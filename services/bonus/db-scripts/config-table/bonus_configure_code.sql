-- =============================================================================
-- TABLE: bonus_configure_code
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Promo codes attached to a bonus_configure node. A single configure node can
-- have many codes; each code carries an optional per-grant amount override, an
-- optional validity window, and all UI metadata needed to render the code in
-- deposit / withdrawal / registration flows.
--
-- USAGE
-- ─────
-- • Players enter a promo code at deposit or registration time.
-- • The application looks up the code by (site_id, code) and verifies:
--     1. active = 1
--     2. NOW() is within valid_from / valid_to (if set)
--     3. All period limits in bonus_code_usage_limit are within cap
-- • If checks pass the grant proceeds using the parent configure node's
--   mechanics. max_amount overrides bonus_configure.bonus_amount_max if set.
-- • After a successful grant, usage_used is incremented in bonus_code_usage_limit
--   and a row is written to bonus_code_redemption_log — all in the same transaction.
-- • auto_apply = 1 causes the front-end to pre-fill / silently apply the code
--   when the player meets conditions, without manual entry.
--
-- Redemption count caps (HOURLY / DAILY / WEEKLY / MONTHLY) and their running
-- counters live in bonus_code_usage_limit — not on this table.
--
-- UI COLUMNS
-- ──────────
-- display_title       Short headline shown on the promo card / deposit screen
--                     (e.g. "Get 100% on your first deposit!").
-- display_description One or two lines of explanatory text beneath the title.
-- terms_url           Link to the full T&C page for this promo; NULL = use site default.
-- banner_image_url    CDN path to the card/banner image shown in the UI.
-- badge_text          Small pill label rendered on the card
--                     (e.g. "Popular", "Limited Time", "Exclusive"). NULL = no badge.
-- cta_text            Label for the apply/redeem button
--                     (e.g. "Apply Code", "Claim Bonus"). NULL = use site default.
-- auto_apply          1 = front-end pre-fills/applies the code silently when
--                     eligible; 0 = player must enter manually.
-- display_order       Ascending sort order when listing multiple codes. Lower = first.
-- display_on          Comma-separated list of payment flows where this code is shown
--                     (DEPOSIT | WITHDRAWAL | REGISTRATION). NULL = DEPOSIT only.
-- min_display_amount  Hide this code option until the entered amount meets this
--                     threshold. NULL = always show.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_configure.id      ← bonus_configure_code.configure_id
-- bonus_configure_code.id ← bonus_code_usage_limit.code_id
-- bonus_configure_code.id ← bonus_code_redemption_log.code_id
--
-- =============================================================================

CREATE TABLE `bonus_configure_code` (
    `id`                  INT            NOT NULL AUTO_INCREMENT,
    `configure_id`        INT            NOT NULL,
    -- references bonus_configure.id
    `site_id`             INT            NOT NULL,
    `code`                VARCHAR(50)    NOT NULL,
    `max_amount`          DECIMAL(18,2)  DEFAULT NULL,
    -- per-redemption grant cap; NULL = defer to configure node
    `valid_from`          DATETIME       DEFAULT NULL,
    `valid_to`            DATETIME       DEFAULT NULL,

    -- ── UI display ───────────────────────────────────────────────────────────
    `display_title`       VARCHAR(100)   DEFAULT NULL,
    -- headline shown on the promo card / deposit screen
    `display_description` VARCHAR(500)   DEFAULT NULL,
    -- supporting text shown beneath the title
    `terms_url`           VARCHAR(500)   DEFAULT NULL,
    -- link to full T&C page; NULL = use site default
    `banner_image_url`    VARCHAR(500)   DEFAULT NULL,
    -- CDN path to card/banner image
    `badge_text`          VARCHAR(50)    DEFAULT NULL,
    -- pill label on the card (e.g. "Popular", "Limited Time"); NULL = none
    `cta_text`            VARCHAR(100)   DEFAULT NULL,
    -- apply/redeem button label; NULL = site default
    `auto_apply`          TINYINT(1)     NOT NULL DEFAULT 0,
    -- 1 = pre-fill/apply silently when eligible; 0 = manual entry
    `display_order`       INT            NOT NULL DEFAULT 0,
    -- ascending sort order when listing codes; lower = first
    `display_on`          VARCHAR(100)   DEFAULT 'DEPOSIT',
    -- comma-separated flows: DEPOSIT | WITHDRAWAL | REGISTRATION
    `min_display_amount`  DECIMAL(18,2)  DEFAULT NULL,
    -- hide option until entered amount meets this threshold; NULL = always show

    `active`              TINYINT(1)     NOT NULL DEFAULT 1,
    `created_by`          VARCHAR(100)   NOT NULL,
    `updated_by`          VARCHAR(100)   NOT NULL,
    `created_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`            CHAR(64)       DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_code_site`        (`site_id`, `code`),
    KEY `idx_bonus_code_configure_id`      (`configure_id`),
    KEY `idx_bonus_code_active`            (`site_id`, `active`),
    KEY `idx_bonus_code_validity`          (`valid_from`, `valid_to`),
    KEY `idx_bonus_code_display_order`     (`site_id`, `active`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_configure_code`
    (`id`, `configure_id`, `site_id`, `code`, `max_amount`,
     `valid_from`, `valid_to`,
     `display_title`, `display_description`,
     `terms_url`, `banner_image_url`, `badge_text`, `cta_text`,
     `auto_apply`, `display_order`, `display_on`, `min_display_amount`,
     `active`, `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    -- WELCOME100: standard first-deposit code, auto-suggested at ₹500+
    (1, 1, 1, 'WELCOME100', NULL,
     '2026-01-01 00:00:00', '2026-12-31 23:59:59',
     'Get 100% on Your First Deposit!',
     'Use code WELCOME100 and get a 100% match bonus up to ₹5,000 on your first deposit.',
     '/terms/welcome100', '/cdn/banners/welcome100.png', 'Popular', 'Apply & Claim',
     0, 1, 'DEPOSIT', 500.00,
     1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),

    -- INFLUENCER50: limited-window influencer code, capped at ₹2,500
    (2, 1, 1, 'INFLUENCER50', 2500.00,
     '2026-04-01 00:00:00', '2026-06-30 23:59:59',
     'Exclusive Influencer Offer',
     'Special 100% match up to ₹2,500 — exclusively for referred players.',
     '/terms/influencer50', '/cdn/banners/influencer50.png', 'Exclusive', 'Redeem Now',
     0, 2, 'DEPOSIT', NULL,
     1, 'ops.team', 'ops.team', '2026-03-25 11:00:00', '2026-03-25 11:00:00'),

    -- VIP2026: VIP desk code, auto-applied when player is VIP-tagged
    (3, 2, 1, 'VIP2026', 20000.00,
     '2026-01-01 00:00:00', NULL,
     'VIP Welcome Bonus — Up to ₹20,000',
     'Your exclusive VIP bonus. A 100% match up to ₹20,000 with priority support.',
     '/terms/vip2026', '/cdn/banners/vip2026.png', 'VIP Only', 'Claim VIP Bonus',
     1, 1, 'DEPOSIT', 5000.00,
     1, 'admin', 'ops.team', '2026-01-01 09:00:00', '2026-04-20 09:00:00'),

    -- WEEKEND500: weekend reload code, shown on deposit flow Sat/Sun
    (4, 3, 1, 'WEEKEND500', 500.00,
     '2026-01-01 00:00:00', '2026-12-31 23:59:59',
     'Weekend Reload — Free ₹500 Bonus',
     'Deposit this weekend and get a flat ₹500 bonus credited instantly. No wagering!',
     '/terms/weekend500', '/cdn/banners/weekend500.png', 'Limited Time', 'Get Weekend Bonus',
     0, 1, 'DEPOSIT', 200.00,
     1, 'ops.team', 'ops.team', '2026-02-01 09:00:00', '2026-02-01 09:00:00');
