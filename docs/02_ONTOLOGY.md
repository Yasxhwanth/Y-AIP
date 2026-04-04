# Y-AIP — Layer 2: The Dynamic Semantic Ontology
### Neo4j + SHACL (semantic validation) + GraphQL (API)

---

## Overview

The Ontology is the soul of Y-AIP. It converts raw rows of data into a living, queryable **Knowledge Graph** of real-world entities. Where Palantir requires Forward Deployed Engineers (FDEs) to hand-craft an ontology over weeks, Y-AIP uses an **Agentic Extraction** pipeline to auto-discover Objects and Relationships in minutes.

```
Raw Data (SQL tables, FHIR records, SAP documents)
            │
            ▼
  Discovery Agent (LLM-powered schema crawler)
            │
            ▼
  Human Review in Atlas (approve / reject / tweak)
            │
            ▼
  Neo4j Knowledge Graph
    ├─ SHACL shapes (semantic rules, via neosemantics plugin)
    ├─ Cypher traversal (GraphRAG, live agent queries)
    └─ @neo4j/graphql (auto-generated GraphQL API)
            │
            ▼
  GraphQL Ontology API
  (Nexus apps, Agents, external clients)
```

### Architecture

| Concern | Solution | How |
|---|---|---|
| Fast graph traversal + GraphRAG | Neo4j + Cypher | Primary query engine |
| Semantic constraint validation | SHACL + neosemantics | Neo4j plugin — no second DB |
| Standard client API | GraphQL | Auto-generated from Neo4j schema |

---

## 1. Core Concepts

### Objects (Nouns)
Every real-world entity tracked by Y-AIP. Objects are strongly typed via TypeScript interfaces and stored as Neo4j nodes.

| Object Type | Example | Industry |
|---|---|---|
| `Asset` | Drone_Unit_042, Tank_Bravo_9 | Defense |
| `Patient` | Patient_MRN_00291 | Medical |
| `Transaction` | TXN_8821-B | Finance |
| `SolarPanel` | Panel_Farm3_Row7_Col12 | Energy |
| `Mission` | Mission_Recon_Alpha | Defense |
| `Claim` | Claim_INS_4421 | Finance / Medical |
| `Employee` | EMP_HR_10042 | Universal |

### Properties
Typed attributes on each object. Can be static (stored in graph) or **live** (resolved at query time from MCP connector).

```typescript
interface DroneUnitObject {
  id: string;               // Immutable primary key
  display_name: string;
  serial_number: string;
  model: "LicheeRV_Nano" | "Jetson_Orin" | "DJI_M300";
  // Live properties (resolved at query time via connector-mqtt)
  battery_pct: number;
  gps_lat: number;
  gps_lon: number;
  altitude_m: number;
  mission_status: "IDLE" | "ACTIVE" | "RTB" | "EMERGENCY";
  // Static properties (stored in Neo4j)
  assigned_operator_id: string;
  home_base_id: string;
  classification: "UNCLASSIFIED" | "CUI";
}
```

### Links (Relationships)
Edges in the knowledge graph connecting Objects.

```cypher
// Example Neo4j relationships
(Mission)-[:ASSIGNED_TO]->(DroneUnit)
(DroneUnit)-[:INSPECTS]->(SolarPanel)
(Patient)-[:TREATED_BY]->(Physician)
(Patient)-[:TAKES]->(Medication)
(Transaction)-[:INITIATED_BY]->(Employee)
(Transaction)-[:FLAGS]->(ComplianceAlert)
```

### Actions (Verbs)
Registered operations that AI agents or humans can execute. Actions write back to the Ontology AND to external systems via MCP connectors.

```typescript
interface OntologyAction {
  action_id: string;
  display_name: string;
  target_object_type: string;
  parameters: JsonSchema;
  hitl_level: 1 | 2 | 3;       // Human-in-the-loop requirement
  revert_action_id?: string;    // Must exist for all Level 2/3 actions
  mcp_connector_id: string;
  permissions_required: string[];
}
```

---

## 2. Agentic Ontology Extraction

### Step 1: Schema Discovery
The Discovery Agent reads connector metadata:

```python
# discovery_agent.py (runs on Day 1 of a new connector registration)
async def extract_ontology_proposal(connector_manifest: ConnectorManifest) -> OntologyProposal:
    schema = await mcp_gateway.get_schema(connector_manifest.connector_id)
    sample_rows = await mcp_gateway.get_sample(connector_manifest.connector_id, n=50, masked=True)

    prompt = build_extraction_prompt(schema, sample_rows)

    # k-LLM consensus: both models must agree on proposed objects
    response_a = await litellm.complete("claude-3-5-sonnet", prompt)
    response_b = await litellm.complete("meta/llama-4-scout", prompt)

    proposal = merge_proposals(response_a, response_b)  # Only overlapping proposals kept
    return proposal
```

### Step 2: Human Review in Atlas
The Atlas UI presents the `ontology-proposal.json` as a visual graph. Operators can:
- ✅ Approve proposed objects / links
- ✏️ Rename, retype, or merge proposals
- ❌ Reject false-positive relationships
- ➕ Manually add missing objects

### Step 3: Commit + Validate
Approved proposals are committed to Neo4j. The neosemantics plugin immediately validates the new nodes against SHACL shapes. If validation fails, the commit is rolled back and the error is surfaced in Atlas.

```python
# ontology_commit.py
async def commit_approved_proposal(proposal: OntologyProposal):
    async with neo4j_client.session() as session:
        async with session.begin_transaction() as tx:
            # Write graph data
            await tx.run(build_cypher_create(proposal.objects))
            await tx.run(build_cypher_relationships(proposal.links))

            # Validate against SHACL shapes (neosemantics built-in)
            result = await tx.run(
                "CALL n10s.validation.shacl.validate() "
                "YIELD focusNode, nodeType, shapeId, propertyShape, offendingValue, resultSeverity"
            )
            violations = [r for r in result if r["resultSeverity"] == "sh:Violation"]
            if violations:
                await tx.rollback()
                raise OntologyValidationError(violations)
            await tx.commit()

    # Invalidate GraphQL schema cache
    await graphql_schema_cache.invalidate()
```

A **Schema Watcher** monitors connector schemas for drift and re-triggers Step 1 automatically.

---

## 3. GraphRAG: AI Queries on the Knowledge Graph

Standard RAG (Retrieval Augmented Generation) retrieves flat text chunks. Y-AIP uses **GraphRAG** — the LLM queries the Neo4j knowledge graph to retrieve structured, relational context.

### GraphRAG Request Flow

```
User / Agent asks: "Which drones are near anomalous solar panels?"
        │
        ▼
GraphRAG Retriever
  1. Entity extraction from question → ["Drone", "SolarPanel", "anomaly"]
  2. Graph traversal:
     MATCH (d:Drone)-[:INSPECTS]->(p:SolarPanel)
     WHERE p.anomaly_score > 0.8
     RETURN d, p, p.last_inspection_ts
  3. Context assembly: returns structured JSON, not raw text
        │
        ▼
LLM receives: structured context + question
LLM outputs: "Drone_042 (battery: 91%) is 120m from Panel_Farm3_R7C12
              which flagged a heat anomaly at 14:23 UTC."
```

### Why GraphRAG vs. Standard RAG

| | Standard RAG | Y-AIP GraphRAG |
|---|---|---|
| Data retrieved | Text chunks | Structured graph subgraph |
| Hallucination risk | High (text disconnected) | Low (typed, relational facts) |
| Traceability | Poor | Full (every fact = a graph node with provenance) |
| Multi-hop reasoning | No | Yes (traverse N hops in one query) |

---

## 4. Causal Lineage

Every AI decision in Y-AIP must be traceable. Causal Lineage links each output back to:

```
AI Decision: "Flag Transaction TXN_8821-B as suspicious"
    │
    └─► Reasoning chain:
          ├─► Queried ontology node: Transaction {amount: $48,200}
          ├─► Queried link: Employee[EMP_103] -[:INITIATED]-> Transaction
          ├─► Queried historical pattern: EMP_103 avg transaction = $1,200
          ├─► Retrieved rule: "Deviation > 10x avg = HIGH_RISK"
          └─► LLM output: confidence=0.94, model="claude-3-5-sonnet"
```

This chain is stored in ClickHouse and queryable via the **Time-Travel Audit** feature — you can replay any decision at any historical timestamp.

---

## 5. SHACL: Semantic Constraint Validation (via neosemantics)

Neo4j stores the graph. **SHACL (Shapes Constraint Language)** — loaded via the `neosemantics` (n10s) Neo4j plugin — enforces what is semantically valid. This replaces TypeDB entirely: same constraint power, zero additional infrastructure.

### Why SHACL + neosemantics over TypeDB

| Need | TypeDB | SHACL + neosemantics |
|---|---|---|
| Semantic constraint rules | ✅ TypeQL | ✅ Turtle/SHACL shapes |
| Second database to run | ❌ Yes (major ops cost) | ✅ No — Neo4j plugin |
| Distributed commit risk | ❌ Yes | ✅ No — single transaction |
| Community + maturity | ❌ Small team, niche | ✅ W3C standard, broad adoption |
| GraphRAG compatibility | ❌ Poor | ✅ Native (same Neo4j instance) |
| Air-gap self-host | ❌ Complex | ✅ Just load the plugin |

### SHACL Shape Example

```turtle
# shacl/medical.ttl — Semantic constraint definitions (W3C SHACL)
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix yaip: <https://yaip.io/ontology#> .

# Shape: Patient properties are required
yaip:PatientShape
    a sh:NodeShape ;
    sh:targetClass yaip:Patient ;
    sh:property [
        sh:path yaip:mrn ;
        sh:minCount 1 ;
        sh:datatype xsd:string ;
    ] ;
    sh:property [
        sh:path yaip:dateOfBirth ;
        sh:minCount 1 ;
        sh:datatype xsd:date ;
    ] .

# Rule: A Patient cannot be their own Physician
yaip:NoSelfTreatmentConstraint
    a sh:NodeShape ;
    sh:targetClass yaip:Treatment ;
    sh:sparql [
        sh:message "A Patient cannot be their own treating Physician" ;
        sh:severity sh:Violation ;
        sh:select """
            SELECT $this WHERE {
                $this yaip:patient ?p .
                $this yaip:physician ?p .
            }
        """ ;
    ] .
```

SHACL shapes are loaded into Neo4j via the neosemantics plugin and validated **inside the same commit transaction** as the graph write. No second database, no sync risk, no distributed transaction.

### Loading Shapes

```cypher
// Load SHACL shapes into Neo4j (run once, or on schema update)
CALL n10s.validation.shacl.import.fetch(
    'file:///shacl/medical.ttl', 'Turtle'
)
```

---

## 6. GraphQL Ontology API

All external consumers — Nexus apps, Logic Studio, external developers — query the ontology via a **GraphQL API** auto-generated from the Neo4j schema.

### Why GraphQL Instead of Direct Cypher

| Concern | Direct Cypher | GraphQL |
|---|---|---|
| Client asks for only needed fields | ❌ Full node returned | ✅ Precise field selection |
| Real-time ontology updates | ❌ Polling required | ✅ GraphQL Subscriptions |
| External developer access | ❌ Must learn Cypher | ✅ Standard GraphQL |
| Security (field-level) | ❌ Manual guards | ✅ OPA at resolver level |

### GraphQL Schema (Auto-Generated)

```graphql
# Auto-generated from Neo4j schema via @neo4j/graphql
type DroneUnit {
  id: ID!
  displayName: String!
  serialNumber: String!
  batteryPct: Float
  missionStatus: MissionStatus
  assignedMissions: [Mission!]! @relationship(type: "ASSIGNED_TO", direction: OUT)
  inspectedPanels: [SolarPanel!]! @relationship(type: "INSPECTS", direction: OUT)
}

type Subscription {
  # Real-time: pushed whenever a DroneUnit object is updated in Neo4j
  droneUnitUpdated(id: ID!): DroneUnit!
}

type Query {
  droneUnitsNearAnomaly(threshold: Float!): [DroneUnit!]!
}
```

### OPA at GraphQL Resolvers
Every GraphQL resolver checks OPA before returning data:
```typescript
// graphql/resolvers/droneUnit.ts
export const droneUnitResolver = async (parent, args, ctx) => {
  const allowed = await opa.evaluate({
    principal: ctx.user,
    query: { resource_type: "DroneUnit", connector_id: "neo4j", purpose_id: ctx.purposeId }
  });
  if (!allowed) throw new ForbiddenError("OPA: access denied");
  return neo4j.query(/* ... */);
};
```

---

## 7. Multi-Modal Ontology

Y-AIP extends Palantir's ontology to support **image and video** as first-class properties on objects (critical for drone inspection use cases).

```typescript
interface SolarPanelObject {
  id: string;
  farm_id: string;
  row: number;
  col: number;
  // Multi-modal properties
  last_thermal_image_url: string;   // S3 URI → displayed in Nexus apps
  last_rgb_video_clip_url: string;  // S3 URI → 30s inspection clip
  anomaly_score: number;            // Computed by Vision AI agent
  anomaly_type?: "hotspot" | "crack" | "soiling" | "delamination";
  // Standard properties
  last_inspection_ts: Date;
  maintenance_status: "OK" | "SCHEDULED" | "URGENT";
}
```

The Vision AI Agent (a specialized sub-agent in Agent Studio) processes drone camera feeds, updates `anomaly_score` and `anomaly_type` in real-time, and links findings to Maintenance Actions.
