-- =============================================================================
-- TABLE: site
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Master record for each site (tenant/operator) in the platform. All
-- other tables that carry a site_id column reference site.id as their
-- logical tenant scope.
--
-- RELATIONSHIPS
-- ─────────────
-- site.id ← bonus_head.site_id
-- site.id ← bonus_subhead.site_id
-- site.id ← bonus_configure.site_id
-- site.id ← site_client.site_id
-- site.id ← user_site_mapping.site_id
--
-- CHANGE LOGGING
-- ──────────────
-- All INSERTs and UPDATEs are recorded in bonus_change_log with
-- table_name = 'site'. No DDL change is needed to that table.
--
-- =============================================================================

CREATE TABLE `site` (
    `id`            INT           NOT NULL AUTO_INCREMENT,
    `program_id`    INT           DEFAULT NULL,
    -- logical program this site belongs to; NULL = no program grouping
    `name`          VARCHAR(100)  NOT NULL,
    `description`   VARCHAR(500)  DEFAULT NULL,

    `domain`        VARCHAR(255)  DEFAULT NULL,
    -- primary domain or base URL for the site
    `active`        TINYINT(1)    NOT NULL DEFAULT 1,
    -- site-level settings (timezone, currency, locale, feature flags, etc.)
    `created_by`    VARCHAR(100)  NOT NULL,
    `updated_by`    VARCHAR(100)  NOT NULL,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`      CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_site_name`       (`name`),
    UNIQUE KEY `uk_site_domain`     (`domain`),
    KEY `idx_site_active`           (`active`),
    KEY `idx_site_program_id`       (`program_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `site`
    (`id`, `program_id`, `name`, `description`, `domain`, `active`, `configuration`,
     `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    (1,
     1,
     'Site One',
     'Primary operator site.',
     'site1.example.com',
     1,
     '{"timezone": "Asia/Kolkata", "currency": "INR", "locale": "en-IN"}',
     'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    (2,
     1,
     'Site Two',
     'Secondary operator site.',
     'site2.example.com',
     1,
     '{"timezone": "UTC", "currency": "USD", "locale": "en-US"}',
     'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00');
