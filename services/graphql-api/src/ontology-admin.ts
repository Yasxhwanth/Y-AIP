/**
 * ontology-admin.ts — 1:1 Palantir Ontology Registry API
 *
 * 12 REST endpoints mirroring the Palantir Foundry Ontology Manager:
 *   Object Types: GET list, POST create, GET single, PATCH update, DELETE
 *   Link Types:   GET list, POST create
 *   Action Types: GET list, POST create, GET single, POST apply (execute)
 *   Interfaces:   GET list, POST create
 */
import { FastifyInstance } from "fastify";
import { Driver } from "neo4j-driver";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { pipeline } from "stream/promises";

export async function registerOntologyAdminRoutes(app: FastifyInstance, driver: Driver) {

    // ════════════════════════════════════════════════════════════════════════════
    // OBJECT TYPES
    // ════════════════════════════════════════════════════════════════════════════

    // GET /api/ontology/object-types
    // List all Object Types with their property counts and implemented interfaces
    app.get("/api/ontology/object-types", async (_req, reply) => {
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (o:OntologyObjectType)
                OPTIONAL MATCH (o)-[:HAS_PROPERTY]->(p:OntologyProperty)
                OPTIONAL MATCH (o)-[:IMPLEMENTS]->(i:OntologyInterface)
                RETURN 
                    o { .* } as object_type,
                    collect(DISTINCT p { .* }) as properties,
                    collect(DISTINCT i.api_name) as implements
                ORDER BY o.display_name
            `);
            return result.records.map(r => ({
                ...r.get("object_type"),
                properties: r.get("properties"),
                implements: r.get("implements").filter((x: any) => x != null)
            }));
        } finally { await session.close(); }
    });

    // GET /api/ontology/object-types/:apiName
    // Get a single Object Type with properties, link types, and actions
    app.get("/api/ontology/object-types/:apiName", async (req: any, reply) => {
        const { apiName } = req.params;
        const session = driver.session();
        try {
            const [otResult, linksResult, actionsResult] = await Promise.all([
                session.run(`
                    MATCH (o:OntologyObjectType {api_name: $apiName})
                    OPTIONAL MATCH (o)-[:HAS_PROPERTY]->(p:OntologyProperty)
                    OPTIONAL MATCH (o)-[:IMPLEMENTS]->(i:OntologyInterface)
                    RETURN o { .* } as object_type,
                           collect(DISTINCT p { .* }) as properties,
                           collect(DISTINCT i { .* }) as interfaces
                `, { apiName }),
                session.run(`
                    MATCH (l:OntologyLinkType)-[:SOURCE|TARGET]->(o:OntologyObjectType {api_name: $apiName})
                    MATCH (l)-[:SOURCE]->(src:OntologyObjectType)
                    MATCH (l)-[:TARGET]->(tgt:OntologyObjectType)
                    RETURN l { .* } as link_type,
                           src.api_name as source,
                           tgt.api_name as target
                `, { apiName }),
                session.run(`
                    MATCH (a:OntologyActionType)-[:TARGETS]->(o:OntologyObjectType {api_name: $apiName})
                    RETURN a { .* } as action_type
                `, { apiName })
            ]);

            if (!otResult.records[0]) return reply.status(404).send({ error: "Object type not found" });

            const ot = otResult.records[0];
            return {
                ...ot.get("object_type"),
                properties: ot.get("properties"),
                implements: ot.get("interfaces"),
                link_types: linksResult.records.map(r => ({
                    ...r.get("link_type"),
                    source: r.get("source"),
                    target: r.get("target")
                })),
                action_types: actionsResult.records.map(r => r.get("action_type"))
            };
        } finally { await session.close(); }
    });

    // POST /api/ontology/object-types
    // Create a new Object Type with typed properties
    app.post("/api/ontology/object-types", async (req: any, reply) => {
        const { api_name, display_name, plural_display_name, description, primary_key, title_property, backing_source, icon, properties = [], implements_interfaces = [] } = req.body ?? {};
        if (!api_name || !display_name || !primary_key) return reply.status(400).send({ error: "api_name, display_name, and primary_key are required" });

        const session = driver.session();
        try {
            const exists = await session.run(`MATCH (o:OntologyObjectType {api_name: $api_name}) RETURN o`, { api_name });
            if (exists.records.length > 0) return reply.status(409).send({ error: `Object type '${api_name}' already exists` });

            await session.run(`
                CREATE (o:OntologyObjectType {
                    api_name: $api_name, display_name: $display_name,
                    plural_display_name: $plural_display_name, description: $description,
                    primary_key: $primary_key, title_property: $title_property,
                    backing_source: $backing_source, icon: $icon
                })
            `, { api_name, display_name, plural_display_name: plural_display_name ?? `${display_name}s`, description: description ?? "", primary_key, title_property: title_property ?? primary_key, backing_source: backing_source ?? "connector-postgres", icon: icon ?? "entity" });

            for (const prop of properties) {
                await session.run(`
                    MATCH (o:OntologyObjectType {api_name: $ot})
                    CREATE (o)-[:HAS_PROPERTY]->(p:OntologyProperty {
                        api_name: $api_name, display_name: $display_name,
                        data_type: $data_type, is_primary_key: $is_primary_key,
                        is_required: $is_required, scope: "local"
                    })
                `, { ot: api_name, api_name: prop.api_name, display_name: prop.display_name, data_type: prop.data_type ?? "string", is_primary_key: prop.is_primary_key ?? false, is_required: prop.is_required ?? false });
            }

            for (const ifaceApiName of implements_interfaces) {
                await session.run(`
                    MATCH (o:OntologyObjectType {api_name: $ot}), (i:OntologyInterface {api_name: $iface})
                    CREATE (o)-[:IMPLEMENTS]->(i)
                `, { ot: api_name, iface: ifaceApiName });
            }

            return { status: "created", api_name };
        } finally { await session.close(); }
    });

    // PATCH /api/ontology/object-types/:apiName
    // Update Object Type metadata
    app.patch("/api/ontology/object-types/:apiName", async (req: any, reply) => {
        const { apiName } = req.params;
        const updates = req.body ?? {};
        const allowed = ["display_name", "plural_display_name", "description", "title_property", "backing_source", "icon"];
        const setClauses = Object.keys(updates).filter(k => allowed.includes(k)).map(k => `o.${k} = $${k}`).join(", ");
        if (!setClauses) return reply.status(400).send({ error: "No valid fields to update" });

        const session = driver.session();
        try {
            const result = await session.run(`MATCH (o:OntologyObjectType {api_name: $apiName}) SET ${setClauses} RETURN o.api_name as api_name`, { apiName, ...updates });
            if (!result.records[0]) return reply.status(404).send({ error: "Not found" });
            return { status: "updated", api_name: result.records[0].get("api_name") };
        } finally { await session.close(); }
    });

    // DELETE /api/ontology/object-types/:apiName
    app.delete("/api/ontology/object-types/:apiName", async (req: any, reply) => {
        const { apiName } = req.params;
        const session = driver.session();
        try {
            await session.run(`MATCH (o:OntologyObjectType {api_name: $apiName}) OPTIONAL MATCH (o)-[:HAS_PROPERTY]->(p) DETACH DELETE o, p`, { apiName });
            return { status: "deleted", api_name: apiName };
        } finally { await session.close(); }
    });

    // ════════════════════════════════════════════════════════════════════════════
    // LINK TYPES
    // ════════════════════════════════════════════════════════════════════════════

    // GET /api/ontology/link-types
    app.get("/api/ontology/link-types", async (_req, _reply) => {
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (l:OntologyLinkType)
                MATCH (l)-[:SOURCE]->(src:OntologyObjectType)
                MATCH (l)-[:TARGET]->(tgt:OntologyObjectType)
                RETURN l { .* } as link_type, src.api_name as source, src.display_name as source_display,
                       tgt.api_name as target, tgt.display_name as target_display
                ORDER BY l.api_name
            `);
            return result.records.map(r => ({ ...r.get("link_type"), source: r.get("source"), source_display: r.get("source_display"), target: r.get("target"), target_display: r.get("target_display") }));
        } finally { await session.close(); }
    });

    // POST /api/ontology/link-types
    app.post("/api/ontology/link-types", async (req: any, reply) => {
        const { api_name, display_name_a_side, display_name_b_side, cardinality, source_object_type, target_object_type, foreign_key_property } = req.body ?? {};
        if (!api_name || !source_object_type || !target_object_type || !cardinality) return reply.status(400).send({ error: "api_name, source_object_type, target_object_type, and cardinality are required" });
        if (!["ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_MANY"].includes(cardinality)) return reply.status(400).send({ error: "cardinality must be ONE_TO_ONE, ONE_TO_MANY, or MANY_TO_MANY" });

        const session = driver.session();
        try {
            await session.run(`
                MATCH (src:OntologyObjectType {api_name: $src}), (tgt:OntologyObjectType {api_name: $tgt})
                CREATE (l:OntologyLinkType {
                    api_name: $api_name, display_name_a_side: $a, display_name_b_side: $b,
                    cardinality: $cardinality, foreign_key_property: $fk
                })
                CREATE (l)-[:SOURCE]->(src)
                CREATE (l)-[:TARGET]->(tgt)
            `, { api_name, a: display_name_a_side ?? api_name, b: display_name_b_side ?? api_name, cardinality, src: source_object_type, tgt: target_object_type, fk: foreign_key_property ?? null });
            return { status: "created", api_name };
        } finally { await session.close(); }
    });

    // ════════════════════════════════════════════════════════════════════════════
    // ACTION TYPES
    // ════════════════════════════════════════════════════════════════════════════

    // GET /api/ontology/action-types
    app.get("/api/ontology/action-types", async (_req, _reply) => {
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (a:OntologyActionType)
                OPTIONAL MATCH (a)-[:HAS_PARAMETER]->(p:OntologyActionParameter)
                OPTIONAL MATCH (a)-[:TARGETS]->(o:OntologyObjectType)
                RETURN a { .* } as action_type,
                       collect(DISTINCT p { .* }) as parameters,
                       collect(DISTINCT o.api_name) as targets
                ORDER BY a.display_name
            `);
            return result.records.map(r => ({
                ...r.get("action_type"),
                parameters: r.get("parameters"),
                targets: r.get("targets").filter((x: any) => x != null)
            }));
        } finally { await session.close(); }
    });

    // GET /api/ontology/action-types/:apiName
    app.get("/api/ontology/action-types/:apiName", async (req: any, reply) => {
        const { apiName } = req.params;
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (a:OntologyActionType {api_name: $apiName})
                OPTIONAL MATCH (a)-[:HAS_PARAMETER]->(p:OntologyActionParameter)
                OPTIONAL MATCH (a)-[:TARGETS]->(o:OntologyObjectType)
                RETURN a { .* } as action_type,
                       collect(DISTINCT p { .* }) as parameters,
                       collect(DISTINCT o.api_name) as targets
            `, { apiName });
            if (!result.records[0]) return reply.status(404).send({ error: "Action type not found" });
            const r = result.records[0];
            return { ...r.get("action_type"), parameters: r.get("parameters"), targets: r.get("targets") };
        } finally { await session.close(); }
    });

    // POST /api/ontology/action-types
    app.post("/api/ontology/action-types", async (req: any, reply) => {
        const { api_name, display_name, description, hitl_level = 1, writeback_target, targets = [], parameters = [], rules = [] } = req.body ?? {};
        if (!api_name || !display_name || !writeback_target) return reply.status(400).send({ error: "api_name, display_name, writeback_target are required" });
        const session = driver.session();
        try {
            await session.run(`
                CREATE (a:OntologyActionType {
                    api_name: $api_name, display_name: $display_name, description: $description,
                    status: "ACTIVE", hitl_level: $hitl_level,
                    writeback_target: $writeback_target, rules_json: $rules_json
                })
            `, { api_name, display_name, description: description ?? "", hitl_level, writeback_target, rules_json: JSON.stringify(rules) });

            for (const tgt of targets) {
                await session.run(`MATCH (a:OntologyActionType {api_name: $a}), (o:OntologyObjectType {api_name: $o}) CREATE (a)-[:TARGETS]->(o)`, { a: api_name, o: tgt });
            }
            for (const param of parameters) {
                await session.run(`
                    MATCH (a:OntologyActionType {api_name: $action_api_name})
                    CREATE (a)-[:HAS_PARAMETER]->(p:OntologyActionParameter {
                        api_name: $api_name, display_name: $display_name, data_type: $data_type,
                        object_type_ref: $object_type_ref, is_required: $is_required, description: $description
                    })
                `, { action_api_name: api_name, api_name: param.api_name, display_name: param.display_name, data_type: param.data_type ?? "string", object_type_ref: param.object_type_ref ?? null, is_required: param.is_required ?? false, description: param.description ?? "" });
            }
            return { status: "created", api_name };
        } finally { await session.close(); }
    });

    // POST /api/ontology/action-types/:apiName/apply
    // Execute an Action Type — HITL gate enforced natively
    app.post("/api/ontology/action-types/:apiName/apply", async (req: any, reply) => {
        const { apiName } = req.params;
        const paramValues: Record<string, any> = req.body ?? {};
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (a:OntologyActionType {api_name: $apiName, status: "ACTIVE"})
                RETURN a.hitl_level as hitl_level, a.rules_json as rules_json,
                       a.display_name as display_name, a.writeback_target as writeback_target
            `, { apiName });
            if (!result.records[0]) return reply.status(404).send({ error: "Action type not found or inactive" });

            const action = result.records[0];
            const hitlLevel = action.get("hitl_level").toNumber ? action.get("hitl_level").toNumber() : action.get("hitl_level");
            const rules: any[] = JSON.parse(action.get("rules_json") || "[]");

            // HITL Gate: Level 1 = immediate execution, Level 2/3 = create Proposal
            if (hitlLevel >= 2) {
                // Convert to Proposal for human review
                const proposalId = `proposal-${Date.now()}`;
                await session.run(`
                    CREATE (p:Proposal {
                        proposal_id: $proposal_id, status: "PENDING",
                        proposed_objects: $proposed_objects, proposed_links: "[]",
                        proposed_by: "system", created_at: datetime(),
                        expires_at: datetime() + duration({hours: 72}),
                        action_type: $apiName, action_params: $params
                    })
                `, { proposal_id: proposalId, proposed_objects: JSON.stringify(paramValues), apiName, params: JSON.stringify(paramValues) });

                return {
                    status: "pending_approval",
                    message: `Action '${action.get("display_name")}' requires Level-${hitlLevel} approval. A Proposal has been created.`,
                    proposal_id: proposalId,
                    hitl_level: hitlLevel
                };
            }

            // Level 1: Execute rules immediately
            const executedRules: string[] = [];
            for (const rule of rules) {
                if (rule.rule_type === "MODIFY_OBJECT") {
                    const value = rule.value_from_parameter ? paramValues[rule.value_from_parameter] : rule.static_value;
                    if (paramValues.target_id && value !== undefined) {
                        const propKey = rule.target_property;
                        await session.run(
                            `MATCH (n {${action.get("writeback_target")}_id: $id}) SET n.${propKey} = $val, n.updated_at = datetime()`,
                            { id: paramValues.target_id, val: value }
                        );
                        executedRules.push(`SET ${propKey} = ${value}`);
                    }
                }
            }
            return { status: "executed", action: apiName, executed_rules: executedRules };
        } finally { await session.close(); }
    });

    // ════════════════════════════════════════════════════════════════════════════
    // INTERFACES
    // ════════════════════════════════════════════════════════════════════════════

    // GET /api/ontology/interfaces
    app.get("/api/ontology/interfaces", async (_req, _reply) => {
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (i:OntologyInterface)
                OPTIONAL MATCH (i)-[:REQUIRES_PROPERTY]->(p:OntologyProperty)
                OPTIONAL MATCH (o:OntologyObjectType)-[:IMPLEMENTS]->(i)
                RETURN i { .* } as iface,
                       collect(DISTINCT p { .* }) as properties,
                       collect(DISTINCT o.api_name) as implemented_by
                ORDER BY i.display_name
            `);
            return result.records.map(r => ({
                ...r.get("iface"),
                properties: r.get("properties"),
                implemented_by: r.get("implemented_by").filter((x: any) => x != null)
            }));
        } finally { await session.close(); }
    });

    // POST /api/ontology/interfaces
    app.post("/api/ontology/interfaces", async (req: any, reply) => {
        const { api_name, display_name, description, properties = [] } = req.body ?? {};
        if (!api_name || !display_name) return reply.status(400).send({ error: "api_name and display_name are required" });
        const session = driver.session();
        try {
            await session.run(`CREATE (i:OntologyInterface { api_name: $api_name, display_name: $display_name, description: $description })`,
                { api_name, display_name, description: description ?? "" });
            for (const prop of properties) {
                await session.run(`
                    MATCH (i:OntologyInterface {api_name: $iface})
                    CREATE (i)-[:REQUIRES_PROPERTY]->(p:OntologyProperty {
                        api_name: $api_name, display_name: $display_name, data_type: $data_type,
                        is_required: $is_required, is_primary_key: false, scope: "interface"
                    })
                `, { iface: api_name, api_name: prop.api_name, display_name: prop.display_name, data_type: prop.data_type ?? "string", is_required: prop.is_required ?? false });
            }
            return { status: "created", api_name };
        } finally { await session.close(); }
    });

    // ════════════════════════════════════════════════════════════════════════════
    // SCHEMA INTROSPECTION (used by Workshop and VOM frontends)
    // ════════════════════════════════════════════════════════════════════════════

    // ── JSON fallback helpers ─────────────────────────────────────────────────
    const projectsJsonPath = path.join(process.cwd(), "..", "..", "data", "projects.json");

    function readProjectsJson(): Record<string, unknown>[] {
        try {
            if (fs.existsSync(projectsJsonPath)) {
                return JSON.parse(fs.readFileSync(projectsJsonPath, "utf-8")) as Record<string, unknown>[];
            }
        } catch { /* ignore */ }
        return [];
    }

    function writeProjectsJson(projects: Record<string, unknown>[]) {
        const dir = path.dirname(projectsJsonPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(projectsJsonPath, JSON.stringify(projects, null, 2), "utf-8");
    }

    app.get("/api/ontology/projects", async (_req, _reply) => {
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (p:OntologyProject)
                RETURN p { .* } as project
                ORDER BY p.created_at DESC
            `);
            return result.records.map(r => {
                const p = r.get("project");
                return {
                    ...p,
                    views: typeof p.views?.toNumber === 'function' ? p.views.toNumber() : (p.views?.low ?? p.views ?? 0),
                    created_at: typeof p.created_at?.toNumber === 'function' ? p.created_at.toNumber() : (p.created_at?.low ?? p.created_at)
                };
            });
        } catch {
            // Neo4j unavailable — serve from local JSON fallback
            return readProjectsJson();
        } finally { await session.close(); }
    });

    app.post("/api/ontology/projects", async (req: any, reply) => {
        const { id, name, description, space, template, role, tags } = req.body;
        // 1. Create local directory structure
        const sanitizedName = (name || "Untitled").replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
        const workspacePath = path.join(process.cwd(), "..", "..", "data", "workspaces", sanitizedName);
        if (!fs.existsSync(workspacePath)) {
            fs.mkdirSync(workspacePath, { recursive: true });
        }

        const projectRecord: Record<string, unknown> = {
            id,
            name,
            description: description || "",
            space: space || "",
            template: template || "",
            role: role || "Owner",
            tags: tags || [],
            folder_path: workspacePath,
            views: 0,
            created_at: Date.now()
        };

        // 2. Try Neo4j first, fall back to JSON file
        const session = driver.session();
        try {
            await session.run(`
                CREATE (p:OntologyProject {
                    id: $id, name: $name, description: $description,
                    space: $space, template: $template, role: $role,
                    tags: $tags, folder_path: $folderPath,
                    views: 0, created_at: timestamp()
                })
            `, { ...projectRecord, folderPath: workspacePath });
        } catch {
            // Neo4j unavailable — persist to local JSON fallback
            const projects = readProjectsJson();
            projects.unshift(projectRecord);
            writeProjectsJson(projects);
        } finally { await session.close(); }

        reply.status(200).send({ success: true, id, path: workspacePath });
    });

    app.get("/api/ontology/projects/:id", async (req: any, reply) => {
        const { id } = req.params;
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (p:OntologyProject {id: $id})
                RETURN p { 
                    .*, 
                    rid: p.id,
                    views: toString(p.views)
                } as project
            `, { id });

            if (result.records.length === 0) return reply.status(404).send({ error: "Project not found" });
            const p = result.records[0].get("project");
            return {
                ...p,
                views: typeof p.views?.toNumber === 'function' ? p.views.toNumber() : (p.views?.low ?? p.views ?? 0),
                created_at: typeof p.created_at?.toNumber === 'function' ? p.created_at.toNumber() : (p.created_at?.low ?? p.created_at)
            };
        } catch {
            // Neo4j unavailable — search local JSON fallback
            const projects = readProjectsJson();
            const found = projects.find(p => p["id"] === id);
            if (!found) return reply.status(404).send({ error: "Project not found" });
            return found;
        } finally { await session.close(); }
    });

    app.get("/api/ontology/projects/:id/folders", async (req: any, _reply) => {
        const { id } = req.params;
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (p:OntologyProject {id: $id})<-[:IN_PROJECT]-(f:OntologyFolder)
                RETURN f { .* } as folder
                ORDER BY f.created_at DESC
            `, { id });
            return result.records.map(r => {
                const f = r.get("folder");
                return {
                    ...f,
                    created_at: typeof f.created_at?.toNumber === 'function' ? f.created_at.toNumber() : (f.created_at?.low ?? f.created_at)
                };
            });
        } finally { await session.close(); }
    });

    app.post("/api/ontology/projects/:id/folders", async (req: any, reply) => {
        const { id } = req.params;
        const { folderId, name } = req.body;
        const session = driver.session();
        try {
            // First get project to find root path
            const projectResult = await session.run(`MATCH (p:OntologyProject {id: $id}) RETURN p.folder_path as folderPath`, { id });
            if (projectResult.records.length === 0) throw new Error("Parent project not found");
            const projectPath = projectResult.records[0].get("folderPath");

            // 1. Create local subdirectory
            let absoluteFolderPath = "";
            if (projectPath) {
                const sanitizedName = (name || "New Folder").replace(/[^a-z0-9_ -]/gi, '_').trim();
                absoluteFolderPath = path.join(projectPath, sanitizedName);
                if (!fs.existsSync(absoluteFolderPath)) {
                    fs.mkdirSync(absoluteFolderPath, { recursive: true });
                }
            }

            // 2. Persist OntologyFolder to Neo4j
            await session.run(`
                MATCH (p:OntologyProject {id: $id})
                CREATE (f:OntologyFolder {
                    id: $folderId,
                    name: $name,
                    folder_path: $absoluteFolderPath,
                    created_at: timestamp()
                })-[:IN_PROJECT]->(p)
            `, { id, folderId, name, absoluteFolderPath });

            return { success: true, path: absoluteFolderPath };
        } catch (error: any) {
            reply.status(400).send({ error: error.message });
        } finally { await session.close(); }
    });

    // GET /api/ontology/schema — full ontology summary for UI rendering
    app.get("/api/ontology/schema", async (_req, _reply) => {
        const session = driver.session();
        try {
            const objectTypes = await session.run(`
                MATCH (o:OntologyObjectType)
                OPTIONAL MATCH (o)-[:HAS_PROPERTY]->(p:OntologyProperty)
                OPTIONAL MATCH (o)-[:IMPLEMENTS]->(i:OntologyInterface)
                RETURN o { .* } as object_type, collect(DISTINCT p { .* }) as properties,
                       collect(DISTINCT i.api_name) as implements ORDER BY object_type.display_name
            `);

            const linkTypes = await session.run(`
                MATCH (l:OntologyLinkType)
                MATCH (l)-[:SOURCE]->(s:OntologyObjectType), (l)-[:TARGET]->(t:OntologyObjectType)
                RETURN l { .* } as link_type, s.api_name as source, s.display_name as source_display,
                       t.api_name as target, t.display_name as target_display
                ORDER BY link_type.api_name
            `);

            const actionTypes = await session.run(`
                MATCH (a:OntologyActionType)
                OPTIONAL MATCH (a)-[:HAS_PARAMETER]->(p:OntologyActionParameter)
                RETURN a { .* } as action_type, collect(p { .* }) as parameters ORDER BY action_type.display_name
            `);

            const interfaces = await session.run(`
                MATCH (i:OntologyInterface)
                OPTIONAL MATCH (i)-[:REQUIRES_PROPERTY]->(p:OntologyProperty)
                OPTIONAL MATCH (o:OntologyObjectType)-[:IMPLEMENTS]->(i)
                RETURN i { .* } as iface,
                       collect(DISTINCT p { .* }) as properties,
                       collect(DISTINCT o.api_name) as implemented_by
                ORDER BY iface.display_name
            `);

            return {
                object_types: objectTypes.records.map(r => ({
                    ...r.get("object_type"),
                    properties: r.get("properties").filter((p: any) => p.api_name),
                    implements: r.get("implements").filter((x: any) => x != null)
                })),
                link_types: linkTypes.records.map(r => ({
                    ...r.get("link_type"),
                    source: r.get("source"), source_display: r.get("source_display"),
                    target: r.get("target"), target_display: r.get("target_display")
                })),
                action_types: actionTypes.records.map(r => ({
                    ...r.get("action_type"),
                    hitl_level: r.get("action_type").hitl_level?.toNumber?.() ?? r.get("action_type").hitl_level,
                    parameters: r.get("parameters").filter((p: any) => p.api_name)
                })),
                interfaces: interfaces.records.map(r => ({
                    ...r.get("iface"),
                    properties: r.get("properties").filter((p: any) => p.api_name),
                    implemented_by: r.get("implemented_by").filter((x: any) => x != null)
                }))
            };
        } finally { await session.close(); }
    });

    app.post("/api/ontology/projects/:id/upload", async (req: any, reply) => {
        const { id } = req.params;
        const session = driver.session();

        try {
            let workspacePath = "";
            let projectFound = false;

            try {
                const projectResult = await session.run(
                    `MATCH (p:OntologyProject {id: $id}) RETURN p.folder_path as path`,
                    { id }
                );
                if (projectResult.records.length > 0) {
                    workspacePath = projectResult.records[0].get("path");
                    projectFound = true;
                }
            } catch {
                // Neo4j offline fallback
                const projects = readProjectsJson();
                const p = projects.find(pr => pr["id"] === id);
                if (p) {
                    workspacePath = p["folder_path"] as string;
                    projectFound = true;
                }
            }

            if (!projectFound) return reply.status(404).send({ error: "Project not found" });

            const parts = req.files();
            const uploadedFiles = [];

            for await (const part of parts) {
                const filePath = path.join(workspacePath, part.filename);
                const writeStream = fs.createWriteStream(filePath);

                await pipeline(part.file, writeStream);

                try {
                    await session.run(`
                        MATCH (p:OntologyProject {id: $projectId})
                        CREATE (d:OntologyDataset {
                            id: $datasetId,
                            name: $name,
                            file_path: $filePath,
                            created_at: timestamp()
                        })
                        CREATE (d)-[:BELONGS_TO]->(p)
                    `, {
                        projectId: id,
                        datasetId: uuidv4(),
                        name: part.filename,
                        filePath
                    });
                } catch {
                    // Neo4j offline — ignore. The file is saved to disk perfectly fine.
                }

                uploadedFiles.push(part.filename);
            }

            return { success: true, files: uploadedFiles };
        } catch (error: any) {
            reply.status(500).send({ error: error.message });
        } finally {
            await session.close();
        }
    });

    // GET /api/ontology/projects/:id/datasets
    // List all datasets belonging to a project
    app.get("/api/ontology/projects/:id/datasets", async (req: any, reply) => {
        const { id } = req.params;
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (p:OntologyProject {id: $id})<-[:BELONGS_TO]-(d:OntologyDataset)
                RETURN d { .*, created_at: toString(d.created_at) } as dataset
                ORDER BY d.created_at DESC
            `, { id });
            return result.records.map(r => {
                const d = r.get("dataset");
                return {
                    ...d,
                    created_at: parseInt(d.created_at || "0") || Date.now()
                };
            });
        } catch {
            // Neo4j offline — fallback to reading the workspace directory on disk
            const projects = readProjectsJson();
            const p = projects.find(pr => pr["id"] === id);
            if (!p || !p["folder_path"]) return reply.status(404).send({ error: "Project not found" });

            const dir = p["folder_path"] as string;
            if (fs.existsSync(dir)) {
                return fs.readdirSync(dir, { withFileTypes: true })
                    .filter(dirent => dirent.isFile() && !dirent.name.startsWith("."))
                    .map(dirent => ({
                        id: dirent.name,
                        name: dirent.name,
                        file_path: path.join(dir, dirent.name),
                        created_at: Date.now()
                    }));
            }
            return [];
        } finally { await session.close(); }
    });

    // GET /api/ontology/datasets/:id/preview
    // Stream a CSV dataset directly to JSON for the builder UI
    app.get("/api/ontology/datasets/:id/preview", async (req: any, reply) => {
        const { id } = req.params;
        const { projectId } = req.query;
        let filePath = "";

        // ── 1. Try Neo4j first ────────────────────────────────────────────────
        const session = driver.session();
        try {
            const result = await session.run(
                `MATCH (d:OntologyDataset {id: $id}) RETURN d.file_path as path`,
                { id }
            );
            if (result.records.length > 0) {
                filePath = result.records[0].get("path") || "";
            }
        } catch { /* Neo4j offline */ }
        try { await session.close(); } catch { /* ignore */ }

        // ── 2. Fallback: search workspace directories ─────────────────────────
        if (!filePath || !fs.existsSync(filePath)) {
            const searchRecursive = (dir: string): string => {
                if (!fs.existsSync(dir)) return "";
                try {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            const found = searchRecursive(fullPath);
                            if (found) return found;
                        } else if (entry.isFile() && entry.name === id) {
                            return fullPath;
                        }
                    }
                } catch { /* skip unreadable dirs */ }
                return "";
            };

            const projects = readProjectsJson();
            // If a projectId is given, only search that project's workspace
            const candidates = projectId
                ? projects.filter(p => p["id"] === projectId)
                : projects;

            for (const p of candidates) {
                if (p["folder_path"]) {
                    const found = searchRecursive(p["folder_path"] as string);
                    if (found) { filePath = found; break; }
                }
            }

            // If still not found, also search the global workspaces root
            if (!filePath) {
                const workspacesRoot = path.join(process.cwd(), "..", "..", "data", "workspaces");
                filePath = searchRecursive(workspacesRoot);
            }
        }

        if (!filePath || !fs.existsSync(filePath)) {
            return reply.status(404).send({ error: `Dataset file not found: ${id}` });
        }

        // ── 3. Parse CSV ───────────────────────────────────────────────────────
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            // Normalize line endings: handle \r\n and \n
            const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
                .split("\n").map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length === 0) return { columns: [], rows: [] };

            // Simple CSV parser that handles quoted fields
            const parseCSVLine = (line: string): string[] => {
                const result: string[] = [];
                let current = "";
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') { inQuotes = !inQuotes; }
                    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ""; }
                    else { current += ch; }
                }
                result.push(current.trim());
                return result;
            };

            const headers = parseCSVLine(lines[0]);
            const columns = headers.map(h => ({ name: h, type: "String" }));
            const rows: Record<string, string>[] = [];

            for (let i = 1; i < Math.min(lines.length, 501); i++) {
                const values = parseCSVLine(lines[i]);
                const rowObj: Record<string, string> = {};
                headers.forEach((h, idx) => { rowObj[h] = values[idx] ?? ""; });
                rows.push(rowObj);
            }
            return { columns, rows, total: lines.length - 1 };
        } catch (e: any) {
            return reply.status(500).send({ error: "Failed to parse CSV: " + e.message });
        }
    });


    // ── Pipelines JSON fallback helpers ───────────────────────────────────────
    const pipelinesJsonPath = path.join(process.cwd(), "..", "..", "data", "pipelines.json");

    function readPipelinesJson(): Record<string, unknown>[] {
        try {
            if (fs.existsSync(pipelinesJsonPath)) {
                return JSON.parse(fs.readFileSync(pipelinesJsonPath, "utf-8")) as Record<string, unknown>[];
            }
        } catch { /* ignore */ }
        return [];
    }

    function writePipelinesJson(pipelines: Record<string, unknown>[]) {
        const dir = path.dirname(pipelinesJsonPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(pipelinesJsonPath, JSON.stringify(pipelines, null, 2), "utf-8");
    }

    // GET /api/ontology/pipelines/:id
    // Fetch pipeline and its parent project
    app.get("/api/ontology/pipelines/:id", async (req: any, reply) => {
        const { id } = req.params;
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (pl:OntologyPipeline {id: $id})-[:IN_PROJECT]->(p:OntologyProject)
                RETURN pl { .* } as pipeline, p.id as projectId, p.name as projectName, p.space as projectSpace
            `, { id });
            if (result.records.length === 0) return reply.status(404).send({ error: "Pipeline not found" });

            const r = result.records[0];
            return {
                ...r.get("pipeline"),
                projectId: r.get("projectId"),
                projectName: r.get("projectName"),
                projectSpace: r.get("projectSpace"),
            };
        } catch (error: any) {
            // Neo4j offline — fallback to pipelines JSON
            const pipelines = readPipelinesJson();
            const pl = pipelines.find(p => p["id"] === id);
            if (!pl) return reply.status(404).send({ error: "Pipeline not found" });

            const projects = readProjectsJson();
            const proj = projects.find(p => p["id"] === pl["projectId"]);

            return {
                ...pl,
                projectId: proj ? proj["id"] : id,
                projectName: proj ? proj["name"] : "Offline Project",
                projectSpace: proj ? (proj["space"] || "Offline Space") : "Offline Space"
            };
        } finally { await session.close(); }
    });

    // POST /api/ontology/projects/:id/pipelines
    // Create a new pipeline in a project/folder
    app.post("/api/ontology/projects/:id/pipelines", async (req: any, reply) => {
        const { id } = req.params;
        const { id: pipelineId, name, folderId, type, compute } = req.body;
        const session = driver.session();

        const pipelineRecord = {
            id: pipelineId,
            projectId: id,
            name,
            folder_id: folderId || id,
            type,
            compute,
            created_at: Date.now()
        };

        try {
            await session.run(`
                MATCH (p:OntologyProject {id: $projectId})
                CREATE (pl:OntologyPipeline {
                    id: $pipelineId,
                    name: $name,
                    folder_id: $folderId,
                    type: $type,
                    compute: $compute,
                    created_at: timestamp()
                })
                CREATE (pl)-[:IN_PROJECT]->(p)
            `, {
                projectId: id,
                pipelineId,
                name,
                folderId: folderId || id,
                type,
                compute
            });

            return { success: true, pipelineId };
        } catch (error: any) {
            // Neo4j offline — fallback to pipelines JSON
            const pipelines = readPipelinesJson();
            pipelines.unshift(pipelineRecord);
            writePipelinesJson(pipelines);

            return { success: true, pipelineId };
        } finally {
            await session.close();
        }
    });

    // ════════════════════════════════════════════════════════════════════════════
    // PIPELINE TRANSFORMS
    // POST /api/ontology/pipelines/:id/transforms/:nodeId
    // Save (replace) the full transform chain + path name for a specific pipeline node
    // ════════════════════════════════════════════════════════════════════════════
    app.post("/api/ontology/pipelines/:id/transforms/:nodeId", async (req: any, reply) => {
        const { id, nodeId } = req.params;
        const { pathName, transforms } = req.body as {
            pathName: string;
            transforms: Array<{ id: string; type: string; params: Record<string, unknown>; applied: boolean }>;
        };

        const session = driver.session();
        try {
            const check = await session.run(`MATCH (pl:OntologyPipeline {id: $id}) RETURN pl.transforms as transforms`, { id });
            let existing: Record<string, any> = {};
            if (check.records.length > 0) {
                const raw = check.records[0].get("transforms");
                if (raw) {
                    try { existing = JSON.parse(raw); } catch { }
                    if (Array.isArray(existing)) existing = {}; // migrate legacy stringified array tracking
                }
            }
            existing[nodeId] = { pathName, transforms };

            // Upsert transform chain onto the OntologyPipeline node
            await session.run(`
                MATCH (pl:OntologyPipeline {id: $id})
                SET pl.transforms          = $newTransforms,
                    pl.updated_at          = datetime()
            `, {
                id,
                newTransforms: JSON.stringify(existing),
            });

            return reply.send({ success: true });
        } catch (error: any) {
            // Neo4j offline — persist in pipelines.json fallback
            const pipelines = readPipelinesJson();
            const idx = pipelines.findIndex(p => p["id"] === id);
            if (idx !== -1) {
                let existing: Record<string, any> = {};
                try {
                    const raw = pipelines[idx]["transforms"];
                    if (typeof raw === "string") existing = JSON.parse(raw);
                    if (Array.isArray(existing)) existing = {};
                } catch { }

                existing[nodeId] = { pathName, transforms };
                pipelines[idx] = {
                    ...pipelines[idx],
                    transforms: JSON.stringify(existing),
                    updated_at: new Date().toISOString(),
                };
            }
            writePipelinesJson(pipelines);
            return reply.send({ success: true, offline: true });
        } finally {
            await session.close();
        }
    });

    // GET /api/ontology/pipelines/:id/transforms/:nodeId
    // Load the saved transform chain for a node
    app.get("/api/ontology/pipelines/:id/transforms/:nodeId", async (req: any, reply) => {
        const { id, nodeId } = req.params;
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (pl:OntologyPipeline {id: $id})
                RETURN pl.transforms AS transforms
            `, { id });

            if (!result.records[0]) return reply.status(404).send({ error: "Pipeline not found" });

            const raw = result.records[0].get("transforms");
            let existing: Record<string, any> = {};
            if (raw) {
                try { existing = JSON.parse(raw); } catch { }
            }
            const nodeData = existing[nodeId] || {};
            return {
                pathName: nodeData.pathName ?? "Transform path 1",
                transforms: nodeData.transforms ?? [],
            };
        } catch (error: any) {
            // Neo4j offline — read from JSON fallback
            const pipelines = readPipelinesJson();
            const pl = pipelines.find(p => p["id"] === id);
            if (!pl) return reply.status(404).send({ error: "Pipeline not found" });

            let existing: Record<string, any> = {};
            try {
                const raw = pl["transforms"];
                if (typeof raw === "string") existing = JSON.parse(raw);
            } catch { }

            const nodeData = existing[nodeId] || {};
            return {
                pathName: nodeData.pathName ?? "Transform path 1",
                transforms: nodeData.transforms ?? [],
            };
        } finally {
            await session.close();
        }
    });

    // GET /api/ontology/pipelines
    // List all pipelines
    app.get("/api/ontology/pipelines", async (_req, reply) => {
        const session = driver.session();
        try {
            const result = await session.run(`
                MATCH (pl:OntologyPipeline)
                OPTIONAL MATCH (pl)-[:IN_PROJECT]->(p:OntologyProject)
                RETURN pl { .* } as pipeline, p.id as projectId, p.name as projectName
                ORDER BY pl.created_at DESC
            `);
            return result.records.map(r => ({
                ...r.get("pipeline"),
                projectId: r.get("projectId"),
                projectName: r.get("projectName"),
            }));
        } catch {
            return readPipelinesJson();
        } finally {
            await session.close();
        }
    });

}
