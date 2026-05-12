-- =============================================================================
-- TABLE: bonus_forfeit
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Records each bonus forfeit event. A bonus may be forfeited automatically
-- when the player triggers a disqualifying action (e.g. early withdrawal)
-- or manually by an operator. One row per forfeit event per bonus.
--
-- COLUMN GROUPS
-- ─────────────
-- Identity  : id, bonus_log_id
-- Forfeit   : amount, type, operator
-- Audit     : forfeited_at, created_at
--
-- TYPE VALUES
-- ───────────
-- AUTO    — system-triggered forfeit on a disqualifying player action
-- MANUAL  — operator-triggered forfeit
--
-- USAGE
-- ─────
-- • Written by the bonus-engine (AUTO) or ops tooling (MANUAL) when an
--   entire bonus is forfeited and any unreleased / released-but-unplayed
--   balance is clawed back.
-- • operator is NULL for AUTO; populated with the acting operator identity
--   for MANUAL forfeits for audit purposes.
-- • amount captures the total forfeited balance at the moment of forfeit.
-- • Never updated after insert.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_log.id ← bonus_forfeit.bonus_log_id
--
-- =============================================================================

CREATE TABLE `bonus_forfeit` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT,
    `bonus_log_id`   BIGINT        NOT NULL,
    -- references bonus_log.id

    -- ── Forfeit ───────────────────────────────────────────────────────────────
    `amount`         DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- total bonus balance forfeited at the time of this event
    `type`           VARCHAR(10)   NOT NULL,
    -- AUTO | MANUAL
    `operator`       VARCHAR(100)  DEFAULT NULL,
    -- identity of the operator who triggered forfeit; NULL for AUTO

    `forfeited_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- when the bonus was forfeited
    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_bonus_forfeit_bonus_log_id` (`bonus_log_id`),
    KEY `idx_bonus_forfeit_type`         (`type`),
    KEY `idx_bonus_forfeit_forfeited_at` (`forfeited_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_forfeit`
    (`id`, `bonus_log_id`, `amount`, `type`, `operator`, `forfeited_at`)
VALUES
    -- bonus_log_id=1 (LB001) — auto-forfeited on early withdrawal
    (1, 1, 50.00, 'AUTO',   NULL,          '2026-05-20 09:15:00'),

    -- bonus_log_id=1 (LB001) — manually forfeited by operator
    (2, 1, 50.00, 'MANUAL', 'ops.admin01', '2026-05-18 11:45:00');
