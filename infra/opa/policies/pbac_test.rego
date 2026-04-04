package yaip.authz_test

import data.yaip.authz

# ─── Test fixtures ────────────────────────────────────────────────────

analyst_principal := {
    "sub": "user-123",
    "roles": ["ANALYST"],
    "purpose_ids": ["audit"],
    "clearance": "CUI",
    "permitted_connectors": ["connector-postgres"],
    "us_person": true,
}

medical_principal := {
    "sub": "user-456",
    "roles": ["MEDICAL_STAFF"],
    "purpose_ids": ["enc:patient-MRN-00291"],        # Active encounter
    "clearance": "CUI",
    "permitted_connectors": ["connector-postgres", "connector-fhir"],
    "us_person": true,
}

agent_principal := {
    "sub": "agent-drone-001",
    "roles": ["AGENT"],
    "purpose_ids": ["mission_planning"],
    "clearance": "SECRET",
    "permitted_connectors": ["connector-postgres", "connector-kafka"],
    "us_person": true,
}

# ─── ALLOW tests ──────────────────────────────────────────────────────

test_analyst_can_access_audit_data {
    authz.allow with input as {
        "principal": analyst_principal,
        "query": {
            "resource_type": "AuditSummary",
            "connector_id": "connector-postgres",
            "purpose_id": "audit",
            "classification": "UNCLASSIFIED",
            "data_markings": [],
        },
        "environment": "cloud",
    }
}

test_medical_staff_can_access_patient_with_encounter {
    authz.allow with input as {
        "principal": medical_principal,
        "query": {
            "resource_type": "Patient",
            "connector_id": "connector-fhir",
            "purpose_id": "enc:patient-MRN-00291",
            "classification": "CUI",
            "data_markings": ["PHI:TRUE"],
        },
        "environment": "on_prem",
    }
}

test_agent_can_access_mission_data {
    authz.allow with input as {
        "principal": agent_principal,
        "query": {
            "resource_type": "Mission",
            "connector_id": "connector-postgres",
            "purpose_id": "mission_planning",
            "classification": "SECRET",
            "data_markings": [],
        },
        "environment": "air_gap",
    }
}

# ─── DENY tests ──────────────────────────────────────────────────────

test_analyst_denied_phi_without_encounter {
    not authz.allow with input as {
        "principal": analyst_principal,                # ANALYST, no active encounter
        "query": {
            "resource_type": "Patient",
            "connector_id": "connector-postgres",
            "purpose_id": "audit",
            "classification": "CUI",
            "data_markings": ["PHI:TRUE"],
        },
        "environment": "cloud",
    }
}

test_deny_top_secret_outside_airgap {
    not authz.allow with input as {
        "principal": agent_principal,
        "query": {
            "resource_type": "Mission",
            "connector_id": "connector-postgres",
            "purpose_id": "mission_planning",
            "classification": "TOP_SECRET",
            "data_markings": [],
        },
        "environment": "cloud",           # Should be air_gap for TOP_SECRET
    }
}

test_deny_itar_for_non_us_person {
    not authz.allow with input as {
        "principal": {
            "sub": "user-789",
            "roles": ["ANALYST"],
            "purpose_ids": ["audit"],
            "clearance": "SECRET",
            "permitted_connectors": ["connector-postgres"],
            "us_person": false,           # Non-US person
        },
        "query": {
            "resource_type": "ExportControlledEquipment",
            "connector_id": "connector-postgres",
            "purpose_id": "audit",
            "classification": "SECRET",
            "data_markings": ["ITAR:TRUE"],
        },
        "environment": "air_gap",
    }
}

test_deny_unpermitted_connector {
    not authz.allow with input as {
        "principal": analyst_principal,
        "query": {
            "resource_type": "AuditSummary",
            "connector_id": "connector-fhir",        # Not in permitted_connectors
            "purpose_id": "audit",
            "classification": "UNCLASSIFIED",
            "data_markings": [],
        },
        "environment": "cloud",
    }
}

test_deny_clearance_ceiling_exceeded {
    not authz.allow with input as {
        "principal": analyst_principal,              # clearance = CUI
        "query": {
            "resource_type": "AuditSummary",
            "connector_id": "connector-postgres",
            "purpose_id": "audit",
            "classification": "SECRET",             # Above CUI ceiling
            "data_markings": [],
        },
        "environment": "cloud",
    }
}
