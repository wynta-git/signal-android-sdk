-- =============================================================================
-- TABLE: site_client_configure
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Key-value configuration store for a site_client. Each row holds one
-- named setting (config_key) and its value (config_value) for a given client.
-- Use this to attach arbitrary client-level parameters without schema changes.
--
-- COMMON KEYS
-- ───────────
-- token_ttl          — override default JWT TTL (seconds) for this client
-- rate_limit_rpm     — requests-per-minute cap applied at the gateway
-- allowed_scopes     — comma-separated list of scopes this client may request
-- refresh_enabled    — whether token refresh is permitted (true/false)
-- session_timeout    — idle session timeout in seconds
--
-- CHANGE LOGGING
-- ──────────────
-- All INSERTs and UPDATEs are recorded in change_log with
-- table_name = 'site_client_configure'. No DDL change is needed.
--
-- RELATIONSHIPS
-- ─────────────
-- site_client_configure.client_id → site_client.id
--
-- =============================================================================

CREATE TABLE `site_client_configure` (
    `id`            INT           NOT NULL AUTO_INCREMENT,
    `client_id`     INT           NOT NULL,
    -- FK → site_client.id
    `config_key`    VARCHAR(100)  NOT NULL,
    -- lowercase_snake_case; never rename a key in production
    `config_value`  VARCHAR(1000) NOT NULL,
    `description`   VARCHAR(500)  DEFAULT NULL,
    `active`        TINYINT(1)    NOT NULL DEFAULT 1,
    `created_by`    VARCHAR(100)  NOT NULL,
    `updated_by`    VARCHAR(100)  NOT NULL,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`      CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_client_config_key`                   (`client_id`, `config_key`),
    KEY `idx_site_client_configure_client`               (`client_id`),
    KEY `idx_site_client_configure_active`               (`active`),

    CONSTRAINT `fk_scc_client` FOREIGN KEY (`client_id`)
        REFERENCES `site_client` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `site_client_configure`
    (`id`, `client_id`, `config_key`, `config_value`, `description`, `active`,
     `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    -- site1-backend-v1 (client_id=1)
    (1, 1, 'token_ttl',      '3600',  'JWT lifetime in seconds.',                         1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (2, 1, 'rate_limit_rpm', '1000',  'Max requests per minute allowed for this client.', 1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (3, 1, 'allowed_scopes', 'read,write,admin', 'Comma-separated permitted scopes.',     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (4, 1, 'refresh_enabled','true',  'Whether token refresh flows are permitted.',        1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- site1-mobile-sdk-v2 (client_id=2)
    (5, 2, 'token_ttl',      '900',   'Shorter JWT lifetime for device clients.',         1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (6, 2, 'rate_limit_rpm', '300',   'Conservative rate limit for mobile clients.',      1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (7, 2, 'allowed_scopes', 'read',  'Device clients are read-only.',                    1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (8, 2, 'refresh_enabled','true',  'Refresh enabled to avoid re-login on mobile.',     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (9, 2, 'session_timeout','1800',  'Idle session timeout in seconds.',                 1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00');
