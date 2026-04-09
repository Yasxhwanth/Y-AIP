const { spawn, spawnSync } = require("child_process");
const net = require("net");
const path = require("path");

const root = process.cwd();

function log(message) {
    console.log(`[SYS] ${message}`);
}

function warn(message) {
    console.warn(`[SYS WARN] ${message}`);
}

function workspacePath(cwdPath) {
    return path.join(root, cwdPath);
}

function checkPythonModule(cwdPath, moduleName) {
    const result = spawnSync(
        "python",
        ["-c", `import ${moduleName}`],
        {
            cwd: workspacePath(cwdPath),
            stdio: "ignore",
            shell: false,
        }
    );
    return result.status === 0;
}

function startService(name, command, cwdPath, options = {}) {
    const missingModules = options.pythonModules?.filter((entry) => !checkPythonModule(cwdPath, entry.module)) ?? [];
    if (missingModules.length > 0) {
        warn(`${name} skipped. Missing Python module(s): ${missingModules.map((entry) => entry.packageName).join(", ")}`);
        warn(`Install with: python -m pip install -r ${path.join(cwdPath, "requirements.txt")}`);
        return null;
    }

    log(`Starting ${name} in ${cwdPath}...`);
    const proc = spawn(command, {
        shell: true,
        cwd: workspacePath(cwdPath),
        stdio: "pipe",
        env: { ...process.env, ...(options.env ?? {}) },
    });

    proc.stdout.on("data", (data) => {
        const text = data.toString().trim();
        if (text) console.log(`[${name}] ${text}`);
    });

    proc.stderr.on("data", (data) => {
        const text = data.toString().trim();
        if (text) console.error(`[${name} ERR] ${text}`);
    });

    proc.on("close", (code) => {
        console.log(`[${name}] Exited with code ${code}`);
    });

    return proc;
}

function checkPort(name, port, hint) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;

        const finish = (ok) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            if (!ok) warn(`${name} not reachable on localhost:${port}. ${hint}`);
            resolve(ok);
        };

        socket.setTimeout(500);
        socket.once("connect", () => finish(true));
        socket.once("timeout", () => finish(false));
        socket.once("error", () => finish(false));
        socket.connect(port, "127.0.0.1");
    });
}

async function main() {
    log("Checking local infrastructure ports...");
    const [neo4jReady, temporalReady, kafkaReady] = await Promise.all([
        checkPort("Neo4j", 7687, "GraphQL will start with static schema fallback, but ontology reads/writes need Neo4j. Start infra with: powershell -ExecutionPolicy Bypass -File infra/start.ps1"),
        checkPort("Temporal", 7233, "Actions_Worker needs Temporal. Start infra with: powershell -ExecutionPolicy Bypass -File infra/start.ps1"),
        checkPort("Kafka", 29092, "Agent_Engine and Edge_Agent telemetry need Kafka. Start infra with: powershell -ExecutionPolicy Bypass -File infra/start.ps1"),
    ]);

    startService("GraphQL_API", "npm run dev", "services/graphql-api");
    startService("Command_Center", "npm run dev", "apps/command-center");
    startService("MCP_Gateway", "npm run dev", "services/mcp-gateway");
    startService(
        "Agent_Engine",
        "python -m uvicorn src.main:app --port 8000 --reload",
        "services/agent-engine",
        {
            pythonModules: [
                { module: "langgraph", packageName: "langgraph" },
                { module: "confluent_kafka", packageName: "confluent-kafka" },
            ],
            env: {
                KAFKA_BROKERS: kafkaReady ? "localhost:29092" : "localhost:29092",
            },
        }
    );

    setTimeout(() => {
        if (temporalReady) {
            startService(
                "Actions_Worker",
                "python -m uvicorn src.main:app --port 8002 --reload",
                "services/actions-worker",
                {
                    pythonModules: [
                        { module: "temporalio", packageName: "temporalio" },
                        { module: "confluent_kafka", packageName: "confluent-kafka" },
                    ],
                }
            );
        } else {
            warn("Actions_Worker skipped because Temporal is not reachable on localhost:7233.");
        }

        startService(
            "Edge_Agent",
            "python src/main.py --device-id D-800",
            "services/edge-agent",
            {
                pythonModules: [
                    { module: "confluent_kafka", packageName: "confluent-kafka" },
                ],
            }
        );
    }, 3000);

    if (!neo4jReady || !temporalReady || !kafkaReady) {
        warn("Some infrastructure services are down. Run infra/start.ps1 before full-stack demos.");
    }
    log("Platform processes spawned. Waiting for Next.js and API services to bind ports...");
}

main().catch((error) => {
    console.error("[SYS ERR]", error);
    process.exit(1);
});
