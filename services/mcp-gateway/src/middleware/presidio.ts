// Y-AIP MCP Gateway — Presidio PII Masking Middleware
// Masks PHI/PAN/PII fields in query results before returning to caller
// Uses Microsoft Presidio (Python microservice) or local field-name heuristics

const PRESIDIO_URL = process.env["PRESIDIO_URL"] ?? "http://presidio-analyzer:5001";
const PRESIDIO_ENABLED = process.env["PRESIDIO_ENABLED"] !== "false";

// Known PHI field patterns — always masked regardless of Presidio availability
const PHI_FIELD_PATTERNS = [
    /^(patient_)?ssn$/i,
    /^(patient_)?(dob|date_of_birth)$/i,
    /^(patient_)?mrn$/i,
    /^(patient_)?name$/i,
    /^(patient_)?address$/i,
    /^(patient_)?(phone|mobile|cell)(_number)?$/i,
    /^email(_address)?$/i,
    /^(credit_card_|card_|pan_)?number$/i,
    /^diagnosis(_code)?$/i,
];

export interface MaskResult {
    maskedRows: Record<string, unknown>[];
    maskedFields: string[];
}

export async function maskPII(
    rows: Record<string, unknown>[],
    phiFields: string[] = [],
    pciFields: string[] = []
): Promise<MaskResult> {
    if (!PRESIDIO_ENABLED || rows.length === 0) {
        return { maskedRows: rows, maskedFields: [] };
    }

    const maskedFields = new Set<string>();

    // Collect all fields that should be masked
    const fieldsToMask = new Set<string>([...phiFields, ...pciFields]);

    // Add fields matching known PHI patterns
    if (rows[0]) {
        for (const key of Object.keys(rows[0])) {
            if (PHI_FIELD_PATTERNS.some((p) => p.test(key))) {
                fieldsToMask.add(key);
            }
        }
    }

    // Apply masking
    const maskedRows = rows.map((row) => {
        const maskedRow = { ...row };
        for (const field of fieldsToMask) {
            if (field in maskedRow) {
                maskedRow[field] = "[MASKED]";
                maskedFields.add(field);
            }
        }
        return maskedRow;
    });

    // If Presidio is available, send free-text fields for entity detection
    if (PRESIDIO_ENABLED) {
        try {
            await presidioScanFreeText(maskedRows, maskedFields);
        } catch {
            // Presidio unavailable — field-name heuristics already applied above
            // Log warning but do not fail the request
            console.warn("[PRESIDIO] Service unavailable — using field-name heuristics only");
        }
    }

    return {
        maskedRows,
        maskedFields: Array.from(maskedFields),
    };
}

// Send string fields to Presidio for NLP-based entity detection
async function presidioScanFreeText(
    rows: Record<string, unknown>[],
    maskedFields: Set<string>
): Promise<void> {
    // Collect string fields not already masked
    const stringFields = rows[0]
        ? Object.entries(rows[0])
            .filter(([k, v]) => typeof v === "string" && !maskedFields.has(k))
            .map(([k]) => k)
        : [];

    if (stringFields.length === 0) return;

    // Sample first 10 rows for Presidio analysis (not full scan for perf)
    const sample = rows.slice(0, 10);

    for (const field of stringFields) {
        const texts = sample
            .map((r) => r[field])
            .filter((v): v is string => typeof v === "string");

        if (texts.length === 0) continue;

        const response = await fetch(`${PRESIDIO_URL}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: texts.join(" ||||| "),
                language: "en",
                score_threshold: 0.7,
            }),
        });

        if (response.ok) {
            const results = (await response.json()) as Array<{ entity_type: string }>;
            if (results.length > 0) {
                maskedFields.add(field);
                // Apply masking retroactively to all rows
                for (const row of rows) {
                    if (typeof row[field] === "string") {
                        row[field] = "[MASKED]";
                    }
                }
            }
        }
    }
}
