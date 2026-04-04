# Y-AIP Agent Engine — inspection-dispatcher Agent
# LangGraph state machine: anomaly detected → mission planned → HITL proposal
#
# Flow:
#   START → scan_anomalies → find_available_drone → plan_mission
#         → human_review_gate → [APPROVED] → activate_mission
#                             → [REJECTED] → log_and_end

import json
from typing import TypedDict, Literal, Annotated
import structlog
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_core.messages import HumanMessage, AIMessage

from src.llm.router import call_llm, LLMMode
from src.tools.mcp_client import query, graphql_query
from src.guards.llm_guard import scan_user_input, GuardrailViolation
from src.config import settings

log = structlog.get_logger(__name__)


# ─── Agent State ─────────────────────────────────────────────────────

class InspectionState(TypedDict):
    # Input
    panel_id: str
    anomaly_type: str
    severity: float
    triggered_by: str           # "automate_rule" | "user" | "kafka_event"

    # Intermediate
    messages: Annotated[list, add_messages]
    panel_details: dict | None
    available_drones: list[dict]
    selected_drone_id: str | None
    mission_plan: str | None

    # Output
    proposal_id: str | None
    proposal_status: Literal["pending", "approved", "rejected", "error"]
    error: str | None


# ─── Graph Nodes ─────────────────────────────────────────────────────

async def scan_anomalies(state: InspectionState) -> dict:
    """Query ontology for the flagged panel's details."""
    log.info("inspection.scan_anomalies", panel_id=state["panel_id"])

    data = await graphql_query(
        """
        query GetPanel($panel_id: String!) {
            solarPanels(where: { panel_id: $panel_id }) {
                panel_id
                location
                efficiency_pct
                anomaly_detected
                last_inspected
            }
        }
        """,
        variables={"panel_id": state["panel_id"]},
        agent_id="inspection-dispatcher",
    )

    panels = data.get("solarPanels", [])
    if not panels:
        return {
            "proposal_status": "error",
            "error": f"Panel {state['panel_id']} not found in ontology",
        }

    panel = panels[0]
    return {
        "panel_details": panel,
        "messages": [
            HumanMessage(
                content=f"Panel {panel['panel_id']} at {panel['location']} "
                        f"has efficiency {panel['efficiency_pct']}% — anomaly detected."
            )
        ],
    }


async def find_available_drone(state: InspectionState) -> dict:
    """Find drones that are IDLE and have sufficient battery."""
    log.info("inspection.find_drone", panel_id=state["panel_id"])

    data = await graphql_query(
        """
        query AvailableDrones {
            droneUnits(where: { status: IDLE }) {
                drone_id
                name
                battery_pct
                latitude
                longitude
            }
        }
        """,
        agent_id="inspection-dispatcher",
    )

    drones = [
        d for d in data.get("droneUnits", [])
        if d.get("battery_pct", 0) >= 30  # Must have ≥30% battery for a mission
    ]

    if not drones:
        return {
            "proposal_status": "error",
            "error": "No available drones with sufficient battery",
            "available_drones": [],
        }

    return {"available_drones": drones}


async def plan_mission(state: InspectionState) -> dict:
    """Use LLM to select best drone and generate mission plan."""
    log.info("inspection.plan_mission", drones=len(state["available_drones"]))

    panel = state["panel_details"] or {}
    drones = state["available_drones"]

    prompt = f"""You are a drone mission planner for solar panel inspection.

Panel details:
- ID: {panel.get('panel_id')}
- Location: {panel.get('location')}
- Efficiency: {panel.get('efficiency_pct')}%
- Anomaly type: {state['anomaly_type']}
- Severity: {state['severity']}

Available drones (IDLE, ≥30% battery):
{json.dumps(drones, indent=2)}

Select the best drone and write a concise inspection mission plan.
Output JSON:
{{
  "selected_drone_id": "<drone_id>",
  "mission_name": "<short name>",
  "objective": "<one sentence>",
  "waypoints": ["<lat,lon>", ...],
  "estimated_duration_minutes": <number>,
  "priority": <1-5>
}}"""

    # LLM Guard: scan the panel data being injected into prompt
    try:
        safe_location = scan_user_input(
            panel.get("location", ""), agent_id="inspection-dispatcher"
        )
        prompt = prompt.replace(str(panel.get("location", "")), safe_location)
    except GuardrailViolation as e:
        log.warning("guardrail_on_panel_data", violations=e.violations)
        # Proceed with original data but log the violation

    response = await call_llm(
        messages=[{"role": "user", "content": prompt}],
        mode=LLMMode(settings.litellm_mode),
        agent_id="inspection-dispatcher",
    )

    # Parse JSON from LLM response
    try:
        # Extract JSON from response (LLM may include markdown)
        import re
        json_match = re.search(r"\{.*\}", response, re.DOTALL)
        plan_data = json.loads(json_match.group(0)) if json_match else {}
    except (json.JSONDecodeError, AttributeError):
        plan_data = {}

    return {
        "selected_drone_id": plan_data.get("selected_drone_id", drones[0]["drone_id"]),
        "mission_plan": response,
        "messages": [AIMessage(content=f"Mission plan generated: {plan_data.get('mission_name', 'Inspection')}")],
    }


async def create_hitl_proposal(state: InspectionState) -> dict:
    """Submit mission plan as HITL proposal — requires human approval."""
    log.info(
        "inspection.create_proposal",
        drone=state["selected_drone_id"],
        panel=state["panel_id"],
    )

    mutation = """
    mutation CreateProposal($objects: JSON!, $links: JSON!, $justification: String!) {
        createProposal(
            proposed_objects: $objects,
            proposed_links: $links,
            justification: $justification
        ) {
            proposal_id
            status
        }
    }
    """

    data = await graphql_query(
        mutation,
        variables={
            "objects": [{
                "type": "Mission",
                "name": f"Inspection of {state['panel_id']}",
                "status": "PLANNED",
                "objective": f"Inspect panel {state['panel_id']} — anomaly: {state['anomaly_type']}",
                "priority": 3,
                "classification": "UNCLASSIFIED",
            }],
            "links": [{
                "type": "ASSIGNED_TO",
                "from": f"Mission:inspect-{state['panel_id']}",
                "to": f"DroneUnit:{state['selected_drone_id']}",
            }],
            "justification": (
                f"Auto-generated by inspection-dispatcher agent. "
                f"Panel {state['panel_id']} efficiency at {state.get('panel_details', {}).get('efficiency_pct')}%. "
                f"Anomaly: {state['anomaly_type']} (severity {state['severity']}). "
                f"Assigned drone: {state['selected_drone_id']}."
            ),
        },
        agent_id="inspection-dispatcher",
    )

    proposal = data.get("createProposal", {})
    proposal_id = proposal.get("proposal_id")

    log.info("inspection.proposal_created", proposal_id=proposal_id)

    # SUBMIT TO TEMPORAL ACTIONS WORKER
    try:
        import httpx
        with httpx.Client(base_url="http://localhost:8001") as client:
            res = client.post("/actions/execute", json={
                "action_name": "drone_inspection",
                "requires_approval": True,
                "workflow_id": proposal_id, # Force workflow ID to match proposal ID
                "steps": [
                    {
                        "type": "mcp_tool",
                        "tool_id": "postgres-write",
                        "query": f"UPDATE edge.drone_units SET status='IN_MISSION' WHERE drone_id='{state['selected_drone_id']}'"
                    }
                ]
            })
            res.raise_for_status()
            log.info("temporal_workflow_submitted", workflow_id=proposal_id)
    except Exception as e:
        log.error("temporal_submission_failed", error=str(e))

    return {
        "proposal_id": proposal_id,
        "proposal_status": "pending",
        "messages": [
            AIMessage(
                content=f"Mission proposal created (ID: {proposal_id}). "
                        f"Awaiting operator approval in the Nexus dashboard."
            )
        ],
    }


def route_after_plan(state: InspectionState) -> Literal["create_hitl_proposal", "__end__"]:
    """Router: proceed to propose, or abort if planning errored."""
    if state.get("proposal_status") == "error":
        return END
    if not state.get("selected_drone_id"):
        return END
    return "create_hitl_proposal"


# ─── Build the Graph ─────────────────────────────────────────────────

def build_inspection_dispatcher() -> StateGraph:
    graph = StateGraph(InspectionState)

    graph.add_node("scan_anomalies", scan_anomalies)
    graph.add_node("find_available_drone", find_available_drone)
    graph.add_node("plan_mission", plan_mission)
    graph.add_node("create_hitl_proposal", create_hitl_proposal)

    graph.add_edge(START, "scan_anomalies")
    graph.add_edge("scan_anomalies", "find_available_drone")
    graph.add_edge("find_available_drone", "plan_mission")
    graph.add_conditional_edges("plan_mission", route_after_plan)
    graph.add_edge("create_hitl_proposal", END)

    return graph.compile()


# Module-level compiled agent (singleton)
inspection_dispatcher = build_inspection_dispatcher()
