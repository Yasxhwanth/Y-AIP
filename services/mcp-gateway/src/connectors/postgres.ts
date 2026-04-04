// Y-AIP MCP Gateway — connector-postgres
// First MCP Connector: executes parameterized SQL queries against Postgres

import pg from "pg";
import type { ConnectorManifest, ConnectorQueryResult } from "../types.js";

const { Pool } = pg;

// Registry of active connector pools (initialized lazily from connector manifests)
const pools = new Map<string, pg.Pool>();

export const POSTGRES_MANIFEST: ConnectorManifest = {
    connector_id: "connector-postgres",
    display_name: "PostgreSQL — Platform Metadata DB",
    source_type: "relational",
    resource_types: ["Connector", "User", "AuditSummary", "Proposal"],
    default_classification: "UNCLASSIFIED",
    phi_fields: [],
    pci_fields: [],
    allowed_purposes: ["audit", "maintenance", "mission_planning"],
};

export function getPool(connectorId: string): pg.Pool {
    if (!pools.has(connectorId)) {
        const pool = new Pool({
            host: process.env["POSTGRES_HOST"] ?? "localhost",
            port: Number(process.env["POSTGRES_PORT"] ?? 5432),
            user: process.env["POSTGRES_USER"] ?? "yaip",
            password: process.env["POSTGRES_PASSWORD"] ?? "yaip_dev_secret",
            database: process.env["POSTGRES_DB"] ?? "yaip",
            max: 10,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
        });
        pools.set(connectorId, pool);
    }
    // biome-ignore lint: Map.get after Map.has is guaranteed
    return pools.get(connectorId)!;
}

export async function executeQuery(
    connectorId: string,
    query: string,
    params: unknown[] = []
): Promise<ConnectorQueryResult> {
    const startMs = Date.now();

    // Safety: only allow SELECT statements through the MCP Gateway
    const normalized = query.trim().toUpperCase();
    if (!normalized.startsWith("SELECT")) {
        throw new Error(
            "MCP Gateway only permits SELECT queries. Use the Actions layer (Temporal) for writes."
        );
    }

    const pool = getPool(connectorId);
    const result = await pool.query(query, params);
    const latencyMs = Date.now() - startMs;

    return {
        rows: result.rows as Record<string, unknown>[],
        metadata: {
            row_count: result.rowCount ?? 0,
            latency_ms: latencyMs,
            source_type: "relational",
        },
    };
}

export async function testConnection(connectorId: string): Promise<boolean> {
    try {
        const pool = getPool(connectorId);
        const result = await pool.query("SELECT 1 as ok");
        return result.rows[0]?.["ok"] === 1;
    } catch {
        return false;
    }
}
