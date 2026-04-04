// Y-AIP Workshop Admin APIs
// Allows the Command Center to save and load Custom Dashboard UI Configs.
// In Palantir AIP, this is the underlying persistence layer for Workshop layouts.

import { FastifyInstance } from "fastify";
import fs from "fs/promises";
import path from "path";

// For the MVP, we will store Workshop JSON Layouts in a local file to avoid
// complex Neo4j JSON stringification migrations right now. In a prod Palantir
// environment, these would be backed by Postgres or secure blob storage.
const DATA_DIR = path.join(process.cwd(), "data");
const WORKSHOP_FILE = path.join(DATA_DIR, "workshop-dashboards.json");

async function ensureDataFile() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.access(WORKSHOP_FILE);
    } catch {
        await fs.writeFile(WORKSHOP_FILE, JSON.stringify({ dashboards: [] }), "utf-8");
    }
}

export async function registerWorkshopAdminRoutes(app: FastifyInstance) {

    // 1. GET /api/workshop/dashboards
    // Returns all custom saved dashboard layouts
    app.get("/api/workshop/dashboards", async (request, reply) => {
        try {
            await ensureDataFile();
            const raw = await fs.readFile(WORKSHOP_FILE, "utf-8");
            return JSON.parse(raw);
        } catch (error: any) {
            app.log.error(error);
            return reply.status(500).send({ error: error.message });
        }
    });

    // 2. POST /api/workshop/dashboards
    // Saves a new Dashboard or overwrites an existing one by ID
    app.post("/api/workshop/dashboards", async (request, reply) => {
        const req: any = request.body;
        const id = req.id;
        const name = req.name;
        const layout = req.layout || []; // Grid layout array
        const widgets = req.widgets || []; // Widget binding configs

        if (!id || !name) return reply.status(400).send({ error: "Missing id or name" });

        try {
            await ensureDataFile();
            const raw = await fs.readFile(WORKSHOP_FILE, "utf-8");
            const data = JSON.parse(raw);

            const existingIndex = data.dashboards.findIndex((d: any) => d.id === id);

            const newDashboard = {
                id,
                name,
                updatedAt: new Date().toISOString(),
                layout,
                widgets
            };

            if (existingIndex >= 0) {
                data.dashboards[existingIndex] = newDashboard;
            } else {
                data.dashboards.push(newDashboard);
            }

            await fs.writeFile(WORKSHOP_FILE, JSON.stringify(data, null, 2), "utf-8");

            return { status: "success", dashboard: newDashboard };
        } catch (error: any) {
            app.log.error(error);
            return reply.status(500).send({ error: error.message });
        }
    });
}
