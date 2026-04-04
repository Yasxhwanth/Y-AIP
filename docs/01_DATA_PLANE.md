# Y-AIP — Layer 1: The Data Plane
### Tiered Data Architecture: Zero-Copy + Streaming + Batch

---

## Overview

Palantir requires customers to ingest ("Foundry Tax") all data before any AI can touch it. Y-AIP reverses this as the **default**: the data never moves. Every queryable source is registered as an **MCP Server** and queried in-place via the **MCP Gateway**. For sources that cannot be queried live, a governed ETL escape hatch (Airbyte) is available.

### Data Access Decision Tree

```
New Data Source
       │
       ▼
Has live queryable API (SQL / REST / FHIR)?
       │
       ├─ YES → MCP Connector → Trino (zero-copy, live)
       │
       └─ NO  → Is it real-time streaming?
                   │
                   ├─ YES → Kafka + Schema Registry
                   │         └─► Spark Structured Streaming → Delta Lake
                   └─ NO  → Airbyte ETL (escape hatch)
                              └─► MinIO / S3 as Delta Lake
                                  └─► Trino queries the Delta table
```

### Full Data Architecture

```
Customer's World                     Y-AIP Platform
─────────────────                    ──────────────
 Snowflake ─────────────────────────► MCP Connector: Snowflake  ┐
 SAP HANA ──────────────────────────► MCP Connector: SAP        │ Zero-Copy
 FHIR EHR ──────────────────────────► MCP Connector: FHIR R5   │ (default)
 Postgres ───────────────────────────► MCP Connector: SQL       ┘
                                           │
 Kafka Streams ─────────────────────► Schema Registry + Spark   ┐ Streaming
 MQTT Telemetry ────────────────────► Mosquitto → Kafka         ┘
                                           │
 Legacy / Offline ───────────────────► Airbyte → Delta Lake     ┐ ETL
 Flat Files ─────────────────────────► Airbyte → MinIO/S3       ┘ (escape hatch)
                                           │
                      ┌────────────────────▼───────────┐
                      │         MCP GATEWAY             │
                      │  OPA sidecar: PBAC evaluation  │
                      │  - Marking enforcement          │
                      │  - Purpose-string check         │
                      │  - PII masking pre-LLM          │
                      └────────────────────┬───────────┘
                               ┌───────────┴───────────┐
                  ┌────────────▼────┐   ┌──────────────▼──────┐
                  │  Trino          │   │  Spark SQL           │
                  │  (live queries) │   │  (batch / ML jobs)   │
                  └─────────────────┘   └─────────────────────┘
```

---

## 1. MCP Gateway

The MCP Gateway is the single entry point for all data access. It enforces governance **before** any query reaches a data source or an LLM.

### Responsibilities

| Responsibility | Mechanism |
|---|---|
| Route queries to the correct MCP Server | Dynamic connector registry (stored in Postgres metadata DB) |
| Enforce data markings | `[CLASS:SECRET]`, `[PHI:TRUE]`, `[PCI:PAN]` headers checked per query |
| Validate purpose strings | Every query must carry a `purpose_id` referencing an active ontology context |
| PII masking | Microsoft Presidio integrated at gateway — strips names, SSNs, card numbers before LLM prompt |
| Rate limiting + quota | Per-agent, per-user, per-connector quotas enforced |
| Audit emission | Every query emitted as an immutable event to ClickHouse Audit Log |

### MCP Gateway API Contract

```typescript
// Request to MCP Gateway
interface MCPQueryRequest {
  connector_id: string;           // "snowflake-prod-us" | "fhir-hospital-x"
  query: string;                  // SQL, FHIR query, or natural language
  query_type: "sql" | "fhir" | "nl" | "graph";
  purpose_id: string;             // Must reference active OntologyContext
  agent_id?: string;              // If called by an agent
  user_id: string;
  classification_ceiling: "UNCLASSIFIED" | "CUI" | "SECRET" | "TOP_SECRET";
}

// Response from MCP Gateway
interface MCPQueryResponse {
  data: Record<string, unknown>[];
  masked_fields: string[];        // Fields that were stripped by Presidio
  audit_id: string;               // Immutable reference to ClickHouse log entry
  lineage: DataLineageEntry[];    // Which source tables/rows contributed
  latency_ms: number;
}
```

---

## 2. Connectors ("MCP Servers")

Each data source runs as an MCP Server — a lightweight adapter that translates MCP protocol calls into native API/SQL calls.

### Built-In Connectors (v1.0)

| Connector | Source Type | Protocol |
|---|---|---|
| `connector-postgres` | PostgreSQL / CockroachDB | SQL |
| `connector-snowflake` | Snowflake | SQL + REST |
| `connector-databricks` | Databricks Delta Lake | SQL + REST |
| `connector-s3-iceberg` | S3 + Apache Iceberg | Iceberg REST Catalog |
| `connector-fhir` | FHIR R5 EHR systems | FHIR REST |
| `connector-sap` | SAP HANA / S/4HANA | OData v4 |
| `connector-slack` | Slack | Events API + Web API |
| `connector-jira` | Jira / Confluence | REST v3 |
| `connector-neo4j` | Neo4j Graph DB | Bolt / HTTP |
| `connector-mqtt` | IoT / Drone telemetry | MQTT v5 |
| `connector-kafka` | Real-time event streams | Kafka REST Proxy |

### Connector Manifest Schema

```typescript
// connector-manifest.json — No hard-coding; all connectors are metadata-driven
interface ConnectorManifest {
  connector_id: string;
  display_name: string;
  source_type: "relational" | "graph" | "document" | "stream" | "iot" | "api";
  connection: {
    host: string;
    port: number;
    auth_type: "oauth2" | "api_key" | "mtls" | "iam_role";
    auth_ref: string;           // Reference to secrets manager key, never plaintext
  };
  governance: {
    default_classification: string;
    phi_fields: string[];       // Fields automatically treated as PHI
    pci_fields: string[];       // Fields automatically treated as PAN
    allowed_purposes: string[];
  };
  schema_sync: {
    auto_discover: boolean;     // Triggers Discovery Agent on connection
    sync_interval_minutes: number;
  };
}
```

---

## 3. Trino: Federated SQL Engine

Trino sits behind the MCP Gateway and allows multi-source SQL joins without data movement.

### Example: Join Medical + Finance data in-place

```sql
-- Y-AIP Federated Query (executed by Trino across two live sources)
SELECT
    p.patient_id,
    p.diagnosis_code,
    ins.coverage_amount,
    ins.claim_status
FROM
    fhir_hospital_x.patients p          -- Reads live from FHIR connector
JOIN
    snowflake_finance.insurance_claims ins  -- Reads live from Snowflake
ON
    p.patient_id = ins.patient_id
WHERE
    p.diagnosis_code IN ('J96.0', 'I21.3')  -- ICU + Heart attack codes
```

> **Zero bytes copied.** Trino pushes predicates down to each native source.

---

## 4. DuckDB: Lightweight Analytical Tier

**Trino** is great for live federated joins. **Spark** handles TB-scale batch. But many useful analytical workloads are in between — exploratory queries on Delta Lake tables, EvalScope dataset generation, small feature computations. Spinning up a Spark cluster for these is wasteful.

**DuckDB** runs in-process (no cluster, no external service) and can query Delta Lake files directly from S3/MinIO. It handles up to ~100GB single-node with sub-second latency.

### Analytics Tier Decision

| Workload | Engine | Why |
|---|---|---|
| Live agent context query | Trino | Zero-copy cross-source join |
| Ad-hoc audit analysis (<10GB) | DuckDB | Single process, instant start |
| EvalScope dataset generation | DuckDB | Fast local iteration |
| Nightly ML feature engineering (>100GB) | Spark | Distributed, cluster-scale |
| Historical data backfill (TB+) | Spark | Only viable option at this scale |

```python
# duckdb_analytics.py — reads Delta Lake directly from MinIO/S3
import duckdb

conn = duckdb.connect()

# Install Delta extension (reads Delta Lake natively)
conn.execute("INSTALL delta; LOAD delta;")

# Configure MinIO as S3-compatible store
conn.execute("""
    SET s3_endpoint='minio:9000';
    SET s3_access_key_id='${MINIO_ACCESS_KEY}';
    SET s3_secret_access_key='${MINIO_SECRET_KEY}';
    SET s3_use_ssl=false;
""")

# Query Delta Lake table directly — no ETL, no Spark cluster
result = conn.execute("""
    SELECT employee_id, AVG(amount) as avg_amount
    FROM delta_scan('s3://yaip-data/transactions')
    WHERE created_at > NOW() - INTERVAL 30 DAYS
    GROUP BY employee_id
""").fetchdf()
```

DuckDB is also used in the **EvalScope** runner for fast golden-dataset generation and metric computation.

---

## 5. Delta Lake + Apache XTable: Unified Table Format

**Delta Lake** is Y-AIP's primary open table format — used for all batch storage in MinIO (air-gap) and S3 (cloud). Apache Spark reads and writes Delta Lake natively.

For interoperability with external consumers that expect Iceberg or Hudi, Y-AIP uses **Apache XTable** as a no-ETL format bridge:

```
Y-AIP writes:  Spark → Delta Lake (MinIO / S3)
                          │
                     Apache XTable
                          │
                  ┌───────┴───────┐
           Iceberg REST       Hudi format
           Catalog → Trino   (external)
```

This means external Iceberg or Hudi consumers can read Y-AIP data without any data duplication or ETL.

---

## 5. Real-Time Streaming (Kafka + Schema Registry + Spark)

For IoT, drone telemetry, and financial tick data, all events flow through **Kafka with Schema Registry** (Avro/Protobuf enforcement). **Spark Structured Streaming** processes events and writes them to Delta Lake or updates Ontology objects.

### Schema Registry Requirement

Every Kafka topic **must** have a registered schema. Producers that attempt to publish without a valid schema are rejected. This prevents malformed events from corrupting agent state.

```
Drone MQTT Telemetry
    └─► Mosquitto → Kafka Topic: drone.telemetry.raw
                         │  (Avro schema enforced by Schema Registry)
                         ▼
              Spark Structured Streaming
                  ├─► Delta Lake (drone.telemetry_history)
                  └─► Ontology Update: Drone_Unit object {
                          battery_pct: 72,      // updated every 5s
                          gps: [lat, lon, alt],
                          mission_status: "ACTIVE"
                      }
```

### Kafka + Schema Registry Connector

```typescript
// connector-kafka-manifest.json
{
  "connector_id": "kafka-drone-telemetry",
  "source_type": "stream",
  "kafka": {
    "brokers": ["kafka:9092"],
    "schema_registry_url": "http://schema-registry:8081",
    "topic": "drone.telemetry.raw",
    "schema_format": "avro",
    "consumer_group": "yaip-stream-processor"
  }
}
```

---

## 4. Apache Spark: Batch & ML Tier

**Trino** handles low-latency live queries for agents. **Spark** handles heavy batch work that agents should not block on:

| Workload | Engine |
|---|---|
| Agent queries ontology for live context | Trino |
| Agent needs result of live cross-source join | Trino |
| Nightly feature engineering for ML models | Spark |
| Backfill Delta Lake from historical archive | Spark |
| Large-scale fraud graph computation | Spark (GraphX) |
| EvalScope golden dataset generation | Spark |

```python
# spark_jobs/feature_engineering.py
from pyspark.sql import SparkSession

spark = SparkSession.builder \
    .appName("yaip-feature-eng") \
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
    .getOrCreate()

# Read raw transactions from Delta Lake
txns = spark.read.format("delta").load("s3://yaip-data/transactions")

# Compute 30-day rolling average per employee
features = txns.groupBy("employee_id").agg(
    avg("amount").over(Window.partitionBy("employee_id").rowsBetween(-30, 0)).alias("avg_30d")
)

# Write features back as Delta table
features.write.format("delta").mode("overwrite").save("s3://yaip-data/features/employee_risk")
```

---

## 7. MinIO: Air-Gap Object Storage

For deployments without AWS access (Defense IL6, medical on-prem), **MinIO** provides an S3-compatible object store that runs fully self-hosted.

| Tier | Object Store | Use Case |
|---|---|---|
| Cloud | AWS S3 | Commercial cloud, Northflank hosted |
| Sovereign on-prem | MinIO | Hospital on-prem, enterprise private cloud |
| Air-gap (Defense) | MinIO | IL6 SCIF, naval vessel, air-gapped SCADA |

```yaml
# docker-compose.minio.yaml (air-gap deployment)
services:
  minio:
    image: minio/minio:RELEASE.2025-01-01
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes:
      - minio_data:/data
```

MinIO is **API-identical to S3** — no code changes needed between cloud and air-gap deployments. The `DEPLOYMENT_MODE=air_gap` env var switches the object store endpoint.

---

## 8. Airbyte: ETL Escape Hatch

> **Rule**: Airbyte is the **last resort**. If a source can be queried live via any API (REST, SQL, FHIR, MQTT), use an MCP Connector instead. Airbyte is only used when live access is impossible.

### When Airbyte is Justified

| Scenario | Why Airbyte |
|---|---|
| Legacy COBOL mainframe with no API | Cannot register an MCP Connector — must export to file |
| Air-gap offline batch export | Network-isolated source sends nightly dump |
| Third-party SaaS with no live webhook/API | Must poll and sync |
| Historical backfill from archive | One-time bulk load |

### Airbyte Integration Pattern

```
Legacy Source (COBOL / offline)
       │
       ▼
Airbyte (self-hosted, no cloud)
   └─► Destination: MinIO / S3 (Delta Lake format)
             │
             ▼
        Trino connector: reads as live Delta table
             │
             ▼
        Agents query via MCP Gateway (zero-copy from here)
```

Once landed in Delta Lake, the Airbyte-sourced data is treated identically to any other MCP connector — governance, markings, and purpose strings are enforced at the MCP Gateway layer.

---

## 9. Discovery Agent

When a new connector is registered, the **Discovery Agent** automatically crawls it and produces an `ontology-proposal.json` that an operator can approve.

```
New Connector Registered
        │
        ▼
Discovery Agent (Claude 3.5 via LiteLLM)
  - Reads schema metadata (table names, column types, foreign keys)
  - Reads sample rows (masked, with governance ceiling)
  - Produces: ontology-proposal.json
        │
        ▼
Atlas (Ontology Editor) → Human Review → Approve/Modify → Neo4j committed
```

### Discovery Agent Prompt Pattern

```
You are an ontology architect. Given the following database schema,
identify the real-world "Objects" (entities/nouns), their "Properties"
(attributes), and the "Links" (relationships between objects).
Do NOT invent relationships. Only propose ones directly observable in
the schema via foreign keys, join columns, or naming conventions.

Output format: ontology-proposal.json (see schema below).
```

The output `ontology-proposal.json` is **never auto-applied**. A human must approve via the Atlas UI.
