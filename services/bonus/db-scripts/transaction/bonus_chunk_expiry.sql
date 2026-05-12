-- =============================================================================
-- TABLE: bonus_chunk_expiry
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Records each bonus chunk expiry event. A chunk may expire automatically
-- when its expiry window elapses (AUTO) or be cancelled early by an operator
-- action (MANUAL). One row per expiry event per chunk.
--
-- COLUMN GROUPS
-- ─────────────
-- Identity  : id, chunk_id, bonus_log_id
-- Expiry    : amount, type, operator
-- Audit     : expired_at, created_at
--
-- TYPE VALUES
-- ───────────
-- AUTO    — system-triggered expiry when chunk_expiry_days window elapsed
-- MANUAL  — operator-triggered cancellation before natural expiry
--
-- USAGE
-- ─────
-- • Written by the expiry scheduler (AUTO) or ops tooling (MANUAL) when a
--   chunk transitions to EXPIRED status in bonus_chunk.
-- • operator is NULL for AUTO; populated with the acting operator identity
--   for MANUAL expiries for audit purposes.
-- • amount captures the forfeited chunk balance at the moment of expiry.
-- • Never updated after insert.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_chunk.id ← bonus_chunk_expiry.chunk_id
-- bonus_log.id   ← bonus_chunk_expiry.bonus_log_id
--
-- =============================================================================

CREATE TABLE `bonus_chunk_expiry` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_id`       BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `bonus_log_id`   BIGINT        NOT NULL,
    -- references bonus_log.id

    -- ── Expiry ────────────────────────────────────────────────────────────────
    `amount`         DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- forfeited chunk balance at the time of expiry
    `type`           VARCHAR(10)   NOT NULL,
    -- AUTO | MANUAL
    `operator`       VARCHAR(100)  DEFAULT NULL,
    -- identity of the operator who triggered expiry; NULL for AUTO

    `expired_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- when the chunk was expired
    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_bonus_chunk_expiry_chunk_id`     (`chunk_id`),
    KEY `idx_bonus_chunk_expiry_bonus_log_id` (`bonus_log_id`),
    KEY `idx_bonus_chunk_expiry_type`         (`type`),
    KEY `idx_bonus_chunk_expiry_expired_at`   (`expired_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_chunk_expiry`
    (`id`, `chunk_id`, `bonus_log_id`, `amount`, `type`, `operator`, `expired_at`)
VALUES
    -- chunk_id=2 (CH002), bonus_log_id=1 (LB001) — auto-expired after window elapsed
    (1, 2, 1, 50.00, 'AUTO',   NULL,          '2026-06-10 00:00:00'),

    -- chunk_id=2 (CH002), bonus_log_id=1 (LB001) — manually cancelled by ops
    (2, 2, 1, 50.00, 'MANUAL', 'ops.admin01', '2026-05-15 14:30:00');
