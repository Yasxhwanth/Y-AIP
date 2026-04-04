# Y-AIP — Industry Verticals
### Defense, Medical, Finance — Feature Specifications

---

## Defense: "Sentinel" Mode

### Target Standards
- **ITAR** (International Traffic in Arms Regulations)
- **DoD IL6** (Impact Level 6 — most sensitive DoD systems)
- **DDIL** (Disconnected, Denied, Intermittent, Limited bandwidth)

### Feature Set

| Feature | Description |
|---|---|
| **Air-Gap Boot** | Full Y-AIP stack boots from NixOS image with zero internet |
| **Local-Only LLM** | All Reasoning Engine calls use Llama-4-Scout via Ollama. No cloud |
| **Biometric HITL** | Level-3 approvals require fingerprint/retina scan (hardware token) |
| **DDIL Sync** | Drone agents buffer events offline; sync when reconnected |
| **Classfication Propagation** | Data marked [CLASS:SECRET] automatically upgrades all derived outputs |
| **Ephemeral Nodes (48h)** | All compute nodes self-reprovision every 48 hours (APT defense) |
| **No-Fly Zone Registry** | Deterministic guardrail — drones cannot propose crossing NFZ boundaries |
| **Operational Briefing Agent** | Generates classified daily situation reports from all sensor data |
| **Chain of Command Routing** | Actions require approval from the correct rank as defined in ontology |
| **SIGINT Object Type** | Signal Intelligence readings as first-class Ontology objects |

### Defense-Specific Ontology Objects

```typescript
// Defense Objects
type DefenseObject =
  | { type: "Asset"; subtype: "Drone" | "Vehicle" | "Vessel" | "Satellite" }
  | { type: "Personnel"; clearance: "CUI" | "SECRET" | "TS" | "TS_SCI" }
  | { type: "Mission"; classification: string; phase: "PLANNING" | "ACTIVE" | "COMPLETE" }
  | { type: "ThreatEntity"; certainty: number; source: "SIGINT" | "HUMINT" | "GEOINT" }
  | { type: "RestrictedZone"; zone_type: "NFZ" | "EEZ" | "ADA" };
```

---

## Medical: "Aesculapius" Mode

### Target Standards
- **HIPAA 2.0** (Health Insurance Portability and Accountability Act)
- **FHIR R5** (Fast Healthcare Interoperability Resources)
- **HL7** (Health Level Seven messaging)
- **FDA 21 CFR Part 11** (Electronic records in clinical trials)

### Feature Set

| Feature | Description |
|---|---|
| **PHI Auto-Masking** | All patient identifiers masked before LLM via Presidio |
| **FHIR R5 Connector** | Native FHIR query support (Patient, Condition, MedicationRequest resources) |
| **TEE Processing** | Reasoning Engine runs inside Intel TDX enclave |
| **Patient Encounter Context** | Agents can only access Patient records with an active encounter Purpose String |
| **Diagnosis Consensus** | Clinical suggestion agents use k-LLM consensus (3 models must agree) |
| **Physician HITL** | Diagnostic proposals always require Level-3 HITL from licensed physician |
| **Right to Erasure** | Automated GDPR/HIPAA erasure pipeline with audit trail |
| **Drug Interaction Agent** | Checks proposed medications against Patient's current med list |
| **HL7 Audit Events** | Audit log emits HL7 FHIR AuditEvent resources (regulator-compatible) |
| **Clinical Trial Mode** | FDA 21 CFR Part 11 compliant electronic signatures on all proposals |

### Medical-Specific Ontology Objects

```typescript
// Medical Objects
type MedicalObject =
  | { type: "Patient"; phi: true; mrn: string }   // phi:true locks masking
  | { type: "Physician"; npi: string; specialty: string }
  | { type: "Encounter"; encounter_type: "inpatient" | "outpatient" | "emergency" }
  | { type: "Condition"; icd10_code: string; severity: "mild" | "moderate" | "severe" | "critical" }
  | { type: "MedicationRequest"; rxnorm_code: string; frequency: string }
  | { type: "DiagnosticReport"; loinc_code: string; result_value: string; unit: string };
```

### Medical Workflow Example: Admission Triage Agent

```
Trigger: New Patient admitted (FHIR Patient resource created)
  │
  Agent: admission-triage
    1. Fetch Patient history (masked) via FHIR connector
    2. Identify active Conditions and current Medications
    3. k-LLM consensus: Assess urgency score
    4. Guardrail: Flag any known drug interactions (deterministic lookup)
    5. Generate Proposal: "Assign to ICU - Urgency Score 0.91"
       → Level-3 HITL: Attending physician must sign
    6. On approval: Update Encounter object, generate care plan
```

---

## Finance: "Argus" Mode

### Target Standards
- **PCI-DSS 4.0.1** (Payment Card Industry Data Security Standard)
- **DORA** (EU Digital Operational Resilience Act)
- **SOX** (Sarbanes-Oxley Act)
- **AML** (Anti-Money Laundering / FinCEN requirements)
- **GDPR** (General Data Protection Regulation)

### Feature Set

| Feature | Description |
|---|---|
| **PAN Tokenization** | Card numbers replaced with tokens (Format-Preserving Encryption) before storage or LLM |
| **Transaction Graph** | Real-time transaction graph in Neo4j — detect money laundering patterns via GraphRAG |
| **Causal Forensics** | Every flagged transaction shows a full causal chain (who → what → why → when) |
| **Fraud Sentinel Agent** | Real-time monitor; proposes freeze within 3 seconds of anomaly detection |
| **DORA Exit Pack** | Logic chains exportable as Docker images; customer can self-host without Y-AIP |
| **SOX Audit Trail** | All financial proposals include SOX-compliant dual-approval workflow |
| **Regulatory Reporter Agent** | Generates SAR (Suspicious Activity Reports) in FinCEN XML format |
| **Market Disruption Alerts** | Ontology object: `MarketEvent`; Automate rule triggers portfolio review |
| **Credit Risk Agent** | Assesses loan applications using internal + external (federated) data |
| **AML Pattern Library** | Pre-built LangGraph chains for layering, smurfing, and shell entity detection |

### Finance-Specific Ontology Objects

```typescript
// Finance Objects
type FinanceObject =
  | { type: "Transaction"; amount: number; currency: string; risk_score?: number }
  | { type: "Account"; account_type: "checking" | "savings" | "credit" | "investment" }
  | { type: "Entity"; entity_type: "individual" | "corporation" | "shell"; kyc_status: string }
  | { type: "ComplianceAlert"; alert_type: "AML" | "Fraud" | "Sanctions" | "PEP"; severity: string }
  | { type: "Portfolio"; aum: number; risk_rating: "LOW" | "MEDIUM" | "HIGH" }
  | { type: "MarketEvent"; event_type: "crash" | "flash" | "halt" | "circuit_breaker" };
```

### AML Pattern Example: Layering Detection

```
Automate Trigger: Transaction graph update
  │
  Agent: aml-monitor (Argus Mode)
    1. GraphRAG query: detect "layering" pattern
       MATCH path = (source:Account)-[:SENT*3..7]->(dest:Account)
       WHERE all(t IN relationships(path) WHERE t.amount BETWEEN 8000 AND 10000)
       AND source.country <> dest.country
       RETURN path

    2. k-LLM consensus: Is this structuring (AML) or legitimate?
    3. Guardrail: Cross-check dest against OFAC Sanctions list (deterministic lookup)
    4. Proposal: "Freeze accounts + file SAR" → Level-3 HITL (compliance officer)
    5. On approval: Freeze executed, SAR generated in FinCEN XML, audit logged under SOX
```
