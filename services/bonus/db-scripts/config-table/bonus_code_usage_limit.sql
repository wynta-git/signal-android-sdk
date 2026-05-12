-- =============================================================================
-- TABLE: bonus_code_usage_limit
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Configuration-only table. Stores the redemption count cap for each
-- (code, period) combination.
--
-- This table changes only when an operator creates or adjusts a code's cap.
-- Running counters (how many times a code has been redeemed) live in
-- bonus_code_usage so that high-frequency grant writes never touch this table.
--
-- USAGE
-- ─────
-- • One row per (code_id, period_type).
-- • Read at redemption time to determine the allowed ceiling.
-- • Written only via the CMS when a code is created or its cap is changed.
-- • NULL on usage_limit means uncapped for that period.
-- • Change history is trackable by auditing updated_at; any change here is
--   operator-driven, never a side-effect of a player grant.
--
-- PERIOD TYPES
-- ────────────
-- HOURLY  — rolling 60-minute window
-- DAILY   — calendar day
-- WEEKLY  — ISO week (Monday–Sunday)
-- MONTHLY — calendar month
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_configure_code.id ← bonus_code_usage_limit.code_id
-- bonus_code_usage_limit (code_id, period_type)
--     ← bonus_code_usage (code_id, period_type)
--
-- =============================================================================

CREATE TABLE `bonus_code_usage_limit` (
    `id`           INT         NOT NULL AUTO_INCREMENT,
    `code_id`      INT         NOT NULL,
    -- references bonus_configure_code.id
    `site_id`      INT         NOT NULL,
    `period_type`  VARCHAR(10) NOT NULL,
    -- HOURLY | DAILY | WEEKLY | MONTHLY
    `usage_limit`  INT         DEFAULT NULL,
    -- NULL = uncapped
    `created_by`   VARCHAR(100) NOT NULL,
    `updated_by`   VARCHAR(100) NOT NULL,
    `created_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code_usage_limit`      (`code_id`, `period_type`),
    KEY `idx_code_usage_limit_code_id`    (`code_id`),
    KEY `idx_code_usage_limit_site`       (`site_id`)
);

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_code_usage_limit`
    (`code_id`, `site_id`, `period_type`, `usage_limit`, `created_by`, `updated_by`)
VALUES
    -- code_id=1 (WELCOME100)
    (1, 1, 'HOURLY',  NULL, 'admin',    'admin'),
    (1, 1, 'DAILY',    500, 'admin',    'admin'),
    (1, 1, 'WEEKLY',  2000, 'admin',    'admin'),
    (1, 1, 'MONTHLY', 5000, 'admin',    'admin'),

    -- code_id=2 (INFLUENCER50): tight hourly cap
    (2, 1, 'HOURLY',    10, 'ops.team', 'ops.team'),
    (2, 1, 'DAILY',    100, 'ops.team', 'ops.team'),
    (2, 1, 'WEEKLY',   500, 'ops.team', 'ops.team'),
    (2, 1, 'MONTHLY', 1500, 'ops.team', 'ops.team'),

    -- code_id=3 (VIP2026): fully uncapped
    (3, 1, 'HOURLY',  NULL, 'admin',    'ops.team'),
    (3, 1, 'DAILY',   NULL, 'admin',    'ops.team'),
    (3, 1, 'WEEKLY',  NULL, 'admin',    'ops.team'),
    (3, 1, 'MONTHLY', NULL, 'admin',    'ops.team'),

    -- code_id=4 (WEEKEND500)
    (4, 1, 'HOURLY',  NULL, 'ops.team', 'ops.team'),
    (4, 1, 'DAILY',    200, 'ops.team', 'ops.team'),
    (4, 1, 'WEEKLY',   400, 'ops.team', 'ops.team'),
    (4, 1, 'MONTHLY', 1000, 'ops.team', 'ops.team');
