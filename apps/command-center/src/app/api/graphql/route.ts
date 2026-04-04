import { NextRequest, NextResponse } from "next/server";

// Proxy GraphQL requests to the internal GraphAPI service
const GRAPHQL_API_URL = process.env.GRAPHQL_API_URL || "http://localhost:4001/graphql";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // DEV OVERRIDE: Bypass Auth
        const token = "MOCK_TOKEN";

        const response = await fetch(GRAPHQL_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("GraphQL Proxy Error:", error);
        return NextResponse.json(
            { errors: [{ message: "Internal Server Error" }] },
            { status: 500 }
        );
    }
}
