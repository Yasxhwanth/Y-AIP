# Y-AIP — Layer 4: Agent Studio
### Multi-Agent Orchestration & k-LLM Consensus Engine

---

## Overview

Agent Studio is where AI agents are built, tested, and deployed. Unlike simple chatbot pipelines, Y-AIP agents are **stateful, deterministic, and consensus-governed** — they use LangGraph state machines to prevent infinite loops, and a k-LLM voting protocol to prevent high-stakes hallucinations.

---

## 1. Agent Architecture

Every Y-AIP agent is a **LangGraph State Machine** with explicitly defined states, transitions, and terminal conditions.

```
Agent: "Solar Farm Inspection Dispatcher"

States:
  INIT → ASSESS_ANOMALIES → RANK_PRIORITY → DISPATCH_DRONE
       → AWAIT_INSPECTION  → REVIEW_FINDINGS → CLOSE_TICKET

State transitions are deterministic — the agent cannot "decide" to
skip REVIEW_FINDINGS. The graph enforces the flow.
```

### Agent Definition Schema

```typescript
interface AgentDefinition {
  agent_id: string;
  name: string;
  description: string;
  version: number;
  // LangGraph state machine definition
  states: AgentState[];
  initial_state: string;
  terminal_states: string[];
  // LLM configuration
  primary_model: string;             // e.g., "claude-3-5-sonnet-20241022"
  consensus_models?: string[];       // Additional models for consensus gate
  consensus_required: boolean;       // If true, activate k-LLM protocol
  // Tools available to this agent
  available_tools: string[];         // MCP Action IDs from tool registry
  // Governance
  hitl_states: string[];             // States where human must approve before advancing
  max_iterations: number;            // Hard stop — agent cannot loop forever
  timeout_seconds: number;
  industry_context: string[];
}
```

---

## 2. k-LLM Consensus Protocol

For Defense, Medical, and Finance use cases, Y-AIP uses the **k-LLM consensus protocol** before any action is proposed.

```
Agent reaches PROPOSE_ACTION state
        │
        ▼
┌─────────────────────────────────────────┐
│         k-LLM CONSENSUS GATE           │
│                                         │
│  LLM-A (Claude 3.5):  → output_json_A  │
│  LLM-B (GPT-4o):      → output_json_B  │
│  LLM-C (Llama-4-Scout, local): → C     │
│                                         │
│  Consensus Check:                       │
│    IF A == B == C → PROCEED            │
│    IF A == B ≠ C  → PROCEED (2/3)     │
│    IF no consensus → HARD LOCK 🔴     │
└─────────────────────────────────────────┘
        │
        ▼
  Hard Lock → Human alert sent via Nexus
             → Reasoning chain logged
             → Agent paused until human resolves
```

### Consensus Definition

Two LLM outputs are considered "in agreement" when their structured JSON outputs satisfy:
- Same `action_id`
- `risk_score` within ±0.10
- Same `primary_reasoning_category`

### LiteLLM Configuration

```python
# litellm_router.py — Model routing, no hardcoded model calls

LITELLM_ROUTER = Router(
    model_list=[
        {"model_name": "consensus-a", "litellm_params": {"model": "claude-3-5-sonnet-20241022"}},
        {"model_name": "consensus-b", "litellm_params": {"model": "gpt-4o"}},
        {"model_name": "consensus-c", "litellm_params": {"model": "ollama/llama4:scout", "api_base": "http://localhost:11434"}},
    ],
    fallbacks=[{"consensus-a": ["consensus-c"]}],   # If OpenAI/Anthropic down, fallback to local
)
```

---

## 3. Built-In Agent Types

Y-AIP ships with pre-built agent templates for each vertical. These are metadata-defined and fully customizable — no code changes needed.

| Agent Template | Industry | What It Does |
|---|---|---|
| `discovery-agent` | Universal | Crawls connectors, proposes ontology (SHACL pre-validates) |
| `inspection-dispatcher` | Energy / Defense | Schedules and dispatches drone missions |
| `fraud-sentinel` | Finance | Monitors transactions, proposes freezes |
| `admission-triage` | Medical | Assesses new patient records, flags urgency |
| `supply-chain-optimizer` | Defense / Logistics | Re-routes shipments around disruptions |
| `incident-responder` | Defense / Security | Correlates threat signals, proposes response |
| `maintenance-scheduler` | Energy / Defense | Predicts failures, schedules maintenance |
| `regulatory-auditor` | Finance / Medical | Checks compliance, flags violations |

---

## 4. Agent Tool Registry (MCP Tools)

Agents cannot call external systems directly — they must use registered MCP Tools. This enforces governance and auditability.

```typescript
interface MCPTool {
  tool_id: string;
  display_name: string;
  description: string;         // LLM reads this to decide when to use the tool
  input_schema: JsonSchema;    // Strongly typed — LLM must produce valid input
  output_schema: JsonSchema;
  hitl_level: 1 | 2 | 3;
  connector_id: string;
  estimated_latency_ms: number;
  is_destructive: boolean;     // If true, always creates a Revert Point first
  compliance_tags: string[];   // e.g., ["HIPAA", "PCI-DSS", "ITAR"]
}
```

### Example Tools

```json
[
  {
    "tool_id": "tool-drone-dispatch",
    "display_name": "Dispatch Drone Mission",
    "hitl_level": 2,
    "is_destructive": false,
    "compliance_tags": ["ITAR"]
  },
  {
    "tool_id": "tool-freeze-account",
    "display_name": "Freeze Bank Account",
    "hitl_level": 3,
    "is_destructive": true,
    "compliance_tags": ["PCI-DSS", "DORA"]
  },
  {
    "tool_id": "tool-update-patient-record",
    "display_name": "Update Patient Record",
    "hitl_level": 3,
    "is_destructive": true,
    "compliance_tags": ["HIPAA"]
  },
  {
    "tool_id": "tool-send-slack-alert",
    "display_name": "Send Slack Alert",
    "hitl_level": 1,
    "is_destructive": false,
    "compliance_tags": []
  }
]
```

---

## 5. Agent Observability (LangSmith Integration)

Every agent run is traced end-to-end. Y-AIP integrates LangSmith for developer-level observability.

```
Agent Run
  ├─ run_id: "run-abc123"
  ├─ agent_id: "inspection-dispatcher"
  ├─ total_duration_ms: 4210
  ├─ llm_calls: 3
  │    ├─ [0] claude-3-5-sonnet: 800ms, 1240 tokens, state=ASSESS_ANOMALIES
  │    ├─ [1] gpt-4o: 1100ms, 980 tokens, state=RANK_PRIORITY (consensus)
  │    └─ [2] claude-3-5-sonnet: 600ms, 420 tokens, state=DISPATCH_DRONE
  ├─ tool_calls: 1
  │    └─ tool-drone-dispatch: 200ms, status=PROPOSAL_CREATED
  ├─ consensus_result: "AGREED" (2/3)
  └─ proposal_id: "prop-xyz789"
```

---

## 6. Deterministic Guardrails

Agents operate inside a rules layer that can hard-block actions **before** the LLM output is even processed:

```typescript
interface DeterministicGuardrail {
  guardrail_id: string;
  name: string;
  // Applied BEFORE LLM output is acted on
  check: (context: AgentContext, proposedAction: Action) => GuardrailResult;
}

// Example: No-Fly Zone enforcement
const noFlyZoneGuardrail: DeterministicGuardrail = {
  guardrail_id: "guardrail-nfz",
  name: "No-Fly Zone Enforcement",
  check: async (ctx, action) => {
    if (action.tool_id !== "tool-drone-dispatch") return { pass: true };
    const nfzs = await ontology.getNoFlyZones();
    const targetGPS = action.params.target_gps;
    const violated = nfzs.some(nfz => isInsidePolygon(targetGPS, nfz.boundary));
    if (violated) return { pass: false, reason: "Target GPS is within a registered No-Fly Zone" };
    return { pass: true };
  }
};
```

Guardrails run **synchronously** and cannot be overridden by the LLM — they are pure deterministic logic.
