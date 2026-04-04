# Y-AIP — Layer 3: AIP Logic & Automate
### Deterministic Reasoning Chains & Event-Driven Automation

---

## Overview

Logic Studio is Y-AIP's equivalent of Palantir's AIP Logic — a visual environment for building AI-powered reasoning chains. Automate is the event-trigger layer that fires Logic chains automatically based on ontology changes, sensor data, or schedules.

Together they form the **Data → Logic → Action** loop:

```
DATA (Ontology facts)
    └─► LOGIC (Reasoning chain built in Logic Studio)
        └─► ACTION (Verified action executed on approval)
```

---

## 1. Logic Studio

Logic Studio exposes a **node-based visual builder** (built in React Flow) where operators chain together:

| Node Type | What It Does |
|---|---|
| `OntologyRead` | Read object properties or execute a graph traversal |
| `LLMFunction` | Send a typed prompt to an LLM via LiteLLM |
| `ToolCall` | Invoke an MCP Action (write-back to external system) |
| `ConditionalBranch` | If/else based on ontology values or LLM output |
| `HumanApproval` | Pause chain, await HITL signature |
| `ConsensusGate` | Block until k-LLM models agree on output |
| `AuditCheckpoint` | Emit a named audit event to ClickHouse |
| `RevertPoint` | Register an undo snapshot before a mutation |

### Example: Financial Fraud Detection Logic Chain

```
OntologyRead: Transaction {TXN_8821-B}
    │
    ├─► OntologyRead: Employee {initiator}
    │       └─► properties: avg_transaction_amount, department, tenure_years
    │
    ├─► LLMFunction: "Assess fraud risk"
    │       model: claude-3-5-sonnet
    │       temperature: 0.1      // Low temp for deterministic scoring
    │       output_schema: { risk_score: number, reason: string }
    │
    ├─► ConditionalBranch:
    │       IF risk_score >= 0.85 → HumanApproval (Level 3)
    │       IF risk_score >= 0.6  → ToolCall: freeze_account (Level 2)
    │       ELSE                  → AuditCheckpoint: "cleared"
    │
    └─► AuditCheckpoint: "logic_chain_completed"
```

### Logic Chain Schema (TypeScript)

```typescript
interface LogicChain {
  chain_id: string;
  name: string;
  description: string;
  version: number;
  nodes: LogicNode[];
  edges: { from: string; to: string; condition?: string }[];
  input_schema: JsonSchema;       // Type-safe input contract
  output_schema: JsonSchema;      // Type-safe output contract
  industry_tags: ("defense" | "medical" | "finance" | "energy")[];
  compliance_notes: string;
}

interface LogicNode {
  node_id: string;
  node_type: "OntologyRead" | "LLMFunction" | "ToolCall" | "ConditionalBranch" | "HumanApproval" | "ConsensusGate" | "AuditCheckpoint" | "RevertPoint";
  config: Record<string, unknown>;  // Node-type-specific config (metadata-driven, not hardcoded)
}
```

---

## 2. The Proposals System

The **Proposals System** is the most important safety mechanism in Y-AIP. It prevents AI from ever writing directly to production data.

```
┌─────────────────────────────────────────────────────────┐
│                    PROPOSALS SYSTEM                     │
│                                                         │
│  Logic Chain runs in STAGING mode                       │
│       │                                                 │
│       ▼                                                 │
│  Creates a "Scenario Branch" (git-like diff)            │
│       │                                                 │
│       ▼                                                 │
│  Proposals Dashboard shows:                             │
│    ├─ What will change (Diff view)                      │
│    ├─ Why AI recommends it (Reasoning chain)            │
│    ├─ Which data was used (Lineage)                     │
│    ├─ Which rule triggered this (Automate trigger)      │
│    └─ Estimated impact (Preview)                        │
│       │                                                 │
│  Human clicks [MERGE] ──────────────────────────────►  │
│       │         [REJECT] → archived, reason logged      │
│       ▼                                                 │
│  Action executes → Audit logged → Revert point saved   │
└─────────────────────────────────────────────────────────┘
```

### Proposals API

```typescript
interface Proposal {
  proposal_id: string;
  chain_id: string;
  triggered_by: "automate" | "agent" | "manual";
  status: "pending" | "approved" | "rejected" | "reverted";
  scenario: {
    object_type: string;
    object_id: string;
    changes: Record<string, { before: unknown; after: unknown }>;
    action_to_execute: string;
    action_params: Record<string, unknown>;
  };
  reasoning_chain: ReasoningStep[];   // Full LLM chain of thought
  lineage: DataLineageEntry[];
  hitl_level: 1 | 2 | 3;
  approver_id?: string;
  approved_at?: Date;
  revert_proposal_id?: string;        // Auto-created on approval
}
```

---

## 3. Automate — Event-Driven Triggers

Automate converts Logic Chains into autonomous workflows that fire on specific conditions.

### Trigger Types

| Trigger Type | Example |
|---|---|
| `object_property_changed` | `Drone.battery_pct < 15` → trigger Return-to-Base logic |
| `object_created` | `new Patient created` → trigger Admission Assessment logic |
| `object_link_added` | `Transaction -[FLAGS]-> ComplianceAlert` → freeze account logic |
| `schedule_cron` | Every 06:00 UTC → generate daily operational briefing |
| `stream_event` | Kafka event: `anomaly_detected` → trigger inspection mission logic |
| `webhook` | External system webhook → trigger intake logic |
| `threshold_crossed` | `SolarPanel.anomaly_score > 0.8` → dispatch drone |

### Automate Rule Schema

```typescript
interface AutomateRule {
  rule_id: string;
  name: string;
  enabled: boolean;
  trigger: {
    trigger_type: string;
    object_type?: string;
    property?: string;
    condition?: string;         // JSONLogic expression — no hardcoding
    cron?: string;              // ISO cron expression
    stream_topic?: string;
  };
  chain_id: string;             // Which Logic Chain to run
  input_mapping: Record<string, string>; // Map trigger context → chain input
  cooldown_seconds: number;     // Prevent runaway loops
  max_proposals_per_hour: number;
}
```

### Example: Drone Low Battery Automate Rule

```json
{
  "rule_id": "rule-drone-rtb-001",
  "name": "Return to Base on Low Battery",
  "trigger": {
    "trigger_type": "object_property_changed",
    "object_type": "DroneUnit",
    "property": "battery_pct",
    "condition": "value < 15"
  },
  "chain_id": "chain-drone-rtb",
  "input_mapping": {
    "drone_id": "trigger.object_id",
    "current_gps": "trigger.object.gps"
  },
  "cooldown_seconds": 300,
  "max_proposals_per_hour": 10
}
```

---

## 4. EvalScope — AI Testing & Hallucination Detection

Before a Logic Chain can be deployed to production, it must pass **EvalScope** — Y-AIP's equivalent of Palantir's AIP Evals.

### Eval Types

| Eval Type | What It Tests |
|---|---|
| `golden_dataset` | Run chain on historical ground-truth cases, compare output |
| `llm_as_judge` | A separate LLM scores the chain's output for correctness |
| `schema_validation` | Output JSON must match declared `output_schema` 100% |
| `determinism_check` | Run chain 10x — variance in risk scores must be < 0.05 |
| `adversarial_prompt` | Inject prompt injection attempts; chain must not deviate |
| `latency_budget` | Chain must complete within defined SLA (e.g., < 3000ms) |
| `compliance_check` | No PHI/PAN in LLM output; governance markings respected |

### EvalScope Config

```typescript
interface EvalScopeConfig {
  chain_id: string;
  eval_suite: EvalTest[];
  pass_threshold: number;      // e.g., 0.95 = 95% tests must pass to deploy
  required_evals: string[];    // These MUST pass regardless of threshold
  blocker_on_fail: boolean;    // If true, CD pipeline halts on eval failure
}
```
