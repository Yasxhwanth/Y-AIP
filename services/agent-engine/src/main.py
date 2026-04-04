# Y-AIP Agent Engine — FastAPI Main Application
# Entry point: exposes REST API to trigger agent runs

import structlog
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from uuid import uuid4

from src.config import settings
from src.agents.inspection_dispatcher import inspection_dispatcher, InspectionState
from src.kafka.consumer import start_kafka_consumer, stop_kafka_consumer

log = structlog.get_logger(__name__)


# ─── Lifespan ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("agent_engine_start", mode=settings.litellm_mode, port=settings.agent_engine_port)
    
    # Start background Kafka consumer for telemetry
    import asyncio
    from src.kafka.consumer import _consumer_task
    _consumer_task = asyncio.create_task(start_kafka_consumer())
    
    yield
    
    # Stop consumer gracefully
    await stop_kafka_consumer()
    log.info("agent_engine_shutdown")


# ─── App ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Y-AIP Agent Engine",
    version="1.0.0",
    description="LangGraph-powered agent runtime for autonomous platform actions",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Auth ─────────────────────────────────────────────────────────────

async def require_agent_token(authorization: str = Header(...)) -> str:
    """Validate agent service token (in prod: verify Keycloak JWT)."""
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization token")
    return token


# ─── Request/Response Models ──────────────────────────────────────────

class InspectionRunRequest(BaseModel):
    panel_id: str = Field(..., description="ID of the panel with detected anomaly")
    anomaly_type: str = Field(..., description="e.g. 'thermal_hotspot', 'soiling', 'micro_crack'")
    severity: float = Field(..., ge=0.0, le=1.0, description="0.0=low, 1.0=critical")
    triggered_by: str = Field(default="user", description="automate_rule | user | kafka_event")


class AgentRunResponse(BaseModel):
    run_id: str
    agent: str
    status: str
    proposal_id: str | None = None
    message: str


class HealthResponse(BaseModel):
    status: str
    service: str
    llm_mode: str
    agents: list[str]


# ─── Routes ───────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        service="agent-engine",
        llm_mode=settings.litellm_mode,
        agents=["inspection-dispatcher"],
    )


@app.post("/agents/inspection-dispatcher/run", response_model=AgentRunResponse)
async def run_inspection_dispatcher(
    req: InspectionRunRequest,
    _token: str = Depends(require_agent_token),
):
    """
    Trigger the inspection-dispatcher LangGraph agent.
    Agent will:
      1. Fetch panel anomaly details from GraphQL
      2. Find available drones
      3. Generate mission plan via LLM (Ollama/Claude depending on mode)
      4. Create HITL proposal — operator must approve in Nexus dashboard
    """
    run_id = str(uuid4())
    log.info("agent_run_start", run_id=run_id, agent="inspection-dispatcher", panel=req.panel_id)

    try:
        initial_state: InspectionState = {
            "panel_id": req.panel_id,
            "anomaly_type": req.anomaly_type,
            "severity": req.severity,
            "triggered_by": req.triggered_by,
            "messages": [],
            "panel_details": None,
            "available_drones": [],
            "selected_drone_id": None,
            "mission_plan": None,
            "proposal_id": None,
            "proposal_status": "pending",
            "error": None,
        }

        final_state = await inspection_dispatcher.ainvoke(initial_state)

        if final_state.get("proposal_status") == "error":
            log.warning(
                "agent_run_error",
                run_id=run_id,
                error=final_state.get("error"),
            )
            raise HTTPException(
                status_code=422,
                detail=final_state.get("error", "Agent encountered an error"),
            )

        log.info(
            "agent_run_success",
            run_id=run_id,
            proposal_id=final_state.get("proposal_id"),
        )

        return AgentRunResponse(
            run_id=run_id,
            agent="inspection-dispatcher",
            status="proposal_created",
            proposal_id=final_state.get("proposal_id"),
            message=(
                f"Inspection mission proposed for panel {req.panel_id}. "
                f"Drone {final_state.get('selected_drone_id')} assigned. "
                f"Awaiting operator approval. Proposal ID: {final_state.get('proposal_id')}"
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        log.exception("agent_run_failed", run_id=run_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Agent run failed: {str(e)}")


@app.get("/agents")
async def list_agents(_token: str = Depends(require_agent_token)):
    """List all registered agents and their status."""
    return {
        "agents": [
            {
                "id": "inspection-dispatcher",
                "description": "Drone inspection mission planner for solar panel anomalies",
                "trigger": "POST /agents/inspection-dispatcher/run",
                "output": "HITL Proposal — requires operator approval",
                "llm_mode": settings.litellm_mode,
                "guardrails": ["LLM Guard (injection)", "PBAC (via MCP Gateway)"],
            }
        ]
    }


# ─── Entry Point ─────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.agent_engine_port,
        reload=True,
        log_level=settings.log_level.lower(),
    )
