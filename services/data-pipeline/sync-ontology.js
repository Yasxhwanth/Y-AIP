// Y-AIP Data Pipeline: Ontology Sync Job
// Demonstrates Airbyte-like sync from Postgres -> MCP Gateway -> Neo4j
// In production, this would be a dbt model or Airbyte destination connector.

import { driver, auth } from "neo4j-driver";

const MCP_GATEWAY_URL = process.env.MCP_GATEWAY_URL || "http://localhost:4000";
const MCP_SECRET = process.env.MCP_GATEWAY_SECRET || "dev-secret-change-in-prod";

const NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7687";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASS = process.env.NEO4J_PASSWORD || "yaip_dev_secret";

const neo4jDriver = driver(NEO4J_URI, auth.basic(NEO4J_USER, NEO4J_PASS));

async function fetchFromMCP(sql) {
    const res = await fetch(`${MCP_GATEWAY_URL}/mcp/query`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${MCP_SECRET}`
        },
        body: JSON.stringify({
            connector_id: "connector-postgres",
            purpose_id: "ontology_sync",
            classification: "UNCLASSIFIED",
            data_markings: [],
            query: sql
        })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`MCP Gateway Error (${res.status}): ${text}`);
    }
    const data = await res.json();
    return data.rows || [];
}

async function syncSolarPanels(session) {
    console.log("Fetching Solar Panels from MCP...");
    const panels = await fetchFromMCP("SELECT * FROM edge.solar_panels");

    console.log(`Syncing ${panels.length} Solar Panels to Neo4j...`);
    for (const p of panels) {
        // Upsert matching the SHACL shape
        await session.run(`
            MERGE (n:SolarPanel { panel_id: $id })
            SET 
                n.location = $location,
                n.efficiency_pct = $eff,
                n.anomaly_detected = $anomaly,
                n.last_inspected = $last
        `, {
            id: p.panel_id,
            location: p.location,
            eff: Number(p.current_efficiency),
            anomaly: Boolean(p.anomaly_detected),
            last: p.last_inspected
        });
    }
}

async function syncDroneUnits(session) {
    console.log("Fetching Drone Units from MCP...");
    const drones = await fetchFromMCP("SELECT * FROM edge.drone_units");

    console.log(`Syncing ${drones.length} Drones to Neo4j...`);
    for (const d of drones) {
        await session.run(`
            MERGE (n:DroneUnit { drone_id: $id })
            SET 
                n.name = $name,
                n.battery_pct = $batt,
                n.status = $status,
                n.latitude = $lat,
                n.longitude = $lon
        `, {
            id: d.drone_id,
            name: d.name,
            batt: Number(d.battery_pct),
            status: d.status,
            lat: Number(d.current_lat),
            lon: Number(d.current_lon)
        });
    }
}

async function main() {
    console.log("Starting Y-AIP Ontology Sync...");
    const session = neo4jDriver.session();
    try {
        await syncSolarPanels(session);
        await syncDroneUnits(session);
        console.log("Ontology Sync Complete.");
    } catch (err) {
        console.error("Sync Failed:", err);
    } finally {
        await session.close();
        await neo4jDriver.close();
    }
}

main();
