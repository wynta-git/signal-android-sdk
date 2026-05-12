-- =============================================================================
-- TABLE: bonus_budget_usage
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Runtime counter table. Tracks how much budget has been spent for each
-- (entity_type, entity_id, period_type) combination within the current period.
--
-- Separated from bonus_budget_limit so that high-frequency grant writes never
-- contend with operator reads/writes on the configuration table.
--
-- USAGE
-- ─────
-- • One row per (entity_type, entity_id, period_type) — mirrors bonus_budget_limit.
-- • At grant time:
--     1. JOIN to bonus_budget_limit to get the cap.
--     2. Check: budget_used + grant_amount <= budget_limit (or limit IS NULL).
--     3. On success: UPDATE budget_used += grant_amount in this table.
--     All three steps happen in the same transaction.
-- • At rollover boundary: the budget-reset scheduler sets budget_used = 0
--   and reset_at = next boundary timestamp.
-- • reset_at records when the current period started; used by the scheduler
--   to detect whether a rollover has already been applied.
--
-- PERIOD TYPES
-- ────────────
-- DAILY   — resets at midnight each calendar day
-- WEEKLY  — resets at Monday midnight (ISO week)
-- MONTHLY — resets on the 1st of each calendar month
--
-- ENTITY TYPES
-- ────────────
-- HEAD      → entity_id references bonus_head.id
-- SUBHEAD   → entity_id references bonus_subhead.id
-- CONFIGURE → entity_id references bonus_configure.id
--
-- =============================================================================

CREATE TABLE `bonus_budget_usage` (
    `id`           INT           NOT NULL AUTO_INCREMENT,
    `entity_type`  VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE
    `entity_id`    INT           NOT NULL,
    `site_id`      INT           NOT NULL,
    `period_type`  VARCHAR(10)   NOT NULL,
    -- DAILY | WEEKLY | MONTHLY
    `budget_used`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `reset_at`     DATETIME      DEFAULT NULL,
    -- start of the current period window; set by the reset scheduler
    `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_budget_usage`       (`entity_type`, `entity_id`, `period_type`),
    KEY `idx_budget_usage_entity`      (`entity_type`, `entity_id`),
    KEY `idx_budget_usage_site`        (`site_id`),
    KEY `idx_budget_usage_reset`       (`period_type`, `reset_at`)
);

-- -----------------------------------------------------------------------------
-- Sample data  (as of 2026-05-12)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_budget_usage`
    (`entity_type`, `entity_id`, `site_id`, `period_type`, `budget_used`, `reset_at`)
VALUES
    -- bonus_head id=1 (Welcome)
    ('HEAD', 1, 1, 'DAILY',    12400.00, '2026-05-12 00:00:00'),
    ('HEAD', 1, 1, 'WEEKLY',   87600.00, '2026-05-11 00:00:00'),
    ('HEAD', 1, 1, 'MONTHLY', 312000.00, '2026-05-01 00:00:00'),

    -- bonus_head id=2 (Reload)
    ('HEAD', 2, 1, 'DAILY',    8200.00, '2026-05-12 00:00:00'),
    ('HEAD', 2, 1, 'WEEKLY',  41000.00, '2026-05-11 00:00:00'),
    ('HEAD', 2, 1, 'MONTHLY',164000.00, '2026-05-01 00:00:00'),

    -- bonus_head id=3 (Cashback)
    ('HEAD', 3, 1, 'DAILY',      0.00, '2026-05-12 00:00:00'),
    ('HEAD', 3, 1, 'WEEKLY',     0.00, '2026-05-11 00:00:00'),
    ('HEAD', 3, 1, 'MONTHLY', 95000.00,'2026-05-01 00:00:00'),

    -- bonus_subhead id=1 (First Deposit)
    ('SUBHEAD', 1, 1, 'DAILY',    8000.00, '2026-05-12 00:00:00'),
    ('SUBHEAD', 1, 1, 'WEEKLY',  56000.00, '2026-05-11 00:00:00'),
    ('SUBHEAD', 1, 1, 'MONTHLY',224000.00, '2026-05-01 00:00:00'),

    -- bonus_subhead id=3 (Weekend Reload)
    ('SUBHEAD', 3, 1, 'DAILY',    5100.00, '2026-05-12 00:00:00'),
    ('SUBHEAD', 3, 1, 'WEEKLY',  25500.00, '2026-05-11 00:00:00'),
    ('SUBHEAD', 3, 1, 'MONTHLY',102000.00, '2026-05-01 00:00:00'),

    -- bonus_configure id=1
    ('CONFIGURE', 1, 1, 'DAILY',   3000.00, '2026-05-12 00:00:00'),
    ('CONFIGURE', 1, 1, 'WEEKLY', 21000.00, '2026-05-11 00:00:00'),
    ('CONFIGURE', 1, 1, 'MONTHLY',84000.00, '2026-05-01 00:00:00'),

    -- bonus_configure id=2 (VIP)
    ('CONFIGURE', 2, 1, 'DAILY',    2000.00, '2026-05-12 00:00:00'),
    ('CONFIGURE', 2, 1, 'WEEKLY',  14000.00, '2026-05-11 00:00:00'),
    ('CONFIGURE', 2, 1, 'MONTHLY', 56000.00, '2026-05-01 00:00:00'),

    -- bonus_configure id=3 (Weekend Flat)
    ('CONFIGURE', 3, 1, 'DAILY',   2500.00, '2026-05-12 00:00:00'),
    ('CONFIGURE', 3, 1, 'WEEKLY', 12500.00, '2026-05-11 00:00:00'),
    ('CONFIGURE', 3, 1, 'MONTHLY',50000.00, '2026-05-01 00:00:00');
