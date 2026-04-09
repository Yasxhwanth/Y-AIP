/**
 * dynamic-schema.ts — 1:1 Palantir Ontology Dynamic GraphQL SDL Generator
 *
 * On every server boot, queries the Neo4j Ontology Registry to synthesize
 * the full GraphQL Schema Definition Language (SDL) string, covering all
 * 4 Palantir Ontology primitives:
 *   1. Object Types → `type {Name} @node { ...typedProperties }`
 *   2. Interfaces   → `interface {Name} { ...sharedProperties }`
 *   3. Link Types   → `@relationship(type, direction)` directives on fields
 *   4. Action Types → `extend type Mutation { actionName(params): ActionResult! }`
 */
import { Driver } from "neo4j-driver";

// Map neo4j ontology data types → GraphQL scalar types
function toGraphQLType(dataType: string): string {
    switch (dataType) {
        case "string": return "String";
        case "integer": return "Int";
        case "double": return "Float";
        case "boolean": return "Boolean";
        case "date": return "Date";
        case "timestamp": return "DateTime";
        default: return "String";
    }
}

// Converts an api_name like "employee_id" to camelCase: "employeeId"
function toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export async function generateDynamicTypeDefs(driver: Driver): Promise<string> {
    const session = driver.session();
    try {
        // ──────────────────────────────────────────────────────────────────────
        // Query 1: Interfaces and their required properties
        // ──────────────────────────────────────────────────────────────────────
        const ifaceResult = await session.run(`
            MATCH (i:OntologyInterface)
            OPTIONAL MATCH (i)-[:REQUIRES_PROPERTY]->(p:OntologyProperty)
            RETURN i.api_name AS api_name, i.display_name AS display_name,
                   collect(p { .api_name, .data_type, .is_required }) AS properties
            ORDER BY i.api_name
        `);

        // ──────────────────────────────────────────────────────────────────────
        // Query 2: Object Types, their properties, and implemented interfaces
        // ──────────────────────────────────────────────────────────────────────
        const objectResult = await session.run(`
            MATCH (o:OntologyObjectType)
            OPTIONAL MATCH (o)-[:HAS_PROPERTY]->(p:OntologyProperty)
            OPTIONAL MATCH (o)-[:IMPLEMENTS]->(i:OntologyInterface)
            RETURN o.api_name AS api_name,
                   collect(DISTINCT p { .api_name, .data_type, .is_required, .is_primary_key }) AS properties,
                   collect(DISTINCT i.api_name) AS implements
            ORDER BY o.api_name
        `);

        // ──────────────────────────────────────────────────────────────────────
        // Query 3: Link Types with source, target, cardinality, and direction
        // ──────────────────────────────────────────────────────────────────────
        const linkResult = await session.run(`
            MATCH (l:OntologyLinkType)
            MATCH (l)-[:SOURCE]->(src:OntologyObjectType)
            MATCH (l)-[:TARGET]->(tgt:OntologyObjectType)
            RETURN l.api_name AS link_api_name,
                   l.display_name_a_side AS label_a,
                   l.display_name_b_side AS label_b,
                   l.cardinality AS cardinality,
                   src.api_name AS source,
                   tgt.api_name AS target
        `);

        // ──────────────────────────────────────────────────────────────────────
        // Query 4: Action Types and their parameters
        // ──────────────────────────────────────────────────────────────────────
        const actionResult = await session.run(`
            MATCH (a:OntologyActionType {status: "ACTIVE"})
            OPTIONAL MATCH (a)-[:HAS_PARAMETER]->(p:OntologyActionParameter)
            RETURN a.api_name AS api_name, a.display_name AS display_name,
                   a.hitl_level AS hitl_level, a.description AS description,
                   collect(p { .api_name, .data_type, .is_required, .object_type_ref }) AS parameters
            ORDER BY a.api_name
        `);

        let sdl = "";

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 1: Interfaces
        // ─────────────────────────────────────────────────────────────────────
        const interfacePropsMap: Record<string, string[]> = {};
        for (const rec of ifaceResult.records) {
            const apiName = rec.get("api_name");
            const props = (rec.get("properties") as any[]).filter(p => p.api_name != null);
            interfacePropsMap[apiName] = [];

            sdl += `\n  # Interface: ${apiName}\n`;
            sdl += `  interface ${apiName} {\n`;
            for (const p of props) {
                const camelName = toCamelCase(p.api_name);
                if (camelName === "objectId" || camelName === "createdAt" || camelName === "updatedAt") continue;
                const gqlType = toGraphQLType(p.data_type ?? "string");
                const required = p.is_required ? "!" : "";
                const propDef = `    ${camelName}: ${gqlType}${required}\n`;
                sdl += propDef;
                interfacePropsMap[apiName].push(propDef);
            }
            sdl += `  }\n`;
        }

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 2: Build a lookup of link fields per Object Type
        // ─────────────────────────────────────────────────────────────────────
        const linkFields: Record<string, string[]> = {};
        for (const rec of linkResult.records) {
            const source = rec.get("source");
            const target = rec.get("target");
            const cardinality = rec.get("cardinality");
            const labelA = rec.get("label_a") ?? rec.get("link_api_name");
            const labelB = rec.get("label_b") ?? rec.get("link_api_name");

            // Side A: source → target
            const fieldNameA = toCamelCase(labelA.toLowerCase().replace(/\s+/g, "_"));
            const typeA = cardinality === "ONE_TO_ONE" ? target : `[${target}!]!`;
            if (!linkFields[source]) linkFields[source] = [];
            linkFields[source].push(`    ${fieldNameA}: ${typeA} @relationship(type: "${rec.get("link_api_name").toUpperCase()}", direction: OUT)\n`);

            // Side B: target → source (reverse)
            if (source !== target) { // skip self-referential reverse
                const fieldNameB = toCamelCase(labelB.toLowerCase().replace(/\s+/g, "_"));
                const typeB = cardinality === "ONE_TO_ONE" ? source : `[${source}!]!`;
                if (!linkFields[target]) linkFields[target] = [];
                linkFields[target].push(`    ${fieldNameB}: ${typeB} @relationship(type: "${rec.get("link_api_name").toUpperCase()}", direction: IN)\n`);
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 3: Object Types
        // ─────────────────────────────────────────────────────────────────────
        for (const rec of objectResult.records) {
            const apiName = rec.get("api_name");
            const props = (rec.get("properties") as any[]).filter(p => p.api_name != null);
            const implements_ = (rec.get("implements") as string[]).filter(x => x != null);

            const implementsClause = implements_.length > 0 ? ` implements ${implements_.join(" & ")}` : "";
            sdl += `\n  # Object Type: ${apiName}\n`;
            sdl += `  type ${apiName}${implementsClause} @node {\n`;

            // System-level base properties (every object has these)
            sdl += `    object_id: ID! @id\n`;

            const emittedProps = new Set<string>();

            // Typed domain properties from registry
            for (const p of props) {
                const camelName = toCamelCase(p.api_name);
                if (camelName === "objectId" || camelName === "createdAt" || camelName === "updatedAt") continue; // skip duplicates of system props

                const gqlType = toGraphQLType(p.data_type ?? "string");

                // If this object implements an interface that makes this property required, force it to required
                let isRequired = p.is_required || p.is_primary_key;
                for (const iface of implements_) {
                    if (interfacePropsMap[iface]?.some(def => def.includes(`${camelName}:`) && def.includes("!"))) {
                        isRequired = true;
                    }
                }

                const requiredStr = isRequired ? "!" : "";
                sdl += `    ${camelName}: ${gqlType}${requiredStr}\n`;
                emittedProps.add(camelName);
            }

            // Inherit missing Interface properties
            for (const iface of implements_) {
                for (const propDef of interfacePropsMap[iface] ?? []) {
                    const match = propDef.match(/^\s+([^:]+):/);
                    if (match && !emittedProps.has(match[1])) {
                        sdl += propDef;
                        emittedProps.add(match[1]);
                    }
                }
            }

            // Governance properties (universal — matches Palantir "markings")
            sdl += `    classification: String\n`;
            sdl += `    createdBy: String\n`;
            sdl += `    createdAt: DateTime @timestamp(operations: [CREATE])\n`;
            sdl += `    updatedAt: DateTime @timestamp(operations: [CREATE, UPDATE])\n`;

            // Relationship fields from Link Types
            const links = linkFields[apiName] ?? [];
            for (const link of links) {
                sdl += link;
            }

            sdl += `  }\n`;
        }

        // ─────────────────────────────────────────────────────────────────────
        // SECTION 4: Action Type → GraphQL Mutation + Input Types
        // ─────────────────────────────────────────────────────────────────────
        let mutationExtension = "\n  extend type Mutation {\n";
        const inputTypeBlocks: string[] = [];

        for (const rec of actionResult.records) {
            const apiName = rec.get("api_name");
            const params = (rec.get("parameters") as any[]).filter(p => p.api_name != null);
            const hitlLevel = rec.get("hitl_level");
            const hitlN = hitlLevel && hitlLevel.toNumber ? hitlLevel.toNumber() : hitlLevel;
            const description = rec.get("description") ?? "";

            // Generate Input type for each Action
            const inputName = apiName.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())
                .replace(/^[a-z]/, (c: string) => c.toUpperCase()) + "Input";

            let inputBlock = `\n  # Input for Action: ${apiName} (HITL Level ${hitlN})\n`;
            inputBlock += `  input ${inputName} {\n`;
            for (const p of params) {
                const gqlType = p.data_type === "object_reference" ? "String" : toGraphQLType(p.data_type ?? "string");
                const required = p.is_required ? "!" : "";
                inputBlock += `    ${toCamelCase(p.api_name)}: ${gqlType}${required}\n`;
            }
            inputBlock += `  }\n`;
            inputTypeBlocks.push(inputBlock);

            // Generate Mutation field
            mutationExtension += `    # ${description}\n`;
            mutationExtension += `    # HITL Level: ${hitlN} — ${hitlN >= 2 ? "requires human approval → creates Proposal" : "executes immediately"}\n`;
            mutationExtension += `    ${toCamelCase(apiName)}(input: ${inputName}!): ActionResult!\n`;
        }
        mutationExtension += `  }\n`;

        // Action Result type
        sdl += `\n  # Universal Action execution result\n`;
        sdl += `  type ActionResult {\n`;
        sdl += `    status: String!          # "executed" | "pending_approval"\n`;
        sdl += `    message: String\n`;
        sdl += `    proposal_id: String      # Populated when HITL gate fires\n`;
        sdl += `    hitl_level: Int          # 1 = immediate, 2/3 = approval required\n`;
        sdl += `  }\n`;

        // Append input types and mutation extension
        for (const block of inputTypeBlocks) sdl += block;
        sdl += mutationExtension;

        return sdl;

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Ontology Registry unavailable; using static GraphQL schema only. ${message}`);
        return "";
    } finally {
        await session.close();
    }
}
