-- wynta_bonus — full schema reset (DDL only, no sample data)

SET FOREIGN_KEY_CHECKS = 0;

-- Drop all tables (reverse dependency order)
DROP TABLE IF EXISTS `bonus_spend_monthly`;
DROP TABLE IF EXISTS `bonus_spend_weekly`;
DROP TABLE IF EXISTS `bonus_spend_daily`;
DROP TABLE IF EXISTS `bonus_code_usage_limit_change_log`;
DROP TABLE IF EXISTS `bonus_budget_limit_change_log`;
DROP TABLE IF EXISTS `bonus_release_trigger_change_log`;
DROP TABLE IF EXISTS `bonus_owners_change_log`;
DROP TABLE IF EXISTS `bonus_eligibility_change_log`;
DROP TABLE IF EXISTS `bonus_configure_code_change_log`;
DROP TABLE IF EXISTS `bonus_configure_change_log`;
DROP TABLE IF EXISTS `bonus_subhead_change_log`;
DROP TABLE IF EXISTS `bonus_head_change_log`;
DROP TABLE IF EXISTS `bonus_audit_log`;
DROP TABLE IF EXISTS `bonus_forfeit`;
DROP TABLE IF EXISTS `bonus_consumed`;
DROP TABLE IF EXISTS `bonus_code_usage`;
DROP TABLE IF EXISTS `bonus_budget_usage`;
DROP TABLE IF EXISTS `bonus_chunk_expiry`;
DROP TABLE IF EXISTS `bonus_chunk_release`;
DROP TABLE IF EXISTS `bonus_chunk_wager`;
DROP TABLE IF EXISTS `bonus_chunk`;
DROP TABLE IF EXISTS `user_bonus_grant`;
DROP TABLE IF EXISTS `bonus_code_usage_limit`;
DROP TABLE IF EXISTS `bonus_budget_limit`;
DROP TABLE IF EXISTS `bonus_release_trigger`;
DROP TABLE IF EXISTS `bonus_owners`;
DROP TABLE IF EXISTS `bonus_eligibility`;
DROP TABLE IF EXISTS `bonus_configure_code`;
DROP TABLE IF EXISTS `bonus_configure`;
DROP TABLE IF EXISTS `bonus_subhead`;
DROP TABLE IF EXISTS `bonus_head`;

SET FOREIGN_KEY_CHECKS = 1;

-- Create tables

-- bonus_head
CREATE TABLE `bonus_head` (
    `id`          INT           NOT NULL AUTO_INCREMENT,
    `site_id`     INT           NOT NULL,
    `name`        VARCHAR(100)  NOT NULL,
    `description` VARCHAR(500)  DEFAULT NULL,
    `active`             TINYINT(1)    NOT NULL DEFAULT 1,
    `owner`      VARCHAR(100)  NOT NULL,
    -- primary accountable person; additional contacts in bonus_responsible_person
    `created_by` VARCHAR(100)  NOT NULL,
    `updated_by`         VARCHAR(100)  NOT NULL,
    `created_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`           CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_head_site_name` (`site_id`, `name`),
    KEY `idx_bonus_head_site_id`         (`site_id`),
    KEY `idx_bonus_head_active`          (`active`),
    KEY `idx_bonus_head_owner`           (`owner`)
);

-- bonus_subhead
CREATE TABLE `bonus_subhead` (
    `id`          INT           NOT NULL AUTO_INCREMENT,
    `head_id`     INT           NOT NULL,
    -- references bonus_head.id
    `site_id`     INT           NOT NULL,
    `name`        VARCHAR(100)  NOT NULL,
    `description` VARCHAR(500)  DEFAULT NULL,
    `active`             TINYINT(1)    NOT NULL DEFAULT 1,
    `owner`      VARCHAR(100)  NOT NULL,
    -- primary accountable person; additional contacts in bonus_responsible_person
    `created_by` VARCHAR(100)  NOT NULL,
    `updated_by`         VARCHAR(100)  NOT NULL,
    `created_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`           CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_subhead_head_name` (`head_id`, `name`),
    KEY `idx_bonus_subhead_head_id`         (`head_id`),
    KEY `idx_bonus_subhead_site_id`         (`site_id`),
    KEY `idx_bonus_subhead_active`          (`active`),
    KEY `idx_bonus_subhead_owner`           (`owner`)
);

-- bonus_configure
CREATE TABLE `bonus_configure` (
    `id`                     INT            NOT NULL AUTO_INCREMENT,
    `subhead_id`             INT            NOT NULL,
    -- references bonus_subhead.id
    `site_id`                INT            NOT NULL,
    `name`                   VARCHAR(100)   NOT NULL,
    `description`            VARCHAR(500)   DEFAULT NULL,

    -- ── Bonus mechanics ──────────────────────────────────────────────────────
    `start_date`             DATETIME       NOT NULL,
    `end_date`               DATETIME       NOT NULL,
    `applicability_frequency` VARCHAR(20)   NOT NULL DEFAULT 'EVERYTIME',
    -- EVERYTIME | ONCE | MONTHLY | WEEKLY
    -- ── Bonus release config ─────────────────────────────────────────────────
    `wager_multiplier`       DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    -- 0 = no wagering required; >0 = chunk wager multiplier
    `no_of_chunks`           INT            NOT NULL DEFAULT 1,
    -- number of equal chunks the bonus is split into
    `release_bucket`         VARCHAR(50)    DEFAULT NULL,
    -- trigger bucket that releases the bonus (e.g. DEPOSIT_INSTANT)
    `chunk_expiry_days`      INT            DEFAULT NULL,
    -- days from grant until an unreleased chunk expires
    `bonus_expiry_days`      INT            DEFAULT NULL,
    -- days from chunk release until the credit expires (post-release)
    `wager_chip_type`        VARCHAR(50)    NOT NULL DEFAULT 'CASH',
    `credit_chip_type`       VARCHAR(50)    NOT NULL DEFAULT 'CASH',

    -- ── Grant caps ───────────────────────────────────────────────────────────
    `bonus_amount_fixed`     DECIMAL(18,2)  DEFAULT NULL,
    -- flat grant amount when trigger supplies no explicit value
    `bonus_amount_percent`   DECIMAL(5,2)   DEFAULT NULL,
    -- % of trigger value (e.g. deposit); mutually exclusive with bonus_amount_fixed
    `bonus_amount_max`       DECIMAL(18,2)  DEFAULT NULL,
    -- hard per-grant ceiling regardless of trigger input

    -- ── Control ──────────────────────────────────────────────────────────────
    `priority`               INT            NOT NULL DEFAULT 0,
    -- lower value = higher priority when multiple nodes match
    `active`                 TINYINT(1)     NOT NULL DEFAULT 1,
    `created_by`             VARCHAR(100)   NOT NULL,
    `updated_by`             VARCHAR(100)   NOT NULL,
    `created_at`             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                            ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`               CHAR(64)       DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_configure_subhead_name`         (`subhead_id`, `name`),
    KEY `idx_bonus_configure_subhead_id`                 (`subhead_id`),
    KEY `idx_bonus_configure_site_id`                    (`site_id`),
    KEY `idx_bonus_configure_active`                     (`active`),
    KEY `idx_bonus_configure_priority`                   (`subhead_id`, `active`, `priority`),
    KEY `idx_bonus_config_dates`                         (`start_date`, `end_date`),
    KEY `idx_bonus_config_applicability_frequency`       (`applicability_frequency`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_configure_code
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

-- bonus_eligibility
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

-- bonus_owners
CREATE TABLE `bonus_owners` (
    `id`          INT           NOT NULL AUTO_INCREMENT,
    `entity_type` VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD
    `entity_id`   INT           NOT NULL,
    `site_id`     INT           NOT NULL,
    `username`    VARCHAR(100)  NOT NULL,
    -- internal username / employee ID of the responsible person
    `role`        VARCHAR(50)   NOT NULL,
    -- OPS_LEAD | CAMPAIGN_MANAGER | FINANCE_APPROVER | ESCALATION_CONTACT
    `active`      TINYINT(1)    NOT NULL DEFAULT 1,
    `created_by`  VARCHAR(100)  NOT NULL,
    `updated_by`  VARCHAR(100)  NOT NULL,
    `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`    CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_responsible_person`         (`entity_type`, `entity_id`, `username`),
    KEY `idx_responsible_person_entity`        (`entity_type`, `entity_id`),
    KEY `idx_responsible_person_username`      (`username`),
    KEY `idx_responsible_person_site_active`   (`site_id`, `active`)
);

-- bonus_release_trigger
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
    `row_hash`             CHAR(64)       DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_release_trigger`              (`configure_id`, `trigger_type`),
    KEY `idx_bonus_release_trigger_configure_id`       (`configure_id`),
    KEY `idx_bonus_release_trigger_type`               (`trigger_type`),
    KEY `idx_bonus_release_trigger_site_active`        (`site_id`, `active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_budget_limit
CREATE TABLE `bonus_budget_limit` (
    `id`           INT           NOT NULL AUTO_INCREMENT,
    `entity_type`  VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE
    `entity_id`    INT           NOT NULL,
    `site_id`      INT           NOT NULL,
    `period_type`  VARCHAR(10)   NOT NULL,
    -- DAILY | WEEKLY | MONTHLY
    `budget_limit` DECIMAL(18,2) DEFAULT NULL,
    -- NULL = uncapped
    `created_by`   VARCHAR(100)  NOT NULL,
    `updated_by`   VARCHAR(100)  NOT NULL,
    `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`     CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_budget_limit`       (`entity_type`, `entity_id`, `period_type`),
    KEY `idx_budget_limit_entity`      (`entity_type`, `entity_id`),
    KEY `idx_budget_limit_site`        (`site_id`)
);

-- bonus_code_usage_limit
CREATE TABLE `bonus_code_usage_limit` (
    `id`           INT         NOT NULL AUTO_INCREMENT,
    `code_id`      INT         NOT NULL,
    -- references bonus_configure_code.id
    `site_id`      INT         NOT NULL,
    `period_type`  VARCHAR(10) NOT NULL,
    -- HOURLY | DAILY | WEEKLY | MONTHLY
    `usage_limit`  INT         DEFAULT NULL,
    -- NULL = uncapped
    `created_by`   VARCHAR(100) NOT NULL,
    `updated_by`   VARCHAR(100) NOT NULL,
    `created_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`     CHAR(64)    DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code_usage_limit`      (`code_id`, `period_type`),
    KEY `idx_code_usage_limit_code_id`    (`code_id`),
    KEY `idx_code_usage_limit_site`       (`site_id`)
);

-- user_bonus_grant
CREATE TABLE `user_bonus_grant` (
    `id`                 BIGINT        NOT NULL AUTO_INCREMENT,
    `player_bonus_id`    BIGINT        NOT NULL,
    -- references userapp_player_bonus.id; unique — one log entry per grant
    `configure_id`       INT           NOT NULL,
    -- references bonus_configure.id
    `subhead_id`         INT           NOT NULL,
    -- references bonus_subhead.id
    `head_id`            INT           NOT NULL,
    -- references bonus_head.id
    `site_id`            INT           NOT NULL,
    `user_id`            VARCHAR(50)   NOT NULL,

    -- ── Config snapshot (copied from bonus_configure at grant time) ───────────
    `bonus_code`         VARCHAR(50)   DEFAULT NULL,
    -- promo code the player redeemed; NULL if no code was used

    `product`            VARCHAR(10)   DEFAULT NULL,
    -- product sourced from bonus_release_trigger at grant time; NULL when trigger has no product constraint
    `wager_multiplier`   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    -- x-wager requirement per chunk; 0 = no wagering — from bonus_configure
    `no_of_chunks`       INT           NOT NULL DEFAULT 1,
    -- number of chunks the bonus was split into — from bonus_configure
    `chunk_expiry_days`  INT           DEFAULT NULL,
    -- days from grant until an unreleased chunk expires; NULL = no expiry
    `bonus_expiry_days`  INT           DEFAULT NULL,
    -- days from chunk release until credited bonus expires; NULL = no expiry
    `wager_chip_type`    VARCHAR(50)   NOT NULL DEFAULT 'CASH',
    -- chip type used for wagering calculation — from bonus_configure
    `credit_chip_type`   VARCHAR(50)   NOT NULL DEFAULT 'CASH',
    -- chip type credited to the player — from bonus_configure

    -- ── Grant ─────────────────────────────────────────────────────────────────
    `grant_amount`       DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `release_amount`     DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative amount released to the player's wallet at time of log entry
    `bonus_consumed`     DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative bonus amount consumed through wagering at time of log entry

    `created_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_bonus_grant_player_bonus_id`    (`player_bonus_id`),
    KEY `idx_user_bonus_grant_configure_id`             (`configure_id`),
    KEY `idx_user_bonus_grant_subhead_id`               (`subhead_id`),
    KEY `idx_user_bonus_grant_head_id`                  (`head_id`),
    KEY `idx_user_bonus_grant_user_id`                  (`user_id`),
    KEY `idx_user_bonus_grant_site_date`                (`site_id`, `created_at`),
    KEY `idx_user_bonus_grant_bonus_code`               (`bonus_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_chunk
CREATE TABLE `bonus_chunk` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_ref`      VARCHAR(20)   NOT NULL,
    -- human-readable chunk identifier; unique within a bonus (e.g. CH001)
    `bonus_log_id`   BIGINT        NOT NULL,
    -- references bonus_log.id

    -- ── Amount ────────────────────────────────────────────────────────────────
    `chunk_amount`      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- face value of this chunk; sum across all chunks equals bonus_log.grant_amount
    `wager_multiplier`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    -- x-wager required to release this chunk; copied from bonus_log at grant time

    -- ── Progress ──────────────────────────────────────────────────────────────
    `status`         VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    -- PENDING | RELEASE | EXPIRED | CONSUMED
    `wager_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative qualifying wager settled against this chunk

    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_chunk_ref`          (`bonus_log_id`, `chunk_ref`),
    KEY `idx_bonus_chunk_bonus_log_id`       (`bonus_log_id`),
    KEY `idx_bonus_chunk_status`             (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_chunk_wager
CREATE TABLE `bonus_chunk_wager` (
    `id`              BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_id`        BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `wager_ref`       VARCHAR(20)   NOT NULL,
    -- upstream wager transaction identifier; unique per chunk

    -- ── Amount ────────────────────────────────────────────────────────────────
    `wager_amount`    DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- wager amount attributed to this chunk from this wager event
    `release_amount`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- amount credited to the player's wallet when this wager triggered a chunk release; 0 if no release occurred

    `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_chunk_wager_ref`     (`chunk_id`, `wager_ref`),
    KEY `idx_bonus_chunk_wager_chunk_id`      (`chunk_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_chunk_release
CREATE TABLE `bonus_chunk_release` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_id`    BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `wager_ref`   VARCHAR(20)   NOT NULL,
    -- upstream wager transaction identifier; unique per chunk

    -- ── Amount ────────────────────────────────────────────────────────────────
    `wager_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- wager amount attributed to this chunk from this wager event
    `release_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- amount credited to the player's wallet when this wager triggered a chunk release; 0 if no release occurred

    `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_chunk_wager_ref`     (`chunk_id`, `wager_ref`),
    KEY `idx_bonus_chunk_wager_chunk_id`      (`chunk_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_chunk_expiry
CREATE TABLE `bonus_chunk_expiry` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_id`       BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `bonus_log_id`   BIGINT        NOT NULL,
    -- references bonus_log.id

    -- ── Expiry ────────────────────────────────────────────────────────────────
    `amount`         DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- forfeited chunk balance at the time of expiry
    `type`           VARCHAR(10)   NOT NULL,
    -- AUTO | MANUAL
    `operator`       VARCHAR(100)  DEFAULT NULL,
    -- identity of the operator who triggered expiry; NULL for AUTO

    `expired_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- when the chunk was expired
    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_bonus_chunk_expiry_chunk_id`     (`chunk_id`),
    KEY `idx_bonus_chunk_expiry_bonus_log_id` (`bonus_log_id`),
    KEY `idx_bonus_chunk_expiry_type`         (`type`),
    KEY `idx_bonus_chunk_expiry_expired_at`   (`expired_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_budget_usage
CREATE TABLE `bonus_budget_usage` (
    `id`           INT           NOT NULL AUTO_INCREMENT,
    `entity_type`  VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE
    `entity_id`    INT           NOT NULL,
    `site_id`      INT           NOT NULL,
    `period_type`  VARCHAR(10)   NOT NULL,
    -- DAILY | WEEKLY | MONTHLY
    `budget_used`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `reset_at`     DATETIME      DEFAULT NULL,
    -- start of the current period window; set by the reset scheduler
    `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_budget_usage`       (`entity_type`, `entity_id`, `period_type`),
    KEY `idx_budget_usage_entity`      (`entity_type`, `entity_id`),
    KEY `idx_budget_usage_site`        (`site_id`),
    KEY `idx_budget_usage_reset`       (`period_type`, `reset_at`)
);

-- bonus_code_usage
CREATE TABLE `bonus_code_usage` (
    `id`          INT         NOT NULL AUTO_INCREMENT,
    `code_id`     INT         NOT NULL,
    -- references bonus_configure_code.id
    `site_id`     INT         NOT NULL,
    `period_type` VARCHAR(10) NOT NULL,
    -- HOURLY | DAILY | WEEKLY | MONTHLY
    `usage_used`  INT         NOT NULL DEFAULT 0,
    `reset_at`    DATETIME    DEFAULT NULL,
    -- start of the current period window; set by the reset scheduler
    `updated_at`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code_usage`         (`code_id`, `period_type`),
    KEY `idx_code_usage_code_id`       (`code_id`),
    KEY `idx_code_usage_site`          (`site_id`),
    KEY `idx_code_usage_reset`         (`period_type`, `reset_at`)
);

-- bonus_consumed
CREATE TABLE `bonus_consumed` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT,
    `consumed_ref`   VARCHAR(20)   NOT NULL,
    -- upstream consumption identifier (e.g. C001); unique per chunk
    `chunk_id`       BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `bonus_log_id`   BIGINT        NOT NULL,
    -- references bonus_log.id
    `wager_ref`         VARCHAR(20)   NOT NULL,
    -- originating wager transaction identifier; links to bonus_chunk_wager.wager_ref
    `wager_id`          VARCHAR(50)   NOT NULL,
    -- external wager / bet transaction reference from game platform
    `game_id`           VARCHAR(50)   DEFAULT NULL,
    -- game / table where the consumption occurred
    `round_id`          VARCHAR(50)   DEFAULT NULL,
    -- hand / round reference

    -- ── Amount ────────────────────────────────────────────────────────────────
    `amount`            DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- bonus balance drawn down by this consumption event
    `wager_amount`      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- full bet stake placed by the player
    `consumed_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,

    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_consumed_ref`          (`chunk_id`, `consumed_ref`),
    KEY `idx_bonus_consumed_chunk_id`           (`chunk_id`),
    KEY `idx_bonus_consumed_bonus_log_id`       (`bonus_log_id`),
    KEY `idx_bonus_consumed_wager_ref`          (`wager_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_forfeit
CREATE TABLE `bonus_forfeit` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT,
    `bonus_log_id`   BIGINT        NOT NULL,
    -- references bonus_log.id

    -- ── Forfeit ───────────────────────────────────────────────────────────────
    `amount`         DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- total bonus balance forfeited at the time of this event
    `type`           VARCHAR(10)   NOT NULL,
    -- AUTO | MANUAL
    `operator`       VARCHAR(100)  DEFAULT NULL,
    -- identity of the operator who triggered forfeit; NULL for AUTO

    `forfeited_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- when the bonus was forfeited
    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_bonus_forfeit_bonus_log_id` (`bonus_log_id`),
    KEY `idx_bonus_forfeit_type`         (`type`),
    KEY `idx_bonus_forfeit_forfeited_at` (`forfeited_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_audit_log
CREATE TABLE `bonus_audit_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `table_name`  VARCHAR(50)   NOT NULL,
    `action`      VARCHAR(10)   NOT NULL,
    -- INSERT | UPDATE
    `entity_id`   INT           NOT NULL,
    -- bonus_head.id (or parent head id for owners / limits)
    `site_id`     INT           NOT NULL,
    `changed_by`  VARCHAR(100)  NOT NULL,
    `changed_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `old_values`  JSON          DEFAULT NULL,
    -- NULL for INSERT; only changed fields for UPDATE
    `new_values`  JSON          DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_audit_table_entity` (`table_name`, `entity_id`),
    KEY `idx_audit_site`         (`site_id`),
    KEY `idx_audit_changed_by`   (`changed_by`),
    KEY `idx_audit_changed_at`   (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- bonus_head_change_log
CREATE TABLE `bonus_head_change_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_id`   INT           NOT NULL,
    -- bonus_head.id
    `site_id`     INT           NOT NULL,
    `action`      VARCHAR(10)   NOT NULL,
    -- INSERT | UPDATE
    `changed_by`  VARCHAR(100)  NOT NULL,
    `changed_at`  DATETIME      NOT NULL,
    `old_values`  JSON          DEFAULT NULL,
    -- NULL for INSERT; full row snapshot for UPDATE
    `new_values`  JSON          DEFAULT NULL,
    -- full new row state
    `prev_hash`   CHAR(64)      DEFAULT NULL,
    -- entry_hash of the previous row for this entity_id; NULL = genesis
    `entry_hash`  CHAR(64)      NOT NULL,
    -- SHA-256 of the chain inputs (see description)
    PRIMARY KEY (`id`),
    KEY `idx_head_cl_entity`     (`entity_id`),
    KEY `idx_head_cl_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- bonus_subhead_change_log
CREATE TABLE `bonus_subhead_change_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_id`   INT           NOT NULL,
    -- bonus_subhead.id
    `site_id`     INT           NOT NULL,
    `action`      VARCHAR(10)   NOT NULL,
    -- INSERT | UPDATE
    `changed_by`  VARCHAR(100)  NOT NULL,
    `changed_at`  DATETIME      NOT NULL,
    `old_values`  JSON          DEFAULT NULL,
    `new_values`  JSON          DEFAULT NULL,
    `prev_hash`   CHAR(64)      DEFAULT NULL,
    `entry_hash`  CHAR(64)      NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_subhead_cl_entity`     (`entity_id`),
    KEY `idx_subhead_cl_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- bonus_configure_change_log
CREATE TABLE `bonus_configure_change_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_id`   INT           NOT NULL,
    -- bonus_configure.id
    `site_id`     INT           NOT NULL,
    `action`      VARCHAR(10)   NOT NULL,
    -- INSERT | UPDATE
    `changed_by`  VARCHAR(100)  NOT NULL,
    `changed_at`  DATETIME      NOT NULL,
    `old_values`  JSON          DEFAULT NULL,
    `new_values`  JSON          DEFAULT NULL,
    `prev_hash`   CHAR(64)      DEFAULT NULL,
    `entry_hash`  CHAR(64)      NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_configure_cl_entity`     (`entity_id`),
    KEY `idx_configure_cl_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- bonus_configure_code_change_log
CREATE TABLE `bonus_configure_code_change_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_id`   INT           NOT NULL,
    -- bonus_configure_code.id
    `site_id`     INT           NOT NULL,
    `action`      VARCHAR(10)   NOT NULL,
    -- INSERT | UPDATE
    `changed_by`  VARCHAR(100)  NOT NULL,
    `changed_at`  DATETIME      NOT NULL,
    `old_values`  JSON          DEFAULT NULL,
    `new_values`  JSON          DEFAULT NULL,
    `prev_hash`   CHAR(64)      DEFAULT NULL,
    `entry_hash`  CHAR(64)      NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_conf_code_cl_entity`     (`entity_id`),
    KEY `idx_conf_code_cl_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- bonus_eligibility_change_log
CREATE TABLE `bonus_eligibility_change_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_id`   INT           NOT NULL,
    -- bonus_eligibility.id
    `site_id`     INT           NOT NULL,
    `action`      VARCHAR(10)   NOT NULL,
    -- INSERT | UPDATE
    `changed_by`  VARCHAR(100)  NOT NULL,
    `changed_at`  DATETIME      NOT NULL,
    `old_values`  JSON          DEFAULT NULL,
    `new_values`  JSON          DEFAULT NULL,
    `prev_hash`   CHAR(64)      DEFAULT NULL,
    `entry_hash`  CHAR(64)      NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_eligibility_cl_entity`     (`entity_id`),
    KEY `idx_eligibility_cl_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- bonus_owners_change_log
CREATE TABLE `bonus_owners_change_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_id`   INT           NOT NULL,
    -- parent bonus_head.id
    `site_id`     INT           NOT NULL,
    `action`      VARCHAR(10)   NOT NULL,
    -- INSERT | UPDATE
    `changed_by`  VARCHAR(100)  NOT NULL,
    `changed_at`  DATETIME      NOT NULL,
    `old_values`  JSON          DEFAULT NULL,
    `new_values`  JSON          DEFAULT NULL,
    `prev_hash`   CHAR(64)      DEFAULT NULL,
    `entry_hash`  CHAR(64)      NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_owners_cl_entity`     (`entity_id`),
    KEY `idx_owners_cl_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- bonus_release_trigger_change_log
CREATE TABLE `bonus_release_trigger_change_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_id`   INT           NOT NULL,
    -- bonus_release_trigger.id
    `site_id`     INT           NOT NULL,
    `action`      VARCHAR(10)   NOT NULL,
    -- INSERT | UPDATE
    `changed_by`  VARCHAR(100)  NOT NULL,
    `changed_at`  DATETIME      NOT NULL,
    `old_values`  JSON          DEFAULT NULL,
    `new_values`  JSON          DEFAULT NULL,
    `prev_hash`   CHAR(64)      DEFAULT NULL,
    `entry_hash`  CHAR(64)      NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_rel_trigger_cl_entity`     (`entity_id`),
    KEY `idx_rel_trigger_cl_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- bonus_budget_limit_change_log
CREATE TABLE `bonus_budget_limit_change_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_id`   INT           NOT NULL,
    -- parent bonus_head.id
    `site_id`     INT           NOT NULL,
    `action`      VARCHAR(10)   NOT NULL,
    -- INSERT | UPDATE
    `changed_by`  VARCHAR(100)  NOT NULL,
    `changed_at`  DATETIME      NOT NULL,
    `old_values`  JSON          DEFAULT NULL,
    `new_values`  JSON          DEFAULT NULL,
    `prev_hash`   CHAR(64)      DEFAULT NULL,
    `entry_hash`  CHAR(64)      NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_limit_cl_entity`     (`entity_id`),
    KEY `idx_limit_cl_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- bonus_code_usage_limit_change_log
CREATE TABLE `bonus_code_usage_limit_change_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_id`   INT           NOT NULL,
    -- bonus_code_usage_limit.id
    `site_id`     INT           NOT NULL,
    `action`      VARCHAR(10)   NOT NULL,
    -- INSERT | UPDATE
    `changed_by`  VARCHAR(100)  NOT NULL,
    `changed_at`  DATETIME      NOT NULL,
    `old_values`  JSON          DEFAULT NULL,
    `new_values`  JSON          DEFAULT NULL,
    `prev_hash`   CHAR(64)      DEFAULT NULL,
    `entry_hash`  CHAR(64)      NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_code_usage_lim_cl_entity`     (`entity_id`),
    KEY `idx_code_usage_lim_cl_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- bonus_spend_daily
CREATE TABLE `bonus_spend_daily` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_type`   VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE | CODE
    `entity_id`     INT           NOT NULL,
    `site_id`       INT           NOT NULL,
    `spend_date`    DATE          NOT NULL,
    `grant_count`   INT           NOT NULL DEFAULT 0,
    `total_amount`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_spend_daily`         (`entity_type`, `entity_id`, `spend_date`),
    KEY `idx_spend_daily_site_date`     (`site_id`, `spend_date`),
    KEY `idx_spend_daily_entity`        (`entity_type`, `entity_id`, `spend_date`)
);

-- bonus_spend_weekly
CREATE TABLE `bonus_spend_weekly` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_type`   VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE | CODE
    `entity_id`     INT           NOT NULL,
    `site_id`       INT           NOT NULL,
    `week_start`    DATE          NOT NULL,
    -- Monday of the ISO week
    `week_end`      DATE          NOT NULL,
    -- Sunday of the ISO week (week_start + 6 days)
    `grant_count`   INT           NOT NULL DEFAULT 0,
    `total_amount`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_spend_weekly`        (`entity_type`, `entity_id`, `week_start`),
    KEY `idx_spend_weekly_site_week`    (`site_id`, `week_start`),
    KEY `idx_spend_weekly_entity`       (`entity_type`, `entity_id`, `week_start`)
);

-- bonus_spend_monthly
CREATE TABLE `bonus_spend_monthly` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_type`   VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE | CODE
    `entity_id`     INT           NOT NULL,
    `site_id`       INT           NOT NULL,
    `spend_year`    SMALLINT      NOT NULL,
    `spend_month`   TINYINT       NOT NULL,
    -- 1–12
    `grant_count`   INT           NOT NULL DEFAULT 0,
    `total_amount`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_spend_monthly`           (`entity_type`, `entity_id`, `spend_year`, `spend_month`),
    KEY `idx_spend_monthly_site_period`     (`site_id`, `spend_year`, `spend_month`),
    KEY `idx_spend_monthly_entity`          (`entity_type`, `entity_id`, `spend_year`, `spend_month`)
);
