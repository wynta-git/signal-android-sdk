-- =============================================================================
-- TABLE: bonus_budget_limit
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Configuration-only table. Stores the spend cap for each (entity, period)
-- combination across the budget hierarchy: HEAD, SUBHEAD, and CONFIGURE.
--
-- This table changes only when an operator reconfigures a budget cap.
-- Running counters (how much has been spent) live in bonus_budget_usage so
-- that high-frequency grant writes never touch this table.
--
-- USAGE
-- ─────
-- • One row per (entity_type, entity_id, period_type).
-- • Read at grant time to determine the allowed ceiling.
-- • Written only via the CMS when an operator creates or adjusts a cap.
-- • NULL on budget_limit means uncapped for that period.
-- • Change history is trackable by auditing this table's updated_at; because
--   it is never written on the hot grant path, any change here is operator-driven.
--
-- PERIOD TYPES
-- ────────────
-- DAILY   — calendar day cap
-- WEEKLY  — ISO week (Monday–Sunday) cap
-- MONTHLY — calendar month cap
--
-- ENTITY TYPES
-- ────────────
-- HEAD      → entity_id references bonus_head.id
-- SUBHEAD   → entity_id references bonus_subhead.id
-- CONFIGURE → entity_id references bonus_configure.id
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_budget_limit (entity_type, entity_id, period_type)
--     ← bonus_budget_usage (entity_type, entity_id, period_type)
--
-- =============================================================================

CREATE TABLE `bonus_budget_limit` (
    `id`           INT           NOT NULL AUTO_INCREMENT,
    `entity_type`  VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE
    `entity_id`    INT           NOT NULL,
    `site_id`      INT           NOT NULL,
    `period_type`  VARCHAR(10)   NOT NULL,
    -- DAILY | WEEKLY | MONTHLY
    `budget_limit` DECIMAL(18,2) DEFAULT NULL,
    -- NULL = uncapped
    `created_by`   VARCHAR(100)  NOT NULL,
    `updated_by`   VARCHAR(100)  NOT NULL,
    `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`     CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_budget_limit`       (`entity_type`, `entity_id`, `period_type`),
    KEY `idx_budget_limit_entity`      (`entity_type`, `entity_id`),
    KEY `idx_budget_limit_site`        (`site_id`)
);

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_budget_limit`
    (`entity_type`, `entity_id`, `site_id`, `period_type`, `budget_limit`, `created_by`, `updated_by`)
VALUES
    -- bonus_head id=1 (Welcome)
    -- bonus_head id=1 (Welcome)
    ('HEAD', 1, 1, 'DAILY',   NULL,        'admin',    'admin'),
    ('HEAD', 1, 1, 'WEEKLY',  500000.00,   'admin',    'admin'),
    ('HEAD', 1, 1, 'MONTHLY', 2000000.00,  'admin',    'ops.team'),

    -- bonus_head id=2 (Reload)
    ('HEAD', 2, 1, 'DAILY',    50000.00,   'admin',    'admin'),
    ('HEAD', 2, 1, 'WEEKLY',  250000.00,   'admin',    'admin'),
    ('HEAD', 2, 1, 'MONTHLY', 800000.00,   'admin',    'admin'),

    -- bonus_head id=3 (Cashback)
    ('HEAD', 3, 1, 'DAILY',   NULL,        'ops.team', 'ops.team'),
    ('HEAD', 3, 1, 'WEEKLY',  NULL,        'ops.team', 'ops.team'),
    ('HEAD', 3, 1, 'MONTHLY', 1000000.00,  'ops.team', 'ops.team'),

    -- bonus_subhead id=1 (First Deposit)
    ('SUBHEAD', 1, 1, 'DAILY',   NULL,        'admin',    'admin'),
    ('SUBHEAD', 1, 1, 'WEEKLY',  300000.00,   'admin',    'admin'),
    ('SUBHEAD', 1, 1, 'MONTHLY', 1200000.00,  'admin',    'ops.team'),

    -- bonus_subhead id=3 (Weekend Reload)
    ('SUBHEAD', 3, 1, 'DAILY',    30000.00,   'admin',    'ops.team'),
    ('SUBHEAD', 3, 1, 'WEEKLY',  150000.00,   'admin',    'ops.team'),
    ('SUBHEAD', 3, 1, 'MONTHLY', 500000.00,   'admin',    'ops.team'),

    -- bonus_configure id=1 (100% First Deposit up to 5000)
    ('CONFIGURE', 1, 1, 'DAILY',   NULL,        'admin',    'admin'),
    ('CONFIGURE', 1, 1, 'WEEKLY',  150000.00,   'admin',    'admin'),
    ('CONFIGURE', 1, 1, 'MONTHLY', 600000.00,   'admin',    'admin'),

    -- bonus_configure id=2 (VIP First Deposit up to 20000)
    ('CONFIGURE', 2, 1, 'DAILY',   NULL,        'admin',    'ops.team'),
    ('CONFIGURE', 2, 1, 'WEEKLY',  100000.00,   'admin',    'ops.team'),
    ('CONFIGURE', 2, 1, 'MONTHLY', 400000.00,   'admin',    'ops.team'),

    -- bonus_configure id=3 (Weekend Reload Flat 500)
    ('CONFIGURE', 3, 1, 'DAILY',    15000.00,   'ops.team', 'ops.team'),
    ('CONFIGURE', 3, 1, 'WEEKLY',   75000.00,   'ops.team', 'ops.team'),
    ('CONFIGURE', 3, 1, 'MONTHLY', 250000.00,   'ops.team', 'ops.team');
