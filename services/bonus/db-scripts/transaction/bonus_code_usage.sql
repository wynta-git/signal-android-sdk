-- =============================================================================
-- TABLE: bonus_code_usage
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Runtime counter table. Tracks how many times each promo code has been
-- redeemed within the current period window.
--
-- Separated from bonus_code_usage_limit so that high-frequency grant writes
-- never contend with operator reads/writes on the configuration table.
--
-- USAGE
-- ─────
-- • One row per (code_id, period_type) — mirrors bonus_code_usage_limit.
-- • At redemption time:
--     1. JOIN to bonus_code_usage_limit to get the cap.
--     2. Check: usage_used + 1 <= usage_limit (or limit IS NULL).
--     3. On success: UPDATE usage_used += 1 in this table.
--     All three steps happen in the same transaction as the player grant.
-- • At rollover boundary: the usage-reset scheduler sets usage_used = 0
--   and reset_at = start of the new period window.
-- • reset_at records when the current period started; the scheduler uses it
--   to detect whether a rollover has already been applied for this window.
--
-- PERIOD TYPES
-- ────────────
-- HOURLY  — resets at the top of each clock hour
-- DAILY   — resets at midnight each calendar day
-- WEEKLY  — resets at Monday midnight (ISO week)
-- MONTHLY — resets on the 1st of each calendar month
--
-- =============================================================================

CREATE TABLE `bonus_code_usage` (
    `id`          INT         NOT NULL AUTO_INCREMENT,
    `code_id`     INT         NOT NULL,
    -- references bonus_configure_code.id
    `site_id`     INT         NOT NULL,
    `period_type` VARCHAR(10) NOT NULL,
    -- HOURLY | DAILY | WEEKLY | MONTHLY
    `usage_used`  INT         NOT NULL DEFAULT 0,
    `reset_at`    DATETIME    DEFAULT NULL,
    -- start of the current period window; set by the reset scheduler
    `updated_at`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code_usage`         (`code_id`, `period_type`),
    KEY `idx_code_usage_code_id`       (`code_id`),
    KEY `idx_code_usage_site`          (`site_id`),
    KEY `idx_code_usage_reset`         (`period_type`, `reset_at`)
);

-- -----------------------------------------------------------------------------
-- Sample data  (as of 2026-05-12 14:xx)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_code_usage`
    (`code_id`, `site_id`, `period_type`, `usage_used`, `reset_at`)
VALUES
    -- code_id=1 (WELCOME100)
    (1, 1, 'HOURLY',    0,    '2026-05-12 14:00:00'),
    (1, 1, 'DAILY',    42,    '2026-05-12 00:00:00'),
    (1, 1, 'WEEKLY',  294,    '2026-05-11 00:00:00'),
    (1, 1, 'MONTHLY', 1176,   '2026-05-01 00:00:00'),

    -- code_id=2 (INFLUENCER50)
    (2, 1, 'HOURLY',   3,     '2026-05-12 14:00:00'),
    (2, 1, 'DAILY',   18,     '2026-05-12 00:00:00'),
    (2, 1, 'WEEKLY',  90,     '2026-05-11 00:00:00'),
    (2, 1, 'MONTHLY', 360,    '2026-05-01 00:00:00'),

    -- code_id=3 (VIP2026)
    (3, 1, 'HOURLY',   0,     '2026-05-12 14:00:00'),
    (3, 1, 'DAILY',    5,     '2026-05-12 00:00:00'),
    (3, 1, 'WEEKLY',  35,     '2026-05-11 00:00:00'),
    (3, 1, 'MONTHLY', 140,    '2026-05-01 00:00:00'),

    -- code_id=4 (WEEKEND500)
    (4, 1, 'HOURLY',   0,     '2026-05-12 14:00:00'),
    (4, 1, 'DAILY',   31,     '2026-05-12 00:00:00'),
    (4, 1, 'WEEKLY',  155,    '2026-05-11 00:00:00'),
    (4, 1, 'MONTHLY', 620,    '2026-05-01 00:00:00');
