-- Y-AIP PostgreSQL Init
-- Creates databases needed by Keycloak and Temporal separately

-- Keycloak database
CREATE DATABASE keycloak;

-- Temporal uses the main yaip DB with its own schema (auto-created by Temporal auto-setup)
