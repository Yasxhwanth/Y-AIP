# Y-AIP — Layer 7: Apollo-Lite Deployment Engine
### Pull-Based Sovereign Delivery & Multi-Environment Orchestration

---

## Overview

Palantir's Apollo is their most underrated moat — it can deploy software to a submarine, a hospital on-prem server, or AWS GovCloud with one click. Y-AIP's **Apollo-Lite** replicates this via a **pull-based deployment model** using K3s, NixOS, and Helm.

---

## 1. The Pull Model

Traditional CI/CD **pushes** code to servers. Apollo-Lite uses a **pull model** — the target environment runs a lightweight agent that polls the Control Plane and pulls updates when conditions are met.

```
Y-AIP Control Plane
  └─► Release Registry (Helm charts + Docker images)
        │
        │  (Target environment polls every 60s)
        │
        ▼
  Environment Agent (running on target)
    ├─ Checks: Does this release satisfy my constraints?
    │    - Classification ceiling matches?
    │    - EvalScope tests passed?
    │    - Canary analysis healthy?
    ├─ YES → Pull and apply Helm upgrade
    └─ NO  → Log skip reason, await next poll
```

**Why Pull instead of Push?**
In air-gapped environments (a Navy ship, a SCIF), you **cannot** push code from the internet. The environment must reach out when it's safe to update.

---

## 2. Release Channels

Every Y-AIP release is tagged with a channel. Environments subscribe to a channel.

| Channel | Description | Target Environment |
|---|---|---|
| `canary` | First 5% of releases, high instability tolerance | Dev / staging |
| `stable` | Tested releases, low instability tolerance | Commercial cloud |
| `sovereign` | Security-audited, TEE-compatible releases | Medical / Finance on-prem |
| `il6-airgap` | Air-gapped, local-LLM-only releases | Defense IL6 |

### Release Manifest

```yaml
# release-manifest.yaml
apiVersion: yaip.io/v1
kind: Release
metadata:
  name: yaip-2.4.1
  channel: stable
spec:
  components:
    mcp_gateway: "2.4.1"
    agent_studio: "2.4.1"
    logic_studio: "2.4.0"   # Not updated in this release
    atlas: "2.3.9"
  constraints:
    min_classification_ceiling: "UNCLASSIFIED"
    tee_required: false
    local_llm_required: false
    evalscope_pass_rate: 0.97
  rollout:
    strategy: "rolling"
    max_surge: "25%"
    canary_analysis_minutes: 30
```

---

## 3. Environment Profiles

Each deployment target is defined by an **Environment Profile** — a metadata file that describes the target's constraints, capabilities, and subscribed channel.

```yaml
# environment-profile.yaml
apiVersion: yaip.io/v1
kind: EnvironmentProfile
metadata:
  name: hospital-nyc-001
  environment_type: "on_prem"
spec:
  channel: "sovereign"
  classification_ceiling: "PHI"
  tee_enabled: true
  tee_hardware: "intel_tdx"
  local_llm: false          # Uses Anthropic API (hospital has internet)
  network:
    egress_allowed: true
    trusted_domains: ["api.anthropic.com", "vault.hospital.internal"]
  compliance:
    hipaa: true
    fhir_version: "R5"
  resources:
    cpu_cores: 32
    ram_gb: 128
    gpu: "NVIDIA_A10G"
```

---

## 4. Zero-Downtime Upgrades

Apollo-Lite uses Kubernetes rolling upgrades with pre/post-upgrade hooks:

```yaml
# upgrade-hooks.yaml
preUpgrade:
  - name: "drain-active-agent-runs"
    command: "yaip-ctl drain --timeout=120s"
  - name: "create-db-backup"
    command: "yaip-ctl backup --components=neo4j,clickhouse"
  - name: "run-evalscope"
    command: "yaip-ctl eval --suite=pre-upgrade --fail-on-regression"

postUpgrade:
  - name: "smoke-test"
    command: "yaip-ctl smoke-test --timeout=60s"
  - name: "notify-operators"
    command: "yaip-ctl notify --channel=slack --message='Upgrade complete'"

rollback:
  automatic: true
  trigger: "smoke-test-failure OR error-rate > 5%"
```

---

## 5. Edge Deployment (Drones & Robots)

Edge devices (LicheeRV Nano AI, Jetson Orin Nano) run a **Micro-Agent** that operates in DDIL (Disconnected, Denied, Intermittent, Limited) conditions.

```
ONLINE MODE:
  Cloud Agent Studio ──►  Full LangGraph + LiteLLM (Claude/GPT)
                           Full Ontology access via Neo4j
                           Proposals sync to cloud Proposals Dashboard

DDIL / OFFLINE MODE (Drone loses signal):
  Local Micro-Agent ──►  TinyLM (Llama-4-Scout on Ollama)
                          Cached Ontology snapshot (last 24h)
                          Execute ONLY pre-approved action set
                          Buffer all events to local SQLite

RECONNECTION:
  Micro-Agent ──►  Sync buffered events to cloud ClickHouse
                   Merge ontology updates (conflict resolution by timestamp)
                   Resume full cloud agent mode
```

### DDIL Sync Protocol

```typescript
interface DDILSyncPacket {
  device_id: string;
  disconnected_at: Date;
  reconnected_at: Date;
  buffered_events: AuditEvent[];       // All events during offline period
  local_ontology_changes: OntologyDelta[];  // Object state changes made offline
  actions_executed_offline: OfflineAction[];
  conflict_strategy: "cloud_wins" | "edge_wins" | "manual_review";
}
```

---

## 6. Canary Analysis

Before a release rolls out fully, Apollo-Lite runs automated canary analysis:

```
Release 2.4.1 begins rolling out (5% of traffic)
    │
    ▼ (30 minutes of canary analysis)
    ├─ Error rate:    0.12% (baseline: 0.10%) → ✅ within threshold
    ├─ P99 latency:   340ms (baseline: 290ms) → ⚠️ slightly elevated
    ├─ EvalScope:     98.2% pass rate         → ✅ above 97% threshold
    ├─ Consensus failures: 0                  → ✅
    └─ HITL approval rate: unchanged          → ✅
    
Result: CANARY HEALTHY → proceed to 100% rollout
```
