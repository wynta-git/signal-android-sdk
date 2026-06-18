-- =============================================================================
-- TABLE: bonus_release_trigger
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Defines which trigger events activate a given bonus_configure node.
-- Qualifying conditions are stored as a free-form JSON object in
-- trigger_config, giving full flexibility without schema migrations.
--
-- USAGE
-- ─────
-- • One row per (configure_id, trigger_type).
-- • At grant time the application matches the incoming event to a row by
--   (configure_id, trigger_type, active=1) and evaluates trigger_config
--   to validate any additional qualifying conditions.
-- • Written only via the CMS; never touched at grant runtime.
-- • active = 0 soft-disables a trigger without deleting the record.
--
-- TRIGGER TYPES
-- ─────────────
-- DEPOSIT       Player completes a qualifying deposit
-- REGISTRATION  Player registers for the first time
-- MANUAL        Operator grants the bonus manually from the CMS
-- REFERRAL      Referred friend completes a qualifying action
-- PROMO_CODE    Player redeems a promo code (see bonus_configure_code)
-- MILESTONE     Player reaches a defined activity milestone
-- APP_VISIT     Player opens the app
-- BET_PLACED    Player places a bet
-- LOGIN         Player logs in
-- LEADERBOARD_WON  Player wins a leaderboard
-- TOURNAMENT_WON   Player wins a tournament
-- FRIEND_SIGNUP    Referred friend signs up
--
-- TRIGGER CONFIG KEYS (common, non-exhaustive)
-- ─────────────────────────────────────────────
-- min_amount       Minimum event amount required (e.g. ₹500)
-- max_amount       Maximum event amount that qualifies
-- payment_method   Restrict to a payment method (UPI | NETBANKING | CARD | WALLET)
-- product          Restrict to a product (POKER | CASINO | RUMMY)
-- occurrence       Which occurrence qualifies: 0=every, 1=first, N=Nth
-- days_of_week     Array of ISO weekday numbers (1=Mon … 7=Sun)
-- player_tag       Restrict to players with this tag (e.g. "VIP")
-- requires_approval  true if operator approval is needed before grant
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_configure.id ← bonus_release_trigger.configure_id
--
-- =============================================================================

CREATE TABLE `bonus_release_trigger` (
    `id`             INT            NOT NULL AUTO_INCREMENT,
    `configure_id`   INT            NOT NULL,
    -- references bonus_configure.id
    `site_id`        INT            NOT NULL,
    `trigger_type`   VARCHAR(50)    NOT NULL,
    `release_type` VARCHAR(20) NOT NULL DEFAULT 'BONUS_RELEASE',
    -- DEPOSIT | REGISTRATION | MANUAL | REFERRAL | PROMO_CODE | MILESTONE | …
    `trigger_config` JSON           DEFAULT NULL,
    -- free-form key-value qualifying conditions
    `active`         TINYINT(1)     NOT NULL DEFAULT 1,
    `created_by`     VARCHAR(100)   NOT NULL,
    `updated_by`     VARCHAR(100)   NOT NULL,
    `created_at`     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`       CHAR(64)       DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_release_trigger`              (`configure_id`, `trigger_type`),
    KEY `idx_bonus_release_trigger_configure_id`       (`configure_id`),
    KEY `idx_bonus_release_trigger_type`               (`trigger_type`),
    KEY `idx_bonus_release_trigger_site_active`        (`site_id`, `active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_release_trigger`
    (`configure_id`, `site_id`, `trigger_type`, `trigger_config`,
     `active`, `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    -- configure_id=1 (100% First Deposit up to 5000)
    (1, 1, 'DEPOSIT',
     '{"min_amount": 500, "product": "POKER", "occurrence": 1}',
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    (1, 1, 'PROMO_CODE',
     '{"product": "POKER"}',
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    (1, 1, 'MANUAL',
     NULL,
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- configure_id=2 (VIP First Deposit up to 20000)
    (2, 1, 'DEPOSIT',
     '{"min_amount": 5000, "product": "POKER", "occurrence": 1, "player_tag": "VIP"}',
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    (2, 1, 'MANUAL',
     '{"requires_approval": true}',
     1, 'admin', 'ops.team', '2026-01-01 09:00:00', '2026-04-15 10:30:00'),

    -- configure_id=3 (Weekend Reload Flat 500)
    (3, 1, 'DEPOSIT',
     '{"min_amount": 200, "payment_method": "UPI,NETBANKING", "product": "POKER", "days_of_week": [6, 7]}',
     1, 'ops.team', 'ops.team', '2026-02-01 09:00:00', '2026-02-01 09:00:00'),

    (3, 1, 'PROMO_CODE',
     NULL,
     1, 'ops.team', 'ops.team', '2026-02-01 09:00:00', '2026-02-01 09:00:00');
