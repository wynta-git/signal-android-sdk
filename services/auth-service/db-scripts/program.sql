-- =============================================================================
-- TABLE: program
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Master record for each PAM program. A program is the top-level tenant
-- unit — it owns API tokens, events, and user profiles. Sites (operators)
-- are grouped under a program via site.program_id.
--
-- RELATIONSHIPS
-- ─────────────
-- program.id ← site.program_id
-- program.program_key → TokenContext.project_id (used in event pipeline)
--
-- CHANGE LOGGING
-- ──────────────
-- All INSERTs and UPDATEs are recorded in change_log with
-- table_name = 'program'. No DDL change is needed to that table.
--
-- =============================================================================

CREATE TABLE `program` (
    `id`            INT           NOT NULL AUTO_INCREMENT,
    `name`          VARCHAR(100)  NOT NULL,
    -- human-readable display name
    `program_key`   VARCHAR(50)   NOT NULL,
    -- machine-readable slug used as project_id in the event pipeline
    -- format: proj_<alphanumeric>, e.g. proj_abc123
    `description`   VARCHAR(500)  DEFAULT NULL,
    `timezone`      VARCHAR(50)   NOT NULL DEFAULT 'UTC',
    `currency`      VARCHAR(10)   NOT NULL DEFAULT 'USD',
    -- ISO 4217 base currency for this program
    `locale`        VARCHAR(20)   NOT NULL DEFAULT 'en-US',
    `active`        TINYINT(1)    NOT NULL DEFAULT 1,
    `created_by`    VARCHAR(100)  NOT NULL,
    `updated_by`    VARCHAR(100)  NOT NULL,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`      CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_program_key`     (`program_key`),
    UNIQUE KEY `uk_program_name`    (`name`),
    KEY `idx_program_active`        (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `program`
    (`id`, `name`, `program_key`, `description`, `timezone`, `currency`, `locale`,
     `active`, `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    (1,
     'Demo Program',
     'proj_demo01',
     'Default program for development and QA.',
     'Asia/Kolkata', 'INR', 'en-IN',
     1,
     'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    (2,
     'Production Program',
     'proj_prod01',
     'Live production program.',
     'UTC', 'USD', 'en-US',
     1,
     'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00');
