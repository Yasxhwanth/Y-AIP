// Y-AIP MCP Gateway — OPA Policy Middleware
// Called on every query before any data is touched

import type { OPAInput, OPAResult, YAIPJWTPayload } from "../types.js";

const OPA_URL = process.env["OPA_URL"] ?? "http://localhost:8181";
const OPA_POLICY_PATH = process.env["OPA_POLICY_PATH"] ?? "/v1/data/yaip/authz";

export async function evaluatePolicy(
    principal: YAIPJWTPayload,
    query: {
        resource_type: string;
        connector_id: string;
        purpose_id: string;
        classification: string;
        data_markings: string[];
    }
): Promise<OPAResult> {
    const input: OPAInput = {
        principal: {
            id: principal.sub,
            roles: principal.roles,
            purpose_ids: principal.purpose_ids,
            clearance: principal.clearance,
            permitted_connectors: principal.permitted_connectors,
            us_person: principal.us_person,
        },
        query,
        environment: principal.environment,
    };

    const startMs = Date.now();

    const response = await fetch(`${OPA_URL}${OPA_POLICY_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
    });

    if (!response.ok) {
        throw new Error(`OPA evaluation failed: HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
        result?: { allow?: boolean; deny?: boolean };
    };

    const allow = body.result?.allow === true;
    const deny = body.result?.deny === true;

    // Log OPA latency for observability
    const latencyMs = Date.now() - startMs;
    if (latencyMs > 50) {
        console.warn(`[OPA] Slow policy evaluation: ${latencyMs}ms`);
    }

    const denyReasons = deny ? buildDenyReasons(input) : undefined;

    return {
        allow: allow && !deny,
        deny,
        ...(denyReasons ? { deny_reasons: denyReasons } : {}),
    };
}

// Build human-readable deny reason for audit log
function buildDenyReasons(input: OPAInput): string[] {
    const reasons: string[] = [];
    const markings = input.query.data_markings;

    if (markings.includes("PHI:TRUE")) {
        const hasEncounter = input.principal.purpose_ids.some((p) =>
            p.startsWith("enc:")
        );
        if (!hasEncounter) reasons.push("PHI:TRUE requires active patient encounter context");
    }

    if (markings.includes("ITAR:TRUE") && !input.principal.us_person) {
        reasons.push("ITAR:TRUE requires US person clearance");
    }

    if (
        input.query.classification === "TOP_SECRET" &&
        input.environment !== "air_gap"
    ) {
        reasons.push("TOP_SECRET data requires air_gap environment");
    }

    if (markings.includes("PCI:PAN")) {
        const hasPurpose = input.principal.purpose_ids.some(
            (p) => p === "fraud_investigation" || p === "audit"
        );
        if (!hasPurpose) reasons.push("PCI:PAN requires fraud_investigation or audit purpose");
    }

    if (reasons.length === 0) {
        reasons.push("Policy evaluation: DENY (role or connector not permitted)");
    }

    return reasons;
}
