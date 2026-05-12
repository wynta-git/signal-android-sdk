-- =============================================================================
-- TABLE: bonus_spend_monthly
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Aggregated bonus spend per calendar month across every level of the hierarchy.
-- One row per (entity_type, entity_id, spend_year, spend_month).
--
-- USAGE
-- ─────
-- • Written via INSERT … ON DUPLICATE KEY UPDATE inside the same transaction
--   as the player grant — no separate aggregation job required.
-- • spend_year + spend_month are stored as integers (not a DATE) to avoid
--   DATE arithmetic in queries and to make GROUP BY trivially readable.
-- • On each grant, one row is upserted per ancestor: CODE → CONFIGURE → SUBHEAD → HEAD.
-- • Used by:
--     – Monthly budget cap enforcement: compare total_amount to monthly_budget_limit.
--     – Month-over-month finance reports and bonus P&L tracking.
--     – Audit: verify monthly totals match the sum of bonus_budget_grant_log
--       rows for the same period.
--
-- ENTITY TYPES
-- ────────────
-- HEAD      → entity_id references bonus_head.id
-- SUBHEAD   → entity_id references bonus_subhead.id
-- CONFIGURE → entity_id references bonus_configure.id
-- CODE      → entity_id references bonus_configure_code.id
--
-- =============================================================================

CREATE TABLE `bonus_spend_monthly` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_type`   VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE | CODE
    `entity_id`     INT           NOT NULL,
    `site_id`       INT           NOT NULL,
    `spend_year`    SMALLINT      NOT NULL,
    `spend_month`   TINYINT       NOT NULL,
    -- 1–12
    `grant_count`   INT           NOT NULL DEFAULT 0,
    `total_amount`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_spend_monthly`           (`entity_type`, `entity_id`, `spend_year`, `spend_month`),
    KEY `idx_spend_monthly_site_period`     (`site_id`, `spend_year`, `spend_month`),
    KEY `idx_spend_monthly_entity`          (`entity_type`, `entity_id`, `spend_year`, `spend_month`)
);

-- -----------------------------------------------------------------------------
-- Sample data  (May 2026)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_spend_monthly`
    (`entity_type`, `entity_id`, `site_id`, `spend_year`, `spend_month`, `grant_count`, `total_amount`)
VALUES
    -- HEAD level
    ('HEAD',      1, 1, 2026, 5,  312,  312000.00),  -- Welcome: 312 grants, ₹3.12L
    ('HEAD',      2, 1, 2026, 5,  204,  102000.00),  -- Reload
    ('HEAD',      3, 1, 2026, 5,   95,   95000.00),  -- Cashback

    -- SUBHEAD level
    ('SUBHEAD',   1, 1, 2026, 5,  224,  224000.00),  -- First Deposit
    ('SUBHEAD',   2, 1, 2026, 5,   88,   88000.00),  -- Second Deposit
    ('SUBHEAD',   3, 1, 2026, 5,  124,   62000.00),  -- Weekend Reload
    ('SUBHEAD',   4, 1, 2026, 5,   80,   40000.00),  -- Midweek Reload

    -- CONFIGURE level
    ('CONFIGURE', 1, 1, 2026, 5,  134,   84000.00),  -- 100% up to 5000
    ('CONFIGURE', 2, 1, 2026, 5,   90,  140000.00),  -- VIP up to 20000
    ('CONFIGURE', 3, 1, 2026, 5,  124,   62000.00),  -- Weekend Flat 500

    -- CODE level
    ('CODE',      1, 1, 2026, 5,  134,   84000.00),  -- WELCOME100
    ('CODE',      2, 1, 2026, 5,    8,   18000.00),  -- INFLUENCER50
    ('CODE',      3, 1, 2026, 5,   82,  122000.00),  -- VIP2026
    ('CODE',      4, 1, 2026, 5,  124,   62000.00);  -- WEEKEND500
