-- =============================================================================
-- TABLE: bonus_eligibility_key
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Child table of bonus_eligibility. Each row is one eligibility criterion
-- (key-value pair) that belongs to a parent bonus_eligibility rule set.
--
-- Multiple rows can exist for the same eligibility_id, allowing flexible
-- rule composition without schema changes. All rows for the same
-- eligibility_id are ANDed together at evaluation time.
--
-- USAGE
-- ─────
-- • One row per criterion per eligibility rule set.
-- • eligibility_key   — the name of the criterion (e.g. player_type,
--                       kyc_status, min_lifetime_deposits, player_tag).
-- • eligibility_value — the criterion value as a string; the grant engine
--                       casts it to the appropriate type using
--                       eligibility_value_type.
-- • eligibility_value_type — how to interpret eligibility_value:
--     STRING   → compare as plain string
--     INT      → cast to integer for numeric comparisons
--     DECIMAL  → cast to DECIMAL(18,2) for amount comparisons
--     BOOLEAN  → "true" / "false"
--     JSON     → parse as JSON object / array for complex conditions
--
-- COMMON eligibility_key VALUES
-- ──────────────────────────────
-- player_type            NEW | EXISTING | VIP | DORMANT
-- kyc_status             VERIFIED | UNVERIFIED | PENDING
-- player_segment         segment name string
-- player_tag             tag string (e.g. VIP, REFERRAL_SOURCE)
-- min_lifetime_deposits  INT   — minimum past deposit count
-- max_lifetime_deposits  INT   — maximum past deposit count
-- min_lifetime_amount    DECIMAL — minimum lifetime deposit amount
-- max_lifetime_amount    DECIMAL — maximum lifetime deposit amount
-- min_account_age_days   INT   — minimum account age in days
-- max_account_age_days   INT   — maximum account age in days
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_eligibility.id ← bonus_eligibility_key.eligibility_id
--
-- =============================================================================

CREATE TABLE `bonus_eligibility_key` (
    `id`                     BIGINT         NOT NULL AUTO_INCREMENT,
    `eligibility_id`         INT            NOT NULL,
    -- references bonus_eligibility.id
    `eligibility_key`        VARCHAR(100)   NOT NULL,
    -- criterion name (e.g. player_type, min_lifetime_deposits)
    `eligibility_value`      VARCHAR(500)   NOT NULL,
    -- criterion value as string; cast per eligibility_value_type
    `eligibility_value_type` VARCHAR(20)    NOT NULL DEFAULT 'STRING',
    -- STRING | INT | DECIMAL | BOOLEAN | JSON
    `created_at`             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                            ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_eligibility_key_eligibility_id` (`eligibility_id`),
    KEY `idx_eligibility_key_key`            (`eligibility_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data  (mirrors the old scalar-column sample data)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_eligibility_key`
    (`eligibility_id`, `eligibility_key`, `eligibility_value`, `eligibility_value_type`)
VALUES
    -- eligibility_id=1 (configure_id=1 — first-time depositor)
    (1, 'player_type',           'NEW',  'STRING'),
    (1, 'min_lifetime_deposits', '0',    'INT'),
    (1, 'max_lifetime_deposits', '0',    'INT'),

    -- eligibility_id=2 (configure_id=2 — VIP, KYC-verified, first-time depositor)
    (2, 'player_type',           'NEW',       'STRING'),
    (2, 'player_tag',            'VIP',       'STRING'),
    (2, 'kyc_status',            'VERIFIED',  'STRING'),
    (2, 'min_lifetime_deposits', '0',         'INT'),
    (2, 'max_lifetime_deposits', '0',         'INT'),

    -- eligibility_id=3 (configure_id=3 — existing depositor, weekend)
    (3, 'player_type',           'EXISTING',         'STRING'),
    (3, 'min_lifetime_deposits', '1',                'INT'),
    (3, 'eligibility_config',    '{"days_of_week": [6, 7]}', 'JSON');
