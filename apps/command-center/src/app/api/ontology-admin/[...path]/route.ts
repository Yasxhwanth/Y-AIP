import { NextRequest, NextResponse } from "next/server";

const GRAPHQL_API_URL = process.env.GRAPHQL_API_URL || "http://127.0.0.1:4001";

// ─── Proxy all HTTP verbs to the GraphQL API Ontology Registry ────────────
// Route: /api/ontology-admin/[...path] → http://graphql-api:4001/api/ontology/[...path]
// Supports all 12 Y-AIP Ontology Manager endpoints:
//   Object Types: GET, POST (list, create, get single, PATCH, DELETE)
//   Link Types:   GET, POST
//   Action Types: GET, POST, GET single, POST apply
//   Interfaces:   GET, POST
//   Schema:       GET /schema (full ontology for UI rendering)

type RouteContext = { params: Promise<{ path: string[] }> };

async function handleProxy(req: NextRequest, ctx: RouteContext) {
    try {
        const { path } = await ctx.params;
        const targetUrl = `${GRAPHQL_API_URL}/api/ontology-admin/${path.join("/")}`;

        const contentType = req.headers.get("content-type") || "";
        const isMultipart = contentType.includes("multipart/form-data");

        const init: RequestInit = {
            method: req.method,
            headers: isMultipart ? {} : { "Content-Type": "application/json" }
        };

        if (["POST", "PUT", "PATCH"].includes(req.method)) {
            const payload = isMultipart ? await req.formData() : await req.text();
            if (payload && payload !== "") {
                init.body = payload;
            } else {
                // If it's empty, remove the Content-Type header to avoid strict backend parsing errors
                if (!isMultipart && init.headers) {
                    delete (init.headers as Record<string, string>)["Content-Type"];
                }
            }
        }

        const response = await fetch(targetUrl, init);
        const text = await response.text();

        if (!response.ok) {
            console.error(`[ontology-admin proxy] Backend returned ${response.status} for ${targetUrl}: ${text}`);
        }

        try {
            return NextResponse.json(JSON.parse(text), { status: response.status });
        } catch {
            return new NextResponse(text, { status: response.status });
        }
    } catch (error) {
        console.error("Ontology Admin Proxy Error:", error);
        return NextResponse.json({ error: "Internal Server Error", detail: String(error) }, { status: 500 });
    }
}

export const GET = (req: NextRequest, ctx: RouteContext) => handleProxy(req, ctx);
export const POST = (req: NextRequest, ctx: RouteContext) => handleProxy(req, ctx);
export const PATCH = (req: NextRequest, ctx: RouteContext) => handleProxy(req, ctx);
export const DELETE = (req: NextRequest, ctx: RouteContext) => handleProxy(req, ctx);
