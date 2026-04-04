// ─────────────────────────────────────────────────────────────────────
// Y-AIP Neo4j Schema — Constraints & Indexes
// Run once on first startup, idempotent on re-run
// ─────────────────────────────────────────────────────────────────────

// ── neosemantics (n10s) initialization ───────────────────────────────
// Required before loading any SHACL shapes or RDF data
CALL n10s.graphconfig.init({
  handleVocabUris: "SHORTEN",
  handleMultival: "ARRAY",
  multivalPropList: ["aliases", "data_markings"]
});

// ── Core: OntologyObject ─────────────────────────────────────────────
// Every entity in the platform is an OntologyObject
CREATE CONSTRAINT ontology_object_id IF NOT EXISTS
  FOR (n:OntologyObject) REQUIRE n.object_id IS UNIQUE;

CREATE CONSTRAINT ontology_object_type IF NOT EXISTS
  FOR (n:OntologyObject) REQUIRE n.object_type IS NOT NULL;

CREATE INDEX ontology_object_classification IF NOT EXISTS
  FOR (n:OntologyObject) ON (n.classification);

CREATE INDEX ontology_object_created_at IF NOT EXISTS
  FOR (n:OntologyObject) ON (n.created_at);

// ── Domain: DroneUnit ─────────────────────────────────────────────────
CREATE CONSTRAINT drone_unit_id IF NOT EXISTS
  FOR (n:DroneUnit) REQUIRE n.drone_id IS UNIQUE;

CREATE INDEX drone_unit_status IF NOT EXISTS
  FOR (n:DroneUnit) ON (n.status);

CREATE INDEX drone_unit_battery IF NOT EXISTS
  FOR (n:DroneUnit) ON (n.battery_pct);

// ── Domain: Mission ───────────────────────────────────────────────────
CREATE CONSTRAINT mission_id IF NOT EXISTS
  FOR (n:Mission) REQUIRE n.mission_id IS UNIQUE;

CREATE INDEX mission_status IF NOT EXISTS
  FOR (n:Mission) ON (n.status);

CREATE INDEX mission_classification IF NOT EXISTS
  FOR (n:Mission) ON (n.classification);

// ── Domain: SolarPanel ────────────────────────────────────────────────
CREATE CONSTRAINT solar_panel_id IF NOT EXISTS
  FOR (n:SolarPanel) REQUIRE n.panel_id IS UNIQUE;

CREATE INDEX solar_panel_efficiency IF NOT EXISTS
  FOR (n:SolarPanel) ON (n.efficiency_pct);

// ── Domain: Patient (Medical) ─────────────────────────────────────────
CREATE CONSTRAINT patient_mrn IF NOT EXISTS
  FOR (n:Patient) REQUIRE n.mrn IS UNIQUE;

CREATE INDEX patient_doi IF NOT EXISTS
  FOR (n:Patient) ON (n.date_of_birth);

// ── Domain: Encounter ─────────────────────────────────────────────────
CREATE CONSTRAINT encounter_id IF NOT EXISTS
  FOR (n:Encounter) REQUIRE n.encounter_id IS UNIQUE;

// ── Domain: Transaction (Finance) ────────────────────────────────────
CREATE CONSTRAINT transaction_id IF NOT EXISTS
  FOR (n:Transaction) REQUIRE n.transaction_id IS UNIQUE;

CREATE INDEX transaction_amount IF NOT EXISTS
  FOR (n:Transaction) ON (n.amount);

CREATE INDEX transaction_flagged IF NOT EXISTS
  FOR (n:Transaction) ON (n.flagged);

// ── Domain: Proposal ──────────────────────────────────────────────────
CREATE CONSTRAINT proposal_id IF NOT EXISTS
  FOR (n:Proposal) REQUIRE n.proposal_id IS UNIQUE;

CREATE INDEX proposal_status IF NOT EXISTS
  FOR (n:Proposal) ON (n.status);

// ── Domain: Connector ─────────────────────────────────────────────────
CREATE CONSTRAINT connector_id IF NOT EXISTS
  FOR (n:Connector) REQUIRE n.connector_id IS UNIQUE;

// ── Relationship Indexes ──────────────────────────────────────────────
CREATE INDEX rel_assigned_to IF NOT EXISTS
  FOR ()-[r:ASSIGNED_TO]-() ON (r.assigned_at);

CREATE INDEX rel_detected_at IF NOT EXISTS
  FOR ()-[r:DETECTED_AT]-() ON (r.detected_at);

// ── Full-text search index ────────────────────────────────────────────
CREATE FULLTEXT INDEX ontology_fulltext IF NOT EXISTS
  FOR (n:OntologyObject|DroneUnit|Mission|SolarPanel|Patient|Transaction)
  ON EACH [n.name, n.description, n.notes];

RETURN "Schema initialization complete" AS status;
