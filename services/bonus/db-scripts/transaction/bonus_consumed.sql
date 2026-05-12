-- =============================================================================
-- TABLE: bonus_consumed
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Records each bonus consumption event — the deduction of released bonus
-- balance as a player's qualifying wager is settled. One row per wager per
-- chunk; the sum of amount for a given chunk_id equals the total bonus
-- consumed against that chunk.
--
-- COLUMN GROUPS
-- ─────────────
-- Identity  : id, consumed_ref, chunk_id, bonus_log_id, wager_ref,
--             wager_id, game_id, round_id
-- Amount    : amount, wager_amount, consumed_amount
-- Audit     : created_at
--
-- USAGE
-- ─────
-- • Appended by the wager-processing pipeline when a settled wager draws
--   down a player's released bonus balance.
-- • consumed_ref is the upstream consumption identifier; unique per chunk
--   to prevent double-counting on event replay.
-- • wager_ref links back to the originating wager (bonus_chunk_wager.wager_ref).
-- • Never updated after insert.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_chunk.id  ← bonus_consumed.chunk_id
-- bonus_log.id    ← bonus_consumed.bonus_log_id
--
-- =============================================================================

CREATE TABLE `bonus_consumed` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT,
    `consumed_ref`   VARCHAR(20)   NOT NULL,
    -- upstream consumption identifier (e.g. C001); unique per chunk
    `chunk_id`       BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `bonus_log_id`   BIGINT        NOT NULL,
    -- references bonus_log.id
    `wager_ref`         VARCHAR(20)   NOT NULL,
    -- originating wager transaction identifier; links to bonus_chunk_wager.wager_ref
    `wager_id`          VARCHAR(50)   NOT NULL,
    -- external wager / bet transaction reference from game platform
    `game_id`           VARCHAR(50)   DEFAULT NULL,
    -- game / table where the consumption occurred
    `round_id`          VARCHAR(50)   DEFAULT NULL,
    -- hand / round reference

    -- ── Amount ────────────────────────────────────────────────────────────────
    `amount`            DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- bonus balance drawn down by this consumption event
    `wager_amount`      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- full bet stake placed by the player
    `consumed_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,

    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_consumed_ref`          (`chunk_id`, `consumed_ref`),
    KEY `idx_bonus_consumed_chunk_id`           (`chunk_id`),
    KEY `idx_bonus_consumed_bonus_log_id`       (`bonus_log_id`),
    KEY `idx_bonus_consumed_wager_ref`          (`wager_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_consumed`
    (`id`, `consumed_ref`, `chunk_id`, `bonus_log_id`, `wager_ref`,
     `wager_id`, `game_id`, `round_id`,
     `amount`, `wager_amount`, `consumed_amount`)
VALUES
    -- chunk_id=1 (CH001), bonus_log_id=3 (GST001), wager WA002 — partial consumption
    (1, 'C001', 1, 3, 'WA002',
     'EXT-WGR-0021', 'POKER-NLH-01', 'RND-20260510-0091',
     28.00, 100.00, 28.00),

    -- chunk_id=2 (CH002), bonus_log_id=1 (LB001), wager WA002 — full chunk consumed
    (2, 'C002', 2, 1, 'WA002',
     'EXT-WGR-0022', 'POKER-NLH-01', 'RND-20260510-0092',
     50.00, 200.00, 50.00);
