-- =============================================================================
-- TABLE: bonus_spend_weekly
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Aggregated bonus spend per ISO week (Monday–Sunday) across every level of
-- the hierarchy. One row per (entity_type, entity_id, week_start).
--
-- USAGE
-- ─────
-- • Written via INSERT … ON DUPLICATE KEY UPDATE inside the same transaction
--   as the player grant — no separate aggregation job required.
-- • week_start is always the Monday of the ISO week containing the grant date.
--   week_end = week_start + 6 days (Sunday).
-- • On each grant, one row is upserted per ancestor: CODE → CONFIGURE → SUBHEAD → HEAD.
-- • Used by:
--     – Weekly budget cap enforcement: compare total_amount to the weekly_budget_limit
--       on bonus_head / bonus_subhead / bonus_configure.
--     – Weekly performance reports and week-over-week comparisons.
--     – Alerting when weekly spend exceeds a configured threshold.
--
-- ENTITY TYPES
-- ────────────
-- HEAD      → entity_id references bonus_head.id
-- SUBHEAD   → entity_id references bonus_subhead.id
-- CONFIGURE → entity_id references bonus_configure.id
-- CODE      → entity_id references bonus_configure_code.id
--
-- =============================================================================

CREATE TABLE `bonus_spend_weekly` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_type`   VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE | CODE
    `entity_id`     INT           NOT NULL,
    `site_id`       INT           NOT NULL,
    `week_start`    DATE          NOT NULL,
    -- Monday of the ISO week
    `week_end`      DATE          NOT NULL,
    -- Sunday of the ISO week (week_start + 6 days)
    `grant_count`   INT           NOT NULL DEFAULT 0,
    `total_amount`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_spend_weekly`        (`entity_type`, `entity_id`, `week_start`),
    KEY `idx_spend_weekly_site_week`    (`site_id`, `week_start`),
    KEY `idx_spend_weekly_entity`       (`entity_type`, `entity_id`, `week_start`)
);

-- -----------------------------------------------------------------------------
-- Sample data  (week of 2026-05-11 Mon – 2026-05-17 Sun)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_spend_weekly`
    (`entity_type`, `entity_id`, `site_id`, `week_start`, `week_end`, `grant_count`, `total_amount`)
VALUES
    -- HEAD level
    ('HEAD',      1, 1, '2026-05-11', '2026-05-17',  5, 19300.00),  -- Welcome
    ('HEAD',      2, 1, '2026-05-11', '2026-05-17',  3,  1500.00),  -- Reload

    -- SUBHEAD level
    ('SUBHEAD',   1, 1, '2026-05-11', '2026-05-17',  5, 19300.00),  -- First Deposit
    ('SUBHEAD',   3, 1, '2026-05-11', '2026-05-17',  3,  1500.00),  -- Weekend Reload

    -- CONFIGURE level
    ('CONFIGURE', 1, 1, '2026-05-11', '2026-05-17',  3,  9800.00),
    ('CONFIGURE', 2, 1, '2026-05-11', '2026-05-17',  2,  9500.00),  -- VIP variant  (20k cap applied once)
    ('CONFIGURE', 3, 1, '2026-05-11', '2026-05-17',  3,  1500.00),

    -- CODE level
    ('CODE',      1, 1, '2026-05-11', '2026-05-17',  3,  9800.00),  -- WELCOME100
    ('CODE',      3, 1, '2026-05-11', '2026-05-17',  2,  9500.00),  -- VIP2026
    ('CODE',      4, 1, '2026-05-11', '2026-05-17',  3,  1500.00);  -- WEEKEND500
