-- =============================================================================
-- TABLE: site_configure
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Key-value configuration store for a site (tenant). Each row holds one
-- named setting (config_key) and its value (config_value) for a given site.
-- Use this to attach site-level parameters without schema changes.
--
-- COMMON KEYS
-- ───────────
-- timezone           — site timezone (e.g. Asia/Kolkata, UTC)
-- currency           — ISO 4217 currency code (e.g. INR, USD)
-- locale             — BCP 47 locale tag (e.g. en-IN, en-US)
-- default_token_ttl  — site-wide default JWT TTL in seconds
-- max_login_attempts — lockout threshold for failed logins
-- session_timeout    — idle session timeout in seconds
-- mfa_enabled        — whether MFA is enforced for system users (true/false)
-- support_email      — site support contact email
--
-- CHANGE LOGGING
-- ──────────────
-- All INSERTs and UPDATEs are recorded in change_log with
-- table_name = 'site_configure'. No DDL change is needed.
--
-- RELATIONSHIPS
-- ─────────────
-- site_configure.site_id → site.id
--
-- =============================================================================

CREATE TABLE `site_configure` (
    `id`            INT           NOT NULL AUTO_INCREMENT,
    `site_id`       INT           NOT NULL,
    -- FK → site.id
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
    UNIQUE KEY `uk_site_config_key`             (`site_id`, `config_key`),
    KEY `idx_site_configure_site`               (`site_id`),
    KEY `idx_site_configure_active`             (`active`),

    CONSTRAINT `fk_sc_site` FOREIGN KEY (`site_id`)
        REFERENCES `site` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `site_configure`
    (`id`, `site_id`, `config_key`, `config_value`, `description`, `active`,
     `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    -- Site 1
    (1,  1, 'timezone',           'Asia/Kolkata',       'Site timezone used for reporting and scheduling.',         1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (2,  1, 'currency',           'INR',                'ISO 4217 currency code.',                                  1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (3,  1, 'locale',             'en-IN',              'BCP 47 locale tag for UI formatting.',                     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (4,  1, 'default_token_ttl',  '3600',               'Site-wide default JWT lifetime in seconds.',               1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (5,  1, 'max_login_attempts', '5',                  'Failed login attempts before account lockout.',            1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (6,  1, 'session_timeout',    '1800',               'Idle session timeout in seconds.',                         1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (7,  1, 'mfa_enabled',        'false',              'Whether MFA is enforced for all system users.',            1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (8,  1, 'support_email',      'support@site1.com',  'Site support contact email.',                              1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- Site 2
    (9,  2, 'timezone',           'UTC',                'Site timezone used for reporting and scheduling.',         1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (10, 2, 'currency',           'USD',                'ISO 4217 currency code.',                                  1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (11, 2, 'locale',             'en-US',              'BCP 47 locale tag for UI formatting.',                     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (12, 2, 'default_token_ttl',  '3600',               'Site-wide default JWT lifetime in seconds.',               1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (13, 2, 'max_login_attempts', '5',                  'Failed login attempts before account lockout.',            1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (14, 2, 'session_timeout',    '1800',               'Idle session timeout in seconds.',                         1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (15, 2, 'mfa_enabled',        'false',              'Whether MFA is enforced for all system users.',            1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (16, 2, 'support_email',      'support@site2.com',  'Site support contact email.',                              1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00');
