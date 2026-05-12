-- =============================================================================
-- TABLE: bonus_release_trigger
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Defines which trigger events activate a given bonus_configure node, along
-- with the qualifying conditions that must be met for each trigger.
--
-- A single configure node can fire on multiple trigger types (e.g. DEPOSIT and
-- PROMO_CODE). Each row carries the full qualifying detail for that trigger so
-- the grant engine can validate the incoming event without extra lookups.
--
-- USAGE
-- ─────
-- • One row per (configure_id, trigger_type).
-- • At grant time the application matches the incoming event to a row by
--   (configure_id, trigger_type, active=1) and then validates:
--     – event amount is within min_trigger_amount / max_trigger_amount
--     – payment_method matches if payment_method is not NULL
--     – product matches if product is not NULL
--     – any extra conditions in trigger_config pass
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
--
-- TRIGGER DETAIL COLUMNS
-- ──────────────────────
-- min_trigger_amount  Minimum event amount required (e.g. min deposit ₹500).
--                     NULL = no minimum.
-- max_trigger_amount  Maximum event amount that qualifies (e.g. only deposits
--                     up to ₹50,000 are eligible). NULL = no maximum.
-- payment_method      Restrict trigger to a specific payment method
--                     (e.g. UPI, NETBANKING). NULL = all methods qualify.
-- product             Restrict trigger to a specific product
--                     (e.g. POKER, CASINO). NULL = all products qualify.
-- occurrence          Which occurrence of this event qualifies:
--                     1 = first-ever, 2 = second, 0 = every occurrence.
-- trigger_config      JSON for any additional qualifying conditions not covered
--                     by the scalar columns (e.g. specific game IDs, time
--                     windows, player tags).
-- description         Human-readable summary of what this trigger does.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_configure.id ← bonus_release_trigger.configure_id
--
-- =============================================================================

CREATE TABLE `bonus_release_trigger` (
    `id`                   INT            NOT NULL AUTO_INCREMENT,
    `configure_id`         INT            NOT NULL,
    -- references bonus_configure.id
    `site_id`              INT            NOT NULL,
    `trigger_type`         VARCHAR(50)    NOT NULL,
    -- DEPOSIT | REGISTRATION | MANUAL | REFERRAL | PROMO_CODE | MILESTONE
    `description`          VARCHAR(500)   DEFAULT NULL,
    -- human-readable summary of this trigger and its conditions
    `min_trigger_amount`   DECIMAL(18,2)  DEFAULT NULL,
    -- minimum qualifying event amount; NULL = no minimum
    `max_trigger_amount`   DECIMAL(18,2)  DEFAULT NULL,
    -- maximum qualifying event amount; NULL = no cap
    `payment_method`       VARCHAR(50)    DEFAULT NULL,
    -- restrict to a payment method (UPI | NETBANKING | CARD | WALLET); NULL = all
    `product`              VARCHAR(50)    DEFAULT NULL,
    -- restrict to a product (POKER | CASINO | RUMMY); NULL = all products
    `occurrence`           INT            NOT NULL DEFAULT 0,
    -- 0 = every occurrence; 1 = first only; N = Nth occurrence
    `trigger_config`       JSON           DEFAULT NULL,
    -- additional qualifying conditions (game IDs, time windows, player tags, etc.)
    `active`               TINYINT(1)     NOT NULL DEFAULT 1,
    `created_by`           VARCHAR(100)   NOT NULL,
    `updated_by`           VARCHAR(100)   NOT NULL,
    `created_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,
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
    (`configure_id`, `site_id`, `trigger_type`, `description`,
     `min_trigger_amount`, `max_trigger_amount`, `payment_method`, `product`,
     `occurrence`, `trigger_config`,
     `active`, `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    -- configure_id=1 (100% First Deposit up to 5000)
    -- DEPOSIT: first deposit only, minimum ₹500, poker only
    (1, 1, 'DEPOSIT',
     'Fires on the player''s first-ever deposit of at least ₹500.',
     500.00, NULL, NULL, 'POKER',
     1, NULL,
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- PROMO_CODE: any deposit with a valid code, no minimum
    (1, 1, 'PROMO_CODE',
     'Fires when any deposit is accompanied by a valid promo code.',
     NULL, NULL, NULL, 'POKER',
     0, NULL,
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- MANUAL: operator-initiated, no amount or product constraint
    (1, 1, 'MANUAL',
     'Operator manually grants this bonus from the CMS on a case-by-case basis.',
     NULL, NULL, NULL, NULL,
     0, NULL,
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- configure_id=2 (VIP First Deposit up to 20000)
    -- DEPOSIT: first deposit ≥ ₹5,000, VIP-tagged players only
    (2, 1, 'DEPOSIT',
     'Fires on first deposit of at least ₹5,000 for VIP-eligible players.',
     5000.00, NULL, NULL, 'POKER',
     1, '{"player_tag": "VIP"}',
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- MANUAL: VIP desk can grant directly, requires approval flag
    (2, 1, 'MANUAL',
     'VIP desk manually grants this bonus after player verification.',
     NULL, NULL, NULL, NULL,
     0, '{"requires_approval": true}',
     1, 'admin', 'ops.team', '2026-01-01 09:00:00', '2026-04-15 10:30:00'),

    -- configure_id=3 (Weekend Reload Flat 500)
    -- DEPOSIT: any deposit on Sat/Sun ≥ ₹200, UPI or NETBANKING only
    (3, 1, 'DEPOSIT',
     'Fires on any weekend deposit of at least ₹200 via UPI or NETBANKING.',
     200.00, NULL, 'UPI,NETBANKING', 'POKER',
     0, '{"days_of_week": [6, 7]}',
     1, 'ops.team', 'ops.team', '2026-02-01 09:00:00', '2026-02-01 09:00:00'),

    -- PROMO_CODE: weekend code redeemed at any deposit, no amount constraint
    (3, 1, 'PROMO_CODE',
     'Fires when the WEEKEND500 promo code is submitted with any deposit.',
     NULL, NULL, NULL, NULL,
     0, NULL,
     1, 'ops.team', 'ops.team', '2026-02-01 09:00:00', '2026-02-01 09:00:00');
