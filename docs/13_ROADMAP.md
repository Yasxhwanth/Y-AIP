# Y-AIP — 90-Day Implementation Roadmap
### From Empty Repo to Pilot-Ready Platform

---

## Principles

1. **Ship working software** at the end of each phase — no "big bang" launches
2. **Every phase** adds a testable, demonstrable capability
3. **Vibe-code friendly** — you can use AI editors (Cursor, Windsurf) for most implementation; focus your energy on the architecture decisions
4. **Vertical-first** — build for Solar Farm Inspection first; generalize after pilot

---

## Phase 1: The Foundation (Days 1–30)
### Goal: Working Data Plane + Basic Ontology

**Week 1: Project Bootstrap**
- [ ] Initialize Next.js 15 monorepo with TypeScript strict mode
- [ ] Set up Docker Compose: Postgres, Neo4j, Redis, ClickHouse
- [ ] Set up tRPC server with Zod schemas
- [ ] Basic NextAuth.js authentication (GitHub OAuth for dev, OIDC for prod)
- [ ] Create `connector-postgres` MCP Server (first connector)

**Week 2: MCP Gateway + OPA**
- [ ] Build MCP Gateway (Fastify): routing, audit emission, purpose-string check
- [ ] Deploy OPA sidecar with initial `pbac.rego` policy (role + purpose + clearance)
- [ ] Implement Presidio masking middleware (PHI/PAN detection)
- [ ] Connect Trino for federated SQL queries
- [ ] Stand up Kafka + Schema Registry (first Avro schema: drone telemetry)
- [ ] Build `connector-manifest.json` schema and registry UI (Atlas v0.1)
- [ ] Basic data markings propagation (UNCLASSIFIED / PHI only)

**Week 3: Ontology v1**
- [ ] Define base OntologyObject TypeScript schema
- [ ] Neo4j schema: object nodes, property nodes, link edges
- [ ] Build Discovery Agent (Claude via LiteLLM → propose objects from schema)
- [ ] Atlas UI: display proposals as visual graph (React Flow + read-only)
- [ ] Human approval flow: approve/reject proposals, commit to Neo4j

**Week 4: First Vertical Objects**
- [ ] Define SolarPanel, DroneUnit, Mission, MaintenanceTicket objects in Atlas
- [ ] Seed Neo4j with 50 mock objects (linked realistically)
- [ ] Build Stream (Quiver v0.1): browse objects, click links
- [ ] EvalScope v0.1: schema validation tests pass for all object types

**Phase 1 Success Metric**: Connect a Postgres DB, have the Discovery Agent propose a valid ontology, approve it, and browse the resulting object graph in Stream.

---

## Phase 2: The Intelligence Layer (Days 31–60)
### Goal: Working Logic Chains + Proposals System

**Week 5: LangGraph Agent Engine**
- [ ] Set up Python FastAPI service for agent engine
- [ ] Configure LiteLLM with Claude + Ollama (local Llama fallback)
- [ ] Build first LangGraph state machine: `inspection-dispatcher` (5 states)
- [ ] Integrate LangSmith for tracing
- [ ] Add deterministic guardrails: No-Fly Zone enforcement

**Week 6: Logic Studio**
- [ ] Build Logic Studio UI (React Flow node editor)
- [ ] Implement node types: OntologyRead, LLMFunction, ConditionalBranch
- [ ] Build HumanApproval node + Proposals data model
- [ ] Proposals Dashboard in Nexus: view pending, approve/reject
- [ ] ClickHouse audit log emitting all proposal events

**Week 7: Automate + Temporal**
- [ ] Deploy Temporal Server (self-hosted on Postgres)
- [ ] Build `HITLActionWorkflow` Temporal workflow (Python worker)
- [ ] Implement L1/L2 HITL gate (waitForSignal from Nexus UI)
- [ ] Register first compensation workflows (drone recall, slot unfreeze)
- [ ] Wire: battery < 15% → Automate trigger → Temporal workflow → Proposals inbox
- [ ] MQTT connector: ingest drone telemetry via Kafka, update DroneUnit object live

**Week 8: k-LLM Consensus + EvalScope**
- [ ] Implement ConsensusGate node in Logic Studio
- [ ] Wire LiteLLM to call Claude + Llama simultaneously, compare outputs
- [ ] Hard Lock on consensus failure: alert sent, agent paused
- [ ] EvalScope v0.2: golden_dataset and llm_as_judge eval types
- [ ] Run EvalScope on `inspection-dispatcher` with 20 historical scenarios

**Phase 2 Success Metric**: Inspect agent detects anomalous panels → creates drone dispatch proposals → operator approves → audit trail complete → EvalScope pass rate ≥ 95%.

---

## Phase 3: The Sovereign Pilot (Days 61–90)
### Goal: Real Hardware + First Enterprise Pitch

**Week 9: Edge / Drone Integration**
- [ ] Flash Jetson Orin Nano with Micro-Agent runtime
- [ ] Wire Micro-Agent: receive mission via MQTT, simulate flight, report back
- [ ] DDIL Sync: disconnect WiFi, verify local SQLite buffering, reconnect and sync
- [ ] Apollo-Lite v0.1: K3s cluster, pull-based deployment to Jetson
- [ ] Test full flow: cloud proposal → MQTT → drone → telemetry back → ontology update

**Week 10: Security Hardening**
- [ ] Lakera Guard prompt injection protection integrated
- [ ] HashiCorp Vault for secrets (replace env vars)
- [ ] RBAC + PBAC enforcement at MCP Gateway (all roles tested)
- [ ] Air-gap test: disconnect all internet, verify platform runs on Ollama only
- [ ] Ephemeral node policy: K3s node self-destructs after 48h test

**Week 11: Nexus Command Center (Pilot UI)**
- [ ] Build solar farm Nexus app: MapWidget (panel locations), ChartWidget (anomaly trends)
- [ ] ProposalInbox widget live: approve missions from the map
- [ ] AgentRunMonitor: watch inspection-dispatcher state machine progress live
- [ ] 3D drone visualizer: Three.js drone icons moving on real GPS coordinates
- [ ] KPI cards: Fleet battery average, anomalies detected today, missions completed

**Week 12: Pilot Preparation**
- [ ] Rehearse 15-minute live demo (Discovery → Ontology → Agent → Proposal → Approve → Drone → Report)
- [ ] Generate sample EvalScope report PDF (for enterprise trust)
- [ ] Prepare DORA exit pack (Docker export of all logic chains)
- [ ] Identify 3 design partners (solar farms, fintech, or defense contractor)
- [ ] Prepare "AIP Bootcamp" offer: 2-day install + custom vertical ontology at 1/10 Palantir price

**Phase 3 Success Metric**: Complete live demo from data connection to drone mission to report in ≤ 15 minutes, with a real or simulated Jetson Orin in the loop.

---

## Post-Pilot: The Scale Play (Days 91–180)

| Month | Focus |
|---|---|
| Month 4 | Add Finance vertical: Transaction ontology, Fraud Sentinel agent, SAR generator |
| Month 5 | Add Medical vertical: FHIR connector, Patient ontology, Admission Triage agent |
| Month 6 | Apollo-Lite v1.0: full canary analysis, multi-environment fleet management |
| Month 7 | Sentinel (Gotham clone): defense intelligence interface, air-gapped IL6 deployment |
| Month 8 | Canvas SDK + Marketplace: external developers can publish Nexus widgets |
| Month 9 | SOC 2 Type II audit + HIPAA attestation + IL4 authorization |

---

## Decision Log (Architecture Choices Made)

| Decision | Choice | Reason |
|---|---|---|
| Graph DB | Neo4j + neosemantics (SHACL) | Best GraphRAG ecosystem; SHACL plugin = semantic validation with no second DB |
| Ontology Constraints | SHACL + neosemantics (replaces TypeDB) | W3C standard; single Neo4j transaction; no sync risk; OSS |
| Ontology API | GraphQL (@neo4j/graphql) | Standard field selection; subscriptions; OPA at resolvers |
| LLM Routing | LiteLLM | Vendor-agnostic; swap models without code changes |
| Local / Edge LLM | Ollama + Llama 4 Scout | 100% air-gap capable; consensus-C model |
| Agent Framework | LangGraph | Deterministic state machines; no unbounded loops |
| Actions Workflow Engine | Temporal (replaces BullMQ+Redis) | Durable; native HITL suspend/resume; saga compensation |
| Federated SQL | Trino | Proven at scale; pushdown to 50+ connectors; zero-copy |
| Lightweight Analytics | DuckDB | In-process; reads Delta Lake natively; no cluster for <100GB |
| Batch / ML | Apache Spark + Delta Lake | Heavy transforms, feature engineering; native Delta support |
| Object Store | S3 (cloud) / MinIO (air-gap) | MinIO = S3-identical API; zero code change between modes |
| Event Streaming | Kafka + Schema Registry | Schema enforcement at producer; prevents malformed agent events |
| ETL Escape Hatch | Airbyte (self-hosted) | Last-resort for legacy/offline sources only |
| Table Format | Delta Lake + XTable bridge | Primary format is Delta; XTable bridges Iceberg/Hudi consumers |
| PBAC Policy Engine | OPA + Rego (replaces custom TypeScript) | Policy-as-code; hot-reload; built-in K8s enforcement via Gatekeeper |
| Identity | Keycloak (sovereign) / Okta / Entra (cloud) | Keycloak self-hosted for air-gap; federated for cloud |
| Secrets | OpenBao (replaces HashiCorp Vault) | MPL-2.0 fork; identical Vault API; clean license for commercial use |
| Service Mesh | Linkerd (replaces no mesh) | Auto-injected mTLS; CNCF graduated; K3s compatible; 10x lighter than Istio |
| API Gateway | Traefik (replaces none) | K3s-native; zero external DB; TLS termination + rate limiting |
| Injection Guard | LLM Guard (replaces Lakera Guard) | Fully OSS; self-hosted; air-gap safe; Lakera was cloud-only |
| Audit Store | ClickHouse | Columnar, append-only, handles billions of events |
| Edge OS | NixOS | Reproducible; hermetic; air-gap compatible |
| K8s: Cloud/On-Prem | Full Kubernetes + Helm | Production-grade; Helm charts for all components |
| K8s: Edge / DDIL | K3s | Lightweight; runs on Jetson Orin; DDIL-resilient |
| Masking | Presidio | Open-source; HIPAA-grade; supports 50+ entity types |
| Observability | LangSmith + Temporal UI + Jaeger | LangSmith for agents; Temporal UI for workflows; Jaeger for traces |
