// Y-AIP GraphQL API — Apollo Server + @neo4j/graphql
// Auto-generates Cypher from SDL; custom resolvers for GraphRAG + Proposals

import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { ApolloServer } from "@apollo/server";
import fastifyApollo, { fastifyApolloDrainPlugin } from "@as-integrations/fastify";
import neo4j from "neo4j-driver";
import { Neo4jGraphQL } from "@neo4j/graphql";
import { v4 as uuidv4 } from "uuid";

import { coreTypeDefs } from "./schema.js";
import { generateDynamicTypeDefs } from "./dynamic-schema.js";
import { registerOntologyAdminRoutes } from "./ontology-admin.js";
import { registerWorkshopAdminRoutes } from "./workshop-api.js";

// ─── Neo4j Driver ─────────────────────────────────────────────────────

const driver = neo4j.driver(
    process.env["NEO4J_URI"] ?? "bolt://localhost:7687",
    neo4j.auth.basic(
        process.env["NEO4J_USER"] ?? "neo4j",
        process.env["NEO4J_PASSWORD"] ?? "yaip_dev_secret"
    ),
    {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 5000,
    }
);

// ─── Custom Resolvers ─────────────────────────────────────────────────

const resolvers = {
    Query: {
        // GraphRAG: natural language ontology search
        // Called by agents to find related objects via semantic search
        graphSearch: async (
            _: unknown,
            args: { query: string; limit?: number }
        ) => {
            const session = driver.session();
            try {
                // Full-text search via Neo4j fulltext index
                const result = await session.run(
                    `CALL db.index.fulltext.queryNodes(
             "ontology_fulltext", $query
           ) YIELD node, score
           WHERE score > 0.5
           RETURN
             labels(node)[0] AS object_type,
             node { .* }     AS properties,
             score
           ORDER BY score DESC
           LIMIT $limit`,
                    {
                        query: args.query,
                        limit: neo4j.int(args.limit ?? 10),
                    }
                );

                return result.records.map((r) => ({
                    object_type: r.get("object_type"),
                    properties: r.get("properties"),
                    score: r.get("score"),
                }));
            } finally {
                await session.close();
            }
        },
    },

    Mutation: {
        // Create Proposal — human-in-the-loop ontology change request
        createProposal: async (
            _: unknown,
            args: {
                proposed_objects: unknown;
                proposed_links: unknown;
                justification: string;
            },
            context: { principal?: { sub: string } }
        ) => {
            const session = driver.session();
            const proposal_id = uuidv4();
            const expires_at = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72hr TTL

            try {
                const result = await session.run(
                    `CREATE (p:Proposal {
             proposal_id:      $proposal_id,
             status:           "PENDING",
             proposed_objects: $proposed_objects,
             proposed_links:   $proposed_links,
             proposed_by:      $proposed_by,
             created_at:       datetime(),
             expires_at:       datetime($expires_at)
           }) RETURN p`,
                    {
                        proposal_id,
                        proposed_objects: JSON.stringify(args.proposed_objects),
                        proposed_links: JSON.stringify(args.proposed_links),
                        proposed_by: context.principal?.sub ?? "system",
                        expires_at: expires_at.toISOString(),
                    }
                );

                return result.records[0]?.get("p").properties ?? null;
            } finally {
                await session.close();
            }
        },

        // Approve Proposal — runs SHACL validation before committing
        approveProposal: async (
            _: unknown,
            args: { proposal_id: string; review_note?: string },
            context: { principal?: { sub: string } }
        ) => {
            const session = driver.session();

            try {
                const tx = session.beginTransaction();

                // Mark proposal as APPROVED
                await tx.run(
                    `MATCH (p:Proposal {proposal_id: $proposal_id, status: "PENDING"})
           SET p.status      = "APPROVED",
               p.reviewed_by = $reviewed_by,
               p.review_note = $review_note,
               p.updated_at  = datetime()
           RETURN p`,
                    {
                        proposal_id: args.proposal_id,
                        reviewed_by: context.principal?.sub ?? "system",
                        review_note: args.review_note ?? null,
                    }
                );

                // Validate all nodes against SHACL shapes
                const shaclResult = await tx.run(
                    `CALL n10s.validation.shacl.validate()
           YIELD focusNode, nodeType, shapeId, offendingValue, resultSeverity
           WHERE resultSeverity = "sh:Violation"
           RETURN count(*) AS violation_count`
                );

                const violations =
                    shaclResult.records[0]?.get("violation_count")?.toNumber() ?? 0;

                if (violations > 0) {
                    await tx.rollback();
                    throw new Error(
                        `Proposal rejected: SHACL validation found ${violations} constraint violation(s)`
                    );
                }

                await tx.commit();

                // SIGNAL TEMPORAL ACTION ENGINE
                try {
                    const actionsUrl = process.env["ACTIONS_WORKER_URL"] ?? "http://localhost:8001";
                    const res = await fetch(`${actionsUrl}/actions/${args.proposal_id}/approve`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" }
                    });
                    if (!res.ok) {
                        console.warn(`Failed to signal Temporal workflow ${args.proposal_id}: ${res.status}`);
                    }
                } catch (err) {
                    console.error("Error signalling Temporal worker:", err);
                }

                // Return updated proposal
                const updated = await session.run(
                    "MATCH (p:Proposal {proposal_id: $id}) RETURN p",
                    { id: args.proposal_id }
                );
                return updated.records[0]?.get("p").properties ?? null;
            } finally {
                await session.close();
            }
        },

        // Reject Proposal
        rejectProposal: async (
            _: unknown,
            args: { proposal_id: string; review_note: string },
            context: { principal?: { sub: string } }
        ) => {
            const session = driver.session();
            try {
                const result = await session.run(
                    `MATCH (p:Proposal {proposal_id: $proposal_id})
           SET p.status      = "REJECTED",
               p.reviewed_by = $reviewed_by,
               p.review_note = $review_note,
               p.updated_at  = datetime()
           RETURN p`,
                    {
                        proposal_id: args.proposal_id,
                        reviewed_by: context.principal?.sub ?? "system",
                        review_note: args.review_note,
                    }
                );

                // SIGNAL TEMPORAL ACTION ENGINE
                try {
                    const actionsUrl = process.env["ACTIONS_WORKER_URL"] ?? "http://localhost:8001";
                    const res = await fetch(`${actionsUrl}/actions/${args.proposal_id}/reject`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" }
                    });
                } catch (err) {
                    console.error("Error signalling Temporal worker rejection:", err);
                }

                return result.records[0]?.get("p").properties ?? null;
            } finally {
                await session.close();
            }
        },
    },
};

// ─── @neo4j/graphql Setup ─────────────────────────────────────────────

console.log("🔵 Generating dynamic schema from Palantir-compatible Ontology Registry...");
const dynamicTypeDefs = await generateDynamicTypeDefs(driver);
const typeDefs = coreTypeDefs + "\n" + dynamicTypeDefs;

// ─── Universal Action Resolver ────────────────────────────────────────
// At boot, fetch all active Action Types and bind each to the generic
// HITL interceptor. This makes Action mutations fully data-driven.
const actionSession = driver.session();
let actionTypeRecords: any = { records: [] };
try {
    actionTypeRecords = await actionSession.run(
        `MATCH (a:OntologyActionType {status: "ACTIVE"}) RETURN a.api_name AS api_name, a.hitl_level AS hitl_level`
    );
} catch {
    console.warn("Neo4j unavailable — skipping dynamic action resolvers");
} finally {
    await actionSession.close();
}

function toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const actionResolvers: Record<string, Function> = {};
for (const rec of actionTypeRecords.records) {
    const apiName = rec.get("api_name") as string;
    const hitlLevel = rec.get("hitl_level");
    const hitlN = hitlLevel && hitlLevel.toNumber ? hitlLevel.toNumber() : hitlLevel;
    const mutKey = toCamelCase(apiName);

    actionResolvers[mutKey] = async (
        _parent: unknown,
        args: { input: Record<string, any> },
        _context: unknown
    ) => {
        const proxiedUrl = `http://localhost:${process.env["GRAPHQL_PORT"] ?? 4001}/api/ontology/action-types/${apiName}/apply`;
        const res = await fetch(proxiedUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(args.input ?? {})
        });
        return res.json();
    };
}

// Merge action resolvers into the mutation map
const mergedResolvers = {
    ...resolvers,
    Mutation: { ...resolvers.Mutation, ...actionResolvers }
};

const neoSchema = new Neo4jGraphQL({
    typeDefs,
    driver,
    resolvers: mergedResolvers,
    features: {
        subscriptions: true, // Real-time: status streams, proposal events
    },
});

const schema = await neoSchema.getSchema();
console.log(`✅ Schema compiled — ${actionTypeRecords.records.length} dynamic Action mutations mounted.`);

// ─── Apollo Server ────────────────────────────────────────────────────

const app = Fastify({ logger: { level: "info" } });

await app.register(multipart);

await app.register(cors, {
    origin: process.env["ALLOWED_ORIGINS"]?.split(",") ?? ["http://localhost:3000"],
});

const apollo = new ApolloServer({
    schema,
    plugins: [fastifyApolloDrainPlugin(app)],
    introspection: process.env["NODE_ENV"] !== "production",
});

await apollo.start();
await app.register(fastifyApollo(apollo) as any, {
    context: async (request: any) => ({
        // Principal extracted from JWT — passed to resolvers for audit/PBAC
        principal: request.user ?? null,
        neo4jSession: driver.session(),
    }),
});

// Health
app.get("/health", async () => ({
    status: "ok",
    service: "graphql-api",
    neo4j: (await driver.getServerInfo()).address,
}));

// Register Dynamic Ontology Admin Routes
await registerOntologyAdminRoutes(app, driver);

// Register Workshop Layout Routes
await registerWorkshopAdminRoutes(app);

const PORT = Number(process.env["GRAPHQL_PORT"] ?? 4001);
await app.listen({ port: PORT, host: "0.0.0.0" });
app.log.info(`🔵 GraphQL API running on :${PORT}`);
app.log.info(`📊 Playground: http://localhost:${PORT}/graphql`);

// Trigger dynamic schema rebuild
