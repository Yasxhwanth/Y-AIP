-- Y-AIP Edge Scenario: Mock Telemetry Data
-- Simulates the physical state of the autonomous edge environment

CREATE SCHEMA IF NOT EXISTS edge;

CREATE TABLE IF NOT EXISTS edge.solar_panels (
    panel_id VARCHAR(50) PRIMARY KEY,
    location VARCHAR(100) NOT NULL,
    current_efficiency NUMERIC(5,2) NOT NULL,
    anomaly_detected BOOLEAN DEFAULT FALSE,
    last_inspected TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS edge.drone_units (
    drone_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    battery_pct NUMERIC(5,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'IDLE',
    current_lat NUMERIC(9,6),
    current_lon NUMERIC(9,6)
);

-- Seed Data: Solar Panels (including one failing panel)
INSERT INTO edge.solar_panels (panel_id, location, current_efficiency, anomaly_detected)
VALUES
    ('SP-001', 'Sector 7G North', 98.5, FALSE),
    ('SP-002', 'Sector 7G North', 99.1, FALSE),
    ('SP-003', 'Sector 7G East', 97.2, FALSE),
    ('SP-004', 'Sector 7G East', 42.0, TRUE),   -- Failing panel!
    ('SP-005', 'Sector 7G South', 96.8, FALSE),
    ('SP-006', 'Sector 7G South', 98.9, FALSE),
    ('SP-007', 'Sector 7G West', 99.5, FALSE),
    ('SP-008', 'Sector 7G West', 95.1, FALSE),
    ('SP-009', 'Central Hub Array', 88.0, FALSE),
    ('SP-010', 'Central Hub Array', 99.9, FALSE)
ON CONFLICT (panel_id) DO NOTHING;

-- Seed Data: Drone Fleet
INSERT INTO edge.drone_units (drone_id, name, battery_pct, status, current_lat, current_lon)
VALUES
    ('DRN-ALPHA', 'Scout Unit Alpha', 100.0, 'IDLE', 34.0522, -118.2437),
    ('DRN-BRAVO', 'Scout Unit Bravo', 85.5, 'IDLE', 34.0525, -118.2440),
    ('DRN-CHARLIE', 'Heavy Lifter Charlie', 15.0, 'CHARGING', 34.0530, -118.2450)
ON CONFLICT (drone_id) DO NOTHING;
