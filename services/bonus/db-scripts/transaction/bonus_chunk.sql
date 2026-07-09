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
-- Progress  : release_status, consume_status, wager_amount
-- Audit     : created_at, updated_at
--
-- RELEASE_STATUS VALUES
-- ─────────────────────
-- PENDING   — chunk created but not yet released; wager target not met
-- RELEASE   — wager target met; chunk credited to player's wallet
-- RELEASED  — bulk-released (wager_multiplier=0 cashback grants)
-- EXPIRED   — chunk expiry window elapsed before wager target was reached
--
-- CONSUME_STATUS VALUES
-- ─────────────────────
-- INIT      — chunk not yet consumed (default)
-- CONSUMED  — chunk fully played through
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
    `site_id`        INT           NOT NULL,
    `pam_user_id`    VARCHAR(50)   NOT NULL,

    -- ── Amount ────────────────────────────────────────────────────────────────
    `chunk_amount`      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- face value of this chunk; sum across all chunks equals bonus_log.grant_amount
    `wager_multiplier`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    -- x-wager required to release this chunk; copied from bonus_log at grant time
    `product_wager_multiplier` JSON        DEFAULT NULL,
    -- optional per-product override; copied from bonus_grant at grant time
    `required_wager_amount`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- pre-computed chunk_amount × wager_multiplier, set at grant time

    -- ── Progress ──────────────────────────────────────────────────────────────
    `release_status` VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    -- PENDING | RELEASE | RELEASED | EXPIRED
    `consume_status` VARCHAR(20)   NOT NULL DEFAULT 'INIT',
    -- INIT | CONSUMED
    `wager_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative qualifying wager settled against this chunk

    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_chunk_ref`               (`bonus_log_id`, `chunk_ref`),
    KEY `idx_bonus_chunk_bonus_log_id`            (`bonus_log_id`),
    KEY `idx_bonus_chunk_pam_user_id`             (`pam_user_id`),
    KEY `idx_bonus_chunk_release_status`          (`release_status`),
    KEY `idx_bonus_chunk_consume_status`          (`consume_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_chunk`
    (`id`, `chunk_ref`, `bonus_log_id`, `chunk_amount`, `wager_multiplier`, `required_wager_amount`, `release_status`, `consume_status`, `wager_amount`)
VALUES
    -- bonus_log_id=1 (grant_amount=5000, 5 chunks → 1000/chunk, 2× wager)
    (1, 'CH001', 1,  50.00, 2.00, 100.00, 'RELEASE', 'INIT', 50.00),
    (2, 'CH002', 1,  50.00, 2.00, 100.00, 'PENDING', 'INIT',  0.00),

    -- bonus_log_id=3 (VIP grant, single chunk, 3× wager)
    (3, 'CH001', 3, 100.00, 3.00, 300.00, 'RELEASE', 'INIT',  0.00);
