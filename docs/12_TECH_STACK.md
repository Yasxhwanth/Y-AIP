# Y-AIP — Unified Tech Stack (v2.0)
### Full OSS Stack, Service Boundaries & API Contracts

> **v2.1 Change Summary (2026-03-31):** Replaced TypeDB with SHACL+neosemantics (Neo4j plugin). Replaced Lakera Guard with LLM Guard (OSS, air-gap safe). Replaced HashiCorp Vault with OpenBao (MPL-2.0 fork, clean license). Added Linkerd (mTLS service mesh), Traefik (API gateway), DuckDB (lightweight analytics tier).

---

## 1. Master Stack Table

| Layer | Tools | Role |
|---|---|---|
| **Data — Streaming** | Kafka + Schema Registry (Avro/Protobuf) | Real-time event bus with enforced schemas |
| **Data — Batch / ML** | Apache Spark + Delta Lake | Heavy transforms, feature engineering, ML pipelines |
| **Data — Federated Query** | Trino | Low-latency cross-source agent queries (live, no copy) |
| **Data — Lightweight Analytics** | DuckDB | In-process analytics on Delta Lake (<100GB); no cluster needed |
| **Data — Object Store** | AWS S3 (cloud) / MinIO (air-gap) | Blob/media storage for images, videos, artifacts |
| **Data — Ingestion (escape hatch)** | Airbyte | ETL for legacy / offline sources that cannot be queried live |
| **Data — Table Format** | Delta Lake (primary) + Apache XTable (bridge to Iceberg) | Open table format; XTable bridges Iceberg/Hudi consumers |
| **Ontology — Graph DB** | Neo4j + neosemantics plugin | Knowledge graph traversal, GraphRAG, SHACL constraint validation |
| **Ontology — API** | GraphQL (Hasura / custom) | Standard query interface over the ontology for UI + externals |
| **AI — LLM Routing** | LiteLLM | Vendor-agnostic model router (Claude, GPT-4o, Llama) |
| **AI — Local/Edge LLM** | Ollama + Llama 4 Scout | Air-gap/edge inference; consensus-C model |
| **AI — Masking** | Microsoft Presidio | PII/PHI/PAN masking pre-LLM at MCP Gateway |
| **AI — Injection Guard** | LLM Guard (ProtectAI) | OSS prompt injection detection — self-hosted, air-gap safe |
| **Agents** | LangGraph | Stateful deterministic agent state machines |
| **Actions — Workflow** | Temporal | Durable HITL workflows, saga compensation, undo stack |
| **Actions — Tool Server** | FastAPI | MCP Tool execution server (called by Temporal workers) |
| **Governance — Policy** | OPA (Open Policy Agent) + Rego | Declarative PBAC policies (replaces bespoke TypeScript) |
| **Governance — Identity** | Keycloak (air-gap) / Okta / Entra ID | OIDC/SAML identity; Keycloak for sovereign deployments |
| **Governance — Audit** | ClickHouse | Immutable, append-only columnar audit log |
| **Governance — Secrets** | OpenBao (air-gap) / AWS Secrets Manager (cloud) | MPL-2.0 Vault fork; zero plaintext secrets |
| **Security — Service Mesh** | Linkerd | mTLS between all pods; CNCF graduated; K3s compatible |
| **Security — API Gateway** | Traefik | TLS termination, rate limiting, routing; K3s-native |
| **UI** | Next.js 15+ + React | Command Center (App Router, TypeScript strict) |
| **UI — Typing** | tRPC + Zod | Type-safe frontend↔backend API |
| **UI — Graph Editor** | React Flow | Logic Studio node editor |
| **UI — 3D / Geo** | Three.js + R3F, Deck.gl | Digital twin 3D visualization, geo drone maps |
| **Infra — Dev** | Docker + Docker Compose | Local full-stack development |
| **Infra — Cloud/On-Prem** | Kubernetes (K8s) + Helm | Cloud and enterprise on-prem deployments |
| **Infra — Edge** | K3s | Lightweight K8s for drones, Jetson Orin, DDIL environments |
| **Infra — Air-Gap OS** | NixOS | Reproducible hermetic image; zero internet boot |
| **Infra — Secrets** | HashiCorp Vault (air-gap) / AWS Secrets Manager (cloud) | Zero plaintext secrets |
| **Infra — Registry** | Harbor | Self-hosted container registry for air-gap |
| **Observability** | LangSmith, Temporal UI, Jaeger, Prometheus | Agents, workflows, services, metrics |

---

## 2. Layer-By-Layer Detail

### 2.1 Frontend (Command Center)
| Technology | Version | Purpose |
|---|---|---|
| Next.js | 15+ | App framework (App Router) |
| TypeScript | 5.x | Primary language (strict mode) |
| tRPC | v11 | Type-safe API layer |
| Tailwind CSS | v4 | Styling |
| React Flow | v12 | Logic Studio node editor |
| Three.js + R3F | latest | 3D Digital Twin visualization |
| Deck.gl + Mapbox GL | latest | Geo/drone map visualization |
| Recharts | v2 | Lens / Stream analytics dashboards |
| WebSockets (native) | — | Real-time telemetry updates |

### 2.2 Backend — Orchestration Layer (TypeScript / Node.js)
| Technology | Purpose |
|---|---|
| tRPC Server | Frontend type-safe API |
| Fastify | MCP Gateway (REST for external integrations) |
| Zod | Runtime schema validation (all API contracts) |
| Prisma | ORM for Postgres metadata DB (connectors, users, manifests) |
| Socket.IO | Real-time push to Command Center |

### 2.3 Backend — Agent Engine (Python)
| Technology | Purpose |
|---|---|
| LangGraph | Stateful agent state machines |
| LiteLLM | Multi-model routing (Claude, GPT-4o, Llama, Groq) |
| FastAPI | Agent API + MCP Tool Server |
| Pydantic v2 | Schema validation for agent I/O |
| LangSmith | Agent tracing and observability |
| Temporal Python SDK | Action workflow workers |
| DeepEval | EvalScope test runner |
| Presidio | PII masking at MCP Gateway |
| Lakera Guard | Prompt injection detection |

### 2.4 Data Layer
| Technology | Purpose |
|---|---|
| Neo4j + neosemantics | Primary Ontology Knowledge Graph + SHACL constraint validation |
| ClickHouse | Audit Log (append-only, columnar) |
| PostgreSQL | Metadata DB (connectors, users, manifests, Temporal history) |
| Delta Lake | Primary open table format (batch / ML tier) |
| Apache Spark | Batch transforms, feature engineering, ML pipelines |
| DuckDB | In-process lightweight analytics on Delta Lake (no cluster needed) |
| Trino | Federated SQL engine (zero-copy live cross-source joins) |
| Kafka + Schema Registry | Real-time event streaming with Avro/Protobuf schema enforcement |
| AWS S3 / MinIO | Object store for blobs, images, videos (S3 cloud / MinIO air-gap) |
| Airbyte | ETL connector of last resort — legacy or offline sources only |
| Apache XTable | Table format bridge (Delta Lake ↔ Iceberg ↔ Hudi) |
| Ollama | Local LLM runtime (air-gap / edge) |
| SQLite | Micro-Agent local cache on drones (DDIL offline buffer) |
| Mosquitto | MQTT broker for IoT/drone telemetry |

### 2.5 Governance & Security
| Technology | Purpose |
|---|---|
| OPA + Rego | Declarative PBAC policy engine (replaces custom TypeScript logic) |
| Keycloak | Self-hosted OIDC IdP for sovereign/air-gap deployments |
| OpenBao | Secrets management (MPL-2.0 fork of HashiCorp Vault, identical API) |
| Intel TDX / AMD SEV-SNP | TEE confidential computing for Medical/Defense |
| Linkerd | mTLS service mesh; auto-injected sidecars; CNCF graduated |
| Traefik | External API gateway; TLS termination, rate limiting; K3s-native |
| LLM Guard (ProtectAI) | OSS prompt injection + jailbreak detection; fully self-hosted |

### 2.6 Actions Layer
| Technology | Purpose |
|---|---|
| Temporal | Durable HITL workflow engine (replaces BullMQ+Redis) |
| FastAPI | MCP Tool execution server |
| Temporal UI | Workflow observability + time-travel debugging |

### 2.7 Infrastructure
| Technology | Purpose |
|---|---|
| Docker + Docker Compose | Local development stack |
| Kubernetes (K8s) + Helm | Cloud and on-prem production deployments |
| K3s | Lightweight K8s for edge / drone / DDIL deployments |
| NixOS | Reproducible air-gap OS image |
| Harbor | Container registry (air-gap) |
| Jaeger + Prometheus | Service tracing and metrics (air-gap) |

---

## 3. Service Architecture (Updated)

```
┌──────────────┐  HTTPS/WS   ┌─────────────────────────────┐
│  Next.js UI  │────────────►│  tRPC API Server (Node.js)  │
└──────────────┘             └──────┬──────────────┬────────┘
                                    │ HTTP          │ Temporal
                             ┌──────▼───┐    ┌─────▼──────────┐
                             │Agent API │    │ Temporal Server │
                             │(FastAPI) │    │ (Workflow Eng.) │
                             └──────┬───┘    └─────┬──────────┘
                                    │              │ FastAPI Workers
                             ┌──────▼──────────────▼──────┐
                             │   MCP Gateway (Fastify)    │
                             │   OPA sidecar (PBAC eval)  │
                             └──────┬─────────────────────┘
                        ┌──────────┬┴──────────────┐
                 ┌──────▼──┐  ┌────▼───┐  ┌────────▼──────┐
                 │ Neo4j   │  │TypeDB  │  │ClickHouse     │
                 │(GraphDB)│  │(Types) │  │(Audit Log)    │
                 └────┬────┘  └────────┘  └───────────────┘
                      │ GraphQL
               ┌──────▼──────┐
               │  GraphQL    │  ← Nexus apps + external clients
               │  Ontology   │
               │  API        │
               └─────────────┘
                      │
          ┌───────────┼────────────┐
   ┌──────▼──┐  ┌─────▼──┐  ┌─────▼─────────────────┐
   │  Trino  │  │  Spark  │  │  Kafka + Schema Reg.  │
   │(Fed SQL)│  │(Batch)  │  │(Streaming)            │
   └──────┬──┘  └─────┬───┘  └──────────┬────────────┘
          │           │                  │
   ┌──────▼───────────▼──────────────────▼────────────┐
   │   DATA SOURCES                                    │
   │   S3/MinIO (Delta Lake) │ Postgres │ FHIR │ SAP  │
   │   Snowflake │ Databricks │ MQTT │ Airbyte (ETL)  │
   └───────────────────────────────────────────────────┘
```

---

## 4. Data Tier Decision Logic

When a new data source is connected, this decision tree determines how Y-AIP accesses it:

```
New Data Source
       │
       ▼
Has live queryable API (SQL/REST/FHIR)?
       │
       ├─ YES → Register as MCP Connector → Trino (zero-copy)
       │
       └─ NO  → Is it real-time streaming?
                   │
                   ├─ YES → Kafka connector + Schema Registry
                   │
                   └─ NO  → Is it a legacy/offline source?
                               │
                               └─ YES → Airbyte ETL (escape hatch)
                                         → lands in MinIO/S3 as Delta Lake
                                         → then Trino queries the Delta table
```

---

## 5. OPA Policy Contract

All PBAC decisions are evaluated by OPA before any MCP Gateway query executes:

```rego
# policies/pbac.rego
package yaip.authz

default allow = false

# A query is allowed if:
# 1. The principal has a matching role
# 2. A valid purpose_id is present in the token
# 3. The data classification does not exceed the principal's clearance
# 4. The connector is in the principal's permitted_connectors list

allow {
    principal := input.principal
    query     := input.query

    role_permits_access(principal.roles, query.resource_type)
    purpose_is_active(principal.purpose_ids, query.purpose_id)
    classification_within_ceiling(query.classification, principal.clearance)
    connector_permitted(principal.permitted_connectors, query.connector_id)
}

# Hard rule: PHI data requires active patient_encounter context
deny {
    "PHI:TRUE" in input.query.data_markings
    not has_active_encounter(input.principal.purpose_ids)
}
```

---

## 6. Core TypeScript Schemas

### OntologyObject (universal base)

```typescript
interface OntologyObject {
  id: string;                           // UUID v7
  object_type: string;                  // Registered in Atlas + TypeDB
  display_name: string;
  classification: ClassificationLevel;
  markings: string[];                   // ["PHI:TRUE", "ITAR:TRUE"]
  created_at: Date;
  updated_at: Date;
  created_by: string;
  source_connector_id: string;
  properties: Record<string, OntologyPropertyValue>;
  live_properties?: string[];           // Resolved at query time from MCP
}

type OntologyPropertyValue = string | number | boolean | Date | string[] | null;
type ClassificationLevel = "UNCLASSIFIED" | "CUI" | "SECRET" | "TOP_SECRET";
```

### ActionRequest (Temporal workflow input)

```typescript
interface ActionRequest {
  action_id: string;            // UUID v7
  tool_id: string;              // Registered MCPTool ID
  triggered_by: "agent" | "logic_chain" | "automate" | "manual";
  trigger_context: Record<string, unknown>;
  params: Record<string, unknown>;        // Validated against tool input_schema
  hitl_level: 1 | 2 | 3;
  proposal_id: string;
  agent_run_id?: string;
  user_id: string;
  purpose_id: string;
  classification_ceiling: ClassificationLevel;
}
```

---

## 7. Environment Variables Reference

```bash
# MCP Gateway
MCP_GATEWAY_PORT=4000
MCP_GATEWAY_SECRET=<vault-ref>

# OPA Policy Engine
OPA_URL=http://opa:8181
OPA_POLICY_PATH=/v1/data/yaip/authz/allow

# LLM Routing
LITELLM_MODE=cloud           # cloud | local | consensus
ANTHROPIC_API_KEY=<vault-ref>
OPENAI_API_KEY=<vault-ref>
OLLAMA_BASE_URL=http://ollama:11434

# Databases
NEO4J_URI=bolt://neo4j:7687
TYPEDB_URI=typedb://typedb:1729
CLICKHOUSE_URL=http://clickhouse:8123
POSTGRES_URL=postgresql://yaip:pw@postgres:5432/yaip

# Object Storage
S3_BUCKET=yaip-data
MINIO_ENDPOINT=http://minio:9000          # Air-gap only
MINIO_ACCESS_KEY=<vault-ref>

# Streaming
KAFKA_BROKERS=kafka:9092
SCHEMA_REGISTRY_URL=http://schema-registry:8081

# Temporal
TEMPORAL_ADDRESS=temporal:7233
TEMPORAL_NAMESPACE=yaip-prod
TEMPORAL_TASK_QUEUE=actions

# Security
TEE_ENABLED=false            # true for Medical/Defense sovereign
CLASSIFICATION_MODE=UNCLASSIFIED
PRESIDIO_ENABLED=true

# Deployment
DEPLOYMENT_MODE=cloud        # cloud | on_prem | air_gap
K8S_MODE=full                # full | k3s (edge)
ENVIRONMENT_NAME=dev
CHANNEL=canary
```
