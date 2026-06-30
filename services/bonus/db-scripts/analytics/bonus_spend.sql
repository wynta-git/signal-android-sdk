-- =============================================================================
-- TABLE: bonus_spend
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Consolidated analytics table for bonus consumption spend across all period
-- granularities (DAILY / WEEKLY / MONTHLY). Replaces the three separate tables
-- bonus_spend_daily, bonus_spend_weekly, and bonus_spend_monthly.
--
-- One row per (entity_type, entity_id, period_type, period_start).
--
-- USAGE
-- ─────
-- Written via INSERT … ON DUPLICATE KEY UPDATE inside the same transaction as
-- consume_bonus() — no separate aggregation job required.
-- On each consume event, one row is upserted for each ancestor in the chain:
--     CONFIGURE → SUBHEAD → HEAD
-- consume_count tracks number of consume events; total_amount tracks consumed
-- balance in currency units.
--
-- period_start / period_end are computed in the site's configured timezone
-- (site_configure.config_key = 'timezone'; default: Asia/Kolkata).
--
-- PERIOD BOUNDS
-- ─────────────
-- DAILY   : period_start = period_end = the consume date
-- WEEKLY  : period_start = Monday of ISO week; period_end = Sunday
-- MONTHLY : period_start = 1st of month;  period_end = last day of month
--
-- ENTITY TYPES
-- ────────────
-- HEAD      → entity_id references bonus_head.id
-- SUBHEAD   → entity_id references bonus_subhead.id
-- CONFIGURE → entity_id references bonus_configure.id
--
-- =============================================================================

CREATE TABLE `bonus_spend` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_type`   VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE
    `entity_id`     INT           NOT NULL,
    `site_id`       INT           NOT NULL,
    `period_type`   VARCHAR(10)   NOT NULL,
    -- DAILY | WEEKLY | MONTHLY
    `period_start`  DATE          NOT NULL,
    -- day / ISO Monday / first-of-month  (site-local timezone)
    `period_end`    DATE          NOT NULL,
    -- same day / Sunday / last-of-month  (site-local timezone)
    `consume_count` INT           NOT NULL DEFAULT 0,
    `total_amount`  DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_spend`        (`entity_type`, `entity_id`, `period_type`, `period_start`),
    KEY `idx_bonus_spend_site`         (`site_id`, `period_type`, `period_start`),
    KEY `idx_bonus_spend_entity`       (`entity_type`, `entity_id`, `period_type`, `period_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
