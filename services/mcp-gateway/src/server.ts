// Y-AIP MCP Gateway — Main Fastify Server
// Single entry point for all platform data queries

import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";

import { MCPQueryRequestSchema, type YAIPJWTPayload } from "./types.js";
import { evaluatePolicy } from "./middleware/opa.js";
import { maskPII } from "./middleware/presidio.js";
import { emitAuditEvent, emitOPADecision } from "./middleware/audit.js";
import {
    executeQuery,
    POSTGRES_MANIFEST,
    testConnection,
} from "./connectors/postgres.js";

// ─── Connector Registry ───────────────────────────────────────────────
// Add more connectors here as they are built
const CONNECTORS = {
    "connector-postgres": {
        manifest: POSTGRES_MANIFEST,
        execute: executeQuery,
        test: testConnection,
    },
} as const;

// ─── Fastify App ─────────────────────────────────────────────────────

const app = Fastify({
    logger: {
        level: process.env["LOG_LEVEL"] ?? "info",
    },
});

// Security headers
await app.register(helmet, { global: true });

// CORS — restrict to platform origins in production
await app.register(cors, {
    origin: process.env["ALLOWED_ORIGINS"]?.split(",") ?? [
        "http://localhost:3000",
    ],
    methods: ["GET", "POST"],
});

// JWT verification via Keycloak JWKS
await app.register(jwt, {
    secret: process.env["MCP_GATEWAY_SECRET"] ?? "dev-secret-change-in-prod",
    // In production: use JWKS from Keycloak
    // secret: { public: jwksRsa.expressJwtSecret({ jwksUri: KEYCLOAK_JWKS_URL }) }
});

// Auth preHandler — reusable across routes
async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    try {
        await request.jwtVerify();
    } catch {
        return reply.code(401).send({ error: "Unauthorized", message: "Invalid or missing token" });
    }
}

// ─── Health Check ─────────────────────────────────────────────────────

app.get("/health", async () => ({
    status: "ok",
    service: "mcp-gateway",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
}));

// ─── Connector Health ─────────────────────────────────────────────────

app.get(
    "/mcp/connectors",
    { preHandler: [authenticate] },
    async (request) => {
        const principal = request.user as YAIPJWTPayload;
        const results = await Promise.all(
            Object.entries(CONNECTORS).map(async ([id, connector]) => ({
                connector_id: id,
                display_name: connector.manifest.display_name,
                source_type: connector.manifest.source_type,
                healthy: await connector.test(id),
                permitted: principal.permitted_connectors.includes(id),
            }))
        );
        return { connectors: results };
    }
);

// ─── Main Query Route ─────────────────────────────────────────────────

app.post(
    "/mcp/query",
    { preHandler: [authenticate] },
    async (request, reply) => {
        const startMs = Date.now();
        const requestId = uuidv4();
        const principal = request.user as YAIPJWTPayload;

        // 1. Validate request body
        const parseResult = MCPQueryRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.code(400).send({
                error: "Invalid request",
                details: parseResult.error.flatten(),
            });
        }

        const body = parseResult.data;

        // Resolve connector
        const connector = CONNECTORS[body.connector_id as keyof typeof CONNECTORS];
        if (!connector) {
            return reply.code(404).send({
                error: "Connector not found",
                connector_id: body.connector_id,
            });
        }

        // 2. OPA Policy Evaluation (PBAC)
        const opaStart = Date.now();
        const policyResult = await evaluatePolicy(principal, {
            resource_type: connector.manifest.resource_types[0] ?? "unknown",
            connector_id: body.connector_id,
            purpose_id: body.purpose_id,
            classification: body.classification,
            data_markings: body.data_markings,
        });
        const opaLatencyMs = Date.now() - opaStart;

        // Emit OPA decision to audit regardless of outcome
        await emitOPADecision({
            principal_id: principal.sub,
            connector_id: body.connector_id,
            resource_type: connector.manifest.resource_types[0] ?? "unknown",
            allowed: policyResult.allow,
            ...(policyResult.deny_reasons ? { deny_reason: policyResult.deny_reasons.join("; ") } : {}),
            query_time_ms: opaLatencyMs,
        });

        // DENY: emit audit and return 403
        if (!policyResult.allow) {
            await emitAuditEvent({
                event_type: "DENY",
                principal_id: principal.sub,
                principal_type: "user",
                purpose_id: body.purpose_id,
                resource_type: connector.manifest.resource_types[0] ?? "unknown",
                resource_id: body.connector_id,
                connector_id: body.connector_id,
                data_markings_accessed: body.data_markings,
                masked_fields: [],
                classification_ceiling: principal.clearance,
                environment: principal.environment,
                opa_decision: `deny:${policyResult.deny_reasons?.join(",") ?? "unknown"}`,
                latency_ms: Date.now() - startMs,
            });

            return reply.code(403).send({
                error: "Access denied",
                reasons: policyResult.deny_reasons,
                request_id: requestId,
            });
        }

        // 3. Execute Query via Connector
        let queryResult;
        try {
            queryResult = await connector.execute(
                body.connector_id,
                body.query,
                body.params ? Object.values(body.params) : []
            );
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);

            await emitAuditEvent({
                event_type: "QUERY",
                principal_id: principal.sub,
                principal_type: "user",
                purpose_id: body.purpose_id,
                resource_type: connector.manifest.resource_types[0] ?? "unknown",
                resource_id: body.connector_id,
                connector_id: body.connector_id,
                data_markings_accessed: body.data_markings,
                masked_fields: [],
                classification_ceiling: principal.clearance,
                environment: principal.environment,
                opa_decision: "allow",
                latency_ms: Date.now() - startMs,
                error_message: errorMessage,
            });

            return reply.code(500).send({
                error: "Connector query failed",
                message: errorMessage,
                request_id: requestId,
            });
        }

        // 4. PII Masking (Presidio)
        const { maskedRows, maskedFields } = await maskPII(
            queryResult.rows,
            connector.manifest.phi_fields,
            connector.manifest.pci_fields
        );

        const totalLatencyMs = Date.now() - startMs;

        // 5. Emit ALLOW audit event
        const queryHash = createHash("sha256").update(body.query).digest("hex").slice(0, 16);

        await emitAuditEvent({
            event_type: "QUERY",
            principal_id: principal.sub,
            principal_type: "user",
            purpose_id: body.purpose_id,
            resource_type: connector.manifest.resource_types[0] ?? "unknown",
            resource_id: body.connector_id,
            connector_id: body.connector_id,
            query_hash: queryHash,
            data_markings_accessed: body.data_markings,
            masked_fields: maskedFields,
            classification_ceiling: principal.clearance,
            environment: principal.environment,
            opa_decision: "allow",
            latency_ms: totalLatencyMs,
        });

        // 6. Return response
        return reply.code(200).send({
            query_id: requestId,
            connector_id: body.connector_id,
            rows: maskedRows,
            row_count: maskedRows.length,
            masked_fields: maskedFields,
            latency_ms: totalLatencyMs,
            classification: body.classification,
        });
    }
);

// ─── Start ────────────────────────────────────────────────────────────

const PORT = Number(process.env["MCP_GATEWAY_PORT"] ?? 4000);
const HOST = process.env["MCP_GATEWAY_HOST"] ?? "0.0.0.0";

try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`🚀 MCP Gateway running on ${HOST}:${PORT}`);
    app.log.info(`📋 Loaded connectors: ${Object.keys(CONNECTORS).join(", ")}`);
} catch (err) {
    app.log.error(err);
    process.exit(1);
}
