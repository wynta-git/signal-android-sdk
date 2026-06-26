-- =============================================================================
-- TABLE: bonus_chunk_consumed
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Per-chunk record of each bonus consumption event. One row per chunk touched
-- by a single consume request. The parent bonus_consumed row captures the
-- event context (wager amounts, game metadata); this table records exactly
-- how much was drawn down from each individual chunk.
--
-- COLUMN GROUPS
-- ─────────────
-- Identity    : id, bonus_consumed_id, chunk_id, bonus_grant_id
-- Idempotency : consumed_ref
-- Amount      : consumed_amount
-- Audit       : created_at
--
-- USAGE
-- ─────
-- • Inserted inside the chunk loop in consume_bonus() after the parent
--   bonus_consumed row is created.
-- • UNIQUE on (chunk_id, consumed_ref) prevents replay double-counting
--   per chunk; this unique constraint moves here from bonus_consumed.
-- • bonus_consumed.consumed_amount (total across all chunks) is the
--   pre-aggregated sum; this table provides the per-chunk breakdown.
-- • Used by revert_consumption() to decrement bonus_grant.consume_amount
--   per chunk accurately.
-- • Never updated after insert.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_consumed.id  ← bonus_chunk_consumed.bonus_consumed_id
-- bonus_chunk.id     ← bonus_chunk_consumed.chunk_id
-- bonus_grant.id     ← bonus_chunk_consumed.bonus_grant_id
--
-- =============================================================================

CREATE TABLE `bonus_chunk_consumed` (
    `id`                BIGINT        NOT NULL AUTO_INCREMENT,
    `bonus_consumed_id` BIGINT        NOT NULL,
    -- references bonus_consumed.id; the parent consume event row
    `chunk_id`          BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `bonus_grant_id`    BIGINT        NOT NULL,
    -- references bonus_grant.id; denormalised for fast per-grant rollups
    `consumed_ref`      VARCHAR(100)  NOT NULL,
    -- upstream consumption identifier (consume_txn_id); unique per chunk for replay safety

    -- ── Amount ────────────────────────────────────────────────────────────────
    `consumed_amount`   DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    -- amount drawn down from this specific chunk in this consume event

    `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_chunk_consumed_ref`              (`chunk_id`, `consumed_ref`),
    -- prevents replay double-counting per chunk
    KEY `idx_bonus_chunk_consumed_bonus_consumed_id`      (`bonus_consumed_id`),
    KEY `idx_bonus_chunk_consumed_chunk_id`               (`chunk_id`),
    KEY `idx_bonus_chunk_consumed_bonus_grant_id`         (`bonus_grant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
-- Mirrors the existing bonus_consumed sample row (id=1, TXN20260510001).
-- chunk_id=1, bonus_grant_id=1, consumed from a single chunk.
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_chunk_consumed`
    (`id`, `bonus_consumed_id`, `chunk_id`, `bonus_grant_id`, `consumed_ref`, `consumed_amount`)
VALUES
    (1, 1, 1, 1, 'TXN20260510001', 100.0000);
