/**
 * seed_ontology.ts — 1:1 Palantir AIP Ontology Registry Bootstrap
 *
 * Injects the full 6-node ontology registry into Neo4j that matches
 * the exact structural primitives of Palantir Foundry:
 *   1. OntologyObjectType    — entity schema (like dataset schema)
 *   2. OntologyProperty      — typed attribute (like column)
 *   3. OntologyLinkType      — named relationship with cardinality
 *   4. OntologyActionType    — typed mutation with HITL gate
 *   5. OntologyActionParameter — typed input to an action
 *   6. OntologyInterface     — abstract polymorphic shape
 */
import neo4j from "neo4j-driver";

const driver = neo4j.driver(
    process.env["NEO4J_URI"] ?? "bolt://localhost:7687",
    neo4j.auth.basic("neo4j", process.env["NEO4J_PASSWORD"] ?? "yaip_dev_secret")
);

async function run() {
    const session = driver.session();
    console.log("🧹 Clearing old ontology registry...");

    try {
        // ─── CLEAR ALL OLD NODES ──────────────────────────────────────────────────
        await session.run(`
            MATCH (n) WHERE
              n:OntologyObjectType OR n:OntologyProperty OR n:OntologyLinkType OR
              n:OntologyActionType OR n:OntologyActionParameter OR n:OntologyInterface OR
              n:NodeShape OR n:PropertyShape
            DETACH DELETE n
        `);

        // ─── INDEXES FOR FAST LOOKUP ──────────────────────────────────────────────
        for (const label of ["OntologyObjectType", "OntologyLinkType", "OntologyActionType", "OntologyInterface"]) {
            await session.run(`CREATE INDEX ${label.toLowerCase()}_api_name IF NOT EXISTS FOR (n:${label}) ON (n.api_name)`).catch(() => { });
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // 1. INTERFACES  (abstract polymorphic shapes — defined first, referenced later)
        // ═══════════════════════════════════════════════════════════════════════════
        console.log("📐 Seeding Interfaces...");
        const interfaces = [
            {
                api_name: "HasLocation",
                display_name: "Has Location",
                description: "Any entity that has a geospatial position",
                properties: [
                    { api_name: "latitude", display_name: "Latitude", data_type: "double", is_required: false },
                    { api_name: "longitude", display_name: "Longitude", data_type: "double", is_required: false },
                    { api_name: "altitude_m", display_name: "Altitude (m)", data_type: "double", is_required: false }
                ]
            },
            {
                api_name: "HasStatus",
                display_name: "Has Status",
                description: "Any entity that transitions through lifecycle states",
                properties: [
                    { api_name: "status", display_name: "Status", data_type: "string", is_required: true },
                    { api_name: "updated_at", display_name: "Last Updated", data_type: "timestamp", is_required: false }
                ]
            }
        ];

        for (const iface of interfaces) {
            const result = await session.run(`
                CREATE (i:OntologyInterface {
                    api_name: $api_name,
                    display_name: $display_name,
                    description: $description
                }) RETURN id(i) as nodeId
            `, { api_name: iface.api_name, display_name: iface.display_name, description: iface.description });

            for (const prop of iface.properties) {
                await session.run(`
                    MATCH (i:OntologyInterface {api_name: $iface_api_name})
                    CREATE (i)-[:REQUIRES_PROPERTY]->(p:OntologyProperty {
                        api_name: $api_name,
                        display_name: $display_name,
                        data_type: $data_type,
                        is_required: $is_required,
                        is_primary_key: false,
                        scope: "interface"
                    })
                `, { iface_api_name: iface.api_name, ...prop });
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // 2. OBJECT TYPES  (the "nouns" — entity schemas)
        // ═══════════════════════════════════════════════════════════════════════════
        console.log("📦 Seeding Object Types...");
        const objectTypes = [
            {
                api_name: "Employee",
                display_name: "Employee",
                plural_display_name: "Employees",
                description: "A person employed by the organization",
                primary_key: "employee_id",
                title_property: "full_name",
                backing_source: "connector-postgres",
                icon: "person",
                implements_interfaces: [],
                properties: [
                    { api_name: "employee_id", display_name: "Employee ID", data_type: "string", is_primary_key: true, is_required: true },
                    { api_name: "full_name", display_name: "Full Name", data_type: "string", is_primary_key: false, is_required: true },
                    { api_name: "email", display_name: "Email", data_type: "string", is_primary_key: false, is_required: true },
                    { api_name: "department", display_name: "Department", data_type: "string", is_primary_key: false, is_required: false },
                    { api_name: "role", display_name: "Role", data_type: "string", is_primary_key: false, is_required: false },
                    { api_name: "hire_date", display_name: "Hire Date", data_type: "date", is_primary_key: false, is_required: false },
                    { api_name: "is_active", display_name: "Is Active", data_type: "boolean", is_primary_key: false, is_required: false },
                    { api_name: "salary", display_name: "Salary", data_type: "double", is_primary_key: false, is_required: false }
                ]
            },
            {
                api_name: "DroneUnit",
                display_name: "Drone Unit",
                plural_display_name: "Drone Units",
                description: "An autonomous aerial vehicle asset",
                primary_key: "drone_id",
                title_property: "name",
                backing_source: "connector-kafka",
                icon: "drone",
                implements_interfaces: ["HasLocation", "HasStatus"],
                properties: [
                    { api_name: "drone_id", display_name: "Drone ID", data_type: "string", is_primary_key: true, is_required: true },
                    { api_name: "name", display_name: "Name", data_type: "string", is_primary_key: false, is_required: true },
                    { api_name: "model", display_name: "Model", data_type: "string", is_primary_key: false, is_required: true },
                    { api_name: "status", display_name: "Status", data_type: "string", is_primary_key: false, is_required: true },
                    { api_name: "battery_pct", display_name: "Battery %", data_type: "integer", is_primary_key: false, is_required: false },
                    { api_name: "latitude", display_name: "Latitude", data_type: "double", is_primary_key: false, is_required: false },
                    { api_name: "longitude", display_name: "Longitude", data_type: "double", is_primary_key: false, is_required: false },
                    { api_name: "altitude_m", display_name: "Altitude (m)", data_type: "double", is_primary_key: false, is_required: false },
                    { api_name: "updated_at", display_name: "Last Updated", data_type: "timestamp", is_primary_key: false, is_required: false }
                ]
            },
            {
                api_name: "Mission",
                display_name: "Mission",
                plural_display_name: "Missions",
                description: "An autonomous operation dispatched to hardware assets",
                primary_key: "mission_id",
                title_property: "name",
                backing_source: "connector-postgres",
                icon: "target",
                implements_interfaces: ["HasStatus"],
                properties: [
                    { api_name: "mission_id", display_name: "Mission ID", data_type: "string", is_primary_key: true, is_required: true },
                    { api_name: "name", display_name: "Mission Name", data_type: "string", is_primary_key: false, is_required: true },
                    { api_name: "objective", display_name: "Objective", data_type: "string", is_primary_key: false, is_required: false },
                    { api_name: "status", display_name: "Status", data_type: "string", is_primary_key: false, is_required: true },
                    { api_name: "priority", display_name: "Priority", data_type: "integer", is_primary_key: false, is_required: false },
                    { api_name: "updated_at", display_name: "Last Updated", data_type: "timestamp", is_primary_key: false, is_required: false }
                ]
            },
            {
                api_name: "SolarPanel",
                display_name: "Solar Panel",
                plural_display_name: "Solar Panels",
                description: "A physical solar energy generation unit",
                primary_key: "panel_id",
                title_property: "panel_id",
                backing_source: "connector-postgres",
                icon: "solar",
                implements_interfaces: ["HasLocation"],
                properties: [
                    { api_name: "panel_id", display_name: "Panel ID", data_type: "string", is_primary_key: true, is_required: true },
                    { api_name: "location", display_name: "Location", data_type: "string", is_primary_key: false, is_required: false },
                    { api_name: "latitude", display_name: "Latitude", data_type: "double", is_primary_key: false, is_required: false },
                    { api_name: "longitude", display_name: "Longitude", data_type: "double", is_primary_key: false, is_required: false },
                    { api_name: "efficiency_pct", display_name: "Efficiency %", data_type: "double", is_primary_key: false, is_required: false },
                    { api_name: "anomaly_detected", display_name: "Anomaly Detected", data_type: "boolean", is_primary_key: false, is_required: false },
                    { api_name: "anomaly_score", display_name: "Anomaly Score", data_type: "double", is_primary_key: false, is_required: false },
                    { api_name: "last_inspected", display_name: "Last Inspected", data_type: "timestamp", is_primary_key: false, is_required: false }
                ]
            },
            {
                api_name: "Patient",
                display_name: "Patient",
                plural_display_name: "Patients",
                description: "A person receiving medical care [PHI — masked at gateway]",
                primary_key: "mrn",
                title_property: "mrn",
                backing_source: "connector-fhir",
                icon: "person",
                implements_interfaces: [],
                properties: [
                    { api_name: "mrn", display_name: "MRN", data_type: "string", is_primary_key: true, is_required: true },
                    { api_name: "date_of_birth", display_name: "Date of Birth", data_type: "date", is_primary_key: false, is_required: false },
                    { api_name: "name", display_name: "Name", data_type: "string", is_primary_key: false, is_required: false }
                ]
            },
            {
                api_name: "Transaction",
                display_name: "Transaction",
                plural_display_name: "Transactions",
                description: "A financial event [PAN masked at gateway]",
                primary_key: "transaction_id",
                title_property: "transaction_id",
                backing_source: "connector-postgres",
                icon: "currency",
                implements_interfaces: ["HasStatus"],
                properties: [
                    { api_name: "transaction_id", display_name: "Transaction ID", data_type: "string", is_primary_key: true, is_required: true },
                    { api_name: "amount", display_name: "Amount", data_type: "double", is_primary_key: false, is_required: true },
                    { api_name: "currency", display_name: "Currency", data_type: "string", is_primary_key: false, is_required: true },
                    { api_name: "status", display_name: "Status", data_type: "string", is_primary_key: false, is_required: false },
                    { api_name: "risk_score", display_name: "Risk Score", data_type: "double", is_primary_key: false, is_required: false },
                    { api_name: "flagged", display_name: "Flagged", data_type: "boolean", is_primary_key: false, is_required: false }
                ]
            }
        ];

        for (const ot of objectTypes) {
            const { properties, implements_interfaces, ...otProps } = ot;
            await session.run(`
                CREATE (o:OntologyObjectType $props)
            `, { props: otProps });

            for (const prop of properties) {
                await session.run(`
                    MATCH (o:OntologyObjectType {api_name: $ot_api_name})
                    CREATE (o)-[:HAS_PROPERTY]->(p:OntologyProperty {
                        api_name: $api_name,
                        display_name: $display_name,
                        data_type: $data_type,
                        is_primary_key: $is_primary_key,
                        is_required: $is_required,
                        scope: "local"
                    })
                `, { ot_api_name: ot.api_name, ...prop });
            }

            for (const ifaceName of implements_interfaces) {
                await session.run(`
                    MATCH (o:OntologyObjectType {api_name: $ot}), (i:OntologyInterface {api_name: $iface})
                    CREATE (o)-[:IMPLEMENTS]->(i)
                `, { ot: ot.api_name, iface: ifaceName });
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // 3. LINK TYPES  (named relationships with cardinality)
        // ═══════════════════════════════════════════════════════════════════════════
        console.log("🔗 Seeding Link Types...");
        const linkTypes = [
            {
                api_name: "drone_assigned_to_mission",
                display_name_a_side: "Assigned To",
                display_name_b_side: "Has Assigned Drone",
                cardinality: "ONE_TO_MANY",      // one Mission -> many Drones
                source_object_type: "DroneUnit",
                target_object_type: "Mission",
                foreign_key_property: "mission_id"
            },
            {
                api_name: "drone_inspects_solar_panel",
                display_name_a_side: "Inspects",
                display_name_b_side: "Inspected By",
                cardinality: "MANY_TO_MANY",
                source_object_type: "DroneUnit",
                target_object_type: "SolarPanel",
                foreign_key_property: null
            },
            {
                api_name: "employee_manages_employee",
                display_name_a_side: "Manages",
                display_name_b_side: "Managed By",
                cardinality: "ONE_TO_MANY",
                source_object_type: "Employee",
                target_object_type: "Employee",
                foreign_key_property: null
            }
        ];

        for (const lt of linkTypes) {
            const { source_object_type, target_object_type, ...ltProps } = lt;
            await session.run(`
                MATCH (src:OntologyObjectType {api_name: $src}), (tgt:OntologyObjectType {api_name: $tgt})
                CREATE (l:OntologyLinkType $props)
                CREATE (l)-[:SOURCE]->(src)
                CREATE (l)-[:TARGET]->(tgt)
            `, { src: source_object_type, tgt: target_object_type, props: ltProps });
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // 4. ACTION TYPES  (typed mutations with HITL gates)
        // ═══════════════════════════════════════════════════════════════════════════
        console.log("⚡ Seeding Action Types...");
        const actionTypes = [
            {
                api_name: "assign_employee_to_role",
                display_name: "Assign Employee to Role",
                description: "Changes the role property of an Employee object. Notifies old and new manager.",
                status: "ACTIVE",
                hitl_level: 1,
                writeback_target: "Employee",
                targets: ["Employee"],
                parameters: [
                    { api_name: "employee", display_name: "Employee", data_type: "object_reference", object_type_ref: "Employee", is_required: true, description: "The employee to reassign" },
                    { api_name: "new_role", display_name: "New Role", data_type: "string", object_type_ref: null, is_required: true, description: "New role title" },
                    { api_name: "reason", display_name: "Reason", data_type: "string", object_type_ref: null, is_required: false, description: "Reason for reassignment" }
                ],
                rules: [
                    { rule_type: "MODIFY_OBJECT", target_property: "role", value_from_parameter: "new_role" }
                ]
            },
            {
                api_name: "dispatch_drone",
                display_name: "Dispatch Drone to Mission",
                description: "Sets a DroneUnit status to IN_MISSION and assigns it to a Mission. Requires Level-2 approval.",
                status: "ACTIVE",
                hitl_level: 2,
                writeback_target: "DroneUnit",
                targets: ["DroneUnit", "Mission"],
                parameters: [
                    { api_name: "drone", display_name: "Drone", data_type: "object_reference", object_type_ref: "DroneUnit", is_required: true, description: "The drone to dispatch" },
                    { api_name: "mission", display_name: "Mission", data_type: "object_reference", object_type_ref: "Mission", is_required: true, description: "The mission to assign to" }
                ],
                rules: [
                    { rule_type: "MODIFY_OBJECT", target_property: "status", value_from_parameter: null, static_value: "IN_MISSION" },
                    { rule_type: "CREATE_LINK", link_type: "drone_assigned_to_mission" }
                ]
            },
            {
                api_name: "flag_transaction",
                display_name: "Flag Transaction for AML Review",
                description: "Marks a Transaction as flagged and creates a ComplianceAlert. Requires Level-3 Compliance Officer approval.",
                status: "ACTIVE",
                hitl_level: 3,
                writeback_target: "Transaction",
                targets: ["Transaction"],
                parameters: [
                    { api_name: "transaction", display_name: "Transaction", data_type: "object_reference", object_type_ref: "Transaction", is_required: true, description: "The transaction to flag" },
                    { api_name: "reason", display_name: "Flag Reason", data_type: "string", object_type_ref: null, is_required: true, description: "Reason for AML flag" },
                    { api_name: "risk_score", display_name: "Risk Score", data_type: "double", object_type_ref: null, is_required: false, description: "Calculated risk score 0.0-1.0" }
                ],
                rules: [
                    { rule_type: "MODIFY_OBJECT", target_property: "flagged", value_from_parameter: null, static_value: "true" },
                    { rule_type: "MODIFY_OBJECT", target_property: "risk_score", value_from_parameter: "risk_score" }
                ]
            }
        ];

        for (const at of actionTypes) {
            const { parameters, rules, targets, ...atProps } = at;
            atProps["rules_json"] = JSON.stringify(rules);

            await session.run(`CREATE (a:OntologyActionType $props)`, { props: atProps });

            for (const target of targets) {
                await session.run(`
                    MATCH (a:OntologyActionType {api_name: $action}), (o:OntologyObjectType {api_name: $ot})
                    CREATE (a)-[:TARGETS]->(o)
                `, { action: at.api_name, ot: target });
            }

            for (const param of parameters) {
                await session.run(`
                    MATCH (a:OntologyActionType {api_name: $action_api_name})
                    CREATE (a)-[:HAS_PARAMETER]->(p:OntologyActionParameter {
                        api_name: $api_name,
                        display_name: $display_name,
                        data_type: $data_type,
                        object_type_ref: $object_type_ref,
                        is_required: $is_required,
                        description: $description
                    })
                `, { action_api_name: at.api_name, ...param });
            }
        }

        // ─── SUMMARY ──────────────────────────────────────────────────────────────
        const counts = await session.run(`
            RETURN
              count { MATCH (n:OntologyObjectType) RETURN n } as object_types,
              count { MATCH (n:OntologyProperty) RETURN n } as properties,
              count { MATCH (n:OntologyLinkType) RETURN n } as link_types,
              count { MATCH (n:OntologyActionType) RETURN n } as action_types,
              count { MATCH (n:OntologyActionParameter) RETURN n } as action_params,
              count { MATCH (n:OntologyInterface) RETURN n } as interfaces
        `);

        const row = counts.records[0];
        console.log("\n✅ Ontology Registry Seeded Successfully!");
        console.log(`   Object Types:       ${row.get("object_types")}`);
        console.log(`   Properties:         ${row.get("properties")}`);
        console.log(`   Link Types:         ${row.get("link_types")}`);
        console.log(`   Action Types:       ${row.get("action_types")}`);
        console.log(`   Action Parameters:  ${row.get("action_params")}`);
        console.log(`   Interfaces:         ${row.get("interfaces")}`);

        process.exit(0);
    } catch (e) {
        console.error("❌ Seeding Failed:", e);
        process.exit(1);
    } finally {
        await session.close();
        await driver.close();
    }
}

run();
