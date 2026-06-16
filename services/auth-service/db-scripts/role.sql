-- =============================================================================
-- TABLE: role
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Master list of roles that can be assigned to a system_user on a site.
-- The `code` column is the stable machine-readable key used in JWT claims
-- and application logic. `name` is the human-readable label shown in the UI.
--
-- ROLES
-- ─────
-- ACCOUNT_MANAGER    — manages player accounts
-- MARKETING_MANAGER  — owns campaigns and promotions
-- FINANCE_MANAGER    — views and manages financial reporting
-- OPS_LEAD           — operational oversight across teams
-- CAMPAIGN_MANAGER   — creates and monitors campaigns
-- ADMIN              — full access within their assigned site
-- ANALYST            — read-only analytics and reporting
-- SUPPORT            — player support and issue resolution
-- BRAND_MANAGER      — manages brand and site-level settings
-- PRODUCT_MANAGER    — product configuration and feature flags
--
-- CHANGE LOGGING
-- ──────────────
-- All INSERTs and UPDATEs are recorded in change_log with
-- table_name = 'role'. No DDL change is needed to that table.
--
-- RELATIONSHIPS
-- ─────────────
-- role.id ← user_site_role.role_id
--
-- =============================================================================

CREATE TABLE `role` (
    `id`            INT           NOT NULL AUTO_INCREMENT,
    `code`          VARCHAR(50)   NOT NULL,
    -- stable machine key used in JWT claims and app logic; never rename
    `name`          VARCHAR(100)  NOT NULL,
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
    UNIQUE KEY `uk_role_code` (`code`),
    KEY `idx_role_active`     (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Seed data — do not change codes; they are referenced in application logic
-- -----------------------------------------------------------------------------
INSERT INTO `role`
    (`id`, `code`, `name`, `description`, `active`,
     `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    (1,  'ACCOUNT_MANAGER',   'Account Manager',   'Manages player accounts and related operations.',                          1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (2,  'MARKETING_MANAGER', 'Marketing Manager', 'Owns campaigns, promotions, and player engagement initiatives.',           1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (3,  'FINANCE_MANAGER',   'Finance Manager',   'Views and manages financial reporting and bonus budgets.',                 1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (4,  'OPS_LEAD',          'Ops Lead',          'Operational oversight across teams; can action cross-functional tasks.',   1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (5,  'CAMPAIGN_MANAGER',  'Campaign Manager',  'Creates, configures, and monitors marketing campaigns.',                   1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (6,  'ADMIN',             'Admin',             'Full read/write access within the assigned site.',                        1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (7,  'ANALYST',           'Analyst',           'Read-only access to analytics, reports, and player data.',                1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (8,  'SUPPORT',           'Support',           'Handles player support tickets and issue resolution.',                    1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (9,  'BRAND_MANAGER',     'Brand Manager',     'Manages brand identity and site-level configuration.',                    1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (10, 'PRODUCT_MANAGER',   'Product Manager',   'Owns product configuration, feature flags, and roadmap execution.',       1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00');
