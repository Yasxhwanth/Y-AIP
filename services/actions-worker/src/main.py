# Y-AIP Actions — Temporal Worker + FastAPI API
# Runs the actual Temporal worker + provides a REST API to submit actions

import asyncio
from contextlib import asynccontextmanager
from typing import Optional
from uuid import uuid4

import structlog
import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from temporalio.client import Client, TLSConfig
from temporalio.worker import Worker

from src.config import settings, log
from src.workflows import HITLActionWorkflow
from src.activities import invoke_mcp_tool, send_alert, compensate_mcp_tool

# Global Temporal client
_temporal_client: Client | None = None
_worker_task: asyncio.Task | None = None

# ─── Initialization ───────────────────────────────────────────────────

async def init_temporal() -> Client:
    """Connect to Temporal and return client."""
    client = await Client.connect(
        settings.temporal_address,
        namespace=settings.temporal_namespace,
        # In prod: tls=TLSConfig(...)
    )
    return client

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _temporal_client, _worker_task
    
    log.info("actions_service_starting", address=settings.temporal_address)
    
    # 1. Connect Client
    try:
        _temporal_client = await init_temporal()
        log.info("temporal_client_connected")
    except Exception as e:
        log.error("temporal_connection_failed", error=str(e))
        raise
        
    # 2. Start Worker in background
    worker = Worker(
        _temporal_client,
        task_queue=settings.temporal_task_queue,
        workflows=[HITLActionWorkflow],
        activities=[invoke_mcp_tool, send_alert, compensate_mcp_tool],
    )
    
    _worker_task = asyncio.create_task(worker.run())
    log.info("temporal_worker_started", queue=settings.temporal_task_queue)
    
    yield
    
    # Shutdown
    log.info("actions_service_shutdown")
    if _worker_task:
        _worker_task.cancel()

# ─── App ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Y-AIP Actions API",
    version="1.0.0",
    description="REST API for Temporal Actions (Workflow Submission + Signalling)",
    lifespan=lifespan,
)

# ─── Models ───────────────────────────────────────────────────────────

class ActionStep(BaseModel):
    type: str  # "mcp_tool" | "alert"
    tool_id: Optional[str] = None
    message: Optional[str] = None
    level: Optional[str] = None

class ActionRequest(BaseModel):
    action_name: str
    requires_approval: bool = True
    workflow_id: Optional[str] = None
    steps: list[ActionStep]
    
class ActionResponse(BaseModel):
    workflow_id: str
    status: str

# ─── Routes ───────────────────────────────────────────────────────────

@app.post("/actions/execute", response_model=ActionResponse)
async def submit_action(req: ActionRequest):
    """Submit a multi-step action to Temporal. Returns immediately."""
    if not _temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not ready")
        
    workflow_id = req.workflow_id or f"action-{req.action_name}-{uuid4().hex[:8]}"
    
    log.info(
        "submitting_action",
        workflow_id=workflow_id,
        action=req.action_name,
        requires_approval=req.requires_approval
    )
    
    # Start workflow asynchronously (returns immediately, workflow runs in background)
    await _temporal_client.start_workflow(
        HITLActionWorkflow.run,
        req.model_dump(),
        id=workflow_id,
        task_queue=settings.temporal_task_queue,
    )
    
    return ActionResponse(
        workflow_id=workflow_id,
        status="running" if not req.requires_approval else "pending_approval"
    )

@app.post("/actions/{workflow_id}/approve")
async def approve_action(workflow_id: str, note: str = ""):
    """Send 'approve' signal to a waiting HITL workflow."""
    if not _temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not ready")
        
    log.info("signaling_approval", workflow_id=workflow_id)
    handle = _temporal_client.get_workflow_handle(workflow_id)
    await handle.signal(HITLActionWorkflow.approve, note)
    return {"status": "signal_sent", "signal": "approve"}

@app.post("/actions/{workflow_id}/reject")
async def reject_action(workflow_id: str, note: str = ""):
    """Send 'reject' signal to a waiting HITL workflow."""
    if not _temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not ready")
        
    log.info("signaling_rejection", workflow_id=workflow_id)
    handle = _temporal_client.get_workflow_handle(workflow_id)
    await handle.signal(HITLActionWorkflow.reject, note)
    return {"status": "signal_sent", "signal": "reject"}

@app.get("/health")
async def health():
    return {"status": "ok", "service": "actions-worker"}

# ─── Entry Point ─────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=True,
    )
