import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const GRAPHQL_API_URL = process.env.GRAPHQL_API_URL || "http://localhost:4001";

type SessionWithAccessToken = Session & {
    accessToken?: string;
};

type RouteContext = {
    params: Promise<{ path: string[] }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
    return handleProxy(req, await context.params);
}

export async function POST(req: NextRequest, context: RouteContext) {
    return handleProxy(req, await context.params);
}

async function handleProxy(req: NextRequest, params: { path: string[] }) {
    try {
        const { path } = params;
        const targetUrl = `${GRAPHQL_API_URL}/api/workshop/${path.join("/")}`;

        const init: RequestInit = {
            method: req.method,
            headers: {
                "Content-Type": "application/json",
            }
        };

        if (req.method === "POST" || req.method === "PUT") {
            init.body = await req.text();
        }

        const response = await fetch(targetUrl, init);
        const textData = await response.text();

        let jsonData;
        try {
            jsonData = JSON.parse(textData);
        } catch {
            return new NextResponse(textData, { status: response.status });
        }

        return NextResponse.json(jsonData, { status: response.status });

    } catch (error) {
        console.error("Workshop Proxy Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
