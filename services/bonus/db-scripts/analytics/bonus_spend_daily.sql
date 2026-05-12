-- =============================================================================
-- TABLE: bonus_spend_daily
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Aggregated bonus spend per calendar day across every level of the hierarchy.
-- One row per (entity_type, entity_id, spend_date).
--
-- USAGE
-- ─────
-- • Written via INSERT … ON DUPLICATE KEY UPDATE inside the same transaction
--   as the player grant — no separate aggregation job required.
-- • On each grant, one row is upserted for each ancestor in the chain:
--     CODE (if used) → CONFIGURE → SUBHEAD → HEAD
-- • grant_count tracks number of grants; total_amount tracks spend in currency.
-- • New spend_date rows start at 0 automatically — no explicit reset needed.
-- • Used by:
--     – Real-time budget dashboards showing today's burn per head / code.
--     – Alerting when daily spend crosses a threshold.
--     – Day-over-day trend reports.
--
-- ENTITY TYPES
-- ────────────
-- HEAD      → entity_id references bonus_head.id
-- SUBHEAD   → entity_id references bonus_subhead.id
-- CONFIGURE → entity_id references bonus_configure.id
-- CODE      → entity_id references bonus_configure_code.id
--
-- =============================================================================

CREATE TABLE `bonus_spend_daily` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_type`   VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE | CODE
    `entity_id`     INT           NOT NULL,
    `site_id`       INT           NOT NULL,
    `spend_date`    DATE          NOT NULL,
    `grant_count`   INT           NOT NULL DEFAULT 0,
    `total_amount`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_spend_daily`         (`entity_type`, `entity_id`, `spend_date`),
    KEY `idx_spend_daily_site_date`     (`site_id`, `spend_date`),
    KEY `idx_spend_daily_entity`        (`entity_type`, `entity_id`, `spend_date`)
);

-- -----------------------------------------------------------------------------
-- Sample data  (2026-05-12)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_spend_daily`
    (`entity_type`, `entity_id`, `site_id`, `spend_date`, `grant_count`, `total_amount`)
VALUES
    -- HEAD level
    ('HEAD',      1, 1, '2026-05-12',  2,  7500.00),  -- Welcome head
    ('HEAD',      2, 1, '2026-05-12',  1,   500.00),  -- Reload head

    -- SUBHEAD level
    ('SUBHEAD',   1, 1, '2026-05-12',  2,  7500.00),  -- First Deposit
    ('SUBHEAD',   3, 1, '2026-05-12',  1,   500.00),  -- Weekend Reload

    -- CONFIGURE level
    ('CONFIGURE', 1, 1, '2026-05-12',  1,  2500.00),  -- 100% First Deposit up to 5000
    ('CONFIGURE', 2, 1, '2026-05-12',  1,  5000.00),  -- VIP variant
    ('CONFIGURE', 3, 1, '2026-05-12',  1,   500.00),  -- Weekend Reload Flat 500

    -- CODE level
    ('CODE',      1, 1, '2026-05-12',  1,  2500.00),  -- WELCOME100
    ('CODE',      3, 1, '2026-05-12',  1,  5000.00),  -- VIP2026
    ('CODE',      4, 1, '2026-05-12',  1,   500.00);  -- WEEKEND500
