-- =============================================================================
-- TABLE: bonus_code_redemption_log
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Immutable record of every player grant that was triggered by a promo code.
-- Written alongside bonus_budget_grant_log and userapp_player_bonus in the same
-- grant transaction.
--
-- USAGE
-- ─────
-- • One row per grant that used a code — not written for grants without a code.
-- • Unique on (code_id, player_bonus_id) for idempotency on event replay.
-- • After insert the application increments bonus_configure_code.*_usage_used
--   for every non-NULL usage limit on the code row.
-- • Used by:
--     – Code usage dashboards: how many times each code was redeemed per day.
--     – Player audit: "which code did this player use for this bonus?".
--     – Fraud detection: same player or device using many different codes.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_configure_code.id ← bonus_code_redemption_log.code_id
-- userapp_player_bonus.id ← bonus_code_redemption_log.player_bonus_id
-- bonus_configure.id      ← bonus_code_redemption_log.configure_id
--
-- =============================================================================

CREATE TABLE `bonus_code_redemption_log` (
    `id`                BIGINT        NOT NULL AUTO_INCREMENT,
    `code_id`           INT           NOT NULL,
    -- references bonus_configure_code.id
    `player_bonus_id`   BIGINT        NOT NULL,
    -- references userapp_player_bonus.id
    `configure_id`      INT           NOT NULL,
    -- references bonus_configure.id (denormalised for fast reporting)
    `site_id`           INT           NOT NULL,
    `player_id`         VARCHAR(50)   NOT NULL,
    `grant_amount`      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code_redemption`           (`code_id`, `player_bonus_id`),
    KEY `idx_code_redemption_code_id`         (`code_id`),
    KEY `idx_code_redemption_player_bonus_id` (`player_bonus_id`),
    KEY `idx_code_redemption_player_id`       (`player_id`),
    KEY `idx_code_redemption_configure_id`    (`configure_id`),
    KEY `idx_code_redemption_site_date`       (`site_id`, `created_at`)
);

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_code_redemption_log`
    (`id`, `code_id`, `player_bonus_id`, `configure_id`,
     `site_id`, `player_id`, `grant_amount`, `created_at`)
VALUES
    -- WELCOME100 (code_id=1) redemptions
    (1, 1, 1001, 1, 1, 'PLR00001', 5000.00, '2026-05-10 10:15:00'),
    (2, 1, 1002, 1, 1, 'PLR00002', 3200.00, '2026-05-10 11:02:00'),
    (3, 1, 1004, 1, 1, 'PLR00004', 4100.00, '2026-05-11 09:30:00'),
    (4, 1, 1007, 1, 1, 'PLR00007', 2500.00, '2026-05-12 08:10:00'),

    -- INFLUENCER50 (code_id=2) redemptions
    (5, 2, 1003, 1, 1, 'PLR00003', 2500.00, '2026-05-10 12:45:00'),

    -- WEEKEND500 (code_id=4) redemptions
    (6, 4, 1005, 3, 1, 'PLR00005',  500.00, '2026-05-11 14:00:00'),
    (7, 4, 1006, 3, 1, 'PLR00006',  500.00, '2026-05-11 15:22:00'),
    (8, 4, 1008, 3, 1, 'PLR00008',  500.00, '2026-05-12 09:05:00');
