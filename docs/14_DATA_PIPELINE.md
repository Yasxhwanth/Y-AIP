# 14. Data Pipeline & Ontology Sync (Phase 2 MVP)

## Overview
In the Y-AIP Architecture, the **Data Pipeline** is responsible for moving raw, tabular data from federated sources (like Postgres, Trino, or edge databases) into the deep semantic **Neo4j Ontology** so that the AI Agent Engine and the Next.js Command Center have a live "World State" to operate against.

Because Y-AIP strictly enforces Zero-Trust Policy-Based Access Control (PBAC), the sync engine **cannot** connect directly to the underlying databases. It must request data through the **MCP Gateway**, ensuring the sync engine itself is subject to OPA authorization rules.

## The MVP Implementation

### 1. Mock Edge Telemetry (`01_mock_data.sql`)
To simulate a real-world edge environment, a local PostgreSQL instance is initialized with mock telemetry data:
- **`edge.drone_units`**: Drones with varying battery percentages and statuses.
- **`edge.solar_panels`**: Solar panels with efficiency ratings and an explicit `anomaly_detected` flag.

This simulates the operational environment that the AI Agents (specifically the `inspection-dispatcher`) are designed to monitor.

### 2. The Sync Script (`services/data-pipeline/sync-ontology.js`)
This Node.js script acts as our lightweight "Airbyte". It performs the following mapping:

1. **Fetches Data**: Executes a `POST /mcp/query` to the MCP Gateway requesting `SELECT * FROM edge.solar_panels` and `SELECT * FROM edge.drone_units` using the `connector-postgres` plugin.
2. **Translates to Cypher**: Maps the flat rows into Cypher `MERGE` statements that align with the SHACL ontology shapes defined natively in Neo4j.
3. **Upserts**: Writes the data into Neo4j, making it immediately visible to the `AtlasViewer` component in the Nexus Command Center UI.

## Startup & Synchronization Instructions

When starting the platform from a fresh state, you must run the data sync pipeline to populate the UI.

**Step 1: Start the Core Infrastructure**
Start Docker Compose to initialize Postgres, Neo4j, ClickHouse, Keycloak, Kafka, and OPA.
```bash
cd infra
docker-compose up -d
```
*(Note: Postgres automatically runs `01_mock_data.sql` during database generation).*

**Step 2: Start the APIs (In separate terminals)**
The Agent Engine and the Sync pipeline rely on the Gateway and GraphQL APIs.
```bash
# Terminal 2
npm run dev:gateway

# Terminal 3
npm run dev:graphql
```

**Step 3: Run the Sync Pipeline**
Extract the mock telemetry from Postgres and load it into the Neo4j active ontology.
```bash
cd services/data-pipeline
npm install
npm run sync
```

**Step 4: Launch the Command Center UI**
```bash
cd apps/command-center
npm run dev
```
Navigate to `http://localhost:3000`. You will now see the `AtlasViewer` successfully parsing and rendering the live drone and solar panel objects.
