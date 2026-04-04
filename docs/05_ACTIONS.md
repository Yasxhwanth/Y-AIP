# Y-AIP — Layer 5: Verified Actions
### Temporal Workflows, HITL Gates, Saga Compensation & Undo Stack

---

## Overview

The Actions layer is the execution surface of Y-AIP — where AI proposals become real-world changes. Every action must be:
1. **Reversible** — a compensation (undo) workflow must be registered before execution
2. **Auditable** — every step is logged immutably to ClickHouse
3. **HITL-gated** — human approval is enforced at the workflow level, not the LLM level
4. **Durable** — server restarts, crashes, and DDIL disconnections cannot lose or corrupt an in-flight action

**Temporal** is the durable workflow engine that provides all four guarantees.

---

## 1. Why Temporal (Replacing BullMQ + Redis)

| Concern | BullMQ + Redis | Temporal |
|---|---|---|
| Durability | Jobs lost on Redis restart | Workflows survive any crash; replay from event log |
| Long-running flows | Polling hacks needed | Native `sleep`, `waitForSignal`, unlimited duration |
| HITL (pause/resume) | Complex, fragile custom code | Native `waitForSignal` — workflow suspends cleanly |
| Saga / compensation | Manual implementation | First-class saga pattern with automatic rollback |
| Observability | Basic | Full workflow history, replay UI, time-travel debug |
| Air-gap | Redis self-hosted | Temporal Server self-hosted (Docker/K8s) |

---

## 2. Architecture

```
Logic Studio / Agent Studio
        │  fires Action request
        ▼
┌───────────────────────────────────────────────────┐
│              TEMPORAL WORKFLOW ENGINE              │
│                                                   │
│  ┌────────────────────────────────────────────┐   │
│  │  Action Workflow (Python / Node.js Worker) │   │
│  │                                            │   │
│  │  1. Register Revert Point (compensation)  │   │
│  │  2. Emit AuditEvent: PROPOSAL_CREATED      │   │
│  │  3. HITL Gate (waitForSignal)              │   │
│  │       ├─ Signal: "approved" → step 4      │   │
│  │       └─ Signal: "rejected" → compensate  │   │
│  │  4. Execute via FastAPI MCP Tool           │   │
│  │  5. Emit AuditEvent: ACTION_EXECUTED       │   │
│  │  6. Register Revert Workflow               │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
│  Workers: Python (agent actions) + Node (UI cmds) │
└───────────────────────────────────────────────────┘
        │
        ▼ HTTP
┌───────────────────┐
│  FastAPI MCP Tool │  ← executes the actual side effect
│  (verified, typed)│
└───────────────────┘
        │
        ▼
External System (EHR, bank API, SCADA, drone MQTT)
```

---

## 3. HITL Levels

Every MCP Tool declares a HITL level. The Temporal workflow enforces the gate.

| Level | Gate | Who Approves | Timeout |
|---|---|---|---|
| **L1** | No gate — auto-executes | N/A | N/A |
| **L2** | Digital approval in Nexus Command Center | Operator role | 4 hours |
| **L3** | Physical approval — biometric or hardware token | ADMIN role | 30 minutes |

### HITL Signal Contract (Temporal)

```python
# actions/workflows/hitl_action.py
from temporalio import workflow
from datetime import timedelta

@workflow.defn
class HITLActionWorkflow:
    def __init__(self):
        self._approval_signal: str | None = None

    @workflow.signal
    def approval_decision(self, decision: str, approver_id: str):
        # Called from Nexus UI via Temporal HTTP API
        self._approval_signal = decision
        self._approver_id = approver_id

    @workflow.run
    async def run(self, action_request: ActionRequest) -> ActionResult:
        # Step 1: register compensation BEFORE execution
        revert_wf_id = await workflow.execute_activity(
            register_revert_point, action_request, schedule_to_close_timeout=timedelta(seconds=30)
        )

        # Step 2: emit proposal to Nexus
        await workflow.execute_activity(
            emit_proposal, action_request, schedule_to_close_timeout=timedelta(seconds=5)
        )

        # Step 3: HITL gate — suspend until signal received
        if action_request.hitl_level >= 2:
            await workflow.wait_condition(
                lambda: self._approval_signal is not None,
                timeout=timedelta(hours=4) if action_request.hitl_level == 2 else timedelta(minutes=30)
            )
            if self._approval_signal == "rejected":
                await workflow.execute_activity(log_rejection, action_request)
                return ActionResult(status="REJECTED")

        # Step 4: execute the actual action
        result = await workflow.execute_activity(
            execute_mcp_tool, action_request,
            schedule_to_close_timeout=timedelta(seconds=60),
            retry_policy=RetryPolicy(maximum_attempts=3)
        )

        # Step 5: emit final audit event
        await workflow.execute_activity(emit_audit_event, result)

        return result
```

---

## 4. Saga Compensation (Undo Stack)

Every L2/L3 action automatically registers a **compensation workflow** before execution. The compensation is the exact inverse operation.

```python
# Example: freeze bank account → compensation = unfreeze

COMPENSATION_MAP = {
    "tool-freeze-account": "tool-unfreeze-account",
    "tool-update-patient-record": "tool-revert-patient-record",
    "tool-dispatch-drone": "tool-recall-drone",
    "tool-deploy-release": "tool-rollback-release",
}

@activity.defn
async def register_revert_point(action: ActionRequest) -> str:
    """Stores a revert workflow ID in ClickHouse before execution."""
    revert_action_id = COMPENSATION_MAP.get(action.tool_id)
    if action.hitl_level >= 2 and not revert_action_id:
        raise ValueError(f"L2/L3 action {action.tool_id} has no registered compensation — blocked.")

    revert_wf_id = f"revert-{action.action_id}"
    await clickhouse.insert("revert_stack", {
        "original_action_id": action.action_id,
        "revert_workflow_id": revert_wf_id,
        "revert_tool_id": revert_action_id,
        "expires_at": utcnow() + timedelta(days=30),
    })
    return revert_wf_id
```

### Undo Stack UI

The Proposals Dashboard in Nexus shows an **Undo Stack** — a time-ordered list of executed actions with a one-click revert button (L1/L2 reversals) or requires L3 re-approval for critical systems.

---

## 5. MCP Tool Registry

Agents cannot call external systems directly — they must use registered MCP Tools. This enforces governance and auditability.

```typescript
interface MCPTool {
  tool_id: string;
  display_name: string;
  description: string;        // LLM reads this — must be precise
  input_schema: JsonSchema;   // Strongly typed; LLM must produce valid input
  output_schema: JsonSchema;
  hitl_level: 1 | 2 | 3;
  connector_id: string;
  is_destructive: boolean;    // If true, compensation MUST be registered first
  compliance_tags: string[];  // ["HIPAA", "PCI-DSS", "ITAR"]
  temporal_workflow: string;  // Which Temporal workflow handles this tool
  max_duration_seconds: number;
}
```

### Core Tool Catalogue (v1.0)

| Tool ID | HITL | Destructive | Compliance |
|---|---|---|---|
| `tool-drone-dispatch` | L2 | No | ITAR |
| `tool-drone-recall` | L1 | No | ITAR |
| `tool-freeze-account` | L3 | Yes | PCI-DSS, DORA |
| `tool-unfreeze-account` | L2 | No | PCI-DSS |
| `tool-update-patient-record` | L3 | Yes | HIPAA |
| `tool-revert-patient-record` | L2 | No | HIPAA |
| `tool-send-slack-alert` | L1 | No | — |
| `tool-create-maintenance-ticket` | L1 | No | — |
| `tool-deploy-release` | L2 | Yes | — |
| `tool-rollback-release` | L2 | Yes | — |

---

## 6. Temporal Deployment

### Cloud / On-Prem
```yaml
# docker-compose.temporal.yaml
services:
  temporal:
    image: temporalio/auto-setup:1.24
    ports: ["7233:7233"]
    environment:
      DB: postgresql
      DB_PORT: 5432
      POSTGRES_USER: temporal
      POSTGRES_PWD: ${TEMPORAL_DB_PASSWORD}
      POSTGRES_SEEDS: postgres

  temporal-ui:
    image: temporalio/ui:2.26
    ports: ["8080:8080"]
    environment:
      TEMPORAL_ADDRESS: temporal:7233
```

### Air-Gap
Temporal Server runs fully self-hosted on Postgres (no cloud dependency). All workflow history is stored in the same on-prem Postgres instance used by the Y-AIP metadata DB.

```
Air-Gap Temporal Stack:
  Temporal Server (self-hosted) → Postgres (workflow history)
  Temporal Worker (Python)      → FastAPI MCP Tools
  Temporal UI                   → Ops team observability
```

---

## 7. Environment Variables

```bash
# Temporal
TEMPORAL_ADDRESS=temporal:7233
TEMPORAL_NAMESPACE=yaip-prod
TEMPORAL_TASK_QUEUE=actions

# FastAPI MCP Tool Server
MCP_TOOL_SERVER_PORT=5001
MCP_TOOL_SECRET=<vault-ref>

# Action Timeouts
HITL_L2_TIMEOUT_HOURS=4
HITL_L3_TIMEOUT_MINUTES=30
REVERT_STACK_RETENTION_DAYS=30
