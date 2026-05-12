-- =============================================================================
-- TABLE: userapp_bonus_chunk_release_wager
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Per-wager bonus release attribution. One row per qualifying wager that
-- contributed toward releasing a chunk, recording what share of the chunk's
-- bonus amount that individual bet unlocked.
--
-- USAGE
-- ─────
-- • Written at bet time (not at release time) — one row per qualifying wager
--   in userapp_bonus_chunk_wager.
-- • Unique on chunk_wager_id; prevents duplicate attribution on replay.
-- • release_attributed is calculated as:
--       wager_amount / wager_required × chunk_amount
--   This distributes the chunk's value proportionally across all bets that
--   contributed to unlocking it.
-- • bonus_release_id starts NULL. When the chunk releases (wager_completed
--   crosses wager_required), the application back-fills bonus_release_id on
--   all rows for that chunk so they link to the userapp_bonus_release event.
-- • Invariant: SUM(release_attributed) for a fully released chunk = chunk_amount.
-- • Used by:
--     – Player statements: "your ₹500 bet unlocked ₹120 of your bonus".
--     – Reconciliation: verify chunk_amount equals the sum of attributed rows.
--     – Dispute resolution: full audit trail of which bets released value.
--
-- RELATIONSHIPS
-- ─────────────
-- userapp_bonus_chunk_wager.id ← userapp_bonus_chunk_release_wager.chunk_wager_id
-- userapp_bonus_chunk.id       ← userapp_bonus_chunk_release_wager.bonus_chunk_id
-- userapp_player_bonus.id      ← userapp_bonus_chunk_release_wager.player_bonus_id
-- userapp_bonus_release.id     ← userapp_bonus_chunk_release_wager.bonus_release_id
--
-- =============================================================================

CREATE TABLE `userapp_bonus_chunk_release_wager` (
    `id`                  BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_wager_id`      BIGINT        NOT NULL,
    -- references userapp_bonus_chunk_wager.id
    `bonus_chunk_id`      BIGINT        NOT NULL,
    -- references userapp_bonus_chunk.id
    `player_bonus_id`     BIGINT        NOT NULL,
    -- references userapp_player_bonus.id
    `bonus_release_id`    BIGINT        DEFAULT NULL,
    -- references userapp_bonus_release.id; NULL until chunk releases
    `player_id`           VARCHAR(50)   NOT NULL,
    `wager_id`            VARCHAR(50)   NOT NULL,
    -- external wager reference (mirrors userapp_bonus_chunk_wager.wager_id)
    `wager_amount`        DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `release_attributed`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- wager_amount / wager_required × chunk_amount
    `created_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_chunk_release_wager`              (`chunk_wager_id`),
    KEY `idx_chunk_release_wager_chunk_id`           (`bonus_chunk_id`),
    KEY `idx_chunk_release_wager_player_bonus_id`    (`player_bonus_id`),
    KEY `idx_chunk_release_wager_release_id`         (`bonus_release_id`),
    KEY `idx_chunk_release_wager_player_id`          (`player_id`)
);

-- -----------------------------------------------------------------------------
-- Sample data
-- Scenario: PLR00001 has a ₹5,000 bonus split into 1 chunk.
--   chunk_amount    = 5,000
--   wager_required  = 10,000  (2× multiplier)
--   Four qualifying bets of ₹2,500 each unlock ₹1,250 of bonus per bet.
--   The fourth bet completes wagering; bonus_release_id is back-filled.
-- -----------------------------------------------------------------------------
INSERT INTO `userapp_bonus_chunk_release_wager`
    (`id`, `chunk_wager_id`, `bonus_chunk_id`, `player_bonus_id`,
     `bonus_release_id`, `player_id`, `wager_id`,
     `wager_amount`, `release_attributed`, `created_at`)
VALUES
    -- Bet 1 — chunk not yet released; bonus_release_id NULL
    (1, 201, 301, 1001, NULL,    'PLR00001', 'WGR-8801', 2500.00, 1250.00, '2026-05-10 10:30:00'),
    -- Bet 2
    (2, 202, 301, 1001, NULL,    'PLR00001', 'WGR-8802', 2500.00, 1250.00, '2026-05-10 11:15:00'),
    -- Bet 3
    (3, 203, 301, 1001, NULL,    'PLR00001', 'WGR-8803', 2500.00, 1250.00, '2026-05-10 12:00:00'),
    -- Bet 4 — completes wagering; bonus_release_id back-filled to release event 401
    (4, 204, 301, 1001, 401,     'PLR00001', 'WGR-8804', 2500.00, 1250.00, '2026-05-10 13:45:00'),

    -- Second player (PLR00002): ₹3,200 bonus, wager_required = 6,400
    -- Two bets of ₹3,200 — each unlocks ₹1,600; second bet triggers release
    (5, 205, 302, 1002, NULL,    'PLR00002', 'WGR-8901', 3200.00, 1600.00, '2026-05-10 11:10:00'),
    (6, 206, 302, 1002, 402,     'PLR00002', 'WGR-8902', 3200.00, 1600.00, '2026-05-10 14:05:00');
