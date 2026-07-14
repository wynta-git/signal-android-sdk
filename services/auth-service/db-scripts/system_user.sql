-- =============================================================================
-- TABLE: system_user
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Stores credentials and profile for every operator/admin who can log into
-- the PAM portal. A system user is distinct from a player (end-user) and
-- from a service account (machine-to-machine via service_accounts in Mongo).
--
-- PASSWORD STORAGE
-- ────────────────
-- password_hash stores the bcrypt output. Plaintext passwords must never be
-- written to this table or to any log.
--
-- CHANGE LOGGING
-- ──────────────
-- All INSERTs and UPDATEs are recorded in change_log with
-- table_name = 'system_user'. No DDL change is needed to that table.
--
-- RELATIONSHIPS
-- ─────────────
-- system_user.id ← user_site_role.user_id
-- system_user.program_id ~ program.id (no FK, informational only — same
-- convention as site.program_id)
--
-- EXTERNAL IDENTITY
-- ─────────────────
-- external_id is the bridge token's "user_id" claim (see
-- shared/auth/external_token.py) — the stable identity from the external
-- system, and the real lookup/uniqueness key for "does this user already
-- exist" during auto-provisioning. display_name is a separate,
-- human-readable label derived from that user's email local-part; it keeps
-- its own uniqueness but is no longer what existence is decided by.
-- email + program_id together are the intended identification pair for a
-- user within a given program — the same email may be a portal user under
-- multiple different programs (separate rows), but must be unique within
-- one program (see uk_system_user_email_program below).
--
-- =============================================================================

CREATE TABLE `system_user` (
    `id`            INT           NOT NULL AUTO_INCREMENT,
    `external_id`   VARCHAR(100)  NOT NULL,
    -- bridge token's "user_id" claim; the real identity/lookup key
    `email`         VARCHAR(255)  NOT NULL,
    -- bridge token's "email" claim; paired with program_id as the
    -- identification pair for a user within a program
    `display_name`  VARCHAR(200)  DEFAULT NULL,
    `program_id`    INT           DEFAULT NULL,
    -- logical program this user was auto-provisioned/associated with;
    -- NULL = none. No FK constraint — same convention as site.program_id.
    `active`        TINYINT(1)    NOT NULL DEFAULT 1,
    `created_by`    VARCHAR(100)  NOT NULL,
    `updated_by`    VARCHAR(100)  NOT NULL,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`      CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_system_user_external_id`     (`external_id`),
    UNIQUE KEY `uk_system_user_display_name`    (`display_name`),
    UNIQUE KEY `uk_system_user_email_program`   (`email`, `program_id`),
    KEY `idx_system_user_active`         (`active`),
    KEY `idx_system_user_program_id`     (`program_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data (external_id/email values are seed placeholders, not real
-- bridge-token data)
-- -----------------------------------------------------------------------------
INSERT INTO `system_user`
    (`id`, `external_id`, `email`, `display_name`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    (1,  'ext_seed_001', 'alice.morgan@example.com', 'alice.morgan',  1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (2,  'ext_seed_002', 'bob.chen@example.com',     'bob.chen',      1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (3,  'ext_seed_003', 'carol.patel@example.com',  'carol.patel',   1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (4,  'ext_seed_004', 'david.kim@example.com',    'david.kim',     1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (5,  'ext_seed_005', 'eva.smith@example.com',    'eva.smith',     1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (6,  'ext_seed_006', 'frank.jones@example.com',  'frank.jones',   1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (7,  'ext_seed_007', 'grace.liu@example.com',    'grace.liu',     1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (8,  'ext_seed_008', 'henry.obi@example.com',    'henry.obi',     1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (9,  'ext_seed_009', 'isla.reyes@example.com',   'isla.reyes',    1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (10, 'ext_seed_010', 'james.wu@example.com',     'james.wu',      1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00');
