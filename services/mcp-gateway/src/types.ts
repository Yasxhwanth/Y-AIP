// Y-AIP MCP Gateway — Shared Types
// All types are strict (no any, no unknown-unhandled)

import { z } from "zod";

// ─── Request Schemas ─────────────────────────────────────────────────

export const MCPQueryRequestSchema = z.object({
    connector_id: z.string().min(1),
    query: z.string().min(1),
    purpose_id: z.string().min(1),
    classification: z.enum(["UNCLASSIFIED", "CUI", "SECRET", "TOP_SECRET"]),
    params: z.record(z.unknown()).optional(),
    data_markings: z.array(z.string()).optional().default([]),
});
export type MCPQueryRequest = z.infer<typeof MCPQueryRequestSchema>;

export const MCPQueryResponseSchema = z.object({
    query_id: z.string().uuid(),
    connector_id: z.string(),
    rows: z.array(z.record(z.unknown())),
    row_count: z.number(),
    masked_fields: z.array(z.string()),
    latency_ms: z.number(),
    classification: z.string(),
});
export type MCPQueryResponse = z.infer<typeof MCPQueryResponseSchema>;

// ─── OPA ─────────────────────────────────────────────────────────────

export interface OPAInput {
    principal: {
        id: string;
        roles: string[];
        purpose_ids: string[];
        clearance: string;
        permitted_connectors: string[];
        us_person: boolean;
    };
    query: {
        resource_type: string;
        connector_id: string;
        purpose_id: string;
        classification: string;
        data_markings: string[];
    };
    environment: "local" | "cloud" | "on_prem" | "air_gap";
}

export interface OPAResult {
    allow: boolean;
    deny: boolean;
    deny_reasons?: string[];
}

// ─── Audit ───────────────────────────────────────────────────────────

export interface AuditEvent {
    event_id: string;
    event_type: "QUERY" | "DENY" | "GUARDRAIL_TRIGGERED" | "PROPOSAL" | "ACTION";
    timestamp: Date;
    principal_id: string;
    principal_type: "user" | "agent";
    purpose_id?: string;
    resource_type: string;
    resource_id: string;
    connector_id?: string;
    query_hash?: string;
    data_markings_accessed: string[];
    masked_fields: string[];
    classification_ceiling: string;
    environment: string;
    opa_decision?: string;
    latency_ms?: number;
    error_message?: string;
}

// ─── Connector ───────────────────────────────────────────────────────

export interface ConnectorManifest {
    connector_id: string;
    display_name: string;
    source_type: "relational" | "graph" | "document" | "stream" | "iot" | "api";
    resource_types: string[];
    default_classification: string;
    phi_fields: string[];
    pci_fields: string[];
    allowed_purposes: string[];
}

export interface ConnectorQueryResult {
    rows: Record<string, unknown>[];
    metadata: {
        row_count: number;
        latency_ms: number;
        source_type: string;
    };
}

// ─── JWT Payload ─────────────────────────────────────────────────────

export interface YAIPJWTPayload {
    sub: string;                    // principal_id
    roles: string[];
    purpose_ids: string[];
    clearance: string;
    permitted_connectors: string[];
    us_person: boolean;
    environment: "local" | "cloud" | "on_prem" | "air_gap";
}
