import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

type RouteContext = {
    params: Promise<{ pipelineId: string }>;
};

type PipelineStatePayload = {
    nodes?: unknown[];
    edges?: unknown[];
    transforms?: unknown[];
    activeBranch?: string;
    outputs?: unknown[];
    deployState?: unknown;
};

function getStatePath(pipelineId: string) {
    return path.join(process.cwd(), "data", "pipeline-state", `${pipelineId}.json`);
}

function readStateFile(pipelineId: string) {
    const filePath = getStatePath(pipelineId);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}

function writeStateFile(pipelineId: string, state: Record<string, unknown>) {
    const filePath = getStatePath(pipelineId);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export async function GET(_req: Request, ctx: RouteContext) {
    const { pipelineId } = await ctx.params;
    const state = readStateFile(pipelineId);
    return NextResponse.json(state ?? { branches: {}, outputs: [], deployState: null });
}

export async function POST(req: Request, ctx: RouteContext) {
    const { pipelineId } = await ctx.params;

    try {
        const body = await req.json() as PipelineStatePayload;
        const branch = typeof body.activeBranch === "string" && body.activeBranch.length > 0 ? body.activeBranch : "Main";
        const previous = readStateFile(pipelineId) ?? {};
        const previousBranches =
            typeof previous.branches === "object" && previous.branches !== null
                ? previous.branches as Record<string, unknown>
                : {};

        const nextState = {
            ...previous,
            branches: {
                ...previousBranches,
                [branch]: {
                    nodes: Array.isArray(body.nodes) ? body.nodes : [],
                    edges: Array.isArray(body.edges) ? body.edges : [],
                },
            },
            outputs: Array.isArray(body.outputs) ? body.outputs : (previous.outputs ?? []),
            deployState: body.deployState ?? previous.deployState ?? null,
            transforms: Array.isArray(body.transforms) ? body.transforms : (previous.transforms ?? []),
            activeBranch: branch,
            savedAt: new Date().toISOString(),
        };

        writeStateFile(pipelineId, nextState);

        return NextResponse.json({
            success: true,
            message: "Pipeline saved successfully",
            savedAt: nextState.savedAt,
            branch,
            nodeCount: Array.isArray(body.nodes) ? body.nodes.length : 0,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to save pipeline state",
            },
            { status: 500 }
        );
    }
}
