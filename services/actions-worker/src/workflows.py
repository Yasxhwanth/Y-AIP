# Y-AIP Actions — Temporal Workflows
# Durable, stateful execution of actions with Human-in-the-Loop (HITL) gates

import asyncio
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError

# Import activities (must be delayed until worker starts in some setups, but safe here)
with workflow.unsafe.imports_passed_through():
    from src.activities import invoke_mcp_tool, send_alert, compensate_mcp_tool
    from src.config import log


# ─── Signals ──────────────────────────────────────────────────────────

@workflow.defn
class HITLActionWorkflow:
    """
    A workflow that executes an action but pauses for human approval if required.
    Demonstrates the Saga pattern: if a step fails post-approval, previous steps are compensated.
    """

    def __init__(self) -> None:
        self.approved = False
        self.rejected = False
        self.review_note = ""

    @workflow.signal(name="approve")
    async def approve(self, review_note: str = "") -> None:
        self.approved = True
        self.review_note = review_note

    @workflow.signal(name="reject")
    async def reject(self, review_note: str = "") -> None:
        self.rejected = True
        self.review_note = review_note

    @workflow.run
    async def run(self, payload: dict) -> dict[str, Any]:
        action_name = payload.get("action_name", "unknown_action")
        requires_approval = payload.get("requires_approval", True)
        steps = payload.get("steps", [])
        
        # Saga compensation stack
        compensations = []

        try:
            # 1. Human-in-the-Loop Gate
            if requires_approval:
                workflow.logger.info(f"Workflow {workflow.info().workflow_id} paused waiting for HITL approval")
                
                # Wait for either approve or reject signal (timeout after 72 hours)
                await workflow.wait_condition(
                    lambda: self.approved or self.rejected,
                    timeout=timedelta(hours=72)
                )

                if self.rejected:
                    workflow.logger.info(f"Action rejected: {self.review_note}")
                    return {"status": "rejected", "note": self.review_note}
                    
                workflow.logger.info(f"Action approved: {self.review_note}")

            # 2. Execute Steps (Saga Pattern)
            results = []
            for step in steps:
                step_type = step.get("type")
                
                if step_type == "mcp_tool":
                    # Execute tool
                    res = await workflow.execute_activity(
                        invoke_mcp_tool,
                        step,
                        start_to_close_timeout=timedelta(seconds=30),
                        retry_policy=RetryPolicy(maximum_attempts=3),
                    )
                    results.append(res)
                    
                    # Push compensation in case a future step fails
                    compensations.insert(0, step)
                    
                elif step_type == "alert":
                    res = await workflow.execute_activity(
                        send_alert,
                        step,
                        start_to_close_timeout=timedelta(seconds=10),
                    )
                    results.append(res)
                    
            return {
                "status": "completed",
                "action": action_name,
                "results": results,
                "note": self.review_note
            }

        except Exception as e:
            workflow.logger.error(f"Workflow failed: {str(e)}. Starting saga compensation.")
            
            # 3. Compensate (Rollback) successfully completed steps
            for comp_step in compensations:
                try:
                    await workflow.execute_activity(
                        compensate_mcp_tool,
                        comp_step,
                        start_to_close_timeout=timedelta(seconds=30),
                        retry_policy=RetryPolicy(maximum_attempts=5), # Try hard to rollback
                    )
                except Exception as comp_err:
                    # Log but continue compensating other steps
                    workflow.logger.error(f"Compensation failed for step {comp_step}: {str(comp_err)}")
            
            raise ApplicationError(f"Action failed and rolled back: {str(e)}", type="SagaFailure")
