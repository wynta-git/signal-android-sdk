-- =============================================================================
-- TABLE: bonus_budget_grant_log
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Immutable audit record of every player bonus grant, capturing which node at
-- each level of the hierarchy (configure → subhead → head) was charged and how
-- much was granted.
--
-- USAGE
-- ─────
-- • Written atomically with userapp_player_bonus at grant time — one row per grant.
-- • Unique on player_bonus_id; prevents double-counting on event replay.
-- • Drives three use-cases:
--     1. Budget-rollover safety — the scheduler sums grant_amount per period
--        and compares to *_budget_used before zeroing counters.
--     2. Ops dashboards — burn-rate reporting per head / subhead / configure
--        without scanning userapp_player_bonus.
--     3. Reconciliation — cross-references player_bonus_id to confirm every
--        live grant has a matching budget log entry.
-- • Never updated after insert. All joins are read-only lookups.
--
-- RELATIONSHIPS
-- ─────────────
-- userapp_player_bonus.id ← bonus_budget_grant_log.player_bonus_id
-- bonus_configure.id      ← bonus_budget_grant_log.configure_id
-- bonus_subhead.id        ← bonus_budget_grant_log.subhead_id
-- bonus_head.id           ← bonus_budget_grant_log.head_id
--
-- =============================================================================

CREATE TABLE `bonus_budget_grant_log` (
    `id`                BIGINT        NOT NULL AUTO_INCREMENT,
    `player_bonus_id`   BIGINT        NOT NULL,
    -- references userapp_player_bonus.id; unique — one log entry per grant
    `configure_id`      INT           NOT NULL,
    -- references bonus_configure.id
    `subhead_id`        INT           NOT NULL,
    -- references bonus_subhead.id
    `head_id`           INT           NOT NULL,
    -- references bonus_head.id
    `site_id`           INT           NOT NULL,
    `player_id`         VARCHAR(50)   NOT NULL,
    `grant_amount`      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_budget_grant_player_bonus_id` (`player_bonus_id`),
    KEY `idx_budget_grant_configure_id`          (`configure_id`),
    KEY `idx_budget_grant_subhead_id`            (`subhead_id`),
    KEY `idx_budget_grant_head_id`               (`head_id`),
    KEY `idx_budget_grant_player_id`             (`player_id`),
    KEY `idx_budget_grant_site_date`             (`site_id`, `created_at`)
);

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_budget_grant_log`
    (`id`, `player_bonus_id`, `configure_id`, `subhead_id`, `head_id`,
     `site_id`, `player_id`, `grant_amount`, `created_at`)
VALUES
    (1,  1001, 1, 1, 1, 1, 'PLR00001', 5000.00, '2026-05-10 10:15:00'),
    (2,  1002, 1, 1, 1, 1, 'PLR00002', 3200.00, '2026-05-10 11:02:00'),
    (3,  1003, 2, 1, 1, 1, 'PLR00003',20000.00, '2026-05-10 12:45:00'),
    (4,  1004, 1, 1, 1, 1, 'PLR00004', 4100.00, '2026-05-11 09:30:00'),
    (5,  1005, 3, 3, 2, 1, 'PLR00005',  500.00, '2026-05-11 14:00:00'),
    (6,  1006, 3, 3, 2, 1, 'PLR00006',  500.00, '2026-05-11 15:22:00'),
    (7,  1007, 1, 1, 1, 1, 'PLR00007', 2500.00, '2026-05-12 08:10:00'),
    (8,  1008, 3, 3, 2, 1, 'PLR00008',  500.00, '2026-05-12 09:05:00');
