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
--
-- =============================================================================

CREATE TABLE `system_user` (
    `id`            INT           NOT NULL AUTO_INCREMENT,
    `display_name`  VARCHAR(200)  DEFAULT NULL,
    `active`        TINYINT(1)    NOT NULL DEFAULT 1,
    `created_by`    VARCHAR(100)  NOT NULL,
    `updated_by`    VARCHAR(100)  NOT NULL,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`      CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_system_user_display_name` (`display_name`),
    KEY `idx_system_user_active`         (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `system_user`
    (`id`, `display_name`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    (1,  'alice.morgan',  1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (2,  'bob.chen',      1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (3,  'carol.patel',   1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (4,  'david.kim',     1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (5,  'eva.smith',     1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (6,  'frank.jones',   1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (7,  'grace.liu',     1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (8,  'henry.obi',     1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (9,  'isla.reyes',    1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (10, 'james.wu',      1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00');
