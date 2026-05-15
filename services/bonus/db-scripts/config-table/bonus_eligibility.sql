-- =============================================================================
-- TABLE: bonus_eligibility
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- One row per eligibility criterion for a bonus_configure node.
-- Multiple rows for the same configure_id are ALL required to pass (AND).
--
-- Each row is a self-contained key-value criterion with audit fields.
-- No separate child table — eligibility_key and eligibility_value live here.
--
-- USAGE
-- ─────
-- • One row per criterion per configure_id.
-- • At grant time the engine loads all active rows for the configure_id
--   and evaluates each one against the event properties.
--   All must pass — a single failing criterion blocks the grant.
-- • Written only via the CMS; never updated at grant runtime.
-- • active = 0 soft-disables a criterion without deleting it.
--
-- COMMON eligibility_key VALUES
-- ──────────────────────────────
-- player_registered_period   STRING  CURRENT_MONTH | CURRENT_WEEK | CURRENT_YEAR
-- player_type                STRING  NEW | EXISTING | VIP | DORMANT
-- kyc_status                 STRING  VERIFIED | UNVERIFIED | PENDING
-- player_segment             STRING  segment name
-- player_tag                 STRING  tag name (e.g. VIP, REFERRAL_SOURCE)
-- min_lifetime_deposits      INT     minimum past deposit count
-- max_lifetime_deposits      INT     maximum past deposit count
-- min_lifetime_amount        DECIMAL minimum lifetime deposit amount
-- max_lifetime_amount        DECIMAL maximum lifetime deposit amount
-- min_account_age_days       INT     minimum account age in days
-- max_account_age_days       INT     maximum account age in days
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_configure.id ← bonus_eligibility.configure_id
--
-- =============================================================================

CREATE TABLE `bonus_eligibility` (
    `id`                     INT            NOT NULL AUTO_INCREMENT,
    `configure_id`           INT            NOT NULL,
    -- references bonus_configure.id
    `site_id`                INT            NOT NULL,
    `eligibility_key`        VARCHAR(100)   NOT NULL,
    -- criterion name (see COMMON eligibility_key VALUES above)
    `eligibility_value`      VARCHAR(500)   NOT NULL,
    -- criterion value as string; cast per eligibility_value_type
    `eligibility_value_type` VARCHAR(20)    NOT NULL DEFAULT 'STRING',
    -- STRING | INT | DECIMAL | BOOLEAN | JSON
    `description`            VARCHAR(500)   DEFAULT NULL,
    -- human-readable summary of this criterion
    `active`                 TINYINT(1)     NOT NULL DEFAULT 1,
    `created_by`             VARCHAR(100)   NOT NULL,
    `updated_by`             VARCHAR(100)   NOT NULL,
    `created_at`             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                            ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`               CHAR(64)       DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_eligibility_configure_key` (`configure_id`, `eligibility_key`),
    KEY `idx_bonus_eligibility_configure_id` (`configure_id`),
    KEY `idx_bonus_eligibility_site_active`  (`site_id`, `active`),
    KEY `idx_bonus_eligibility_key`          (`eligibility_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_eligibility`
    (`configure_id`, `site_id`, `eligibility_key`, `eligibility_value`,
     `eligibility_value_type`, `description`, `active`, `created_by`, `updated_by`)
VALUES
    -- configure_id=1: first-time depositor
    (1, 1, 'player_type',           'NEW',   'STRING',
     'Player must be a new account with no prior deposits', 1, 'admin', 'admin'),
    (1, 1, 'min_lifetime_deposits', '0',     'INT',
     'No prior deposits allowed', 1, 'admin', 'admin'),

    -- configure_id=2: VIP, KYC-verified, first-time depositor
    (2, 1, 'player_type',           'NEW',      'STRING',
     'New players only', 1, 'admin', 'admin'),
    (2, 1, 'player_tag',            'VIP',      'STRING',
     'Player must carry the VIP tag', 1, 'admin', 'admin'),
    (2, 1, 'kyc_status',            'VERIFIED', 'STRING',
     'KYC must be verified', 1, 'admin', 'admin'),

    -- configure_id=3: registered this month
    (3, 1, 'player_registered_period', 'CURRENT_MONTH', 'STRING',
     'Player must have registered in the current calendar month', 1, 'ops.lead', 'ops.lead');
