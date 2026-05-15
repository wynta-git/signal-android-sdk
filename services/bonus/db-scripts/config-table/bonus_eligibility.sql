-- =============================================================================
-- TABLE: bonus_eligibility
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Header row for a set of eligibility rules on a bonus_configure node.
-- Each row represents one named eligibility rule. The actual criteria are
-- stored as key-value pairs in bonus_eligibility_key.
--
-- All active bonus_eligibility_key rows for the same eligibility_id are
-- ANDed together — a player must satisfy every active key to qualify.
--
-- USAGE
-- ─────
-- • One or more rows per configure_id (one per distinct rule set).
-- • At grant time the engine loads all active bonus_eligibility rows for the
--   configure_id, then for each loads its bonus_eligibility_key children and
--   evaluates them against the player's profile.
-- • Written only via the CMS; never updated at grant runtime.
-- • active = 0 soft-disables the whole rule set without deleting it.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_configure.id    ← bonus_eligibility.configure_id
-- bonus_eligibility.id  ← bonus_eligibility_key.eligibility_id
--
-- =============================================================================

CREATE TABLE `bonus_eligibility` (
    `id`           INT            NOT NULL AUTO_INCREMENT,
    `configure_id` INT            NOT NULL,
    -- references bonus_configure.id
    `site_id`      INT            NOT NULL,
    `description`  VARCHAR(500)   DEFAULT NULL,
    -- human-readable summary of this eligibility rule set
    `active`       TINYINT(1)     NOT NULL DEFAULT 1,
    `created_by`   VARCHAR(100)   NOT NULL,
    `updated_by`   VARCHAR(100)   NOT NULL,
    `created_at`   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`     CHAR(64)       DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    KEY `idx_bonus_eligibility_configure_id` (`configure_id`),
    KEY `idx_bonus_eligibility_site_active`  (`site_id`, `active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_eligibility`
    (`configure_id`, `site_id`, `description`, `active`, `created_by`, `updated_by`,
     `created_at`, `updated_at`)
VALUES
    -- configure_id=1: first-time depositor rule
    (1, 1, 'Player must have no prior deposits (first-time depositor).',
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- configure_id=2: VIP first-depositor rule
    (2, 1, 'Player must be VIP-tagged, KYC-verified, and have no prior deposits.',
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- configure_id=3: weekend reload – existing depositor
    (3, 1, 'Player must have at least one prior deposit and be playing on a weekend.',
     1, 'ops.team', 'ops.team', '2026-02-01 09:00:00', '2026-02-01 09:00:00');
