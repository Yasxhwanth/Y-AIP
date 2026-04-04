# Y-AIP — Layer 5: Governance
### OPA Policy Engine, Purpose-Based Access Control, Audit Logs & Compliance

---

## Overview

Governance in Y-AIP is **mesh-wide** — it is not a layer you add on top, it is embedded in every API call, every query, every agent tool invocation. The model is: **no query, action, or agent run can occur without a valid governance context**.

---

## 1. OPA (Open Policy Agent): Declarative PBAC Engine

Previous Y-AIP versions enforced PBAC through bespoke TypeScript logic embedded in the MCP Gateway. This is now replaced with **OPA (Open Policy Agent)** — a battle-tested, policy-as-code engine used by Kubernetes, Envoy, and enterprise security systems.

### Why OPA

| Concern | Custom TypeScript | OPA + Rego |
|---|---|---|
| Policy changes require code deploy | Yes | No — hot-reload `.rego` files |
| Policy audit trail | Manual | OPA decision log (every eval recorded) |
| Kubernetes enforcement | Custom webhook needed | OPA Gatekeeper (built-in) |
| Policy unit testing | Ad-hoc | `opa test` — first-class test framework |
| Complex rules (time-based, multi-field) | Complex custom code | Declarative Rego — readable and auditable |

### OPA Deployment

OPA runs as a **sidecar** on the MCP Gateway pod. Every query decision is offloaded to OPA before any data is touched.

```yaml
# k8s/mcp-gateway-deployment.yaml (OPA sidecar)
containers:
  - name: mcp-gateway
    image: yaip/mcp-gateway:latest
    env:
      - name: OPA_URL
        value: "http://localhost:8181"

  - name: opa
    image: openpolicyagent/opa:latest
    args: ["run", "--server", "--log-level=info",
           "--log-format=json",            # OPA decision logs → ClickHouse
           "/policies/pbac.rego"]
    volumeMounts:
      - name: opa-policies
        mountPath: /policies
volumes:
  - name: opa-policies
    configMap:
      name: yaip-opa-policies
```

### Core PBAC Policy (Rego)

```rego
# policies/pbac.rego — Declarative PBAC for all MCP Gateway decisions
package yaip.authz

default allow = false

# ALLOW: all four conditions must be satisfied simultaneously
allow {
    role_permits_access
    purpose_is_active
    classification_within_ceiling
    connector_permitted
}

# Condition 1: principal's role allows access to this resource type
role_permits_access {
    role := input.principal.roles[_]
    permitted := data.role_permissions[role]
    input.query.resource_type in permitted.resource_types
}

# Condition 2: active purpose_id is present in the request token
purpose_is_active {
    input.query.purpose_id in input.principal.purpose_ids
}

# Condition 3: data classification does not exceed principal's clearance ceiling
classification_within_ceiling {
    level := ["UNCLASSIFIED", "CUI", "SECRET", "TOP_SECRET"]
    query_idx   := indexof(level, input.query.classification)
    ceiling_idx := indexof(level, input.principal.clearance)
    query_idx <= ceiling_idx
}

# Condition 4: connector is in the principal's permitted list
connector_permitted {
    input.query.connector_id in input.principal.permitted_connectors
}

# HARD DENY: PHI data without active patient_encounter context — overrides allow
deny {
    "PHI:TRUE" in input.query.data_markings
    count([p | p := input.principal.purpose_ids[_]; startswith(p, "enc:")]) == 0
}

# HARD DENY: ITAR data to non-US persons
deny {
    "ITAR:TRUE" in input.query.data_markings
    not input.principal.us_person
}

# HARD DENY: TOP_SECRET in non-air-gap environment
deny {
    input.query.classification == "TOP_SECRET"
    input.environment != "air_gap"
}
```

### OPA Decision Log → ClickHouse

Every OPA evaluation (ALLOW and DENY) is streamed to ClickHouse as an audit event:

```json
{
  "decision_id": "abc-123",
  "timestamp": "2026-03-31T14:23:11Z",
  "input": { "principal": {...}, "query": {...} },
  "result": { "allow": false, "deny": ["PHI:TRUE without encounter context"] },
  "query_time_ms": 1.2
}
```

This gives auditors a **cryptographically linked** record of every access decision, not just what was granted.

---

## 2. Purpose-Based Access Control (PBAC) — Concepts

Standard RBAC ("User A can read Table B") is insufficient for AI systems. Y-AIP uses **PBAC**, which requires every data access to declare **why** it is needed, tied to an active ontology context. OPA enforces the rules; the MCP Gateway manages purpose contexts.

### Access Control Model

```
Principal (User / Agent)
    +
Role (ANALYST / OPERATOR / AGENT / AUDITOR / ADMIN)
    +
Purpose String (active OntologyContext reference)
    +
Classification Ceiling (UNCLASSIFIED / CUI / SECRET / TOP_SECRET)
    =
OPA Evaluation → ALLOW / DENY
```

### Purpose Context Schema

```typescript
interface PurposeContext {
  purpose_id: string;            // "enc:patient-MRN-00291" = patient encounter
  purpose_type: "patient_encounter" | "fraud_investigation" | "mission_planning" | "audit" | "maintenance";
  linked_object_id: string;
  linked_object_type: string;
  created_by: string;
  expires_at: Date;              // Access automatically expires
  justification: string;         // Free-text, logged immutably
}
```

**Example**: A medical agent cannot access Patient records unless there is an active `patient_encounter` context for that specific patient. OPA hard-denies even if the role would otherwise permit it.

---

## 2. Data Markings

Palantir's "Markings" system is replicated in Y-AIP. Every data object, property, and connector carries classification metadata that propagates through every query.

### Marking Types

| Marking Header | Meaning | Effect |
|---|---|---|
| `[CLASS:UNCLASSIFIED]` | No restriction | Full access for authorized roles |
| `[CLASS:CUI]` | Controlled Unclassified Info | Requires Purpose String |
| `[CLASS:SECRET]` | Secret | Requires clearance + air-gap deployment |
| `[CLASS:TOP_SECRET]` | Top Secret | IL6 only, local Llama model, no cloud |
| `[PHI:TRUE]` | Protected Health Information | Auto-masked before LLM |
| `[PCI:PAN]` | Payment Card Number | Auto-tokenized before LLM |
| `[ITAR:TRUE]` | Defense export controlled | US persons only, logged |

### Marking Propagation Rule
If ANY field in a query result is marked `[CLASS:SECRET]`, the **entire response** is treated as `SECRET`. Markings never dilute — they only escalate.

---

## 3. Audit Log (ClickHouse)

Every event in Y-AIP — query, action proposal, approval, agent run, login — is written as an **immutable, append-only event** to ClickHouse.

### Audit Event Schema

```typescript
interface AuditEvent {
  event_id: string;              // UUID v7 (time-sortable)
  event_type: AuditEventType;
  timestamp: Date;
  principal_id: string;          // User or Agent ID
  principal_type: "user" | "agent";
  purpose_id?: string;
  // What was accessed or changed
  resource_type: string;
  resource_id: string;
  // For queries
  query_hash?: string;           // SHA-256 of the full query (for deduplication)
  data_markings_accessed?: string[];
  masked_fields?: string[];
  // For actions
  action_id?: string;
  proposal_id?: string;
  action_status?: "proposed" | "approved" | "rejected" | "reverted";
  // Governance
  classification_ceiling: string;
  environment: "cloud" | "on_prem" | "edge" | "air_gap";
  // Chain of custody
  parent_event_id?: string;      // Links agent tool call to the parent agent run
  reasoning_hash?: string;       // SHA-256 of the full reasoning chain JSON
}

type AuditEventType =
  | "DATA_QUERY"
  | "DATA_WRITE"
  | "AGENT_RUN_STARTED"
  | "AGENT_RUN_COMPLETED"
  | "PROPOSAL_CREATED"
  | "PROPOSAL_APPROVED"
  | "PROPOSAL_REJECTED"
  | "ACTION_EXECUTED"
  | "ACTION_REVERTED"
  | "LOGIN"
  | "ACCESS_DENIED"
  | "GUARDRAIL_TRIGGERED"
  | "CONSENSUS_FAILED"
  | "HUMAN_APPROVAL_REQUESTED"
  | "HUMAN_APPROVAL_GRANTED";
```

---

## 4. Time-Travel Audit

The most powerful governance feature — you can **replay any agent decision** at any historical point in time.

```
Auditor asks: "What data did the fraud agent use at 14:23 UTC on March 15th
               to recommend freezing Account ACC-0291?"

Time-Travel Query:
  1. Find AuditEvent WHERE proposal_id='prop-xyz' AND event_type='PROPOSAL_CREATED'
  2. Retrieve reasoning_hash → load full reasoning chain JSON
  3. Retrieve lineage entries → show which ontology nodes (at their historical version)
  4. Replay: re-run the same logic chain against the historical data snapshot
     (ClickHouse retains all historical states via append-only design)
```

---

## 5. Identity & Authentication

### Identity Provider Strategy

| Deployment Mode | IdP | Protocol |
|---|---|---|
| Cloud / Commercial | Okta / Microsoft Entra ID / AWS IAM Identity Center | OIDC / SAML |
| Sovereign on-prem / Medical | Keycloak (self-hosted) | OIDC |
| Air-gap (Defense IL6) | Keycloak + Vault PKI (offline CA) | mTLS + OIDC |

**Keycloak** is the canonical IdP for all non-cloud deployments. It federates with enterprise IdPs when network connectivity is available, and falls back to local credential store in air-gap mode.

### Token Model

```typescript
interface YAIPAccessToken {
  sub: string;         // Principal ID
  roles: string[];     // ["ANALYST", "OPERATOR"]
  clearance: string;   // "TOP_SECRET"
  purpose_ids: string[];  // Active purpose contexts for this session
  exp: number;
  environment: string; // "cloud" | "air_gap"
}
```

### Agent Identity
Agents have a dedicated identity with scoped permissions:

```json
{
  "agent_id": "agent-fraud-sentinel-001",
  "roles": ["AGENT"],
  "permitted_tools": ["tool-freeze-account", "tool-send-slack-alert"],
  "permitted_connectors": ["connector-postgres-finance"],
  "clearance": "UNCLASSIFIED",
  "never_access": ["PHI", "ITAR"]   // Hard-coded exclusions that cannot be overridden
}
```

---

## 6. Compliance Automation

### HIPAA 2.0 (Medical)
- PHI auto-detected and masked by Presidio at MCP Gateway
- All PHI access requires active `patient_encounter` Purpose Context
- FHIR audit logs generated in HL7 FHIR AuditEvent format
- Right-to-erasure: automated data scrubbing pipeline with audit trail

### PCI-DSS 4.0.1 (Finance)
- PANs tokenized before storage (Format-Preserving Encryption)
- Card numbers auto-masked in LLM prompts: `4111 **** **** 1111`
- Quarterly penetration test reports generated by Security Scanner agent
- DORA exit strategy: all logic chains exportable as Docker images; customer can self-host

### ITAR / IL6 (Defense)
- US-person-only flag enforced at role level
- Air-gapped deployment verified via NixOS configuration hash
- All LLM calls in IL6 mode use local Llama-4-Scout only (no cloud API)
- DDIL sync protocol for data reconciliation when connectivity restored
