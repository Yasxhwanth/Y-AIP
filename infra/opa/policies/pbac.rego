package yaip.authz

# ─────────────────────────────────────────────────────────────────────
# Y-AIP PBAC Policy (v1.0)
# Evaluated by OPA sidecar on every MCP Gateway query
# Input shape:
#   input.principal = { roles, purpose_ids, clearance, permitted_connectors, us_person }
#   input.query     = { resource_type, connector_id, purpose_id, classification, data_markings }
#   input.environment = "cloud" | "on_prem" | "air_gap"
# ─────────────────────────────────────────────────────────────────────

default allow = false
default deny  = false

# ── ALLOW ─────────────────────────────────────────────────────────────
# All four conditions must pass simultaneously

allow {
    not deny
    role_permits_access
    purpose_is_active
    classification_within_ceiling
    connector_permitted
}

# Condition 1: principal's role grants access to this resource type
role_permits_access {
    role     := input.principal.roles[_]
    resource := input.query.resource_type
    data.role_permissions[role].resource_types[_] == resource
}

# Condition 2: the queried purpose_id is in the principal's active set
purpose_is_active {
    input.query.purpose_id in input.principal.purpose_ids
}

# Condition 3: data classification ≤ principal's clearance ceiling
classification_within_ceiling {
    levels      := ["UNCLASSIFIED", "CUI", "SECRET", "TOP_SECRET"]
    query_level := [i | levels[i] == input.query.classification][0]
    ceil_level  := [i | levels[i] == input.principal.clearance][0]
    query_level <= ceil_level
}

# Condition 4: connector is explicitly permitted for this principal
connector_permitted {
    input.query.connector_id in input.principal.permitted_connectors
}

# ── HARD DENY — override allow ────────────────────────────────────────

# DENY: PHI data without active patient_encounter purpose context
deny {
    "PHI:TRUE" in input.query.data_markings
    count([p |
        p := input.principal.purpose_ids[_]
        startswith(p, "enc:")
    ]) == 0
}

# DENY: ITAR data accessed by non-US person
deny {
    "ITAR:TRUE" in input.query.data_markings
    not input.principal.us_person
}

# DENY: TOP_SECRET data outside air-gap environment
deny {
    input.query.classification == "TOP_SECRET"
    input.environment != "air_gap"
}

# DENY: PCI data without active fraud_investigation or audit purpose
deny {
    "PCI:PAN" in input.query.data_markings
    count([p |
        p := input.principal.purpose_ids[_]
        p in ["fraud_investigation", "audit"]
    ]) == 0
}
