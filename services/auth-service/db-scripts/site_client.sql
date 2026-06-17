-- =============================================================================
-- TABLE: site_client
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Manages API clients that are authorised to act on behalf of a site.
-- Each client has a public client_id and a hashed client_secret used for
-- authentication. Clients are scoped to a site and have an active validity
-- window; they can be enabled/disabled independently of that window.
--
-- CLIENT TYPES
-- ────────────
-- S2S    — server-to-server; trusted backend integration
-- DEVICE — end-user device (mobile app, browser SDK, etc.)
--
-- CHANGE LOGGING
-- ──────────────
-- All INSERTs and UPDATEs are recorded in bonus_change_log with
-- table_name = 'site_client'. No DDL change is needed to that table.
--
-- RELATIONSHIPS
-- ─────────────
-- site_client.id → bonus_change_log (entity_id, table_name='site_client')
--
-- =============================================================================

CREATE TABLE `site_client` (
    `id`            INT           NOT NULL AUTO_INCREMENT,
    `site_id`       INT           NOT NULL,
    `client_id`     VARCHAR(64)   NOT NULL,
    -- public identifier; unique per site
    `client_secret` VARCHAR(255)  NOT NULL,
    -- stored as a hash (bcrypt / SHA-256); never stored in plaintext
    `name`          VARCHAR(100)  NOT NULL,
    `description`   VARCHAR(500)  DEFAULT NULL,
    `active`        TINYINT(1)    NOT NULL DEFAULT 1,
    `client_type`   VARCHAR(10)   NOT NULL,
    -- S2S | DEVICE
    `role`          JSON          DEFAULT NULL,
    -- JSON object describing permissions/scopes granted to this client
    -- NULL = no expiry
    `created_by`    VARCHAR(100)  NOT NULL,
    `updated_by`    VARCHAR(100)  NOT NULL,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`      CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_site_client`             (`site_id`, `client_id`),
    KEY `idx_site_client_site`              (`site_id`),
    KEY `idx_site_client_active`            (`active`),
    KEY `idx_site_client_type`              (`client_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `site_client`
    (`id`, `site_id`, `client_id`, `client_secret`, `name`, `description`,
     `active`, `client_type`, `role`,
     `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    -- Active S2S backend integration
    (1, 1,
     'site1-backend-v1',
     '$2b$12$hashed_secret_placeholder_backend',
     'Site 1 Backend Integration',
     'Primary server-to-server client for the site 1 backend service.',
     1, 'S2S',
     '{"permissions": ["read", "write", "admin"], "scopes": ["events", "users", "segments"]}',
     'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- Active DEVICE client for mobile app
    (2, 1,
     'site1-mobile-sdk-v2',
     '$2b$12$hashed_secret_placeholder_mobile',
     'Site 1 Mobile SDK',
     'Device client used by the iOS and Android mobile apps.',
     1, 'DEVICE',
     '{"permissions": ["read", "write"], "scopes": ["events"]}',
     'admin', 'ops.team', '2026-01-01 09:00:00', '2026-03-15 11:00:00'),

    -- Inactive S2S client (legacy, decommissioned)
    (3, 1,
     'site1-backend-v0',
     '$2b$12$hashed_secret_placeholder_legacy',
     'Site 1 Backend Integration (Legacy)',
     'Decommissioned v0 backend client; replaced by site1-backend-v1.',
     0, 'S2S',
     NULL,
     'admin', 'admin', '2025-01-01 09:00:00', '2026-01-01 08:00:00');
