# Y-AIP: Autonomous Intelligence Platform
### Full Technical Documentation — v2.0 (2026 Edition)

> **Project Y-AIP** is a sovereign, metadata-driven, agentic operating system for high-consequence enterprises. It is a 1:1 architectural competitor to Palantir's triple-platform (Foundry + AIP + Apollo), with added 2026 capabilities in edge robotics, GraphRAG ontology extraction, multi-model consensus, and hardware-rooted trust for Defense, Medical, and Finance verticals.

---

## Document Index

| # | File | What It Covers |
|---|------|----------------|
| 00 | `00_OVERVIEW.md` *(this file)* | Architecture map, design philosophy, competitive matrix |
| 01 | `01_DATA_PLANE.md` | Tiered data plane: Zero-Copy + Kafka/Spark/Delta Lake + Airbyte + MinIO |
| 02 | `02_ONTOLOGY.md` | Neo4j (traversal) + TypeDB (types) + GraphQL (API) |
| 03 | `03_AIP_LOGIC_AUTOMATE.md` | Logic builder, Automate triggers, Proposals workflow |
| 04 | `04_AGENT_STUDIO.md` | Multi-agent orchestration, LangGraph, k-LLM consensus |
| 05 | `05_ACTIONS.md` | Temporal workflows, HITL gates, Saga compensation, Undo stack |
| 06 | `06_GOVERNANCE.md` | OPA + Rego PBAC, Audit Logs, Purpose Strings, Data Markings |
| 07 | `07_SECURITY.md` | TEEs, PII Masking, Air-Gap, Confidential Computing |
| 08 | `08_APOLLO_DEPLOYMENT.md` | Pull-based deployment, ephemeral nodes, K8s vs K3s tiers |
| 09 | `09_MODULES.md` | Nexus (Workshop), Canvas (Slate), Lens (Contour), Stream (Quiver) |
| 10 | `10_EDGE_ROBOTICS.md` | Drone agents, Micro-Agent protocol, DDIL resilience |
| 11 | `11_INDUSTRY_VERTICALS.md` | Defense IL6, Medical HIPAA, Finance PCI-DSS |
| 12 | `12_TECH_STACK.md` | Full OSS stack v2.0, API contracts, TypeScript schemas |
| 13 | `13_ROADMAP.md` | 90-day build phases, milestones, architecture decision log |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Y-AIP PLATFORM  (v2.0)                       │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  COMMAND CENTER  (Next.js 15 + tRPC + Three.js)               │   │
│  │  Nexus (Workshop) │ Canvas (Slate) │ Lens │ Stream            │   │
│  └────────────────────────┬───────────────────────────────────┘   │
│                           │ tRPC / REST / WebSocket                  │
│  ┌────────────────────────▼───────────────────────────────────┐   │
│  │  AIP LOGIC & AUTOMATE LAYER                                   │
│  │  LangGraph State Machines │ AIP Logic Builder │ Proposals     │
│  └────────────────────────┬───────────────────────────────────┘   │
│                           │                                          │
│           ┌──────────────┴─────────────────────┐                  │
│           │                              │                           │
│  ┌─────────▼────────────┐    ┌─────────▼────────────────┐   │
│  │  AGENT STUDIO           │    │  ACTIONS LAYER                │   │
│  │  LangGraph + k-LLM     │    │  Temporal Workflows            │   │
│  │  LiteLLM + Llama/Ollama │    │  HITL Gates + Saga Undo       │   │
│  └──────────────────────┘    └────────────────────────┘   │
│       │ GraphRAG                      │ FastAPI MCP Tools             │
│  ┌─────▼─────────────────────────▼─────────────────────────┐   │
│  │  SEMANTIC ONTOLOGY LAYER                                      │
│  │  Neo4j (graph traversal + GraphRAG)                           │
│  │  TypeDB (type registry + semantic rules)                      │
│  │  GraphQL API (Nexus + external developers)                    │
│  └────────────────────────┬───────────────────────────────┘   │
│                           │                                          │
│  ┌────────────────────────▼───────────────────────────────┐   │
│  │  DATA PLANE — TIERED ARCHITECTURE                             │
│  │  MCP Gateway (OPA sidecar) │ Trino (live)                   │
│  │  Kafka + Schema Registry │ Spark + Delta Lake (batch)       │
│  │  S3 / MinIO (object store) │ Airbyte (ETL escape hatch)     │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  GOVERNANCE & SECURITY (mesh-wide)                             │
│  │  OPA + Rego PBAC │ Keycloak IdP │ TEEs │ ClickHouse Audit  │   │
│  │  Presidio PII Mask │ Lakera Guard │ Vault Secrets          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  APOLLO-LITE DEPLOYMENT ENGINE                                │
│  │  Full K8s (cloud/on-prem) │ K3s (edge/DDIL) │ NixOS Air-Gap │   │
│  │  Pull-based │ Canary Analysis │ MinIO + Harbor (air-gap)   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Design Philosophy

### 1. Metadata-Driven, Never Hard-Coded
Every object type, relationship, action schema, and connector is defined in metadata (JSON manifests) — not in application code. When schemas change, a Discovery Agent updates the manifests automatically.

### 2. Zero-Copy by Default
Y-AIP never asks customers to migrate data. All queries are federated at the MCP Gateway layer. Data stays in Snowflake, Databricks, S3, or on-prem SQL — Y-AIP only reads/writes via governed connectors.

### 3. Sovereignty-First
Every deployment mode — cloud, on-prem, and air-gapped edge — is a first-class citizen. The system must boot from a NixOS image with zero internet access for Defense IL6 contracts.

### 4. Explainability over Magic
Every AI decision is traceable to a specific graph node, a specific data version, and a specific reasoning chain. "Black box" outputs are a hard-fail condition.

### 5. Human Authority
AI proposes; humans decide (at configurable risk thresholds). No life-critical or irreversible action can be executed without a Level-3 physical approval in the Command Center.

---

## Competitive Matrix

| Capability | Palantir AIP | Y-AIP |
|---|---|---|
| Data Architecture | Foundry (centralized ingestion) | Zero-Copy MCP Mesh |
| Ontology Definition | Manual (FDE-assisted) | Agentic Extraction (auto-discovered) |
| LLM Strategy | Single model per logic | k-LLM Consensus (multi-model vote) |
| Reasoning Framework | AIP Logic (proprietary GUI) | LangGraph State Machines (open) |
| Deployment | Apollo (proprietary CD) | Apollo-Lite (K3s + NixOS, open) |
| Edge Support | Limited | Native — Drone/Robot as First-Class Agent |
| Explainability | Audit trail | Full Causal Chain + Time-Travel Replay |
| Security Model | RBAC + Markings | PBAC + TEEs + Purpose Strings |
| Setup Time | Weeks–months (Bootcamp) | Minutes (MCP auto-discovery) |
| Air-Gap Support | Yes (Government) | Yes (NixOS single-image boot) |
| Pricing | $10M+ enterprise | Open-core + hosted tiers |

---

## Naming Conventions (Y-AIP vs Palantir)

| Palantir Module | Y-AIP Equivalent | Description |
|---|---|---|
| Foundry Pipeline Builder | **Forge** | Visual data pipeline builder |
| Ontology Manager | **Atlas** | Dynamic ontology editor |
| Workshop | **Nexus** | Low-code operational app builder |
| Slate | **Canvas** | Developer-grade custom app builder |
| Contour | **Lens** | Dataset-centric analytics |
| Quiver | **Stream** | Object & time-series analytics |
| AIP Logic | **Logic Studio** | No-code AI reasoning chains |
| AIP Automate | **Automate** | Event-triggered automation |
| AIP Agent Studio | **Agent Studio** | Multi-agent orchestration |
| AIP Evals | **EvalScope** | AI testing & hallucination detection |
| Apollo | **Apollo-Lite** | Pull-based sovereign deployment |
| Gotham | **Sentinel** | Defense/intelligence command interface |
