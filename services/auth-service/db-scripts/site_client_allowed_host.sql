-- =============================================================================
-- TABLE: site_client_allowed_host
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Allow-list of hosts (origins / domains) that a site_client is permitted
-- to make requests from. Used to enforce CORS origin validation and referrer
-- checks at the API layer.
--
-- HOST FORMAT
-- ───────────
-- Store the full origin: scheme + host + optional port.
-- Examples:
--   https://app.example.com
--   https://api.example.com:8443
--   http://localhost:3000          (dev only — set active=0 in production)
--
-- CHANGE LOGGING
-- ──────────────
-- All INSERTs and UPDATEs are recorded in change_log with
-- table_name = 'site_client_allowed_host'. No DDL change is needed.
--
-- RELATIONSHIPS
-- ─────────────
-- site_client_allowed_host.client_id → site_client.id
--
-- =============================================================================

CREATE TABLE `site_client_allowed_host` (
    `id`            INT           NOT NULL AUTO_INCREMENT,
    `client_id`     INT           NOT NULL,
    -- FK → site_client.id
    `host`          VARCHAR(255)  NOT NULL,
    -- full origin: scheme://host[:port]
    `active`        TINYINT(1)    NOT NULL DEFAULT 1,
    `created_by`    VARCHAR(100)  NOT NULL,
    `updated_by`    VARCHAR(100)  NOT NULL,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`      CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_client_host`                     (`client_id`, `host`),
    KEY `idx_site_client_allowed_host_client`        (`client_id`),
    KEY `idx_site_client_allowed_host_active`        (`active`),

    CONSTRAINT `fk_scah_client` FOREIGN KEY (`client_id`)
        REFERENCES `site_client` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `site_client_allowed_host`
    (`id`, `client_id`, `host`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    -- site1-backend-v1 (client_id=1): production backend origin
    (1, 1, 'https://api.site1.example.com',  1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- site1-mobile-sdk-v2 (client_id=2): mobile app and local dev origins
    (2, 2, 'https://app.site1.example.com',  1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (3, 2, 'http://localhost:3000',           0, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00');
