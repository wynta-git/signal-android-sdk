-- wynta_bonus — full schema reset (DDL only, no sample data)

SET FOREIGN_KEY_CHECKS = 0;

-- Drop all tables (reverse dependency order)
-- 5. Log
DROP TABLE IF EXISTS `bonus_audit_log`;
-- 4. Reporting
DROP TABLE IF EXISTS `bonus_spend_monthly`;
DROP TABLE IF EXISTS `bonus_spend_weekly`;
DROP TABLE IF EXISTS `bonus_spend_daily`;
-- 3. Budget
DROP TABLE IF EXISTS `bonus_code_usage`;
DROP TABLE IF EXISTS `bonus_budget_usage`;
DROP TABLE IF EXISTS `bonus_code_usage_limit`;
DROP TABLE IF EXISTS `bonus_budget_limit`;
-- 2. Runtime
DROP TABLE IF EXISTS `bonus_manual_bulk_pending`;
DROP TABLE IF EXISTS `bonus_manual_bulk_grant`;
DROP TABLE IF EXISTS `bonus_chunk_forfeit`;
DROP TABLE IF EXISTS `bonus_forfeit`;
DROP TABLE IF EXISTS `bonus_consumed`;
DROP TABLE IF EXISTS `bonus_chunk_expiry`;
DROP TABLE IF EXISTS `bonus_chunk_release`;
DROP TABLE IF EXISTS `bonus_chunk_consume`;
DROP TABLE IF EXISTS `bonus_chunk`;
DROP TABLE IF EXISTS `bonus_grant`;
-- 1. Master Configuration
DROP TABLE IF EXISTS `bonus_owners`;
DROP TABLE IF EXISTS `bonus_release_trigger`;
DROP TABLE IF EXISTS `bonus_eligibility`;
DROP TABLE IF EXISTS `bonus_configure_code`;
DROP TABLE IF EXISTS `bonus_configure`;
DROP TABLE IF EXISTS `bonus_subhead`;
DROP TABLE IF EXISTS `bonus_head`;

-- =============================================================================
-- 1. MASTER CONFIGURATION
--    bonus_head => bonus_subhead => bonus_configure
--               => (bonus_eligibility, bonus_release_trigger) => bonus_configure_code
--    bonus_owners (attached to head / subhead)
-- =============================================================================

-- bonus_head
CREATE TABLE `bonus_head` (
    `id`          INT           NOT NULL AUTO_INCREMENT,
    `site_id`     INT           NOT NULL,
    `name`        VARCHAR(100)  NOT NULL,
    `description` VARCHAR(500)  DEFAULT NULL,
    `active`      TINYINT(1)    NOT NULL DEFAULT 1,
    `owner`       VARCHAR(100)  NOT NULL,
    -- primary accountable person; additional contacts in bonus_owners
    `created_by`  VARCHAR(100)  NOT NULL,
    `updated_by`  VARCHAR(100)  NOT NULL,
    `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`    CHAR(64)      DEFAULT NULL,
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
    `active`      TINYINT(1)    NOT NULL DEFAULT 1,
    `owner`       VARCHAR(100)  NOT NULL,
    `created_by`  VARCHAR(100)  NOT NULL,
    `updated_by`  VARCHAR(100)  NOT NULL,
    `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`    CHAR(64)      DEFAULT NULL,
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
    `id`                      INT            NOT NULL AUTO_INCREMENT,
    `subhead_id`              INT            NOT NULL,
    -- references bonus_subhead.id
    `site_id`                 INT            NOT NULL,
    `name`                    VARCHAR(100)   NOT NULL,
    `description`             VARCHAR(500)   DEFAULT NULL,

    -- ── Bonus mechanics ──────────────────────────────────────────────────────
    `start_date`              DATETIME       NOT NULL,
    `end_date`                DATETIME       NOT NULL,
    `applicability_frequency` VARCHAR(20)    NOT NULL DEFAULT 'EVERYTIME',
    -- EVERYTIME | ONCE | MONTHLY | WEEKLY

    -- ── Bonus release config ─────────────────────────────────────────────────
    `wager_multiplier`        DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    -- 0 = no wagering required; >0 = chunk wager multiplier
    `no_of_chunks`            INT            NOT NULL DEFAULT 1,
    -- number of equal chunks the bonus is split into
    `release_bucket`          VARCHAR(50)    DEFAULT NULL,
    -- trigger bucket that releases the bonus (e.g. DEPOSIT_INSTANT)
    `chunk_expiry_days`       INT            DEFAULT NULL,
    -- days from grant until an unreleased chunk expires
    `bonus_expiry_days`       INT            DEFAULT NULL,
    -- days from chunk release until the credit expires (post-release)
    `wager_chip_type`         VARCHAR(50)    NOT NULL DEFAULT 'CASH',
    `credit_chip_type`        VARCHAR(50)    NOT NULL DEFAULT 'CASH',

    -- ── Grant caps ───────────────────────────────────────────────────────────
    `bonus_amount_fixed`      DECIMAL(18,2)  DEFAULT NULL,
    -- flat grant amount when trigger supplies no explicit value
    `bonus_amount_percent`    DECIMAL(5,2)   DEFAULT NULL,
    -- % of trigger value (e.g. deposit); mutually exclusive with bonus_amount_fixed
    `bonus_amount_max`        DECIMAL(18,2)  DEFAULT NULL,
    -- hard per-grant ceiling regardless of trigger input

    -- ── cashback bonus ───────────────────────────────────────────────────────────
    `cashback_bonus_amount_fixed`      DECIMAL(18,2)  DEFAULT NULL,
    -- flat grant amount when trigger supplies no explicit value
    `cashback_bonus_amount_percent`    DECIMAL(5,2)   DEFAULT NULL,
    -- % of trigger value (e.g. deposit); mutually exclusive with bonus_amount_fixed
    `cashback_bonus_amount_max`        DECIMAL(18,2)  DEFAULT NULL,
    -- hard per-grant ceiling regardless of trigger input

    -- ── Control ──────────────────────────────────────────────────────────────
    `priority`                INT            NOT NULL DEFAULT 0,
    -- lower value = higher priority when multiple nodes match
    `active`                  TINYINT(1)     NOT NULL DEFAULT 1,
    `created_by`              VARCHAR(100)   NOT NULL,
    `updated_by`              VARCHAR(100)   NOT NULL,
    `created_at`              DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`              DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`                CHAR(64)       DEFAULT NULL,
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
    KEY `idx_bonus_eligibility_configure_id`        (`configure_id`),
    KEY `idx_bonus_eligibility_site_active`         (`site_id`, `active`),
    KEY `idx_bonus_eligibility_key`                 (`eligibility_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_release_trigger
CREATE TABLE `bonus_release_trigger` (
    `id`                  INT            NOT NULL AUTO_INCREMENT,
    `configure_id`        INT            NOT NULL,
    -- references bonus_configure.id
    `site_id`             INT            NOT NULL,
    `trigger_type`        VARCHAR(50)    NOT NULL,
    -- LOGIN | REGISTRATION | APP_VISIT | DEPOSIT | BET_PLACED | LEADERBOARD_WON | TOURNAMENT_WON | FRIEND_SIGNUP
    `description`         VARCHAR(500)   DEFAULT NULL,
    -- human-readable summary of this trigger and its conditions
    `min_trigger_amount`  DECIMAL(18,2)  DEFAULT NULL,
    -- minimum qualifying event amount; NULL = no minimum
    `max_trigger_amount`  DECIMAL(18,2)  DEFAULT NULL,
    -- maximum qualifying event amount; NULL = no cap
    `payment_method`      VARCHAR(50)    DEFAULT NULL,
    -- restrict to a payment method (UPI | NETBANKING | CARD | WALLET); NULL = all
    `product`             VARCHAR(50)    DEFAULT NULL,
    -- restrict to a product (POKER | CASINO | RUMMY); NULL = all products
    `occurrence`          INT            NOT NULL DEFAULT 0,
    -- 0 = every occurrence; 1 = first only; N = Nth occurrence
    `active`              TINYINT(1)     NOT NULL DEFAULT 1,
    `created_by`          VARCHAR(100)   NOT NULL,
    `updated_by`          VARCHAR(100)   NOT NULL,
    `created_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`            CHAR(64)       DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_release_trigger`              (`configure_id`, `trigger_type`),
    KEY `idx_bonus_release_trigger_configure_id`       (`configure_id`),
    KEY `idx_bonus_release_trigger_type`               (`trigger_type`),
    KEY `idx_bonus_release_trigger_site_active`        (`site_id`, `active`)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================================
-- 2. RUNTIME TABLES
-- =============================================================================

-- bonus_manual_bulk_grant
CREATE TABLE `bonus_manual_bulk_grant` (
    `id`                      BIGINT        NOT NULL AUTO_INCREMENT,
    `site_id`                 INT           NOT NULL,
    `bonus_configure_code_id` INT           NOT NULL,
    -- references bonus_configure_code.id — determines which bonus is granted
    `file_path`               VARCHAR(500)  DEFAULT NULL,
    -- storage path of the uploaded user CSV; NULL when created programmatically
    `operator_id`             VARCHAR(100)  NOT NULL,
    -- username of the operator who initiated the bulk grant
    `users_count`             INT           NOT NULL DEFAULT 0,
    -- total users in the batch (from file row count or explicit list)
    `processed_count`         INT           NOT NULL DEFAULT 0,
    -- running tally of records that have been attempted
    `success_count`           INT           NOT NULL DEFAULT 0,
    -- records that resulted in a successful bonus_grant
    `failed_count`            INT           NOT NULL DEFAULT 0,
    -- records that failed or were skipped
    `status`                  VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    -- PENDING | PROCESSING | COMPLETED | FAILED | CANCELLED
    `error_message`           VARCHAR(500)  DEFAULT NULL,
    -- top-level failure reason when status = FAILED
    `created_at`              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                            ON UPDATE CURRENT_TIMESTAMP,
    `completed_at`            DATETIME      DEFAULT NULL,
    -- set when status transitions to COMPLETED, FAILED, or CANCELLED
    PRIMARY KEY (`id`),
    KEY `idx_bulk_grant_site_status`     (`site_id`, `status`),
    KEY `idx_bulk_grant_code_id`         (`bonus_configure_code_id`),
    KEY `idx_bulk_grant_operator`        (`operator_id`),
    KEY `idx_bulk_grant_created_at`      (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_manual_bulk_pending
CREATE TABLE `bonus_manual_bulk_pending` (
    `id`                   BIGINT        NOT NULL AUTO_INCREMENT,
    `bulk_grant_id`        BIGINT        NOT NULL,
    -- references bonus_manual_bulk_grant.id
    `site_id`              INT           NOT NULL,
    `user_id`              VARCHAR(50)   NOT NULL,
    -- player to receive the bonus
    `bonus_grant_id`       BIGINT        DEFAULT NULL,
    -- references bonus_grant.id; populated on successful processing
    `status`               VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    -- PENDING | SUCCESS | FAILED | SKIPPED | EXPIRED
    `message`              VARCHAR(500)  DEFAULT NULL,
    -- processing result detail or error reason
    `expire_at`            DATETIME      DEFAULT NULL,
    -- deadline for processing; records past this are auto-transitioned to EXPIRED
    `created_at`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `processed_at`         DATETIME      DEFAULT NULL,
    -- timestamp when this record was last attempted
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bulk_pending_grant_user`       (`bulk_grant_id`, `user_id`),
    KEY `idx_bulk_pending_bulk_grant_id`          (`bulk_grant_id`),
    KEY `idx_bulk_pending_site_status`            (`site_id`, `status`),
    KEY `idx_bulk_pending_user_id`                (`user_id`),
    KEY `idx_bulk_pending_expire_at`              (`expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



-- bonus_grant
CREATE TABLE `bonus_grant` (
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
    -- cumulative amount released to the player's wallet
    `consume_amount`     DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative bonus amount consumed through wagering
    `expiry_amount`      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative amount expired
    `forfeited_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative amount forfeited
    `status`             VARCHAR(20)   NOT NULL DEFAULT 'INPROGRESS',
    -- CONSUMED | INPROGRESS | RELEASED
    `bonus_grant_type`       VARCHAR(20)   NOT NULL DEFAULT 'SYSTEM',
    -- MANUAL | BULK_MANUAL | SYSTEM
    `created_by`   VARCHAR(100)  NOT NULL DEFAULT 'SYSTEM',

    `created_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_grant_player_bonus_id`  (`player_bonus_id`),
    KEY `idx_bonus_grant_configure_id`           (`configure_id`),
    KEY `idx_bonus_grant_subhead_id`             (`subhead_id`),
    KEY `idx_bonus_grant_head_id`                (`head_id`),
    KEY `idx_bonus_grant_user_id`                (`user_id`),
    KEY `idx_bonus_grant_site_date`              (`site_id`, `created_at`),
    KEY `idx_bonus_grant_bonus_code`             (`bonus_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_chunk
CREATE TABLE `bonus_chunk` (
    `id`              BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_ref`       VARCHAR(20)   NOT NULL,
    -- human-readable chunk identifier; unique within a bonus (e.g. CH001)
    `bonus_grant_id`  BIGINT        NOT NULL,
    -- references bonus_grant.id

    -- ── Amount ────────────────────────────────────────────────────────────────
    `chunk_amount`    DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- face value of this chunk; sum across all chunks equals bonus_grant.grant_amount
    `wager_multiplier` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    -- x-wager required to release this chunk; copied from bonus_grant at grant time

    -- ── Progress ──────────────────────────────────────────────────────────────
    `status`          VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    -- PENDING | RELEASE | EXPIRED | CONSUMED
    `required_wager_amount`    DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- required wager amount to release this chunk amount
    `wager_amount`    DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative qualifying wager settled against this chunk
    `release_amount`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative amount released to the player's wallet
    `consume_amount`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- cumulative bonus amount consumed through wagering
    `expiry_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- amount expired from this chunk
    `forfeited_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- amount forfeited from this chunk

    `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_chunk_ref`          (`bonus_grant_id`, `chunk_ref`),
    KEY `idx_bonus_chunk_bonus_grant_id`     (`bonus_grant_id`),
    KEY `idx_bonus_chunk_status`             (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_chunk_consume
CREATE TABLE `bonus_chunk_consume` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_id`       BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `wager_ref`      VARCHAR(20)   NOT NULL,
    -- upstream wager transaction identifier; unique per chunk

    -- ── Amount ────────────────────────────────────────────────────────────────
    `wager_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- wager amount attributed to this chunk from this wager event
    `consume_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- bonus balance consumed when this wager was settled; 0 if no consumption occurred

    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_chunk_consume_ref`   (`chunk_id`, `wager_ref`),
    KEY `idx_bonus_chunk_consume_chunk_id`    (`chunk_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_chunk_release
CREATE TABLE `bonus_chunk_release` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_id`       BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `wager_ref`      VARCHAR(20)   NOT NULL,
    -- upstream wager transaction identifier; unique per chunk

    -- ── Amount ────────────────────────────────────────────────────────────────
    `wager_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- wager amount attributed to this chunk from this wager event
    `release_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- amount credited to the player's wallet when this wager triggered a chunk release

    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_chunk_release_ref`   (`chunk_id`, `wager_ref`),
    KEY `idx_bonus_chunk_release_chunk_id`    (`chunk_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_chunk_expiry
CREATE TABLE `bonus_chunk_expiry` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_id`       BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `bonus_grant_id` BIGINT        NOT NULL,
    -- references bonus_grant.id

    -- ── Expiry ────────────────────────────────────────────────────────────────
    `amount`         DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- forfeited chunk balance at the time of expiry
    `type`           VARCHAR(10)   NOT NULL,
    -- AUTO | MANUAL
    `operator`       VARCHAR(100)  DEFAULT NULL,
    -- identity of the operator who triggered expiry; NULL for AUTO

    `expired_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_bonus_chunk_expiry_chunk_id`      (`chunk_id`),
    KEY `idx_bonus_chunk_expiry_bonus_grant_id` (`bonus_grant_id`),
    KEY `idx_bonus_chunk_expiry_type`          (`type`),
    KEY `idx_bonus_chunk_expiry_expired_at`    (`expired_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_consumed
CREATE TABLE `bonus_consumed` (
    `id`              BIGINT        NOT NULL AUTO_INCREMENT,
    `consumed_ref`    VARCHAR(20)   NOT NULL,
    -- upstream consumption identifier (e.g. C001); unique per chunk
    `chunk_id`        BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `bonus_grant_id`  BIGINT        NOT NULL,
    -- references bonus_grant.id
    `wager_ref`       VARCHAR(20)   NOT NULL,
    -- originating wager transaction identifier; links to bonus_chunk_consume.wager_ref
    `wager_id`        VARCHAR(50)   NOT NULL,
    -- external wager / bet transaction reference from game platform
    `game_id`         VARCHAR(50)   DEFAULT NULL,
    -- game / table where the consumption occurred
    `round_id`        VARCHAR(50)   DEFAULT NULL,
    -- hand / round reference

    -- ── Amount ────────────────────────────────────────────────────────────────
    `amount`          DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- bonus balance drawn down by this consumption event
    `wager_amount`    DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- full bet stake placed by the player
    `consumed_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,

    `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_consumed_ref`          (`chunk_id`, `consumed_ref`),
    KEY `idx_bonus_consumed_chunk_id`           (`chunk_id`),
    KEY `idx_bonus_consumed_bonus_grant_id`     (`bonus_grant_id`),
    KEY `idx_bonus_consumed_wager_ref`          (`wager_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_forfeit
CREATE TABLE `bonus_forfeit` (
    `id`               BIGINT        NOT NULL AUTO_INCREMENT,
    `bonus_grant_id`   BIGINT        NOT NULL,
    -- references bonus_grant.id

    -- ── Forfeit ───────────────────────────────────────────────────────────────
    `requested_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- total bonus balance requested to forfeit
    `amount`           DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- total bonus balance actually forfeited
    `type`             VARCHAR(10)   NOT NULL,
    -- AUTO | MANUAL
    `operator`         VARCHAR(100)  DEFAULT NULL,
    -- identity of the operator who triggered forfeit; NULL for AUTO

    `forfeited_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_bonus_forfeit_bonus_grant_id` (`bonus_grant_id`),
    KEY `idx_bonus_forfeit_type`           (`type`),
    KEY `idx_bonus_forfeit_forfeited_at`   (`forfeited_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_chunk_forfeit
CREATE TABLE `bonus_chunk_forfeit` (
    `id`               BIGINT        NOT NULL AUTO_INCREMENT,
    `bonus_forfeit_id` BIGINT        NOT NULL,
    -- references bonus_forfeit.id
    `bonus_grant_id`   BIGINT        NOT NULL,
    -- references bonus_grant.id
    `chunk_id`         BIGINT        NOT NULL,
    -- references bonus_chunk.id

    -- ── Forfeit ───────────────────────────────────────────────────────────────
    `amount`           DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- bonus balance forfeited from this chunk
    `type`             VARCHAR(10)   NOT NULL,
    -- AUTO | MANUAL
    `operator`         VARCHAR(100)  DEFAULT NULL,
    -- identity of the operator who triggered forfeit; NULL for AUTO

    `forfeited_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_bonus_chunk_forfeit_forfeit_id`   (`bonus_forfeit_id`),
    KEY `idx_bonus_chunk_forfeit_grant_id`     (`bonus_grant_id`),
    KEY `idx_bonus_chunk_forfeit_chunk_id`     (`chunk_id`),
    KEY `idx_bonus_chunk_forfeit_type`         (`type`),
    KEY `idx_bonus_chunk_forfeit_forfeited_at` (`forfeited_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================================
-- 3. BUDGET TABLES
-- =============================================================================

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
    `limit_type`   VARCHAR(10)   NOT NULL DEFAULT 'SOFT',
    -- SOFT | HARD
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_code_usage_limit
CREATE TABLE `bonus_code_usage_limit` (
    `id`           INT          NOT NULL AUTO_INCREMENT,
    `code_id`      INT          NOT NULL,
    -- references bonus_configure_code.id
    `site_id`      INT          NOT NULL,
    `period_type`  VARCHAR(10)  NOT NULL,
    -- HOURLY | DAILY | WEEKLY | MONTHLY
    `usage_limit`  INT          DEFAULT NULL,
    -- NULL = uncapped
    `created_by`   VARCHAR(100) NOT NULL,
    `updated_by`   VARCHAR(100) NOT NULL,
    `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`     CHAR(64)     DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code_usage_limit`      (`code_id`, `period_type`),
    KEY `idx_code_usage_limit_code_id`    (`code_id`),
    KEY `idx_code_usage_limit_site`       (`site_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_budget_usage
CREATE TABLE `bonus_budget_usage` (
    `id`          INT           NOT NULL AUTO_INCREMENT,
    `entity_type` VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE
    `entity_id`   INT           NOT NULL,
    `site_id`     INT           NOT NULL,
    `period_type` VARCHAR(10)   NOT NULL,
    -- DAILY | WEEKLY | MONTHLY
    `budget_used` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `reset_at`    DATETIME      DEFAULT NULL,
    -- start of the current period window; set by the reset scheduler
    `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_budget_usage`       (`entity_type`, `entity_id`, `period_type`),
    KEY `idx_budget_usage_entity`      (`entity_type`, `entity_id`),
    KEY `idx_budget_usage_site`        (`site_id`),
    KEY `idx_budget_usage_reset`       (`period_type`, `reset_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_code_usage
CREATE TABLE `bonus_code_usage` (
    `id`          INT          NOT NULL AUTO_INCREMENT,
    `code_id`     INT          NOT NULL,
    -- references bonus_configure_code.id
    `site_id`     INT          NOT NULL,
    `period_type` VARCHAR(10)  NOT NULL,
    -- HOURLY | DAILY | WEEKLY | MONTHLY
    `usage_used`  INT          NOT NULL DEFAULT 0,
    `reset_at`    DATETIME     DEFAULT NULL,
    -- start of the current period window; set by the reset scheduler
    `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code_usage`         (`code_id`, `period_type`),
    KEY `idx_code_usage_code_id`       (`code_id`),
    KEY `idx_code_usage_site`          (`site_id`),
    KEY `idx_code_usage_reset`         (`period_type`, `reset_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================================
-- 4. REPORTING TABLES
-- =============================================================================

-- bonus_spend_daily
CREATE TABLE `bonus_spend_daily` (
    `id`           BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_type`  VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE | CODE
    `entity_id`    INT           NOT NULL,
    `site_id`      INT           NOT NULL,
    `spend_date`   DATE          NOT NULL,
    `grant_count`  INT           NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_spend_daily`         (`entity_type`, `entity_id`, `spend_date`),
    KEY `idx_spend_daily_site_date`     (`site_id`, `spend_date`),
    KEY `idx_spend_daily_entity`        (`entity_type`, `entity_id`, `spend_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_spend_weekly
CREATE TABLE `bonus_spend_weekly` (
    `id`           BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_type`  VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE | CODE
    `entity_id`    INT           NOT NULL,
    `site_id`      INT           NOT NULL,
    `week_start`   DATE          NOT NULL,
    -- Monday of the ISO week
    `week_end`     DATE          NOT NULL,
    -- Sunday of the ISO week (week_start + 6 days)
    `grant_count`  INT           NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_spend_weekly`        (`entity_type`, `entity_id`, `week_start`),
    KEY `idx_spend_weekly_site_week`    (`site_id`, `week_start`),
    KEY `idx_spend_weekly_entity`       (`entity_type`, `entity_id`, `week_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bonus_spend_monthly
CREATE TABLE `bonus_spend_monthly` (
    `id`           BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_type`  VARCHAR(10)   NOT NULL,
    -- HEAD | SUBHEAD | CONFIGURE | CODE
    `entity_id`    INT           NOT NULL,
    `site_id`      INT           NOT NULL,
    `spend_year`   SMALLINT      NOT NULL,
    `spend_month`  TINYINT       NOT NULL,
    -- 1–12
    `grant_count`  INT           NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_spend_monthly`           (`entity_type`, `entity_id`, `spend_year`, `spend_month`),
    KEY `idx_spend_monthly_site_period`     (`site_id`, `spend_year`, `spend_month`),
    KEY `idx_spend_monthly_entity`          (`entity_type`, `entity_id`, `spend_year`, `spend_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================================
-- 5. LOG TABLES
-- =============================================================================

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;
