// Neo4j Schema Initializer
// Run this once after Neo4j starts for the first time
// node infra/scripts/init-neo4j.mjs

import neo4j from "neo4j-driver";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const driver = neo4j.driver(
    process.env.NEO4J_URI ?? "bolt://localhost:7687",
    neo4j.auth.basic(
        process.env.NEO4J_USER ?? "neo4j",
        process.env.NEO4J_PASSWORD ?? "yaip_dev_secret"
    )
);

const session = driver.session();

try {
    console.log("🔵 Connecting to Neo4j...");
    await driver.verifyConnectivity();
    console.log("✅ Connected");

    // Run Cypher schema init
    const schema = await readFile(
        join(__dirname, "../init/neo4j/01_schema.cypher"),
        "utf8"
    );

    // Split on semicolons and run each statement
    const statements = schema
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("//"));

    for (const stmt of statements) {
        try {
            await session.run(stmt);
            console.log("  ✅", stmt.slice(0, 60).replace(/\n/g, " ") + "...");
        } catch (e) {
            if (e.message?.includes("already exists")) {
                console.log("  ⏭  Already exists:", stmt.slice(0, 50).replace(/\n/g, " "));
            } else {
                console.error("  ❌ Failed:", e.message);
            }
        }
    }

    // Load SHACL shapes
    const shaclFiles = ["medical.ttl", "drone.ttl"];
    for (const file of shaclFiles) {
        try {
            await session.run(
                `CALL n10s.validation.shacl.import.fetch(
           $url, 'Turtle'
         )`,
                { url: `file:///shacl/${file}` }
            );
            console.log(`  ✅ SHACL shapes loaded: ${file}`);
        } catch (e) {
            console.error(`  ❌ SHACL load failed for ${file}:`, e.message);
        }
    }

    console.log("\n✅ Neo4j initialization complete");
} finally {
    await session.close();
    await driver.close();
}
