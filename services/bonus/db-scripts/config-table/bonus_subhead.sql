-- =============================================================================
-- TABLE: bonus_subhead
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Mid-level budget category nested under a bonus_head. Lets operators split a
-- head's budget across distinct sub-programmes (e.g. "First Deposit" vs
-- "Second Deposit" both under the "Welcome" head).
--
-- USAGE
-- ─────
-- • One row per sub-programme per head.
-- • Budget caps and running usage totals live in bonus_budget_limit
--   (one row per period: DAILY, WEEKLY, MONTHLY).
-- • At grant time both the subhead's limits and the parent head's limits are
--   checked via bonus_budget_limit — a grant fails if either is exceeded.
-- • This table is never updated at runtime; all counters are in bonus_budget_limit.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_head.id    ← bonus_subhead.head_id
-- bonus_subhead.id ← bonus_configure.subhead_id
-- bonus_subhead.id ← bonus_budget_limit (entity_type='SUBHEAD', entity_id)
-- bonus_subhead.id ← bonus_budget_grant_log.subhead_id
-- bonus_subhead.id ← bonus_spend_daily / bonus_spend_weekly / bonus_spend_monthly
--                    (entity_type='SUBHEAD', entity_id)
--
-- =============================================================================

CREATE TABLE `bonus_subhead` (
    `id`          INT           NOT NULL AUTO_INCREMENT,
    `head_id`     INT           NOT NULL,
    -- references bonus_head.id
    `site_id`     INT           NOT NULL,
    `name`        VARCHAR(100)  NOT NULL,
    `description` VARCHAR(500)  DEFAULT NULL,
    `active`             TINYINT(1)    NOT NULL DEFAULT 1,
    `owner`      VARCHAR(100)  NOT NULL,
    -- primary accountable person; additional contacts in bonus_responsible_person
    `created_by` VARCHAR(100)  NOT NULL,
    `updated_by`         VARCHAR(100)  NOT NULL,
    `created_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_subhead_head_name` (`head_id`, `name`),
    KEY `idx_bonus_subhead_head_id`         (`head_id`),
    KEY `idx_bonus_subhead_site_id`         (`site_id`),
    KEY `idx_bonus_subhead_active`          (`active`),
    KEY `idx_bonus_subhead_owner`           (`owner`)
);

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_subhead`
    (`id`, `head_id`, `site_id`, `name`, `description`, `active`,
     `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    (1, 1, 1, 'First Deposit',  '100% match bonus on a player''s very first deposit.', 1, 'priya.sharma', 'admin',    'admin',    '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (2, 1, 1, 'Second Deposit', '50% match bonus on the player''s second deposit.',    1, 'priya.sharma', 'admin',    'admin',    '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (3, 2, 1, 'Weekend Reload', '25% deposit-match every Saturday and Sunday.',        1, 'arjun.mehta',  'admin',    'ops.team', '2026-01-01 09:00:00', '2026-03-10 14:00:00'),
    (4, 2, 1, 'Midweek Reload', '15% deposit-match on Tuesday and Wednesday.',         1, 'arjun.mehta',  'ops.team', 'ops.team', '2026-02-01 09:00:00', '2026-02-01 09:00:00');
