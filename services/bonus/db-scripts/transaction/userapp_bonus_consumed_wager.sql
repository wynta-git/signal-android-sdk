-- =============================================================================
-- TABLE: userapp_bonus_consumed_wager
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Tracks each wager (bet) that caused a portion of the player's bonus balance
-- to be consumed during gameplay. One row per game wager that triggered a
-- bonus deduction.
--
-- USAGE
-- ─────
-- • Written each time a player's bet results in a bonus balance deduction.
-- • Links directly to userapp_bonus_consumed (the consumption event) and
--   carries the external wager_id so the deduction can be reconciled with the
--   game platform's own bet ledger.
-- • consumed_amount records how much bonus was deducted by this specific wager
--   (not the full bet stake — only the bonus portion consumed).
-- • Unique on (bonus_consumed_id, wager_id): one attribution row per
--   (consumption event, wager) pair; prevents double-writes on replay.
-- • Used by:
--     – Player statements: "your ₹200 bet consumed ₹20 of your bonus balance".
--     – Reconciliation: SUM(consumed_amount) per player_bonus_id must equal
--       userapp_player_bonus.bonus_consumed.
--     – Game audits: cross-reference wager_id against the game platform ledger.
--
-- RELATIONSHIPS
-- ─────────────
-- userapp_bonus_consumed.id ← userapp_bonus_consumed_wager.bonus_consumed_id
-- userapp_player_bonus.id   ← userapp_bonus_consumed_wager.player_bonus_id
--
-- =============================================================================

CREATE TABLE `userapp_bonus_consumed_wager` (
    `id`                BIGINT        NOT NULL AUTO_INCREMENT,
    `bonus_consumed_id` BIGINT        NOT NULL,
    -- references userapp_bonus_consumed.id
    `player_bonus_id`   BIGINT        NOT NULL,
    -- references userapp_player_bonus.id
    `player_id`         VARCHAR(50)   NOT NULL,
    `wager_id`          VARCHAR(50)   NOT NULL,
    -- external wager / bet transaction reference from game platform
    `game_id`           VARCHAR(50)   DEFAULT NULL,
    -- game / table where the consumption occurred
    `round_id`          VARCHAR(50)   DEFAULT NULL,
    -- hand / round reference
    `wager_amount`      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- full bet stake placed by the player
    `consumed_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- bonus balance deducted by this wager (ingame_consumption_pct / 100 × wager_amount)
    `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_consumed_wager`                   (`bonus_consumed_id`, `wager_id`),
    KEY `idx_consumed_wager_player_bonus_id`         (`player_bonus_id`),
    KEY `idx_consumed_wager_player_id`               (`player_id`),
    KEY `idx_consumed_wager_wager_id`                (`wager_id`),
    KEY `idx_consumed_wager_game_id`                 (`game_id`)
);

-- -----------------------------------------------------------------------------
-- Sample data
-- Scenario: PLR00001 has a released bonus with ingame_consumption_pct = 10.
--   Each ₹200 bet consumes 10% = ₹20 of bonus balance.
-- -----------------------------------------------------------------------------
INSERT INTO `userapp_bonus_consumed_wager`
    (`id`, `bonus_consumed_id`, `player_bonus_id`, `player_id`,
     `wager_id`, `game_id`, `round_id`,
     `wager_amount`, `consumed_amount`, `created_at`)
VALUES
    (1, 501, 1001, 'PLR00001', 'WGR-9001', 'GAME-TABLE-42', 'RND-1001', 200.00,  20.00, '2026-05-11 18:05:00'),
    (2, 502, 1001, 'PLR00001', 'WGR-9002', 'GAME-TABLE-42', 'RND-1002', 500.00,  50.00, '2026-05-11 18:12:00'),
    (3, 503, 1001, 'PLR00001', 'WGR-9003', 'GAME-TABLE-42', 'RND-1003', 300.00,  30.00, '2026-05-11 18:20:00'),
    (4, 504, 1001, 'PLR00001', 'WGR-9004', 'GAME-TABLE-42', 'RND-1004',1000.00, 100.00, '2026-05-11 18:35:00'),

    -- PLR00002: ingame_consumption_pct = 5; ₹400 bet consumes ₹20
    (5, 505, 1002, 'PLR00002', 'WGR-9101', 'GAME-TABLE-17', 'RND-2001', 400.00,  20.00, '2026-05-11 19:00:00'),
    (6, 506, 1002, 'PLR00002', 'WGR-9102', 'GAME-TABLE-17', 'RND-2002', 400.00,  20.00, '2026-05-11 19:08:00');
