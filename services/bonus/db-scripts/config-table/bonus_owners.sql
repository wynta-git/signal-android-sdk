-- =============================================================================
-- TABLE: bonus_owners
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Tracks all responsible persons associated with a bonus_head or bonus_subhead,
-- each with a defined role. Supports multiple people per entity — e.g. a head
-- can have an ops lead, a campaign manager, and a finance approver simultaneously.
--
-- The primary owner remains on bonus_head / bonus_subhead directly.
-- This table holds every other stakeholder and their responsibility.
--
-- USAGE
-- ─────
-- • One row per (entity_type, entity_id, username) — a person cannot hold
--   duplicate entries on the same entity.
-- • role describes the person's responsibility (e.g. OPS_LEAD, CAMPAIGN_MANAGER,
--   FINANCE_APPROVER, ESCALATION_CONTACT).
-- • active = 0 soft-deletes an assignment without losing history.
-- • Written only via the CMS by an operator; never touched at grant runtime.
--
-- ROLES  (suggested values — enforced by the application, not a DB enum)
-- ──────
-- OPS_LEAD            Day-to-day operational oversight
-- CAMPAIGN_MANAGER    Designs and monitors the bonus campaign
-- FINANCE_APPROVER    Approves budget changes
-- ESCALATION_CONTACT  First point of contact for incidents or disputes
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_head.id    → bonus_owners (entity_type='HEAD',    entity_id)
-- bonus_subhead.id → bonus_owners (entity_type='SUBHEAD', entity_id)
--
-- =============================================================================

CREATE TABLE `bonus_owners` (
    `id`          INT           NOT NULL AUTO_INCREMENT,
    `entity_type` VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD
    `entity_id`   INT           NOT NULL,
    `site_id`     INT           NOT NULL,
    `username`    VARCHAR(100)  NOT NULL,
    -- internal username / employee ID of the responsible person
    `role`        VARCHAR(50)   NOT NULL,
    -- OPS_LEAD | CAMPAIGN_MANAGER | FINANCE_APPROVER | ESCALATION_CONTACT
    `active`      TINYINT(1)    NOT NULL DEFAULT 1,
    `created_by`  VARCHAR(100)  NOT NULL,
    `updated_by`  VARCHAR(100)  NOT NULL,
    `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`    CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_responsible_person`         (`entity_type`, `entity_id`, `username`),
    KEY `idx_responsible_person_entity`        (`entity_type`, `entity_id`),
    KEY `idx_responsible_person_username`      (`username`),
    KEY `idx_responsible_person_site_active`   (`site_id`, `active`)
);

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_owners`
    (`entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`,
     `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    -- bonus_head id=1 (Welcome)
    ('HEAD', 1, 1, 'rahul.dev',    'OPS_LEAD',            1, 'admin', 'admin',    '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    ('HEAD', 1, 1, 'sneha.ops',    'CAMPAIGN_MANAGER',    1, 'admin', 'admin',    '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    ('HEAD', 1, 1, 'finance.lead', 'FINANCE_APPROVER',    1, 'admin', 'admin',    '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- bonus_head id=2 (Reload)
    ('HEAD', 2, 1, 'sneha.ops',    'OPS_LEAD',            1, 'admin', 'admin',    '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    ('HEAD', 2, 1, 'finance.lead', 'FINANCE_APPROVER',    1, 'admin', 'admin',    '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- bonus_head id=3 (Cashback)
    ('HEAD', 3, 1, 'rahul.dev',    'ESCALATION_CONTACT',  1, 'admin', 'ops.team', '2026-01-15 10:00:00', '2026-03-01 11:00:00'),

    -- bonus_subhead id=1 (First Deposit)
    ('SUBHEAD', 1, 1, 'rahul.dev',    'OPS_LEAD',          1, 'admin', 'admin',    '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    ('SUBHEAD', 1, 1, 'sneha.ops',    'CAMPAIGN_MANAGER',  1, 'admin', 'admin',    '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- bonus_subhead id=2 (Second Deposit)
    ('SUBHEAD', 2, 1, 'sneha.ops',    'CAMPAIGN_MANAGER',  1, 'admin', 'admin',    '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- bonus_subhead id=3 (Weekend Reload)
    ('SUBHEAD', 3, 1, 'sneha.ops',    'OPS_LEAD',          1, 'admin', 'ops.team', '2026-01-01 09:00:00', '2026-03-10 14:00:00'),
    ('SUBHEAD', 3, 1, 'rahul.dev',    'ESCALATION_CONTACT',1, 'admin', 'ops.team', '2026-01-01 09:00:00', '2026-03-10 14:00:00'),

    -- bonus_subhead id=4 (Midweek Reload)
    ('SUBHEAD', 4, 1, 'sneha.ops',    'OPS_LEAD',          1, 'ops.team', 'ops.team', '2026-02-01 09:00:00', '2026-02-01 09:00:00');
