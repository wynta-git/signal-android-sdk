-- =============================================================================
-- TABLE: bonus_chunk_wager
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Granular record of each wager settlement that contributes toward releasing
-- a bonus chunk. One row per wager event per chunk; the sum of amount for a
-- given chunk_id equals bonus_chunk.wager_amount.
--
-- COLUMN GROUPS
-- ─────────────
-- Identity  : id, wager_ref, chunk_id
-- Amount    : wager_amount, release_amount
-- Audit     : created_at
--
-- USAGE
-- ─────
-- • Appended by the wager-processing pipeline each time a qualifying wager
--   is settled and attributed to a chunk.
-- • wager_ref is the upstream wager transaction identifier (e.g. WA001);
--   unique per chunk to prevent double-counting on event replay.
-- • After insert, the pipeline increments bonus_chunk.wager_amount and
--   transitions the chunk PENDING → RELEASE when the target is met.
-- • Never updated after insert.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_chunk.id ← bonus_chunk_wager.chunk_id
--
-- =============================================================================

CREATE TABLE `bonus_chunk_release` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_id`    BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `wager_ref`   VARCHAR(20)   NOT NULL,
    -- upstream wager transaction identifier; unique per chunk

    -- ── Amount ────────────────────────────────────────────────────────────────
    `wager_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- wager amount attributed to this chunk from this wager event
    `release_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- amount credited to the player's wallet when this wager triggered a chunk release; 0 if no release occurred

    `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_chunk_wager_ref`     (`chunk_id`, `wager_ref`),
    KEY `idx_bonus_chunk_wager_chunk_id`      (`chunk_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_chunk_release`
    (`id`, `chunk_id`, `wager_ref`, `wager_amount`, `release_amount`)
VALUES
    -- chunk_id=1 (CH001, bonus_log_id=1) — two wagers totalling 50.00; second wager triggers release
    (1, 1, 'WA001',  10.00,  0.00),
    (2, 1, 'WA010',  40.00, 50.00),

    -- chunk_id=3 (CH001, bonus_log_id=3) — wager settled with no attributed amount, no release
    (3, 3, 'WA1010',  0.00,  0.00);
