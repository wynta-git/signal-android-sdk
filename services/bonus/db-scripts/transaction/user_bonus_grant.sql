-- =============================================================================
-- TABLE: user_bonus_grant
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Immutable audit record of every player bonus grant. Captures the full
-- mechanics configuration snapshotted at grant time so that subsequent
-- changes to bonus_configure never alter the historical record.
--
-- COLUMN GROUPS
-- ─────────────
-- Identity        : id, player_bonus_id, configure_id, subhead_id, head_id,
--                   site_id, pam_user_id
-- Config snapshot : bonus_code, product,
--                   wager_multiplier, no_of_chunks,
--                   chunk_expiry_days, bonus_expiry_days,
--                   wager_chip_type, credit_chip_type
-- Grant           : grant_amount, release_amount, bonus_consumed
-- Audit           : created_at
--
-- USAGE
-- ─────
-- • Written atomically with userapp_player_bonus at grant time — one row per
--   grant.
-- • Unique on player_bonus_id; prevents double-counting on event replay.
-- • Config snapshot columns are copied from bonus_configure (and
--   bonus_configure_code if a promo code was used) at the moment of grant.
--   They are never back-filled if the configure row changes afterwards.
-- • Drives three use-cases:
--     1. Budget-rollover safety — the scheduler sums grant_amount per period
--        and compares to *_budget_used before zeroing counters.
--     2. Ops dashboards — burn-rate reporting per head / subhead / configure
--        without scanning userapp_player_bonus.
--     3. Reconciliation — cross-references player_bonus_id to confirm every
--        live grant has a matching log entry, with full mechanics context.
-- • Never updated after insert. All joins are read-only lookups.
--
-- RELATIONSHIPS
-- ─────────────
-- userapp_player_bonus.id ← user_bonus_grant.player_bonus_id
-- bonus_configure.id      ← user_bonus_grant.configure_id
-- bonus_subhead.id        ← user_bonus_grant.subhead_id
-- bonus_head.id           ← user_bonus_grant.head_id
--
-- =============================================================================

CREATE TABLE `user_bonus_grant` (
    `id`                 BIGINT        NOT NULL AUTO_INCREMENT,
    `player_bonus_id`    BIGINT        NOT NULL,
    -- references userapp_player_bonus.id; unique — one log entry per grant
    `configure_id`       INT           NOT NULL,
    -- references bonus_configure.id
    `subhead_id`         INT           NOT NULL,
    -- references bonus_subhead.id
    `head_id`            INT           NOT NULL,
    -- references bonus_head.id
    `site_id`            INT           NOT NULL,
    `pam_user_id`      VARCHAR(50)   NOT NULL,

    -- ── Config snapshot (copied from bonus_configure at grant time) ───────────
    `bonus_code`         VARCHAR(50)   DEFAULT NULL,
    -- promo code the player redeemed; NULL if no code was used

    `product`            VARCHAR(10)   DEFAULT NULL,
    -- product sourced from bonus_release_trigger at grant time; NULL when trigger has no product constraint
    `wager_multiplier`   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    -- x-wager requirement per chunk; 0 = no wagering — from bonus_configure
    `no_of_chunks`       INT           NOT NULL DEFAULT 1,
    -- number of chunks the bonus was split into — from bonus_configure
    `chunk_expiry_days`  INT           DEFAULT NULL,
    -- days from grant until an unreleased chunk expires; NULL = no expiry
    `bonus_expiry_days`  INT           DEFAULT NULL,
    -- days from chunk release until credited bonus expires; NULL = no expiry
    `wager_chip_type`    VARCHAR(50)   NOT NULL DEFAULT 'CASH',
    -- chip type used for wagering calculation — from bonus_configure
    `credit_chip_type`   VARCHAR(50)   NOT NULL DEFAULT 'CASH',
    -- chip type credited to the player — from bonus_configure

    -- ── Grant ─────────────────────────────────────────────────────────────────
    `grant_amount`       DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `release_amount`     DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative amount released to the player's wallet at time of log entry
    `bonus_consumed`     DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative bonus amount consumed through wagering at time of log entry

    `created_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_bonus_grant_player_bonus_id`    (`player_bonus_id`),
    KEY `idx_user_bonus_grant_configure_id`             (`configure_id`),
    KEY `idx_user_bonus_grant_subhead_id`               (`subhead_id`),
    KEY `idx_user_bonus_grant_head_id`                  (`head_id`),
    KEY `idx_user_bonus_grant_pam_user_id`            (`pam_user_id`),
    KEY `idx_user_bonus_grant_site_date`                (`site_id`, `created_at`),
    KEY `idx_user_bonus_grant_bonus_code`               (`bonus_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `user_bonus_grant`
    (`id`, `player_bonus_id`, `configure_id`, `subhead_id`, `head_id`,
     `site_id`, `pam_user_id`,
     `bonus_code`, `product`,
     `wager_multiplier`, `no_of_chunks`, `chunk_expiry_days`, `bonus_expiry_days`,
     `wager_chip_type`, `credit_chip_type`,
     `grant_amount`, `release_amount`, `bonus_consumed`, `created_at`)
VALUES
    -- configure_id=1 (100% First Deposit up to 5000, CHUNK, 2× wager, 5 chunks, 30-day expiry)
    (1, 1001, 1, 1, 1, 1, 'PLR00001',
     'WELCOME100', 'POKER',
     2.00, 5, 30, NULL, 'CASH', 'CASH',
     5000.00, 1000.00, 800.00, '2026-05-10 10:15:00'),

    (2, 1002, 1, 1, 1, 1, 'PLR00002',
     'WELCOME100', 'POKER',
     2.00, 5, 30, NULL, 'CASH', 'CASH',
     3200.00, 640.00, 500.00, '2026-05-10 11:02:00'),

    -- configure_id=2 (VIP variant, CHUNK, 3× wager, 1 chunk, 45-day expiry)
    (3, 1003, 2, 1, 1, 1, 'PLR00003',
     'VIP2026', 'POKER',
     3.00, 1, 45, NULL, 'CASH', 'CASH',
     20000.00, 20000.00, 15000.00, '2026-05-10 12:45:00'),

    -- configure_id=1, no promo code
    (4, 1004, 1, 1, 1, 1, 'PLR00004',
     NULL, 'POKER',
     2.00, 5, 30, NULL, 'CASH', 'CASH',
     4100.00, 820.00, 0.00, '2026-05-11 09:30:00'),

    -- configure_id=3 (Weekend Reload 500, INSTANT, 0× wager, no expiry)
    (5, 1005, 3, 3, 2, 1, 'PLR00005',
     'WEEKEND500', 'POKER',
     0.00, 1, NULL, NULL, 'CASH', 'CASH',
     500.00, 500.00, 500.00, '2026-05-11 14:00:00'),

    (6, 1006, 3, 3, 2, 1, 'PLR00006',
     'WEEKEND500', 'POKER',
     0.00, 1, NULL, NULL, 'CASH', 'CASH',
     500.00, 500.00, 320.00, '2026-05-11 15:22:00'),

    -- configure_id=1, no promo code
    (7, 1007, 1, 1, 1, 1, 'PLR00007',
     NULL, 'POKER',
     2.00, 5, 30, NULL, 'CASH', 'CASH',
     2500.00, 0.00, 0.00, '2026-05-12 08:10:00'),

    -- configure_id=3, no promo code
    (8, 1008, 3, 3, 2, 1, 'PLR00008',
     NULL, 'POKER',
     0.00, 1, NULL, NULL, 'CASH', 'CASH',
     500.00, 500.00, 0.00, '2026-05-12 09:05:00');
