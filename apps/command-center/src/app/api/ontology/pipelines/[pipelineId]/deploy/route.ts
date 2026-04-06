import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

type RouteContext = {
    params: Promise<{ pipelineId: string }>;
};

type OutputPreview = {
    id: string;
    name: string;
    columns: Array<{ name: string; type: string }>;
    rows: Array<Record<string, string>>;
};

type DeployRequest = {
    projectId: string;
    outputs: OutputPreview[];
};

function getProjectsPath() {
    // Look for projects.json at the repository root (../../data/projects.json relative to the app execution directory)
    return path.join(process.cwd(), "..", "..", "data", "projects.json");
}

function getPipelineStatePath(pipelineId: string) {
    return path.join(process.cwd(), "data", "pipeline-state", `${pipelineId}.json`);
}

function sanitizeDatasetName(name: string) {
    const base = name.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    return base.length > 0 ? base : "output";
}

function toCsv(rows: Array<Record<string, string>>, columns: Array<{ name: string }>) {
    const escape = (value: string) => {
        if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
        return value;
    };

    const header = columns.map((column) => escape(column.name)).join(",");
    const body = rows.map((row) => columns.map((column) => escape(String(row[column.name] ?? ""))).join(",")).join("\n");
    return `${header}\n${body}`;
}

function readProjects() {
    const projectsPath = getProjectsPath();
    if (!fs.existsSync(projectsPath)) return [];
    return JSON.parse(fs.readFileSync(projectsPath, "utf-8")) as Array<Record<string, unknown>>;
}

function updatePipelineState(pipelineId: string, deployState: Record<string, unknown>) {
    const statePath = getPipelineStatePath(pipelineId);
    if (!fs.existsSync(statePath)) return;
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as Record<string, unknown>;
    fs.writeFileSync(
        statePath,
        JSON.stringify(
            {
                ...state,
                deployState,
                savedAt: new Date().toISOString(),
            },
            null,
            2,
        ),
        "utf-8",
    );
}

export async function POST(req: Request, ctx: RouteContext) {
    const { pipelineId } = await ctx.params;

    try {
        const body = await req.json() as DeployRequest;
        const outputs = Array.isArray(body.outputs) ? body.outputs : [];
        if (!body.projectId) {
            return NextResponse.json({ error: "projectId is required" }, { status: 400 });
        }
        if (outputs.length === 0) {
            return NextResponse.json({ error: "At least one output is required" }, { status: 400 });
        }

        const projects = readProjects();
        const project = projects.find((entry) => entry.id === body.projectId);
        const folderPath = typeof project?.folder_path === "string" ? project.folder_path : null;
        if (!folderPath) {
            return NextResponse.json({ error: "Project folder not found" }, { status: 404 });
        }

        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

        const deployedOutputs = outputs.map((output) => {
            const datasetFileName = `${sanitizeDatasetName(output.name)}.csv`;
            const absolutePath = path.join(folderPath, datasetFileName);
            const csv = toCsv(output.rows ?? [], output.columns ?? []);
            fs.writeFileSync(absolutePath, csv, "utf-8");

            return {
                id: output.id,
                name: output.name,
                fileName: datasetFileName,
                filePath: absolutePath,
                rowCount: Array.isArray(output.rows) ? output.rows.length : 0,
                deployedAt: new Date().toISOString(),
            };
        });

        const deployState = {
            status: "deployed",
            pipelineId,
            outputs: deployedOutputs,
            lastDeploymentAt: new Date().toISOString(),
        };

        updatePipelineState(pipelineId, deployState);

        return NextResponse.json({
            success: true,
            deployState,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to deploy pipeline",
            },
            { status: 500 }
        );
    }
}
