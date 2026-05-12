-- =============================================================================
-- BONUS CONFIGURE SCHEMA  —  STATE 1: CONFIGURE BONUS
-- =============================================================================
--
-- PURPOSE
-- ───────
-- Defines the three-level hierarchy used to organise and budget-control bonus
-- campaigns before any player grant occurs:
--
--   bonus_head          Top-level category  (e.g. "Welcome", "Reload", "Cashback")
--     └─ bonus_subhead  Sub-category        (e.g. "First Deposit", "Weekend Reload")
--          └─ bonus_configure  Leaf configuration — links to a bonus campaign
--                              template (userapp_bonus_configuration) and carries
--                              the final grant parameters for this node.
--
-- BUDGET LIMITS
-- ─────────────
-- Each level (head, subhead, configure) stores three independent spend caps:
--   daily_budget_limit   — maximum total bonus amount grantable within one day
--   weekly_budget_limit  — maximum within any rolling 7-day window
--   monthly_budget_limit — maximum within the current calendar month
--
-- The corresponding *_budget_used columns are maintained by the application at
-- grant time (incremented) and by the budget-reset job (zeroed on rollover).
-- NULL on any limit means uncapped at that level.
--
-- A grant is allowed only when EVERY ancestor in the chain is within budget:
--   bonus_configure → bonus_subhead → bonus_head
--
-- TABLE MAP
-- ─────────
--   bonus_head         Top-level budget category
--   bonus_subhead      Mid-level category under a head
--   bonus_configure    Leaf bonus node (links to userapp_bonus_configuration)
--
-- KEY RELATIONSHIPS  (no FK constraints; application enforces integrity)
-- ──────────────────────────────────────────────────────────────────────
--   bonus_head.id       ← bonus_subhead.head_id
--   bonus_subhead.id    ← bonus_configure.subhead_id
--   userapp_bonus_configuration.id  ← bonus_configure.configuration_id
--
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- Top-level bonus category.
-- Groups related sub-categories under a single spend umbrella.
--
-- daily_budget_limit    : NULL = uncapped. Sum of all grants under this head
--                         in a single day must not exceed this value.
-- weekly_budget_limit   : rolling 7-day cap.
-- monthly_budget_limit  : calendar-month cap.
-- *_budget_used         : running totals maintained by the application;
--                         reset by the budget-rollover scheduler.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE `
` (
    `id`                    INT            NOT NULL AUTO_INCREMENT,
    `site_id`               INT            NOT NULL,
    `name`                  VARCHAR(100)   NOT NULL,
    `description`           VARCHAR(500)   DEFAULT NULL,
    `daily_budget_limit`    DECIMAL(18,2)  DEFAULT NULL,
    `weekly_budget_limit`   DECIMAL(18,2)  DEFAULT NULL,
    `monthly_budget_limit`  DECIMAL(18,2)  DEFAULT NULL,
    `daily_budget_used`     DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    `weekly_budget_used`    DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    `monthly_budget_used`   DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    `daily_reset_at`        DATETIME       DEFAULT NULL,
    `weekly_reset_at`       DATETIME       DEFAULT NULL,
    `monthly_reset_at`      DATETIME       DEFAULT NULL,
    `active`                TINYINT(1)     NOT NULL DEFAULT 1,
    `created_at`            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                           ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_head_site_name`  (`site_id`, `name`),
    KEY `idx_bonus_head_site_id`          (`site_id`),
    KEY `idx_bonus_head_active`           (`active`)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- Mid-level bonus sub-category, nested under a head.
-- Budget limits here are additive constraints — the subhead cap is checked first,
-- then the parent head cap.  A grant fails if either is exceeded.
--
-- head_id : references bonus_head.id
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE `bonus_subhead` (
    `id`                    INT            NOT NULL AUTO_INCREMENT,
    `head_id`               INT            NOT NULL,
    -- references bonus_head.id
    `site_id`               INT            NOT NULL,
    `name`                  VARCHAR(100)   NOT NULL,
    `description`           VARCHAR(500)   DEFAULT NULL,
    `daily_budget_limit`    DECIMAL(18,2)  DEFAULT NULL,
    `weekly_budget_limit`   DECIMAL(18,2)  DEFAULT NULL,
    `monthly_budget_limit`  DECIMAL(18,2)  DEFAULT NULL,
    `daily_budget_used`     DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    `weekly_budget_used`    DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    `monthly_budget_used`   DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    `daily_reset_at`        DATETIME       DEFAULT NULL,
    `weekly_reset_at`       DATETIME       DEFAULT NULL,
    `monthly_reset_at`      DATETIME       DEFAULT NULL,
    `active`                TINYINT(1)     NOT NULL DEFAULT 1,
    `created_at`            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                           ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_subhead_head_name`  (`head_id`, `name`),
    KEY `idx_bonus_subhead_head_id`          (`head_id`),
    KEY `idx_bonus_subhead_site_id`          (`site_id`),
    KEY `idx_bonus_subhead_active`           (`active`)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- Leaf-level bonus configuration node.
-- Binds a sub-category to a specific bonus campaign template
-- (userapp_bonus_configuration) and adds its own tier of budget controls.
--
-- subhead_id       : references bonus_subhead.id
-- configuration_id : references userapp_bonus_configuration.id
--                    The linked template supplies bonus_type, wager_multiplier,
--                    chunk config, etc.  Snapshotted at grant time into
--                    userapp_player_bonus so changes here do not affect live grants.
--
-- bonus_amount_default : default grant amount when no dynamic amount is supplied
--                        by the trigger (e.g. fixed campaign value).
-- bonus_amount_max     : hard cap on the grant amount regardless of trigger input.
--
-- Budget limit/used columns follow the same pattern as bonus_head / bonus_subhead.
-- All three levels are checked in order (configure → subhead → head) before a
-- grant is written to userapp_player_bonus.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE `bonus_configure` (
    `id`                    INT            NOT NULL AUTO_INCREMENT,
    `subhead_id`            INT            NOT NULL,
    -- references bonus_subhead.id
    `configuration_id`      INT            NOT NULL,
    -- references userapp_bonus_configuration.id
    `site_id`               INT            NOT NULL,
    `name`                  VARCHAR(100)   NOT NULL,
    `description`           VARCHAR(500)   DEFAULT NULL,
    `bonus_amount_default`  DECIMAL(18,2)  DEFAULT NULL,
    `bonus_amount_max`      DECIMAL(18,2)  DEFAULT NULL,
    `daily_budget_limit`    DECIMAL(18,2)  DEFAULT NULL,
    `weekly_budget_limit`   DECIMAL(18,2)  DEFAULT NULL,
    `monthly_budget_limit`  DECIMAL(18,2)  DEFAULT NULL,
    `daily_budget_used`     DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    `weekly_budget_used`    DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    `monthly_budget_used`   DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
    `daily_reset_at`        DATETIME       DEFAULT NULL,
    `weekly_reset_at`       DATETIME       DEFAULT NULL,
    `monthly_reset_at`      DATETIME       DEFAULT NULL,
    `priority`              INT            NOT NULL DEFAULT 0,
    -- lower value = higher priority when multiple nodes match
    `active`                TINYINT(1)     NOT NULL DEFAULT 1,
    `created_at`            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                           ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_configure_subhead_config` (`subhead_id`, `configuration_id`),
    KEY `idx_bonus_configure_subhead_id`      (`subhead_id`),
    KEY `idx_bonus_configure_configuration_id`(`configuration_id`),
    KEY `idx_bonus_configure_site_id`         (`site_id`),
    KEY `idx_bonus_configure_active`          (`active`),
    KEY `idx_bonus_configure_priority`        (`subhead_id`, `active`, `priority`)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- Budget grant log — one row per player bonus grant, recording which configure
-- node was used and how much budget was consumed at each level of the hierarchy.
--
-- Written atomically with userapp_player_bonus at grant time.
-- Used by:
--   • The budget-rollover scheduler to verify reset safety.
--   • Ops dashboards to show budget burn rate per head / subhead / configure.
--   • Replay / reconciliation jobs (idempotency via player_bonus_id).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE `bonus_budget_grant_log` (
    `id`                BIGINT        NOT NULL AUTO_INCREMENT,
    `player_bonus_id`   BIGINT        NOT NULL,
    -- references userapp_player_bonus.id; unique — one log entry per grant
    `configure_id`      INT           NOT NULL,
    -- references bonus_configure.id
    `subhead_id`        INT           NOT NULL,
    -- references bonus_subhead.id
    `head_id`           INT           NOT NULL,
    -- references bonus_head.id
    `site_id`           INT           NOT NULL,
    `player_id`         VARCHAR(50)   NOT NULL,
    `grant_amount`      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_budget_grant_player_bonus_id` (`player_bonus_id`),
    KEY `idx_budget_grant_configure_id` (`configure_id`),
    KEY `idx_budget_grant_subhead_id`   (`subhead_id`),
    KEY `idx_budget_grant_head_id`      (`head_id`),
    KEY `idx_budget_grant_player_id`    (`player_id`),
    KEY `idx_budget_grant_site_date`    (`site_id`, `created_at`)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- Bonus codes attached to a configure node.
-- One bonus_configure can have many codes; each code has its own usage caps and
-- optional grant-amount override.
--
-- code               : Player-facing promo code string (e.g. "WELCOME100").
--                      Unique per site — two configure nodes on the same site
--                      cannot share a code.
-- max_amount         : Hard cap on the grant amount when this code is applied.
--                      Overrides bonus_configure.bonus_amount_max if set.
--                      NULL = use the configure-level cap.
-- valid_from/valid_to: Optional validity window independent of the parent
--                      configure node's active flag.  NULL = always valid while
--                      active = 1.
--
-- Usage limits (NULL = uncapped at that interval):
--   hourly_usage_limit   — max redemptions within any 60-minute window
--   daily_usage_limit    — max redemptions per calendar day
--   weekly_usage_limit   — max redemptions per rolling 7-day window
--   monthly_usage_limit  — max redemptions per calendar month
--
-- *_usage_used columns are incremented at each redemption and zeroed by the
-- usage-reset scheduler at the appropriate rollover boundary (*_reset_at).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE `bonus_configure_code` (
    `id`                     INT            NOT NULL AUTO_INCREMENT,
    `configure_id`           INT            NOT NULL,
    -- references bonus_configure.id
    `site_id`                INT            NOT NULL,
    `code`                   VARCHAR(50)    NOT NULL,
    `max_amount`             DECIMAL(18,2)  DEFAULT NULL,
    -- per-redemption grant cap; NULL = defer to configure node
    `valid_from`             DATETIME       DEFAULT NULL,
    `valid_to`               DATETIME       DEFAULT NULL,
    `hourly_usage_limit`     INT            DEFAULT NULL,
    `hourly_usage_used`      INT            NOT NULL DEFAULT 0,
    `hourly_reset_at`        DATETIME       DEFAULT NULL,
    `daily_usage_limit`      INT            DEFAULT NULL,
    `daily_usage_used`       INT            NOT NULL DEFAULT 0,
    `daily_reset_at`         DATETIME       DEFAULT NULL,
    `weekly_usage_limit`     INT            DEFAULT NULL,
    `weekly_usage_used`      INT            NOT NULL DEFAULT 0,
    `weekly_reset_at`        DATETIME       DEFAULT NULL,
    `monthly_usage_limit`    INT            DEFAULT NULL,
    `monthly_usage_used`     INT            NOT NULL DEFAULT 0,
    `monthly_reset_at`       DATETIME       DEFAULT NULL,
    `active`                 TINYINT(1)     NOT NULL DEFAULT 1,
    `created_at`             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                            ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_code_site`              (`site_id`, `code`),
    KEY `idx_bonus_code_configure_id`            (`configure_id`),
    KEY `idx_bonus_code_active`                  (`site_id`, `active`),
    KEY `idx_bonus_code_validity`                (`valid_from`, `valid_to`)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- Bonus code redemption log — one row per player grant that used a code.
-- Written atomically with userapp_player_bonus and bonus_budget_grant_log.
--
-- Drives:
--   • Usage counters (*_usage_used) on bonus_configure_code.
--   • Audit trail for "which code did this player use and when".
--   • Idempotency: unique on (code_id, player_bonus_id).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE `bonus_code_redemption_log` (
    `id`                BIGINT        NOT NULL AUTO_INCREMENT,
    `code_id`           INT           NOT NULL,
    -- references bonus_configure_code.id
    `player_bonus_id`   BIGINT        NOT NULL,
    -- references userapp_player_bonus.id
    `configure_id`      INT           NOT NULL,
    -- references bonus_configure.id (denormalised for fast reporting)
    `site_id`           INT           NOT NULL,
    `player_id`         VARCHAR(50)   NOT NULL,
    `grant_amount`      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code_redemption`              (`code_id`, `player_bonus_id`),
    KEY `idx_code_redemption_code_id`            (`code_id`),
    KEY `idx_code_redemption_player_bonus_id`    (`player_bonus_id`),
    KEY `idx_code_redemption_player_id`          (`player_id`),
    KEY `idx_code_redemption_configure_id`       (`configure_id`),
    KEY `idx_code_redemption_site_date`          (`site_id`, `created_at`)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- Per-wager bonus release attribution — one row per wager that contributed
-- toward releasing a chunk, capturing how much of the chunk's bonus amount
-- that individual wager unlocked.
--
-- ATTRIBUTION MODEL
-- ─────────────────
-- release_attributed = chunk_amount × (wager_amount / wager_required)
--
-- One row is written per qualifying wager as bets come in. The sum of
-- release_attributed for all rows on a chunk equals that chunk's chunk_amount
-- once fully wagered.
--
-- bonus_release_id is NULL until the chunk releases; back-filled at release
-- time so every contributing wager row links to the release event.
--
-- chunk_wager_id    : references userapp_bonus_chunk_wager.id (unique — one row per wager)
-- bonus_release_id  : references userapp_bonus_release.id; NULL until chunk releases
-- wager_amount      : qualifying portion of the bet (mirrors chunk_wager.amount)
-- release_attributed: bonus value unlocked by this wager
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE `userapp_bonus_chunk_release_wager` (
    `id`                  BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_wager_id`      BIGINT        NOT NULL,
    -- references userapp_bonus_chunk_wager.id
    `bonus_chunk_id`      BIGINT        NOT NULL,
    -- references userapp_bonus_chunk.id
    `player_bonus_id`     BIGINT        NOT NULL,
    -- references userapp_player_bonus.id
    `bonus_release_id`    BIGINT        DEFAULT NULL,
    -- references userapp_bonus_release.id; NULL until chunk releases
    `player_id`           VARCHAR(50)   NOT NULL,
    `wager_id`            VARCHAR(50)   NOT NULL,
    -- external wager reference (mirrors userapp_bonus_chunk_wager.wager_id)
    `wager_amount`        DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `release_attributed`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- wager_amount / wager_required × chunk_amount
    `created_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_chunk_release_wager`              (`chunk_wager_id`),
    KEY `idx_chunk_release_wager_chunk_id`           (`bonus_chunk_id`),
    KEY `idx_chunk_release_wager_player_bonus_id`    (`player_bonus_id`),
    KEY `idx_chunk_release_wager_release_id`         (`bonus_release_id`),
    KEY `idx_chunk_release_wager_player_id`          (`player_id`)
);


-- =============================================================================
-- AGGREGATED SPEND TABLES
-- =============================================================================
--
-- Three tables — one per period granularity — track cumulative bonus spend
-- across every level of the hierarchy: HEAD, SUBHEAD, CONFIGURE, and CODE.
--
-- WHY THREE TABLES INSTEAD OF ONE
-- ────────────────────────────────
-- Separate tables avoid a mixed-granularity unique key and keep each table's
-- rows uniform (daily rows are DATE, weekly rows carry a week_start DATE and
-- week_end DATE, monthly rows carry a year+month).  Queries never need to
-- filter on period_type, and the planner can use the full index on each table.
--
-- ENTITY TYPES  (entity_type column)
-- ────────────────────────────────────
--   HEAD       — bonus_head.id
--   SUBHEAD    — bonus_subhead.id
--   CONFIGURE  — bonus_configure.id
--   CODE       — bonus_configure_code.id
--
-- WRITE PATTERN
-- ─────────────
-- On every grant, the application does an INSERT … ON DUPLICATE KEY UPDATE
-- into all three tables for each ancestor in the chain:
--   CODE row (if a code was used) → CONFIGURE row → SUBHEAD row → HEAD row
-- This keeps the aggregates eventually consistent with zero separate batch jobs.
--
-- READS
-- ─────
-- Head-wise total spend this month:
--   SELECT * FROM bonus_spend_monthly
--    WHERE entity_type = 'HEAD' AND spend_year = 2026 AND spend_month = 5;
--
-- Code-wise total spend today:
--   SELECT * FROM bonus_spend_daily
--    WHERE entity_type = 'CODE' AND spend_date = CURDATE();
--
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- Daily spend aggregation — one row per (entity_type, entity_id, spend_date).
-- Reset is implicit: a new spend_date row starts at 0 automatically.
-- ─────────────────────────────────────────────────────────────────────────────
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
    UNIQUE KEY `uk_spend_daily`              (`entity_type`, `entity_id`, `spend_date`),
    KEY `idx_spend_daily_site_date`          (`site_id`, `spend_date`),
    KEY `idx_spend_daily_entity`             (`entity_type`, `entity_id`, `spend_date`)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- Weekly spend aggregation — one row per (entity_type, entity_id, week_start).
-- week_start is the Monday of the ISO week; week_end is the following Sunday.
-- ─────────────────────────────────────────────────────────────────────────────
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
    UNIQUE KEY `uk_spend_weekly`             (`entity_type`, `entity_id`, `week_start`),
    KEY `idx_spend_weekly_site_week`         (`site_id`, `week_start`),
    KEY `idx_spend_weekly_entity`            (`entity_type`, `entity_id`, `week_start`)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- Monthly spend aggregation — one row per (entity_type, entity_id, year, month).
-- spend_year + spend_month avoids DATE arithmetic and is trivially groupable.
-- ─────────────────────────────────────────────────────────────────────────────
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
    UNIQUE KEY `uk_spend_monthly`            (`entity_type`, `entity_id`, `spend_year`, `spend_month`),
    KEY `idx_spend_monthly_site_period`      (`site_id`, `spend_year`, `spend_month`),
    KEY `idx_spend_monthly_entity`           (`entity_type`, `entity_id`, `spend_year`, `spend_month`)
);
