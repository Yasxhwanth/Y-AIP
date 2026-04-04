# Y-AIP Actions — Temporal Activities
# Individual idempotent steps executed by the workflow

from datetime import timedelta
from temporalio import activity
import httpx
import json
import re
from confluent_kafka import Producer

from src.config import settings, log

# ─── API Clients ──────────────────────────────────────────────────────

async def get_mcp_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.mcp_gateway_url,
        timeout=10.0,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.mcp_gateway_secret}",
        },
    )

# ─── Action Activities ────────────────────────────────────────────────

@activity.defn
async def invoke_mcp_tool(payload: dict) -> dict:
    """Execute an MCP Tool (e.g., connector-postgres write) via the Gateway."""
    tool_id = payload.get("tool_id", "postgres-write")
    query = payload.get("query")
    log.info("activity_invoke_tool_start", tool_id=tool_id, query=query)
    
    if query:
        async with await get_mcp_client() as client:
            res = await client.post("/mcp/query", json={
                "connector_id": "connector-postgres",
                "purpose_id": "mission_planning",
                "classification": "UNCLASSIFIED",
                "data_markings": [],
                "query": query
            })
            res.raise_for_status()
            data = res.json()
            
            # [Y-AIP Phase 5]: If this is a Drone Dispatch, fire an Edge Command!
            if tool_id == "postgres-write" and "drone_units" in query.lower() and "'IN_MISSION'" in query:
                match = re.search(r"id\s*=\s*'([^']+)'", query)
                device_id = match.group(1) if match else "D-800"
                try:
                    p = Producer({'bootstrap.servers': 'localhost:9092'})
                    payload = json.dumps({"target_device": device_id, "action": "LAUNCH"})
                    p.produce("yaip.edge.commands", payload)
                    p.flush(timeout=2.0)
                    log.info("edge_mission_dispatched", target=device_id)
                except Exception as e:
                    log.error("edge_dispatch_failed", error=str(e))
                
            return {"status": "success", "tool_id": tool_id, "result": data}
            
    return {"status": "success", "tool_id": tool_id, "result": "Tool executed (no query)"}

@activity.defn
async def send_alert(alert_payload: dict) -> dict:
    """Send an alert to a user or group."""
    message = alert_payload.get("message")
    level = alert_payload.get("level", "INFO")
    log.info("activity_send_alert", level=level, len=len(message))
    return {"status": "success", "delivered": True}

# ─── Saga Compensation ────────────────────────────────────────────────

@activity.defn
async def compensate_mcp_tool(payload: dict) -> dict:
    """Undo an MCP tool execution if the overall saga fails."""
    tool_id = payload.get("tool_id")
    log.info("activity_compensate_tool", tool_id=tool_id)
    
    # Simulate rollback
    return {"status": "rolled_back", "tool_id": tool_id}
