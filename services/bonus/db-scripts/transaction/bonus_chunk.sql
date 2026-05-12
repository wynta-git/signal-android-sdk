-- =============================================================================
-- TABLE: bonus_chunk
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- One row per chunk within a bonus grant. A bonus may be split into N chunks
-- (controlled by bonus_log.no_of_chunks); each chunk is released independently
-- once the player satisfies the per-chunk wager requirement.
--
-- COLUMN GROUPS
-- ─────────────
-- Identity  : id, chunk_ref, bonus_log_id
-- Amount    : chunk_amount, wager_multiplier
-- Progress  : status, wager_amount
-- Audit     : created_at, updated_at
--
-- STATUS VALUES
-- ─────────────
-- PENDING   — chunk created but not yet released; wager target not met
-- RELEASE   — wager target met; chunk credited to player's wallet
-- EXPIRED   — chunk expiry window elapsed before wager target was reached
-- CONSUMED  — released chunk fully played through
--
-- USAGE
-- ─────
-- • Created at grant time — one row per chunk (no_of_chunks rows per bonus).
-- • chunk_ref is unique within a bonus (e.g. CH001, CH002…); used for
--   idempotent upserts from the wager-processing pipeline.
-- • wager_amount is incremented as qualifying wagers are settled; when it
--   reaches bonus_log.grant_amount × wager_multiplier / no_of_chunks the
--   chunk transitions PENDING → RELEASE.
-- • status transitions are append-only in practice; the row is never deleted.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_log.id ← bonus_chunk.bonus_log_id
--
-- =============================================================================

CREATE TABLE `bonus_chunk` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_ref`      VARCHAR(20)   NOT NULL,
    -- human-readable chunk identifier; unique within a bonus (e.g. CH001)
    `bonus_log_id`   BIGINT        NOT NULL,
    -- references bonus_log.id

    -- ── Amount ────────────────────────────────────────────────────────────────
    `chunk_amount`      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- face value of this chunk; sum across all chunks equals bonus_log.grant_amount
    `wager_multiplier`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    -- x-wager required to release this chunk; copied from bonus_log at grant time

    -- ── Progress ──────────────────────────────────────────────────────────────
    `status`         VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    -- PENDING | RELEASE | EXPIRED | CONSUMED
    `wager_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative qualifying wager settled against this chunk

    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_chunk_ref`          (`bonus_log_id`, `chunk_ref`),
    KEY `idx_bonus_chunk_bonus_log_id`       (`bonus_log_id`),
    KEY `idx_bonus_chunk_status`             (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_chunk`
    (`id`, `chunk_ref`, `bonus_log_id`, `chunk_amount`, `wager_multiplier`, `status`, `wager_amount`)
VALUES
    -- bonus_log_id=1 (grant_amount=5000, 5 chunks → 1000/chunk, 2× wager)
    (1, 'CH001', 1,  50.00, 2.00, 'RELEASE', 50.00),
    (2, 'CH002', 1,  50.00, 2.00, 'PENDING',  0.00),

    -- bonus_log_id=3 (VIP grant, single chunk, 3× wager)
    (3, 'CH001', 3, 100.00, 3.00, 'RELEASE',  0.00);
