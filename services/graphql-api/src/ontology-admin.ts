/**
 * ontology-admin.ts — 1:1 Y-AIP Ontology Registry API
 *
 * 12 REST endpoints mirroring the Y-AIP Ontology Manager:
 *   Object Types: GET list, POST create, GET single, PATCH update, DELETE
 *   Link Types:   GET list, POST create
 *   Action Types: GET list, POST create, GET single, POST apply (execute)
 *   Interfaces:   GET list, POST create
 */
import { FastifyInstance } from "fastify";
import { int, Driver } from "neo4j-driver";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { pipeline } from "stream/promises";

export async function registerOntologyAdminRoutes(app: FastifyInstance, driver: Driver) {

    // ════════════════════════════════════════════════════════════════════════════
    // DATASETS — Dynamic filesystem-based (reads real CSVs from workspace folders)
    // ════════════════════════════════════════════════════════════════════════════

    const DATA_ROOT = path.resolve(process.cwd(), "..", "..", "data");
    const WORKSPACES_ROOT = path.join(DATA_ROOT, "workspaces");

    /** Infer a column type from a sample of string values */
    function inferType(samples: string[]): string {
        const vals = samples.filter(v => v.trim() !== "");
        if (vals.length === 0) return "string";
        const numberCount = vals.filter(v => !isNaN(Number(v))).length;
        if (numberCount / vals.length > 0.8) {
            const intCount = vals.filter(v => Number.isInteger(Number(v))).length;
            return intCount / vals.length > 0.8 ? "integer" : "double";
        }
        const dateCount = vals.filter(v => !isNaN(Date.parse(v))).length;
        if (dateCount / vals.length > 0.8) return "date";
        return "string";
    }

    /** Parse a CSV first row for headers, plus sample rows for type inference */
    function parseCsvMeta(content: string, maxRows = 200): {
        columns: { name: string; type: string }[];
        rows: Record<string, string>[];
        total: number;
    } {
        const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 1) return { columns: [], rows: [], total: 0 };

        // Parse a single line respecting quoted fields
        const parseLine = (line: string): string[] => {
            const result: string[] = [];
            let cur = "";
            let inQuote = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') { inQuote = !inQuote; continue; }
                if (ch === "," && !inQuote) { result.push(cur); cur = ""; continue; }
                cur += ch;
            }
            result.push(cur);
            return result;
        };

        const headers = parseLine(lines[0]);
        const dataLines = lines.slice(1);
        const total = dataLines.length;
        const samples = dataLines.slice(0, 20);
        const columns = headers.map((h, idx) => ({
            name: h.trim(),
            type: inferType(samples.map(l => parseLine(l)[idx] ?? ""))
        }));

        const rows = dataLines.slice(0, maxRows).map(line => {
            const vals = parseLine(line);
            const row: Record<string, string> = {};
            headers.forEach((h, i) => { row[h.trim()] = (vals[i] ?? "").trim(); });
            return row;
        });

        return { columns, rows, total };
    }

    /** Recursively convert Neo4j Integer / Date objects to plain JS values so JSON.stringify works */
    function serializeNeo4j(val: unknown): unknown {
        if (val === null || val === undefined) return val;
        // Neo4j Integer — has low/high fields and toNumber()
        if (typeof (val as any)?.toNumber === "function") return (val as any).toNumber();
        if (Array.isArray(val)) return val.map(serializeNeo4j);
        if (typeof val === "object") {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
                out[k] = serializeNeo4j(v);
            }
            return out;
        }
        return val;
    }

    /** Find a project's folder path from projects.json or Neo4j */
    async function getProjectFolderPath(projectId: string): Promise<string | null> {
        // 1. Try Neo4j
        const sess = driver.session();
        try {
            const r = await sess.run(
                `MATCH (p:OntologyProject {id: $id}) RETURN p.folder_path as fp`,
                { id: projectId }
            );
            if (r.records[0]) {
                const fp = r.records[0].get("fp");
                if (fp && fs.existsSync(fp)) return fp;
            }
        } catch { /* Neo4j offline */ } finally { await sess.close(); }

        // 2. Fall back to projects.json
        try {
            const projectsPath = path.join(DATA_ROOT, "projects.json");
            if (fs.existsSync(projectsPath)) {
                const projects = JSON.parse(fs.readFileSync(projectsPath, "utf-8")) as Record<string, unknown>[];
                const p = projects.find(pr => pr["id"] === projectId);
                if (p && typeof p["folder_path"] === "string" && fs.existsSync(p["folder_path"] as string)) {
                    return p["folder_path"] as string;
                }
            }
        } catch { /* ignore */ }

        return null;
    }

    /** List all CSV files in a given folder */
    function listCsvFiles(folderPath: string): { id: string; name: string; path: string; absPath: string }[] {
        try {
            return fs.readdirSync(folderPath)
                .filter(f => f.toLowerCase().endsWith(".csv"))
                .map(f => {
                    const nameWithoutExt = f.replace(/\.csv$/i, "");
                    return {
                        id: nameWithoutExt,
                        name: nameWithoutExt,
                        path: `/workspace/${path.basename(folderPath)}/${f}`,
                        absPath: path.join(folderPath, f)
                    };
                });
        } catch { return []; }
    }

    /** Resolve a dataset file given an id and optional projectId */
    async function resolveDatasetFile(id: string, projectId?: string): Promise<string | null> {
        // 1. Scoped to a project workspace
        if (projectId) {
            const folderPath = await getProjectFolderPath(projectId);
            if (folderPath) {
                const candidate = path.join(folderPath, `${id}.csv`);
                if (fs.existsSync(candidate)) return candidate;
                // try matching by prefix
                const files = listCsvFiles(folderPath);
                const match = files.find(f => f.id === id || f.name === id);
                if (match) return match.absPath;
            }
        }

        // 2. Search all workspace folders
        if (fs.existsSync(WORKSPACES_ROOT)) {
            for (const ws of fs.readdirSync(WORKSPACES_ROOT)) {
                const candidate = path.join(WORKSPACES_ROOT, ws, `${id}.csv`);
                if (fs.existsSync(candidate)) return candidate;
            }
        }

        return null;
    }

    // ── GET /api/ontology-admin/datasets ─────────────────────────────────────
    // List all CSV files across all workspace folders (for the ontology wizard)
    app.get("/api/ontology-admin/datasets", async (req: any, _reply) => {
        const projectId = req.query?.projectId as string | undefined;

        if (projectId) {
            const folderPath = await getProjectFolderPath(projectId);
            if (folderPath) return listCsvFiles(folderPath).map(f => ({ id: f.id, name: f.name, path: f.path }));
        }

        // Return all datasets across all workspace folders
        const results: { id: string; name: string; path: string }[] = [];
        if (fs.existsSync(WORKSPACES_ROOT)) {
            for (const ws of fs.readdirSync(WORKSPACES_ROOT)) {
                const wsPath = path.join(WORKSPACES_ROOT, ws);
                if (fs.statSync(wsPath).isDirectory()) {
                    listCsvFiles(wsPath).forEach(f => {
                        if (!results.find(r => r.id === f.id)) results.push({ id: f.id, name: f.name, path: f.path });
                    });
                }
            }
        }
        return results;
    });

    // ── GET /api/ontology-admin/datasets/:id/preview ─────────────────────────
    // Returns ALL rows + column schema inferred from real CSV data
    app.get("/api/ontology-admin/datasets/:id/preview", async (req: any, reply) => {
        const { id } = req.params;
        const projectId = req.query?.projectId as string | undefined;

        const filePath = await resolveDatasetFile(id, projectId);
        if (!filePath) return reply.status(404).send({ error: `Dataset '${id}' not found` });

        try {
            const content = fs.readFileSync(filePath, "utf-8");
            // Always return all rows — no artificial cap
            const { columns, rows, total } = parseCsvMeta(content, Infinity);
            return { id, name: id, columns, rows, total, file: path.basename(filePath) };
        } catch (e) {
            console.error("CSV read error:", e);
            return reply.status(500).send({ error: "Failed to read dataset" });
        }
    });

    // ── GET /api/ontology-admin/datasets/:id/schema ──────────────────────────
    // Returns column names + types only (no rows) for join/schema introspection
    app.get("/api/ontology-admin/datasets/:id/schema", async (req: any, reply) => {
        const { id } = req.params;
        const projectId = req.query?.projectId as string | undefined;

        const filePath = await resolveDatasetFile(id, projectId);
        if (!filePath) return reply.status(404).send({ error: `Dataset '${id}' not found` });

        try {
            const content = fs.readFileSync(filePath, "utf-8");
            const { columns, total } = parseCsvMeta(content, 0);
            return { id, name: id, columns, total };
        } catch (e) {
            console.error("Schema read error:", e);
            return reply.status(500).send({ error: "Failed to read schema" });
        }
    });

    // ── GET /api/ontology-admin/projects/:id/datasets ────────────────────────
    // Lists all CSV files belonging to a specific project's workspace
    app.get("/api/ontology-admin/projects/:id/datasets", async (req: any, reply) => {
        const { id } = req.params;
        const folderPath = await getProjectFolderPath(id);
        if (!folderPath) return reply.status(404).send({ error: "Project not found or has no workspace" });

        const datasets = listCsvFiles(folderPath).map(f => {
            // Read column schema from each CSV (header only — fast)
            try {
                const content = fs.readFileSync(f.absPath, "utf-8");
                const firstLine = content.split(/\r?\n/)[0] ?? "";
                const headers = firstLine.split(",").map(h => h.trim().replace(/^"|"$/g, ""));
                // Quick 5-line sample for type inference
                const sample = content.split(/\r?\n/).slice(1, 6);
                const parseLine = (line: string) => line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
                const columns = headers.map((h, i) => ({
                    name: h,
                    type: inferType(sample.map(l => parseLine(l)[i] ?? ""))
                }));
                return { id: f.id, name: f.name, path: f.path, columns };
            } catch {
                return { id: f.id, name: f.name, path: f.path, columns: [] };
            }
        });

        return datasets;
    });


    // ════════════════════════════════════════════════════════════════════════════
    // OBJECT TYPES
    // ════════════════════════════════════════════════════════════════════════════

    // GET /api/ontology-admin/object-types
    // List all Object Types with their property counts and implemented interfaces
    app.get("/api/ontology-admin/object-types", async (_req, reply) => {
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
        } catch (error) {
            console.error("ObjectType listing error (Neo4j offline):", error);
            return [];
        } finally { await session.close(); }
    });

    // GET /api/ontology-admin/object-types/:apiName
    // Get a single Object Type with properties, link types, and actions
    app.get("/api/ontology-admin/object-types/:apiName", async (req: any, reply) => {
        const { apiName } = req.params;
        const session = driver.session();
        try {
            // Use one session sequentially to ensure cleanup
            const otResult = await session.run(`
                MATCH (o:OntologyObjectType {api_name: $apiName})
                OPTIONAL MATCH (o)-[:HAS_PROPERTY]->(p:OntologyProperty)
                OPTIONAL MATCH (o)-[:IMPLEMENTS]->(i:OntologyInterface)
                RETURN
                    o.api_name          AS api_name,
                    o.display_name      AS display_name,
                    o.plural_display_name AS plural_display_name,
                    o.description       AS description,
                    o.primary_key       AS primary_key,
                    o.title_property    AS title_property,
                    o.backing_source    AS backing_source,
                    o.icon              AS icon,
                    o.index_status      AS index_status,
                    toString(o.index_count)  AS index_count,
                    o.last_synced       AS last_synced,
                    o.status            AS status,
                    o.visibility        AS visibility,
                    o.ontology_name     AS ontology_name,
                    o.point_of_contact  AS point_of_contact,
                    o.contributors      AS contributors,
                    collect(DISTINCT {
                        api_name: p.api_name,
                        display_name: p.display_name,
                        data_type: p.data_type,
                        is_primary_key: p.is_primary_key,
                        is_required: p.is_required,
                        scope: p.scope
                    }) AS properties,
                    collect(DISTINCT {
                        api_name: i.api_name,
                        display_name: i.display_name
                    }) AS interfaces
            `, { apiName });

            if (!otResult.records[0] || otResult.records[0].get("api_name") === null) {
                return reply.status(404).send({ error: "Object type not found" });
            }

            const linksResult = await session.run(`
                MATCH (l:OntologyLinkType)-[:SOURCE|TARGET]->(o:OntologyObjectType {api_name: $apiName})
                MATCH (l)-[:SOURCE]->(src:OntologyObjectType)
                MATCH (l)-[:TARGET]->(tgt:OntologyObjectType)
                RETURN
                    l.api_name              AS api_name,
                    l.display_name_a_side   AS display_name_a_side,
                    l.display_name_b_side   AS display_name_b_side,
                    l.cardinality           AS cardinality,
                    src.api_name            AS source,
                    tgt.api_name            AS target
            `, { apiName });

            const actionsResult = await session.run(`
                MATCH (a:OntologyActionType)-[:TARGETS]->(o:OntologyObjectType {api_name: $apiName})
                RETURN
                    a.api_name      AS api_name,
                    a.display_name  AS display_name,
                    a.description   AS description,
                    a.action_type   AS action_type,
                    a.status        AS status
            `, { apiName });

            const r = otResult.records[0];
            const rawProps = (r.get("properties") as any[]).filter((p: any) => p?.api_name != null);
            const rawIfaces = (r.get("interfaces") as any[]).filter((i: any) => i?.api_name != null);

            const payload = {
                api_name: String(r.get("api_name") ?? ""),
                display_name: String(r.get("display_name") ?? ""),
                plural_display_name: String(r.get("plural_display_name") ?? ""),
                description: String(r.get("description") ?? ""),
                primary_key: String(r.get("primary_key") ?? ""),
                title_property: String(r.get("title_property") ?? ""),
                backing_source: String(r.get("backing_source") ?? ""),
                icon: String(r.get("icon") ?? "entity"),
                index_status: String(r.get("index_status") ?? "pending"),
                index_count: parseInt(String(r.get("index_count") ?? "0"), 10) || 0,
                last_synced: r.get("last_synced") ? String(r.get("last_synced")) : null,
                status: String(r.get("status") ?? "Experimental"),
                visibility: String(r.get("visibility") ?? "Normal"),
                ontology_name: String(r.get("ontology_name") ?? "Ontologize Public Ontology"),
                point_of_contact: String(r.get("point_of_contact") ?? "None"),
                contributors: String(r.get("contributors") ?? "None"),
                properties: rawProps.map((p: any) => ({
                    api_name: String(p.api_name ?? ""),
                    display_name: String(p.display_name ?? ""),
                    data_type: String(p.data_type ?? "string"),
                    is_primary_key: p.is_primary_key === true || p.is_primary_key === "true",
                    is_required: p.is_required === true || p.is_required === "true",
                    scope: String(p.scope ?? "local"),
                })),
                implements: rawIfaces.map((i: any) => ({
                    api_name: String(i.api_name ?? ""),
                    display_name: String(i.display_name ?? ""),
                })),
                link_types: linksResult.records.map(lr => ({
                    api_name: String(lr.get("api_name") ?? ""),
                    display_name_a_side: String(lr.get("display_name_a_side") ?? ""),
                    display_name_b_side: String(lr.get("display_name_b_side") ?? ""),
                    cardinality: String(lr.get("cardinality") ?? ""),
                    source: String(lr.get("source") ?? ""),
                    target: String(lr.get("target") ?? ""),
                })),
                action_types: actionsResult.records.map(ar => ({
                    api_name: String(ar.get("api_name") ?? ""),
                    display_name: String(ar.get("display_name") ?? ""),
                    description: String(ar.get("description") ?? ""),
                    action_type: String(ar.get("action_type") ?? ""),
                    status: String(ar.get("status") ?? ""),
                })),
            };

            return reply.type("application/json").send(JSON.stringify(payload));
        } catch (e: any) {
            console.error(`[GET object-type ${apiName}] Detailed Error:`, e);
            return reply.status(500).send({ error: "Failed to load object type", detail: e?.message });
        } finally {
            await session.close();
        }
    });

    // PATCH /api/ontology-admin/object-types/:apiName
    // Update an existing Object Type
    app.patch("/api/ontology-admin/object-types/:apiName", async (req: any, reply) => {
        const { apiName } = req.params;
        const updates = req.body ?? {};
        if (Object.keys(updates).length === 0) return reply.status(400).send({ error: "No fields to update" });

        const session = driver.session();
        try {
            // Check existence
            const exists = await session.run(`MATCH (o:OntologyObjectType {api_name: $apiName}) RETURN o`, { apiName });
            if (exists.records.length === 0) return reply.status(404).send({ error: "Object type not found" });

            // If updating api_name, ensure the new one doesn't exist
            if (updates.api_name && updates.api_name !== apiName) {
                const target = await session.run(`MATCH (o:OntologyObjectType {api_name: $newApiName}) RETURN o`, { newApiName: updates.api_name });
                if (target.records.length > 0) return reply.status(409).send({ error: `Object type '${updates.api_name}' already exists` });
            }

            // Build dynamic SET clause
            const setPhrases: string[] = [];
            const params: Record<string, any> = { apiName };
            for (const [k, v] of Object.entries(updates)) {
                // Ignore properties we shouldn't touch here
                if (['properties', 'implements_interfaces'].includes(k)) continue;
                setPhrases.push(`o.${k} = $${k}`);
                params[k] = v;
            }

            if (setPhrases.length > 0) {
                await session.run(`
                    MATCH (o:OntologyObjectType {api_name: $apiName})
                    SET ${setPhrases.join(", ")}
                    RETURN o
                `, params);
            }

            return reply.send({ status: "updated", api_name: updates.api_name || apiName });
        } catch (e: any) {
            console.error(`[PATCH object-type ${apiName}] Error:`, e);
            return reply.status(500).send({ error: "Failed to update object type" });
        } finally {
            await session.close();
        }
    });

    // POST /api/ontology-admin/object-types
    // Create a new Object Type with typed properties
    app.post("/api/ontology-admin/object-types", async (req: any, reply) => {
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

            // Set initial index status on the new node
            await session.run(`MATCH (o:OntologyObjectType {api_name: $api_name}) SET o.index_status = 'indexing', o.index_count = 0, o.last_synced = null`, { api_name });
            // Fire-and-forget — schedule after current tick so response is sent first
            setImmediate(() => triggerIndexing(api_name, backing_source ?? "connector-postgres", driver).catch(console.error));
            return { status: "created", api_name };
        } finally { await session.close(); }
    });

    // POST /api/ontology-admin/object-types/:apiName/index  — manually re-trigger
    app.post("/api/ontology-admin/object-types/:apiName/index", async (req: any, reply) => {
        const { apiName } = req.params;
        const sess = driver.session();
        try {
            const r = await sess.run(`MATCH (o:OntologyObjectType {api_name: $apiName}) RETURN o.backing_source as bs`, { apiName });
            if (!r.records[0]) return reply.status(404).send({ error: "Object type not found" });
            await sess.run(`MATCH (o:OntologyObjectType {api_name: $apiName}) SET o.index_status = 'indexing', o.index_count = 0`, { apiName });
            triggerIndexing(apiName, r.records[0].get("bs") ?? "connector-postgres", driver).catch(console.error);
            return { status: "indexing_started", api_name: apiName };
        } finally { await sess.close(); }
    });

    // GET /api/ontology-admin/object-types/:apiName/index-status  — poll status
    app.get("/api/ontology-admin/object-types/:apiName/index-status", async (req: any, reply) => {
        const { apiName } = req.params;
        const sess = driver.session();
        try {
            const r = await sess.run(
                `MATCH (o:OntologyObjectType {api_name: $apiName})
                 RETURN o.index_status AS status,
                        o.index_count  AS count,
                        o.last_synced  AS last_synced`,
                { apiName }
            );
            if (!r.records[0]) return reply.status(404).send({ error: "Not found" });

            const rec = r.records[0];

            // Safely extract index_count — handles Neo4j Integer, BigInt, plain number, and string
            const rawCount = rec.get("count");
            let indexCount = 0;
            if (rawCount !== null && rawCount !== undefined) {
                if (typeof rawCount.toNumber === "function") indexCount = rawCount.toNumber();
                else if (typeof rawCount.toInt === "function") indexCount = rawCount.toInt();
                else indexCount = parseInt(String(rawCount), 10) || 0;
            }

            // Safely extract last_synced — Neo4j DateTime objects have a toString()
            const rawSynced = rec.get("last_synced");
            const lastSynced = rawSynced != null
                ? (typeof rawSynced.toString === "function" && typeof rawSynced !== "string"
                    ? rawSynced.toString()
                    : String(rawSynced))
                : null;

            return reply.type("application/json").send(JSON.stringify({
                api_name: apiName,
                index_status: String(rec.get("status") ?? "pending"),
                index_count: indexCount,
                last_synced: lastSynced,
            }));
        } catch (e: any) {
            console.error(`[index-status] ${apiName}:`, e.message);
            return reply.status(500).send({ error: "Failed to get index status", detail: e?.message });
        } finally { await sess.close(); }
    });


    // GET /api/ontology-admin/object-types/:apiName/objects  — query indexed objects
    app.get("/api/ontology-admin/object-types/:apiName/objects", async (req: any, reply) => {
        const { apiName } = req.params;
        const limit = parseInt(String(req.query?.limit ?? "100"), 10);
        const offset = parseInt(String(req.query?.offset ?? "0"), 10);
        const pk = req.query?.pk as string | undefined;

        const sess = driver.session();
        try {
            let result;
            if (pk) {
                result = await sess.run(
                    `MATCH (obj:OntologyObject {_type: $type, _pk: $pk}) RETURN obj { .* } as obj LIMIT 1`,
                    { type: apiName, pk }
                );
            } else {
                result = await sess.run(
                    `MATCH (obj:OntologyObject {_type: $type})
                     RETURN obj { .* } as obj
                     SKIP $offset LIMIT $limit`,
                    { type: apiName, offset: int(offset), limit: int(limit) }
                );
            }
            const rows = result.records.map(r => {
                const obj = r.get("obj") as Record<string, unknown>;
                // Strip internal keys
                const { _type, _pk, _indexed_at, ...props } = obj;
                return props;
            });
            const countRes = await sess.run(
                `MATCH (obj:OntologyObject {_type: $type}) RETURN count(obj) as total`,
                { type: apiName }
            );
            const total = countRes.records[0]?.get("total")?.toNumber?.() ?? rows.length;
            return { objects: rows, total, limit, offset };
        } catch (e: any) {
            console.error(`[objects] ${apiName}:`, e.message);
            return reply.status(500).send({ error: "Failed to query objects", detail: e?.message });
        } finally { await sess.close(); }
    });


    // GET /api/ontology-admin/object-types/:apiName/preview
    // Returns up to 200 rows from the backing dataset for the data preview table
    app.get("/api/ontology-admin/object-types/:apiName/preview", async (req: any, reply) => {
        const { apiName } = req.params;
        const sess = driver.session();
        let backingSource = "";
        try {
            const r = await sess.run(`MATCH (o:OntologyObjectType {api_name: $apiName}) RETURN o.backing_source as bs`, { apiName });
            if (!r.records[0]) return reply.status(404).send({ error: "Not found" });
            backingSource = r.records[0].get("bs") ?? "";
        } finally { await sess.close(); }

        // Try to read a matching CSV file from the data directory
        try {
            const dataDir = path.resolve(process.cwd(), "../../data");
            const allFiles = fs.readdirSync(dataDir).filter(f => f.endsWith(".csv"));
            // Match by backing source name or fallback to any orders CSV
            const match = allFiles.find(f => f.toLowerCase().includes(backingSource.replace(/[^a-z0-9]/gi, "_").toLowerCase()))
                ?? allFiles.find(f => f.includes("order"))
                ?? allFiles[0];
            if (!match) return { columns: [], rows: [] };

            const content = fs.readFileSync(path.join(dataDir, match), "utf-8");
            const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) return { columns: [], rows: [] };

            const columns = lines[0].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
            const rows = lines.slice(1, 201).map(line => {
                const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
                const row: Record<string, string> = {};
                columns.forEach((col, i) => { row[col] = vals[i] ?? ""; });
                return row;
            });
            return { columns, rows, total: lines.length - 1, file: match };
        } catch (e) {
            console.error("Preview read error:", e);
            return { columns: [], rows: [], total: 0, file: null };
        }
    });


    // DELETE /api/ontology-admin/object-types/:apiName
    app.delete("/api/ontology-admin/object-types/:apiName", async (req: any, reply) => {
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

    // GET /api/ontology-admin/link-types
    app.get("/api/ontology-admin/link-types", async (_req, _reply) => {
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
        } catch (error) {
            console.error("LinkType listing error (Neo4j offline):", error);
            return [];
        } finally { await session.close(); }
    });

    // POST /api/ontology-admin/link-types
    app.post("/api/ontology-admin/link-types", async (req: any, reply) => {
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

    // GET /api/ontology-admin/action-types
    app.get("/api/ontology-admin/action-types", async (_req, _reply) => {
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
        } catch (error) {
            console.error("ActionType listing error (Neo4j offline):", error);
            return [];
        } finally { await session.close(); }
    });

    // GET /api/ontology-admin/action-types/:apiName
    app.get("/api/ontology-admin/action-types/:apiName", async (req: any, reply) => {
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

    // POST /api/ontology-admin/action-types
    app.post("/api/ontology-admin/action-types", async (req: any, reply) => {
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

    // POST /api/ontology-admin/action-types/:apiName/apply
    // Execute an Action Type — HITL gate enforced natively
    app.post("/api/ontology-admin/action-types/:apiName/apply", async (req: any, reply) => {
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

    // GET /api/ontology-admin/interfaces
    app.get("/api/ontology-admin/interfaces", async (_req, _reply) => {
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
        } catch (error) {
            console.error("Interface listing error (Neo4j offline):", error);
            return [];
        } finally { await session.close(); }
    });

    // POST /api/ontology-admin/interfaces
    app.post("/api/ontology-admin/interfaces", async (req: any, reply) => {
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

    app.get("/api/ontology-admin/projects", async (_req, _reply) => {
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

    app.post("/api/ontology-admin/projects", async (req: any, reply) => {
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

    app.get("/api/ontology-admin/projects/:id", async (req: any, reply) => {
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

    app.get("/api/ontology-admin/projects/:id/folders", async (req: any, _reply) => {
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
        } catch {
            // Neo4j offline — fallback to scanning disk for subfolders
            const projects = readProjectsJson();
            const p = projects.find(pr => pr["id"] === id);
            if (!p || !p["folder_path"]) return [];

            const dir = p["folder_path"] as string;
            if (fs.existsSync(dir)) {
                try {
                    return fs.readdirSync(dir, { withFileTypes: true })
                        .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith("."))
                        .map(dirent => ({
                            id: dirent.name,
                            name: dirent.name,
                            folder_path: path.join(dir, dirent.name),
                            created_at: Date.now()
                        }));
                } catch { return []; }
            }
            return [];
        } finally { await session.close(); }
    });

    app.post("/api/ontology-admin/projects/:id/folders", async (req: any, reply) => {
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

    // GET /api/ontology-admin/schema — full ontology summary for UI rendering
    app.get("/api/ontology-admin/schema", async (_req, _reply) => {
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
                RETURN a { .* } as action_type, collect(p { .* }) as parameters ORDER BY a.display_name
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
        } catch (error) {
            console.error("Schema listing error (Neo4j offline):", error);
            return {
                object_types: [],
                link_types: [],
                action_types: [],
                interfaces: []
            };
        } finally { await session.close(); }
    });

    app.post("/api/ontology-admin/projects/:id/upload", async (req: any, reply) => {
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

    // GET /api/ontology-admin/pipelines/:id
    // Fetch pipeline and its parent project
    app.get("/api/ontology-admin/pipelines/:id", async (req: any, reply) => {
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

    // POST /api/ontology-admin/projects/:id/pipelines
    // Create a new pipeline in a project/folder
    app.post("/api/ontology-admin/projects/:id/pipelines", async (req: any, reply) => {
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
    // POST /api/ontology-admin/pipelines/:id/transforms/:nodeId
    // Save (replace) the full transform chain + path name for a specific pipeline node
    // ════════════════════════════════════════════════════════════════════════════
    app.post("/api/ontology-admin/pipelines/:id/transforms/:nodeId", async (req: any, reply) => {
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

    // GET /api/ontology-admin/pipelines/:id/transforms/:nodeId
    // Load the saved transform chain for a node
    app.get("/api/ontology-admin/pipelines/:id/transforms/:nodeId", async (req: any, reply) => {
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

    // GET /api/ontology-admin/pipelines
    // List all pipelines
    app.get("/api/ontology-admin/pipelines", async (_req, reply) => {
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


async function triggerIndexing(apiName: string, backingSource: string, driver: Driver) {
    const DATA_ROOT = path.resolve(process.cwd(), "..", "..", "data");
    const WORKSPACES_ROOT = path.join(DATA_ROOT, "workspaces");

    // ── 1. Find the backing CSV ────────────────────────────────────────────────
    let csvPath: string | null = null;

    if (fs.existsSync(WORKSPACES_ROOT)) {
        for (const ws of fs.readdirSync(WORKSPACES_ROOT)) {
            const candidate = path.join(WORKSPACES_ROOT, ws, `${backingSource}.csv`);
            if (fs.existsSync(candidate)) { csvPath = candidate; break; }
        }
    }
    if (!csvPath) {
        const flat = path.join(DATA_ROOT, `${backingSource}.csv`);
        if (fs.existsSync(flat)) csvPath = flat;
    }

    if (!csvPath) {
        console.warn(`[indexing] ${apiName}: no CSV found for '${backingSource}', defaulting to 0`);
        const s = driver.session();
        await s.run(
            `MATCH (o:OntologyObjectType {api_name: $n}) SET o.index_status='active', o.index_count=0, o.last_synced=$ts`,
            { n: apiName, ts: new Date().toISOString() }
        ).finally(() => s.close());
        return;
    }

    console.log(`[indexing] ${apiName}: streaming from ${csvPath}`);

    // ── 2. Read primary_key for this object type ───────────────────────────────
    let primaryKey = "id";
    try {
        const ms = driver.session();
        const pkRes = await ms.run(
            `MATCH (o:OntologyObjectType {api_name: $n}) RETURN o.primary_key as pk`,
            { n: apiName }
        );
        if (pkRes.records[0]) primaryKey = pkRes.records[0].get("pk") ?? "id";
        await ms.close();
    } catch { /* use default */ }

    // ── 3. Stream CSV and parse rows ───────────────────────────────────────────
    const { createReadStream } = await import("fs");
    const { createInterface } = await import("readline");

    const rl = createInterface({
        input: createReadStream(csvPath, { encoding: "utf-8" }),
        crlfDelay: Infinity,
    });

    const parseLine = (line: string): string[] => {
        const result: string[] = [];
        let cur = ""; let inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; continue; }
            if (ch === "," && !inQ) { result.push(cur); cur = ""; continue; }
            cur += ch;
        }
        result.push(cur);
        return result.map(v => v.trim());
    };

    let headers: string[] = [];
    const BATCH_SIZE = 50;   // rows per Neo4j write
    const PARALLEL = 5;    // concurrent batches
    let pending: Record<string, string>[] = [];
    let totalIndexed = 0;
    let isFirstLine = true;

    const mainSess = driver.session();

    /** Write one batch of rows to Neo4j as OntologyObject nodes */
    const writeBatch = async (rows: Record<string, string>[]) => {
        const sess = driver.session();
        try {
            // Delete old objects for this type in this batch range then MERGE fresh nodes
            await sess.run(
                `UNWIND $rows AS row
                 MERGE (obj:OntologyObject {_type: $type, _pk: row._pk})
                 SET obj   = row,
                     obj._type = $type,
                     obj._pk   = row._pk,
                     obj._indexed_at = $ts`,
                {
                    type: apiName,
                    rows: rows.map(r => ({ ...r, _pk: String(r[primaryKey] ?? Object.values(r)[0] ?? "") })),
                    ts: new Date().toISOString(),
                }
            );
        } catch (e) {
            console.error(`[indexing] ${apiName}: batch write error`, e);
        } finally {
            await sess.close();
        }
    };

    const batchQueue: Record<string, string>[][] = [];
    let running = 0;

    const flush = async (force = false) => {
        while (pending.length >= BATCH_SIZE || (force && pending.length > 0)) {
            const batch = pending.splice(0, BATCH_SIZE);
            batchQueue.push(batch);
        }

        // Drain queue with parallelism limit
        while (batchQueue.length > 0 && running < PARALLEL) {
            const b = batchQueue.shift()!;
            running++;
            writeBatch(b).then(async () => {
                totalIndexed += b.length;
                running--;
                // Update progress in Neo4j
                try {
                    await mainSess.run(
                        `MATCH (o:OntologyObjectType {api_name: $n}) SET o.index_count = $c`,
                        { n: apiName, c: int(totalIndexed) }
                    );
                } catch (err: any) {
                    console.error(`[indexing] ${apiName}: count update error`, err.message);
                }
            });
        }
    };

    // Read line by line
    for await (const line of rl) {
        if (!line.trim()) continue;
        if (isFirstLine) {
            headers = parseLine(line);
            isFirstLine = false;
            continue;
        }
        const vals = parseLine(line);
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
        pending.push(row);
        if (pending.length >= BATCH_SIZE) await flush();
    }

    // Flush remaining rows
    await flush(true);

    // Wait for all running batches to complete
    await new Promise<void>((resolve) => {
        const wait = () => { if (running === 0 && batchQueue.length === 0) resolve(); else setTimeout(wait, 100); };
        wait();
    });

    // ── 4. Mark as active ─────────────────────────────────────────────────────
    try {
        await mainSess.run(
            `MATCH (o:OntologyObjectType {api_name: $n})
             SET o.index_status = 'active',
                 o.index_count  = $c,
                 o.last_synced  = $ts`,
            { n: apiName, c: int(totalIndexed), ts: new Date().toISOString() }
        );
        console.log(`[indexing] ${apiName}: complete — ${totalIndexed} objects written to Neo4j`);
    } catch (e) {
        console.error(`[indexing] ${apiName}: final status update failed`, e);
    } finally {
        await mainSess.close();
    }
}

