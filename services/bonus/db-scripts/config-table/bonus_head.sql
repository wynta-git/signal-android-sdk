-- =============================================================================
-- TABLE: bonus_head
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Top-level budget category that groups related bonus sub-categories under a
-- single spend umbrella (e.g. "Welcome", "Reload", "Cashback").
--
-- USAGE
-- ─────
-- • One row per high-level bonus programme per site.
-- • Operators create heads in the CMS; heads are never created at runtime.
-- • Budget caps and running usage totals live in bonus_budget_limit
--   (one row per period: DAILY, WEEKLY, MONTHLY).
-- • At grant time the application joins to bonus_budget_limit to check caps
--   and increments budget_used there — this table is never updated at runtime.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_head.id ← bonus_subhead.head_id
-- bonus_head.id ← bonus_budget_limit (entity_type='HEAD', entity_id)
-- bonus_head.id ← bonus_budget_grant_log.head_id
-- bonus_head.id ← bonus_spend_daily / bonus_spend_weekly / bonus_spend_monthly
--                 (entity_type='HEAD', entity_id)
--
-- =============================================================================

CREATE TABLE `bonus_head` (
    `id`          INT           NOT NULL AUTO_INCREMENT,
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
    `row_hash`           CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_head_site_name` (`site_id`, `name`),
    KEY `idx_bonus_head_site_id`         (`site_id`),
    KEY `idx_bonus_head_active`          (`active`),
    KEY `idx_bonus_head_owner`           (`owner`)
);

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_head`
    (`id`, `site_id`, `name`, `description`, `active`,
     `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    (1, 1, 'Welcome',  'All first-deposit and early-lifecycle bonuses for new players.', 1, 'priya.sharma', 'admin',    'admin',    '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (2, 1, 'Reload',   'Deposit-match bonuses for returning players.',                  1, 'arjun.mehta',  'admin',    'admin',    '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (3, 1, 'Cashback', 'Loss-based cashback bonuses credited weekly.',                  1, 'priya.sharma', 'admin',    'ops.team', '2026-01-15 10:00:00', '2026-03-01 11:00:00');
