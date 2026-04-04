import { NextResponse } from 'next/server';

const transformCache: Record<string, any> = {};

export async function GET(request: Request, { params }: { params: { pipelineId: string; nodeId: string } }) {
    const data = transformCache[params.nodeId] || {
        pathName: "Transform path 1",
        transforms: []
    };
    return NextResponse.json(data);
}

export async function POST(request: Request, { params }: { params: { pipelineId: string; nodeId: string } }) {
    const body = await request.json();
    transformCache[params.nodeId] = body;
    return NextResponse.json({ success: true, message: "Transforms saved successfully (mock)" });
}

export async function PUT(request: Request, { params }: { params: { pipelineId: string; nodeId: string } }) {
    const body = await request.json();
    transformCache[params.nodeId] = body;
    return NextResponse.json({ success: true, message: "Transforms updated successfully (mock)" });
}
