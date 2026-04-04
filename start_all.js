const { spawn } = require('child_process');
const path = require('path');

function startService(name, command, cwdPath) {
    console.log(`[SYS] Starting ${name} in ${cwdPath}...`);
    const proc = spawn(command, {
        shell: true,
        cwd: path.join(process.cwd(), cwdPath),
        stdio: 'pipe'
    });

    proc.stdout.on('data', data => console.log(`[${name}] ${data.toString().trim()}`));
    proc.stderr.on('data', data => console.error(`[${name} ERR] ${data.toString().trim()}`));
    proc.on('close', code => console.log(`[${name}] Exited with code ${code}`));

    return proc;
}

// Spin up the entire Y-AIP stack
startService("GraphQL_API", "npm run dev", "services/graphql-api");
startService("Command_Center", "npm run dev", "apps/command-center");
startService("MCP_Gateway", "uvicorn src.main:app --port 8000", "services/mcp-gateway");
startService("Agent_Engine", "uvicorn src.main:app --port 8001", "services/agent-engine");

// Delay edge runtime slightly
setTimeout(() => {
    startService("Actions_Worker", "python src/worker.py", "services/actions-worker");
    startService("Edge_Agent", "python src/main.py --device-id D-800", "services/edge-agent");
}, 3000);

console.log("[SYS] All platform processes spawned. Waiting for Next.js and Fastify to bind ports...");
