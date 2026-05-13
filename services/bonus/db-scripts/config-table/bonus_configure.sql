-- =============================================================================
-- TABLE: bonus_configure
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Leaf-level configuration node in the bonus hierarchy. Binds a bonus_subhead
-- to a specific bonus campaign and carries the full mechanics configuration
-- for how the bonus behaves when granted to a player.
--
-- COLUMN GROUPS
-- ─────────────
-- Identity        : id, subhead_id, site_id, name, description
-- Bonus mechanics : bonus_type, release_mode, product,
--                   start_date, end_date, wager_multiplier, no_of_chunks,
--                   release_bucket, chunk_expiry_days, bonus_expiry_days,
--                   wager_chip_type, credit_chip_type
-- Grant caps      : bonus_amount_default, bonus_amount_max
-- Budget limits   : → bonus_budget_limit  (entity_type='CONFIGURE', entity_id)
-- Budget counters : → bonus_budget_usage  (entity_type='CONFIGURE', entity_id)
-- Control         : priority, active, created_by, updated_by, created_at, updated_at
--
-- USAGE
-- ─────
-- • One row per distinct bonus offer within a subhead.
-- • Key mechanics fields are snapshotted into userapp_player_bonus at grant
--   time so changing this row does not affect live grants.
-- • bonus_amount_default — used when the trigger supplies no explicit amount.
-- • bonus_amount_max — hard per-grant ceiling regardless of trigger input.
-- • priority — when multiple configure nodes match a trigger, lowest value wins.
-- • Budget caps and running counters are intentionally split into separate
--   tables to keep this configuration row cold (operator-written only).
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_subhead.id   ← bonus_configure.subhead_id
-- bonus_configure.id ← bonus_configure_code.configure_id
-- bonus_configure.id ← bonus_budget_grant_log.configure_id
-- bonus_configure.id ← bonus_budget_limit  (entity_type='CONFIGURE')
-- bonus_configure.id ← bonus_budget_usage  (entity_type='CONFIGURE')
-- bonus_configure.id ← bonus_spend_daily / weekly / monthly
--                      (entity_type='CONFIGURE')
--
-- =============================================================================

CREATE TABLE `bonus_configure` (
    `id`                     INT            NOT NULL AUTO_INCREMENT,
    `subhead_id`             INT            NOT NULL,
    -- references bonus_subhead.id
    `site_id`                INT            NOT NULL,
    `name`                   VARCHAR(100)   NOT NULL,
    `description`            VARCHAR(500)   DEFAULT NULL,

    -- ── Bonus mechanics ──────────────────────────────────────────────────────
    `bonus_type`             VARCHAR(20)    NOT NULL,
    -- e.g. CHUNK | INSTANT
    `release_mode`           VARCHAR(20)    NOT NULL,
    -- e.g. CHUNK | INSTANT
    `product`                VARCHAR(10)    NOT NULL,
    -- e.g. POKER | CASINO | RUMMY
    `start_date`             DATETIME       NOT NULL,
    `end_date`               DATETIME       NOT NULL,
    `wager_multiplier`       DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    -- 0 = no wagering required; >0 = chunk wager multiplier
    `no_of_chunks`           INT            NOT NULL DEFAULT 1,
    -- number of equal chunks the bonus is split into
    `release_bucket`         VARCHAR(50)    DEFAULT NULL,
    -- trigger bucket that releases the bonus (e.g. DEPOSIT_INSTANT)
    `chunk_expiry_days`      INT            DEFAULT NULL,
    -- days from grant until an unreleased chunk expires
    `bonus_expiry_days`      INT            DEFAULT NULL,
    -- days from chunk release until the credit expires (post-release)
    `wager_chip_type`        VARCHAR(50)    NOT NULL DEFAULT 'CASH',
    `credit_chip_type`       VARCHAR(50)    NOT NULL DEFAULT 'CASH',

    -- ── Grant caps ───────────────────────────────────────────────────────────
    `bonus_amount_default`   DECIMAL(18,2)  DEFAULT NULL,
    -- grant amount when trigger supplies no explicit value
    `bonus_amount_max`       DECIMAL(18,2)  DEFAULT NULL,
    -- hard per-grant ceiling regardless of trigger input

    -- ── Control ──────────────────────────────────────────────────────────────
    `priority`               INT            NOT NULL DEFAULT 0,
    -- lower value = higher priority when multiple nodes match
    `active`                 TINYINT(1)     NOT NULL DEFAULT 1,
    `created_by`             VARCHAR(100)   NOT NULL,
    `updated_by`             VARCHAR(100)   NOT NULL,
    `created_at`             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                            ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`               CHAR(64)       DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_configure_subhead_name`         (`subhead_id`, `name`),
    KEY `idx_bonus_configure_subhead_id`                 (`subhead_id`),
    KEY `idx_bonus_configure_site_id`                    (`site_id`),
    KEY `idx_bonus_configure_active`                     (`active`),
    KEY `idx_bonus_configure_priority`                   (`subhead_id`, `active`, `priority`),
    KEY `idx_bonus_config_bonus_type`                    (`bonus_type`),
    KEY `idx_bonus_config_release_mode`                  (`release_mode`),
    KEY `idx_bonus_config_product`                       (`product`),
    KEY `idx_bonus_config_dates`                         (`start_date`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_configure`
    (`id`, `subhead_id`, `site_id`, `name`, `description`,
     `bonus_type`, `release_mode`, `product`,
     `start_date`, `end_date`,
     `wager_multiplier`, `no_of_chunks`, `release_bucket`,
     `chunk_expiry_days`, `bonus_expiry_days`,
     `wager_chip_type`, `credit_chip_type`,
     `bonus_amount_default`, `bonus_amount_max`,
     `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    -- 100% First Deposit match, chunked with 2× wager, expires in 30 days
    (1, 1, 1,
     '100% First Deposit up to 5000',
     'Full 100% match on first deposit, capped at ₹5,000 bonus.',
     'CHUNK', 'CHUNK', 'POKER',
     '2026-01-01 00:00:00', '2026-12-31 23:59:59',
     2.00, 5, 'DEPOSIT_INSTANT',
     30, NULL,
     'CASH', 'CASH',
     NULL, 5000.00,
     1, 1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- VIP variant: higher cap, single chunk, 3× wager
    (2, 1, 1,
     '100% First Deposit up to 20000 (VIP)',
     'Higher cap variant for VIP-tagged players.',
     'CHUNK', 'CHUNK', 'POKER',
     '2026-01-01 00:00:00', '2026-12-31 23:59:59',
     3.00, 1, 'DEPOSIT_INSTANT',
     45, NULL,
     'CASH', 'CASH',
     NULL, 20000.00,
     2, 1, 'admin', 'ops.team', '2026-01-01 09:00:00', '2026-04-15 10:30:00'),

    -- Weekend flat reload: instant, no wagering
    (3, 3, 1,
     'Weekend Reload Flat 500',
     'Fixed ₹500 bonus credited on any weekend deposit.',
     'INSTANT', 'INSTANT', 'POKER',
     '2026-01-01 00:00:00', '2026-12-31 23:59:59',
     0.00, 1, 'DEPOSIT_INSTANT',
     NULL, NULL,
     'CASH', 'CASH',
     500.00, 500.00,
     1, 1, 'ops.team', 'ops.team', '2026-02-01 09:00:00', '2026-02-01 09:00:00');
