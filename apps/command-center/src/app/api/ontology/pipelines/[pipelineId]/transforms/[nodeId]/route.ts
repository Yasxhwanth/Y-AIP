import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ pipelineId: string; nodeId: string }> };

function getTransformPath(pipelineId: string, nodeId: string) {
    return path.join(process.cwd(), "data", "transforms", pipelineId, `${nodeId}.json`);
}

function readTransformFile(pipelineId: string, nodeId: string) {
    try {
        const filePath = getTransformPath(pipelineId, nodeId);
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
        return null;
    }
}

function writeTransformFile(pipelineId: string, nodeId: string, data: unknown) {
    const filePath = getTransformPath(pipelineId, nodeId);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function GET(_request: Request, context: RouteContext) {
    try {
        const { pipelineId, nodeId } = await context.params;
        const data = readTransformFile(pipelineId, nodeId) ?? {
            pathName: "Transform path 1",
            transforms: [],
        };
        return NextResponse.json(data);
    } catch (err) {
        console.error("[transforms GET]", err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

export async function POST(request: Request, context: RouteContext) {
    try {
        const { pipelineId, nodeId } = await context.params;
        const body = await request.json();
        writeTransformFile(pipelineId, nodeId, body);
        return NextResponse.json({ success: true, message: "Transforms saved successfully" });
    } catch (err) {
        console.error("[transforms POST]", err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

export async function PUT(request: Request, context: RouteContext) {
    try {
        const { pipelineId, nodeId } = await context.params;
        const body = await request.json();
        writeTransformFile(pipelineId, nodeId, body);
        return NextResponse.json({ success: true, message: "Transforms updated successfully" });
    } catch (err) {
        console.error("[transforms PUT]", err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
