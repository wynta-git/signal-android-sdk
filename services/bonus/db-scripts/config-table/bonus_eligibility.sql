-- =============================================================================
-- TABLE: bonus_eligibility
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Defines which players are eligible for a given bonus_configure node.
-- Each row specifies one eligibility rule. All rules on the same configure_id
-- are ANDed together — a player must satisfy every active rule to qualify.
--
-- USAGE
-- ─────
-- • One or more rows per configure_id.
-- • At grant time the engine loads all active rows for the configure_id and
--   checks each criterion against the player's profile:
--     – player_type must match if not NULL
--     – player_segment must be in the player's segment list if not NULL
--     – player_tag must be present on the player's profile if not NULL
--     – kyc_status must match if not NULL
--     – lifetime_deposit_count must be within min/max bounds (NULL = no bound)
--     – lifetime_deposit_amount must be within min/max bounds (NULL = no bound)
--     – account_age_days must be within min/max bounds (NULL = no bound)
--     – any extra conditions in eligibility_config pass
-- • Written only via the CMS; never updated at grant runtime.
-- • active = 0 soft-disables a rule without deleting it.
--
-- PLAYER TYPE VALUES  (application-enforced; not a DB enum)
-- ──────────────────
-- NEW         Player has never made a deposit (deposit count = 0)
-- EXISTING    Player has made at least one deposit
-- VIP         Player is tagged as VIP in the player profile
-- DORMANT     Player has not deposited within the last N days
--
-- ELIGIBILITY CRITERIA COLUMNS
-- ─────────────────────────────
-- player_type              Filter by lifecycle stage. NULL = all types.
-- player_segment           Filter by segment name (e.g. "high_roller").
--                          NULL = all segments qualify.
-- player_tag               Filter by a specific player tag (e.g. "VIP",
--                          "REFERRAL_SOURCE"). NULL = no tag required.
-- kyc_status               Filter by KYC verification status
--                          (e.g. VERIFIED | UNVERIFIED | PENDING).
--                          NULL = any status qualifies.
-- min_lifetime_deposits    Minimum number of past deposits required. NULL = no minimum.
-- max_lifetime_deposits    Maximum number of past deposits allowed. NULL = no cap.
-- min_lifetime_amount      Minimum total lifetime deposit amount required. NULL = no min.
-- max_lifetime_amount      Maximum total lifetime deposit amount allowed. NULL = no cap.
-- min_account_age_days     Minimum account age in days. NULL = no minimum.
-- max_account_age_days     Maximum account age in days. NULL = no cap.
-- eligibility_config       JSON for any additional eligibility conditions not covered
--                          by the scalar columns (e.g. geo restrictions, device type,
--                          referral flags, specific game history).
-- description              Human-readable summary of this eligibility rule.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_configure.id ← bonus_eligibility.configure_id
--
-- =============================================================================

CREATE TABLE `bonus_eligibility` (
    `id`                      INT            NOT NULL AUTO_INCREMENT,
    `configure_id`            INT            NOT NULL,
    -- references bonus_configure.id
    `site_id`                 INT            NOT NULL,
    `player_type`             VARCHAR(20)    DEFAULT NULL,
    -- NEW | EXISTING | VIP | DORMANT; NULL = all types qualify
    `player_segment`          VARCHAR(100)   DEFAULT NULL,
    -- segment name the player must belong to; NULL = all segments qualify
    `player_tag`              VARCHAR(100)   DEFAULT NULL,
    -- player profile tag that must be present; NULL = no tag required
    `kyc_status`              VARCHAR(20)    DEFAULT NULL,
    -- VERIFIED | UNVERIFIED | PENDING; NULL = any status qualifies
    `min_lifetime_deposits`   INT            DEFAULT NULL,
    -- minimum number of past deposits; NULL = no minimum
    `max_lifetime_deposits`   INT            DEFAULT NULL,
    -- maximum number of past deposits; NULL = no cap
    `min_lifetime_amount`     DECIMAL(18,2)  DEFAULT NULL,
    -- minimum total lifetime deposit amount; NULL = no minimum
    `max_lifetime_amount`     DECIMAL(18,2)  DEFAULT NULL,
    -- maximum total lifetime deposit amount; NULL = no cap
    `min_account_age_days`    INT            DEFAULT NULL,
    -- minimum account age in days; NULL = no minimum
    `max_account_age_days`    INT            DEFAULT NULL,
    -- maximum account age in days; NULL = no cap
    `eligibility_config`      JSON           DEFAULT NULL,
    -- additional eligibility conditions (geo, device type, referral flags, etc.)
    `description`             VARCHAR(500)   DEFAULT NULL,
    -- human-readable summary of this eligibility rule
    `active`                  TINYINT(1)     NOT NULL DEFAULT 1,
    `created_by`              VARCHAR(100)   NOT NULL,
    `updated_by`              VARCHAR(100)   NOT NULL,
    `created_at`              DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`              DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`                CHAR(64)       DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    KEY `idx_bonus_eligibility_configure_id`         (`configure_id`),
    KEY `idx_bonus_eligibility_site_active`          (`site_id`, `active`),
    KEY `idx_bonus_eligibility_player_type`          (`player_type`),
    KEY `idx_bonus_eligibility_player_segment`       (`player_segment`),
    KEY `idx_bonus_eligibility_kyc_status`           (`kyc_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_eligibility`
    (`configure_id`, `site_id`, `player_type`, `player_segment`, `player_tag`,
     `kyc_status`,
     `min_lifetime_deposits`, `max_lifetime_deposits`,
     `min_lifetime_amount`, `max_lifetime_amount`,
     `min_account_age_days`, `max_account_age_days`,
     `eligibility_config`, `description`,
     `active`, `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    -- configure_id=1 (100% First Deposit up to 5000)
    -- Only brand-new players (zero past deposits), KYC not required
    (1, 1, 'NEW', NULL, NULL,
     NULL,
     0, 0,
     NULL, NULL,
     NULL, NULL,
     NULL,
     'Player must have no prior deposits (first-time depositor).',
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- configure_id=2 (100% First Deposit up to 20000 — VIP variant)
    -- VIP-tagged players only, KYC must be verified, first-time depositor
    (2, 1, 'NEW', NULL, 'VIP',
     'VERIFIED',
     0, 0,
     NULL, NULL,
     NULL, NULL,
     NULL,
     'Player must be VIP-tagged, KYC-verified, and have no prior deposits.',
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- configure_id=3 (Weekend Reload Flat 500)
    -- Any existing depositor; no VIP or KYC requirement; lifetime ≥ 1 deposit
    (3, 1, 'EXISTING', NULL, NULL,
     NULL,
     1, NULL,
     NULL, NULL,
     NULL, NULL,
     '{"days_of_week": [6, 7]}',
     'Player must have at least one prior deposit and be playing on a weekend.',
     1, 'ops.team', 'ops.team', '2026-02-01 09:00:00', '2026-02-01 09:00:00');
