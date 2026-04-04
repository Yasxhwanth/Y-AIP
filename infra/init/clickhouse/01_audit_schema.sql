-- Y-AIP ClickHouse Audit Log Schema
-- This table is append-only — never UPDATE or DELETE

CREATE TABLE IF NOT EXISTS audit.audit_events
(
    event_id              String,
    event_type            LowCardinality(String),
    timestamp             DateTime64(3, 'UTC'),
    principal_id          String,
    principal_type        LowCardinality(String),   -- 'user' | 'agent'
    purpose_id            Nullable(String),
    resource_type         LowCardinality(String),
    resource_id           String,
    connector_id          Nullable(String),
    query_hash            Nullable(String),
    data_markings_accessed Array(String),
    masked_fields         Array(String),
    action_id             Nullable(String),
    proposal_id           Nullable(String),
    action_status         Nullable(LowCardinality(String)),
    classification_ceiling LowCardinality(String),
    environment           LowCardinality(String),
    parent_event_id       Nullable(String),
    reasoning_hash        Nullable(String),
    opa_decision          Nullable(String),         -- 'allow' | 'deny' | 'deny:PHI' etc.
    latency_ms            Nullable(UInt32),
    error_message         Nullable(String)
)
ENGINE = MergeTree()
ORDER BY (timestamp, event_type, principal_id)
PARTITION BY toYYYYMM(timestamp)
TTL timestamp + INTERVAL 7 YEAR;                   -- Retain for 7 years (compliance)

-- OPA decision log table (separate from business events)
CREATE TABLE IF NOT EXISTS audit.opa_decisions
(
    decision_id   String,
    timestamp     DateTime64(3, 'UTC'),
    principal_id  String,
    connector_id  String,
    resource_type String,
    allowed       Bool,
    deny_reason   Nullable(String),
    query_time_ms Float32
)
ENGINE = MergeTree()
ORDER BY (timestamp, principal_id)
PARTITION BY toYYYYMM(timestamp);
