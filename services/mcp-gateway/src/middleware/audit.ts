// Y-AIP MCP Gateway — ClickHouse Audit Middleware
// Every query (ALLOW and DENY) is emitted as an immutable audit event

import { createClient } from "@clickhouse/client";
import { v4 as uuidv4 } from "uuid";
import type { AuditEvent } from "../types.js";

const client = createClient({
    host: process.env["CLICKHOUSE_URL"] ?? "http://localhost:8123",
    username: process.env["CLICKHOUSE_USER"] ?? "yaip",
    password: process.env["CLICKHOUSE_PASSWORD"] ?? "yaip_dev_secret",
    database: process.env["CLICKHOUSE_DB"] ?? "audit",
});


export async function emitAuditEvent(
    event: Omit<AuditEvent, "event_id" | "timestamp">
): Promise<string> {
    const event_id = uuidv4();
    const timestamp = new Date();

    const row: AuditEvent = {
        ...event,
        event_id,
        timestamp,
    };

    try {
        await client.insert({
            table: "audit_events",
            values: [
                {
                    event_id: row.event_id,
                    event_type: row.event_type,
                    timestamp: row.timestamp.toISOString(),
                    principal_id: row.principal_id,
                    principal_type: row.principal_type,
                    purpose_id: row.purpose_id ?? null,
                    resource_type: row.resource_type,
                    resource_id: row.resource_id,
                    connector_id: row.connector_id ?? null,
                    query_hash: row.query_hash ?? null,
                    data_markings_accessed: row.data_markings_accessed,
                    masked_fields: row.masked_fields,
                    classification_ceiling: row.classification_ceiling,
                    environment: row.environment,
                    opa_decision: row.opa_decision ?? null,
                    latency_ms: row.latency_ms ?? null,
                    error_message: row.error_message ?? null,
                },
            ],
            format: "JSONEachRow",
        });
    } catch (err) {
        // Audit log failure must never block the main query
        // But it must be surfaced loudly
        console.error("[AUDIT] Failed to emit audit event:", err);
        console.error("[AUDIT] Dropping event:", row);
    }

    return event_id;
}

export async function emitOPADecision(decision: {
    principal_id: string;
    connector_id: string;
    resource_type: string;
    allowed: boolean;
    deny_reason?: string;
    query_time_ms: number;
}): Promise<void> {
    try {
        await client.insert({
            table: "opa_decisions",
            values: [
                {
                    decision_id: uuidv4(),
                    timestamp: new Date().toISOString(),
                    principal_id: decision.principal_id,
                    connector_id: decision.connector_id,
                    resource_type: decision.resource_type,
                    allowed: decision.allowed,
                    deny_reason: decision.deny_reason ?? null,
                    query_time_ms: decision.query_time_ms,
                },
            ],
            format: "JSONEachRow",
        });
    } catch (err) {
        console.error("[AUDIT] Failed to emit OPA decision:", err);
    }
}
