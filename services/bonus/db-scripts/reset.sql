-- wynta_bonus — full schema reset (DDL only, no sample data)

SET FOREIGN_KEY_CHECKS = 0;

-- Drop all tables (reverse dependency order)
-- 5. Log
DROP TABLE IF EXISTS `bonus_change_log`;
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
DROP TABLE IF EXISTS `user_bonus_grant`;
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
    `id`             INT            NOT NULL AUTO_INCREMENT,
    `configure_id`   INT            NOT NULL,
    -- references bonus_configure.id
    `site_id`        INT            NOT NULL,
    `trigger_type`   VARCHAR(50)    NOT NULL,
    -- DEPOSIT | REGISTRATION | MANUAL | REFERRAL | PROMO_CODE | MILESTONE | …
    `release_type`   VARCHAR(20)    NOT NULL DEFAULT 'BONUS_RELEASE',
    -- BONUS_RELEASE | CHUNK_RELEASE
    `trigger_config` JSON           DEFAULT NULL,
    -- free-form key-value qualifying conditions
    `active`         TINYINT(1)     NOT NULL DEFAULT 1,
    `created_by`     VARCHAR(100)   NOT NULL,
    `updated_by`     VARCHAR(100)   NOT NULL,
    `created_at`     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`       CHAR(64)       DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_release_trigger`              (`configure_id`, `trigger_type`, `release_type`),
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
    `pam_user_id`          VARCHAR(50)   NOT NULL,
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
    UNIQUE KEY `uk_bulk_pending_grant_user`       (`bulk_grant_id`, `pam_user_id`),
    KEY `idx_bulk_pending_bulk_grant_id`          (`bulk_grant_id`),
    KEY `idx_bulk_pending_site_status`            (`site_id`, `status`),
    KEY `idx_bulk_pending_pam_user_id`            (`pam_user_id`),
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
    `pam_user_id`        VARCHAR(50)   NOT NULL,

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
    KEY `idx_bonus_grant_pam_user_id`            (`pam_user_id`),
    KEY `idx_bonus_grant_site_date`              (`site_id`, `created_at`),
    KEY `idx_bonus_grant_bonus_code`             (`bonus_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
    `pam_user_id`        VARCHAR(50)   NOT NULL,
    `event_id`           CHAR(36)      NOT NULL,
    -- UUID of the source event that triggered this grant; used for idempotency replay checks

    -- ── Config snapshot (copied from bonus_configure at grant time) ───────────
    `bonus_code`         VARCHAR(50)   DEFAULT NULL,
    -- promo code the player redeemed; NULL if no code was used
    `product`            VARCHAR(10)   DEFAULT NULL,
    -- product sourced from bonus_release_trigger at grant time; NULL when trigger has no product constraint
    `wager_multiplier`   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    -- x-wager requirement per chunk; 0 = no wagering — from bonus_configure
    `no_of_chunks`       INT           DEFAULT NULL,
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
    KEY `idx_user_bonus_grant_configure_id`  (`configure_id`),
    KEY `idx_user_bonus_grant_subhead_id`    (`subhead_id`),
    KEY `idx_user_bonus_grant_head_id`       (`head_id`),
    KEY `idx_user_bonus_grant_pam_user_id`   (`pam_user_id`),
    KEY `idx_user_bonus_grant_site_date`     (`site_id`, `created_at`),
    KEY `idx_user_bonus_grant_bonus_code`    (`bonus_code`),
    KEY `idx_user_bonus_grant_event_site`    (`event_id`, `site_id`)
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
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `chunk_id`    BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `site_id`     INT           NOT NULL,
    `event_id`    CHAR(36)      NOT NULL,
    -- UUID of the source event; used for idempotency replay checks
    `wager_ref`   VARCHAR(100)  NOT NULL,
    -- upstream wager transaction identifier; unique per chunk

    -- ── Amount ────────────────────────────────────────────────────────────────
    `wager_amount`   DECIMAL(18,2) DEFAULT NULL,
    -- wager amount attributed to this chunk from this wager event
    `release_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- amount credited to the player's wallet when this wager triggered a chunk release; 0 if no release occurred

    `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_chunk_wager_ref`          (`chunk_id`, `wager_ref`),
    KEY `idx_bonus_chunk_wager_chunk_id`           (`chunk_id`),
    KEY `idx_bonus_chunk_release_event_site`       (`event_id`, `site_id`)
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
    `id`                        BIGINT        NOT NULL AUTO_INCREMENT,
    `consumed_ref`              VARCHAR(100)  NOT NULL,
    -- upstream consumption identifier (consume_txn_id); unique per chunk
    `chunk_id`                  BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `bonus_grant_id`            BIGINT        NOT NULL,
    -- references bonus_grant.id
    `wager_ref`                 VARCHAR(100)  DEFAULT NULL,
    -- originating wager transaction reference (wager_tnx_id); optional

    -- ── Game context ──────────────────────────────────────────────────────────
    `chip_type`                 VARCHAR(20)   DEFAULT NULL,
    `session_key`               VARCHAR(200)  DEFAULT NULL,
    `client_id`                 VARCHAR(100)  DEFAULT NULL,
    `product`                   VARCHAR(100)  DEFAULT NULL,
    `game_type`                 VARCHAR(20)   DEFAULT NULL,
    `game_variant`              VARCHAR(100)  DEFAULT NULL,
    `game_name`                 VARCHAR(200)  DEFAULT NULL,
    `game_action`               VARCHAR(100)  DEFAULT NULL,

    -- ── Platform transaction IDs ──────────────────────────────────────────────
    `primary_transaction_id`    BIGINT        DEFAULT NULL,
    `secondary_transaction_id`  BIGINT        DEFAULT NULL,
    `tertiary_transaction_id`   BIGINT        DEFAULT NULL,
    `base_request_id`           BIGINT        DEFAULT NULL,

    -- ── Amount ────────────────────────────────────────────────────────────────
    `amount`                    DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    -- bonus balance drawn down by this consumption event
    `wager_amount`              DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    -- full stake (transaction_amount) placed by the player
    `consumed_amount`           DECIMAL(18,4) NOT NULL DEFAULT 0.0000,

    `created_at`                DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `reverted_at`               DATETIME      DEFAULT NULL,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_consumed_ref`              (`chunk_id`, `consumed_ref`),
    KEY `idx_bonus_consumed_chunk_id`               (`chunk_id`),
    KEY `idx_bonus_consumed_bonus_grant_id`         (`bonus_grant_id`),
    KEY `idx_bonus_consumed_wager_ref`              (`wager_ref`)
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

-- bonus_change_log
CREATE TABLE `bonus_change_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `table_name`  VARCHAR(50)   NOT NULL,
    `action`      VARCHAR(10)   NOT NULL,
    -- INSERT | UPDATE
    `entity_id`   INT           NOT NULL,
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

-- =============================================================================
-- SEED DATA — wynta_bonus
-- =============================================================================
-- Captured from local DB: 2026-05-25
-- Tables: bonus_head, bonus_subhead, bonus_configure, bonus_configure_code,
--         bonus_eligibility, bonus_release_trigger,
--         bonus_budget_limit, bonus_owners, bonus_budget_usage
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- bonus_head  (3 rows)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_head` (`id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (1,1,'ACTIVATION','Activation bonuses for new player on-boarding',1,'ops.lead','ops.lead','ops.lead','2026-05-15 21:35:39','2026-05-15 21:35:39','7b6b72e7e31dc8ad78f891e654182f7581a718c31817f89182b3ab561daf6f38');
INSERT INTO `bonus_head` (`id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (2,1,'Retention YYYY','Recurring incentives for active depositors — weekly reloads, cashback, loyalty milestones, leaderboards. xxxx',1,'demo','admin','demo','2026-05-18 19:09:27','2026-05-18 23:44:05','b60218d2139e1f01e0a214dea39fc4f0d74650d2dc7e882a49b445d6ddcb92aa');
INSERT INTO `bonus_head` (`id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (3,1,'Win-Back','Re-engagement campaigns for churned and lapsed players.',1,'arjun.dev','admin','admin','2026-05-18 19:09:27','2026-05-18 19:09:27','56757575e4fe280f52429fb3e3a8d1fdfb5c45d061c320b2a8dc1c69e85e61ec');

-- -----------------------------------------------------------------------------
-- bonus_subhead  (12 rows)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_subhead` (`id`, `head_id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (1,1,1,'ON-BOARDING','On-boarding incentives tied to first deposit',1,'ops.lead','ops.lead','ops.lead','2026-05-15 21:36:53','2026-05-15 21:36:53','fba65da432d3cab4b0b99ffd340fa8999994983125387d4587da89fc07428d39');
INSERT INTO `bonus_subhead` (`id`, `head_id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (2,1,1,'First Deposit Match','Up to 100% match on first deposit',1,'ops.lead','admin','admin','2026-05-18 19:10:17','2026-05-18 19:10:17','07372f13ef35be11647172b935e767a7df67c9abda5cd0d352cfd9452e3f8ad2');
INSERT INTO `bonus_subhead` (`id`, `head_id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (3,1,1,'Second Deposit Match','50% match on second deposit',1,'sneha.ops','admin','admin','2026-05-18 19:10:17','2026-05-18 19:10:17','35259f144233fd7b1179808d355ac941ba4d2e4968c5074306d870c7e26734b9');
INSERT INTO `bonus_subhead` (`id`, `head_id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (4,1,1,'Free Spins Welcome','20 free spins on sign-up',1,'ops.lead','admin','admin','2026-05-18 19:10:17','2026-05-18 19:10:17','11ab84a22a34447dcc069601e24071c37c0e21f326ff3931b2132a207c8c51db');
INSERT INTO `bonus_subhead` (`id`, `head_id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (5,1,1,'KYC Completion Bonus','Flat ₹500 on KYC verification',0,'finance.lead','admin','admin','2026-05-18 19:10:17','2026-05-18 19:10:17','d4f2bf71b6de0c3dc9578ee7c20636fcebda7118c2ebaf1fd0b53bcdde601018');
INSERT INTO `bonus_subhead` (`id`, `head_id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (6,2,1,'Weekly Reload Match','50% match every Friday',1,'priya.sharma','admin','admin','2026-05-18 19:10:17','2026-05-18 19:10:17','dbf084cc8ac4ce7a51d947c7ec10f1e9813bad520a12487d569f26c476b2b3a1');
INSERT INTO `bonus_subhead` (`id`, `head_id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (7,2,1,'Weekend Cashback','10% loss-back on weekends',1,'arjun.dev','admin','admin','2026-05-18 19:10:17','2026-05-18 19:10:17','eea09c0cbe42906628a1fad949155ec77999bfcc5a86943c1a509fd39c4ce70f');
INSERT INTO `bonus_subhead` (`id`, `head_id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (8,2,1,'Loyalty Milestones','Points-based tier rewards',1,'priya.sharma','admin','admin','2026-05-18 19:10:17','2026-05-18 19:10:17','9ff1b427f0709f9b42dbdfe864050b29d9dbbc62c5272d6f6d5b0093eb65119f');
INSERT INTO `bonus_subhead` (`id`, `head_id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (9,2,1,'Leaderboard Prizes','Weekly top-player bonuses',0,'arjun.dev','admin','admin','2026-05-18 19:10:17','2026-05-18 19:10:17','c4e083892230e406b2e3a6f47fa021b03a694cba025ea6602cb08c0312e71921');
INSERT INTO `bonus_subhead` (`id`, `head_id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (10,3,1,'Lapsed 7-Day Offer','30% reload for players inactive 7+ days',1,'arjun.dev','admin','admin','2026-05-18 19:10:17','2026-05-18 19:10:17','96248cfc3d6b77b0e3faf12a222ab341048220f90108815986164df1ba6f7281');
INSERT INTO `bonus_subhead` (`id`, `head_id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (11,3,1,'Lapsed 30-Day Offer','Free ₹200 credit for 30+ day inactives',1,'priya.sharma','admin','admin','2026-05-18 19:10:17','2026-05-18 19:10:17','bfd770490ab8977e924c9cd771494a38ea9d451e25aad02f14606a07e5bb1e9b');
INSERT INTO `bonus_subhead` (`id`, `head_id`, `site_id`, `name`, `description`, `active`, `owner`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (12,3,1,'Churned VIP Recovery','Personalised offer for VIP T2/T3 churners',0,'arjun.dev','admin','admin','2026-05-18 19:10:17','2026-05-18 19:10:17','9b718886f0b315098e06bfee6b8ae7c534907b5cfab74adf768392540fa3c0c7');

-- -----------------------------------------------------------------------------
-- bonus_configure  (17 rows)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (1,1,1,'First Deposit 200pct FIRST_DEPOSIT','200% first deposit bonus max 500 in 5 chunks on 2x wager','2026-05-15 00:00:00','2027-05-15 23:59:59','ONCE',2.00,5,NULL,30,90,'CASH','CASH',NULL,200.00,500.00,10,1,'ops.lead','ops.lead','2026-05-15 21:38:01','2026-05-15 21:38:01','3ca1323c5a555910159a78237cb2efd4f3d053e81694564f7cb03da2658642ce');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (2,1,1,'Welcome 100% Match','100% match on first deposit up to ₹5,000. Wager 3x to release.','2026-01-01 00:00:00','2026-12-31 23:59:59','ONCE',3.00,3,NULL,NULL,NULL,'CASH','CASH',NULL,100.00,5000.00,1,1,'admin','admin','2026-05-18 19:29:46','2026-05-18 19:29:46','deb2730cdad47fb018a353141ada5ed9045b45818729b9c0c0e67b0058062a1d');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (3,1,1,'Welcome Free ₹200 Credit','Flat ₹200 bonus credit on account activation. No wager required.','2026-01-01 00:00:00','2026-12-31 23:59:59','ONCE',0.00,1,NULL,NULL,NULL,'CASH','CASH',200.00,NULL,NULL,2,1,'admin','admin','2026-05-18 19:29:46','2026-05-18 19:29:46','edda10bd8beebbd897248aeff0dc7b43f0275988e7bc9fd5f377982dc4ba5747');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (4,2,1,'FD 100% Match up to ₹10K','Double your first deposit. Wager 4x on bonus to release.','2026-01-01 00:00:00','2026-12-31 23:59:59','ONCE',4.00,4,NULL,NULL,NULL,'CASH','CASH',NULL,100.00,10000.00,1,1,'admin','admin','2026-05-18 19:29:46','2026-05-18 19:29:46','b4089da51151c78959853ddc560636cb2452dc813fce1b99f155783652dc8184');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (5,2,1,'FD 50% Match up to ₹5K','50% match on first deposit. Wager 3x to release.','2026-01-01 00:00:00','2026-12-31 23:59:59','ONCE',3.00,2,NULL,NULL,NULL,'CASH','CASH',NULL,50.00,5000.00,2,1,'admin','admin','2026-05-18 19:29:46','2026-05-18 19:29:46','bda0523e5086de12158e706728233ce9dcca796dea9e4305f296610f969e0ce0');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (6,3,1,'SD 50% Match up to ₹5K','50% match on your second deposit. Wager 3x.','2026-01-01 00:00:00','2026-12-31 23:59:59','ONCE',3.00,2,NULL,NULL,NULL,'CASH','CASH',NULL,50.00,5000.00,1,1,'admin','admin','2026-05-18 19:29:46','2026-05-18 19:29:46','92874da447cb8761bd38f384f000e1ca1d82d27513384d4642083b5a6b7e91a2');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (7,3,1,'SD 25% Match up to ₹2.5K','25% match on second deposit for lower-tier players.','2026-01-01 00:00:00','2026-12-31 23:59:59','ONCE',2.00,1,NULL,NULL,NULL,'CASH','CASH',NULL,25.00,2500.00,2,1,'admin','admin','2026-05-18 19:29:47','2026-05-18 19:29:47','66af56c86ccb6518904fcaadbc08fd18f7683b790f35ad9ab844b9f68534ac84');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (8,4,1,'20 Free Spin Credits','₹400 spin credit (20 × ₹20) on registration. No wager.','2026-01-01 00:00:00','2026-12-31 23:59:59','ONCE',0.00,1,NULL,NULL,NULL,'CASH','CASH',400.00,NULL,NULL,1,1,'admin','admin','2026-05-18 19:29:47','2026-05-18 19:29:47','38359322550ab9d46e67275a142b875d6b3e825544477112481261d901abcfd5');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (9,5,1,'KYC Verified Reward','Flat ₹500 credited on successful KYC completion.','2026-01-01 00:00:00','2026-12-31 23:59:59','ONCE',1.00,1,NULL,NULL,NULL,'CASH','CASH',500.00,NULL,NULL,1,0,'admin','admin','2026-05-18 19:29:47','2026-05-18 19:29:47','394ca07319fe3e356bf5b9c9055172ca5ac65d3630531925ba252f2113e139f2');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (10,6,1,'Friday 50% Reload','50% match every Friday on your next deposit. Wager 2x to release.','2026-01-01 00:00:00','2026-12-31 23:59:59','WEEKLY',2.00,2,NULL,NULL,NULL,'CASH','CASH',NULL,50.00,3000.00,1,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','478ec67a003240e104742ccbb24fd1dae1b23fbef592b2fb03fd5b65e8874366');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (11,6,1,'VIP Friday 75% Reload','75% reload match for VIP T2 and T3 players every Friday.','2026-01-01 00:00:00','2026-12-31 23:59:59','WEEKLY',2.00,3,NULL,NULL,NULL,'CASH','CASH',NULL,75.00,7500.00,2,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','084e8cc04fab34edf951283c08dce4b8cb7213e06f60cefcb2efdb2b2a65371d');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (12,7,1,'10% Weekend Loss Cashback','Get 10% of net losses back every Monday. Wager 1x.','2026-01-01 00:00:00','2026-12-31 23:59:59','WEEKLY',1.00,1,NULL,NULL,NULL,'CASH','CASH',NULL,10.00,2000.00,1,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','e85016eb39a0b70dbf15ece392dd30825962e27c44620609f8d26fee6fbaebd6');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (13,7,1,'VIP 15% Cashback','15% cashback for VIP T3 players. No wager required.','2026-01-01 00:00:00','2026-12-31 23:59:59','WEEKLY',0.00,1,NULL,NULL,NULL,'CASH','CASH',NULL,15.00,5000.00,2,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','bddc610b85c80216a92ddd8addb447bbc62566e5d82d18eb69b683aa3cb72a72');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (14,8,1,'Silver Tier Milestone','₹1,000 bonus on reaching Silver loyalty tier.','2026-01-01 00:00:00','2026-12-31 23:59:59','ONCE',2.00,1,NULL,NULL,NULL,'CASH','CASH',1000.00,NULL,NULL,1,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','4027c16c137b91f10dfa8a4d50cd39cfd42254787bfe9c05ee7383c6c972407e');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (15,8,1,'Gold Tier Milestone','₹2,500 bonus on reaching Gold loyalty tier.','2026-01-01 00:00:00','2026-12-31 23:59:59','ONCE',2.00,1,NULL,NULL,NULL,'CASH','CASH',2500.00,NULL,NULL,2,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','2f09babde40e57ee2144c671348d63f69b1d252fdcac4bbf25d58c54b6fd96d1');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (16,8,1,'VIP Tier Milestone','₹5,000 bonus on reaching VIP T1 and above.','2026-01-01 00:00:00','2026-12-31 23:59:59','ONCE',1.00,1,NULL,NULL,NULL,'CASH','CASH',5000.00,NULL,NULL,3,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','3173d213b41653ec85e75fce313a5e2c33ba1477b9178537d8ed1450cfed8d3a');
INSERT INTO `bonus_configure` (`id`, `subhead_id`, `site_id`, `name`, `description`, `start_date`, `end_date`, `applicability_frequency`, `wager_multiplier`, `no_of_chunks`, `release_bucket`, `chunk_expiry_days`, `bonus_expiry_days`, `wager_chip_type`, `credit_chip_type`, `bonus_amount_fixed`, `bonus_amount_percent`, `bonus_amount_max`, `priority`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (17,9,1,'Weekly Leaderboard Top 10','Top 10 players on weekly leaderboard share a ₹1L prize pool.','2026-01-01 00:00:00','2026-12-31 23:59:59','WEEKLY',0.00,1,NULL,NULL,NULL,'CASH','CASH',10000.00,NULL,NULL,1,0,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','18efa4f619239016ad203060cdbdd1684da89c832b17190a898b2e6f3db6d64e');

-- -----------------------------------------------------------------------------
-- bonus_configure_code  (31 rows)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (1,1,1,'AUTO-1',500.00,'2026-05-15 00:00:00','2027-05-15 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'ops.lead','ops.lead','2026-05-15 21:38:01','2026-05-15 21:38:01','fe667ccf7809e771408ecbfe58edb598954eef617b254385f2f807227ae02045');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (2,2,1,'AUTO-2',5000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:29:46','2026-05-18 19:29:46','6dc02db547f8109409073a098e5b3dee62f10d3df0a2dc673f21f3241dbc1b36');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (3,3,1,'AUTO-3',NULL,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:29:46','2026-05-18 19:29:46','5e978c0402427e16b32246f0e4b59566a53b5c0ff47713059187ab3874a88ef9');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (4,4,1,'AUTO-4',10000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:29:46','2026-05-18 19:29:46','f3417d08b6f3e778b1f9b7d06fa9773e4b8781161a439bfca9cb65dcf81610e9');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (5,5,1,'AUTO-5',5000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:29:46','2026-05-18 19:29:46','3da7b32d9b622bb2bb84e8fa072a01c1268a9d02372b9a4f8d02698a8465c448');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (6,6,1,'AUTO-6',5000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:29:47','2026-05-18 19:29:47','8547a5c5fc76a1aab49c815dbde61f07f3607692d10ba48475a19a8e40a64fec');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (7,7,1,'AUTO-7',2500.00,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:29:47','2026-05-18 19:29:47','177c7856e151babc4eae32d4c625f5102863783b5c7cb6b2b96ffd4a7116de96');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (8,8,1,'AUTO-8',NULL,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:29:47','2026-05-18 19:29:47','fc61ef76138b8de5b3b0c26bfeca1599e5e9fb57b345ee0950a4783e294f6fd7');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (9,9,1,'AUTO-9',NULL,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:29:47','2026-05-18 19:29:47','3f3cb4b6e3511d713d48ae71f1a51e1350a945987f9420c1c83ae18483beab86');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (10,10,1,'AUTO-10',3000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','0b7d5dc7847d80b183a43825c414b62c8aa768aa4f01f3e27874208a56d5ee64');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (11,11,1,'AUTO-11',7500.00,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','88900b6931dfa87e32052ffcc5f1f5f127b7bd7da10317e912720d2544718ad1');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (12,12,1,'AUTO-12',2000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','5f295b8490832ed4ae30323ad34e82d0d108f8f9e92d55a111a4809af6cb81e1');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (13,13,1,'AUTO-13',5000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','70f4651d5fd2997a29cf6db46fb98f272442f8173e16ea2665d69dcd72bddafa');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (14,14,1,'AUTO-14',NULL,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','66d7c3977d2cd7bee261bdee01ebdbaa8ac2d9e113d14abfeb81313f5150bf2d');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (15,15,1,'AUTO-15',NULL,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','d3f417042a1f7e530d16b67cb09dc0ab08b0bdc215cd44e54ce4bb21b115c89c');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (16,16,1,'AUTO-16',NULL,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','cf7779ae00941228af2bff94d68c9c8f0fdefd3de53bed00561771c63e634a5f');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (17,17,1,'AUTO-17',NULL,'2026-01-01 00:00:00','2026-12-31 23:59:59',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:30:28','2026-05-18 19:30:28','9a4ffe815a1a70452049ce9b40b69bcbd348bf73594ad622411d4a7d92bb7066');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (18,2,1,'WELCOME100',5000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59','100% Welcome Bonus','Get double your first deposit!',NULL,NULL,'NEW','Claim Now',0,1,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','494ce96f1f38dd7a9b822c81268c4313d09ede3d9b1ceab8443970702b431c59');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (19,2,1,'FIRST100',5000.00,'2026-05-01 00:00:00','2026-07-31 23:59:59','Summer Welcome Offer','100% match — limited time!',NULL,NULL,'HOT','Grab Offer',0,2,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','0cff25048e3ff52e5596548a01a3d2c7e32a7587d19b7be94aba1fd43e2c4baa');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (20,3,1,'FREEPLAY200',200.00,'2026-01-01 00:00:00','2026-12-31 23:59:59','₹200 Free Play','No deposit needed. Play on us!',NULL,NULL,'FREE','Activate',1,1,'REGISTRATION',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','0058b750722ebbcbce9bd337a12332866c85e48165bab6e10418726163297b89');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (21,4,1,'FD100',10000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59','First Deposit 100%','Double your first deposit up to ₹10,000',NULL,NULL,'TOP','Deposit & Win',0,1,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','131c8514587e1fd630b7e02f21757292f13f4b8cea651e016b7d80ac5786a280');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (22,4,1,'NEWPLAYER',10000.00,'2026-04-01 00:00:00','2026-06-30 23:59:59','New Player Mega Offer','100% match — exclusive for new signups',NULL,NULL,'MEGA','Claim Bonus',0,2,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','0ea62a55142bc739dfb3d13be7d471b8e7bdde62e415fdd95f00461680b7287b');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (23,5,1,'FD50',5000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59','First Deposit 50%','50% bonus on your first deposit',NULL,NULL,NULL,'Deposit Now',0,1,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','37fa9d2eca18a593a684f2b45b378d83e399dc07366dcaa8e6e8f04de270ed2c');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (24,6,1,'SECOND50',5000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59','Second Deposit 50%','50% match on your second deposit',NULL,NULL,NULL,'Deposit More',0,1,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','b75016e3c51f167df202098107b04c32581b3ea8649b3f1e732fa349ac30122b');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (25,10,1,'RELOAD50',3000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59','Friday Reload 50%','Reload every Friday and get 50% bonus',NULL,NULL,'WEEKLY','Reload Now',0,1,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','53020c8f41672f98503673bace44094628bac4021fe28c5f3d3c93d8e8014538');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (26,10,1,'FRIDAY50',3000.00,'2026-05-01 00:00:00','2026-07-31 23:59:59','Summer Friday Deal','50% reload — every Friday this summer',NULL,NULL,'SUMMER','Get Bonus',0,2,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','dcc0fa0fcd11f28e23dfd2ecb0abc69cc52d11718afde6cd19398abae1030013');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (27,11,1,'VIPFRI75',7500.00,'2026-01-01 00:00:00','2026-12-31 23:59:59','VIP Friday 75%','Exclusive VIP Friday reload — 75% match',NULL,NULL,'VIP','Claim VIP Bonus',0,1,'DEPOSIT',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','a578d1278a75a15f48061078e5bfb4a865f14da94af11bb72c7272409ba0706b');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (28,12,1,'CASHBACK10',2000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59','10% Weekend Cashback','Losses on weekends? Get 10% back!',NULL,NULL,'SAFE','Enable Cashback',1,1,'LOSS',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','9c4412f8ea1b13faf86c71fd67fdfa0971f2c2d6f607f5fdaa6e0bbb4f390a62');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (29,14,1,'SILVER1K',1000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59','Silver Tier Reward','₹1,000 bonus — welcome to Silver!',NULL,NULL,'SILVER','Collect Reward',1,1,'MILESTONE',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','f1e4093e5fa488ee115e3918571df28e11b983a2ff4685d61087c4b5dd89c2f2');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (30,15,1,'GOLD2500',2500.00,'2026-01-01 00:00:00','2026-12-31 23:59:59','Gold Tier Reward','₹2,500 bonus — welcome to Gold!',NULL,NULL,'GOLD','Collect Reward',1,1,'MILESTONE',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','abf8557e05b9f8f0a9514ad7f2b5d4f1689bbf90efcc314607b62b64f598e733');
INSERT INTO `bonus_configure_code` (`id`, `configure_id`, `site_id`, `code`, `max_amount`, `valid_from`, `valid_to`, `display_title`, `display_description`, `terms_url`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (31,16,1,'VIPMILESTONE',5000.00,'2026-01-01 00:00:00','2026-12-31 23:59:59','VIP Tier Reward','₹5,000 exclusive reward — you are VIP!',NULL,NULL,'VIP','Collect VIP Reward',1,1,'MILESTONE',NULL,1,'admin','admin','2026-05-18 19:31:03','2026-05-18 19:31:03','70cbe930282ee3c00c22697651b093077e9e2bdc013a937bc038bb169004f66f');

-- -----------------------------------------------------------------------------
-- bonus_eligibility  (1 row)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_eligibility` (`id`, `configure_id`, `site_id`, `eligibility_key`, `eligibility_value`, `eligibility_value_type`, `description`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (3,1,1,'player_registered_period','CURRENT_WEEK','STRING',NULL,1,'ops.lead','ops.lead','2026-05-15 22:51:22','2026-05-15 22:51:22','58343a9d236e2fe9a06df8527415cd6457338eaafadaa1e84d56efa7f6bd2158');

-- -----------------------------------------------------------------------------
-- bonus_release_trigger  (17 rows)
-- trigger_config JSON keys: min_amount, max_amount, payment_method, product, occurrence
-- occurrence: 0 = every, 1 = first only, N = Nth
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_release_trigger` (`id`, `configure_id`, `site_id`, `trigger_type`, `release_type`, `trigger_config`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES
(1,  1,  1, 'DEPOSIT',        'BONUS_RELEASE', '{"min_amount":500,"occurrence":1}',   1,'ops.lead','ops.lead','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(2,  2,  1, 'DEPOSIT',        'BONUS_RELEASE', '{"min_amount":100,"occurrence":1}',   1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(3,  3,  1, 'REGISTRATION',   'BONUS_RELEASE', NULL,                                  1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(4,  4,  1, 'DEPOSIT',        'BONUS_RELEASE', '{"min_amount":500,"occurrence":1}',   1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(5,  5,  1, 'DEPOSIT',        'BONUS_RELEASE', '{"min_amount":200,"occurrence":1}',   1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(6,  6,  1, 'DEPOSIT',        'BONUS_RELEASE', '{"min_amount":200,"occurrence":2}',   1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(7,  7,  1, 'DEPOSIT',        'BONUS_RELEASE', '{"min_amount":100,"occurrence":2}',   1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(8,  8,  1, 'REGISTRATION',   'BONUS_RELEASE', NULL,                                  1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(9,  9,  1, 'APP_VISIT',      'BONUS_RELEASE', '{"occurrence":1}',                    0,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(10,10,  1, 'DEPOSIT',        'BONUS_RELEASE', '{"min_amount":500,"occurrence":0}',   1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(11,11,  1, 'DEPOSIT',        'BONUS_RELEASE', '{"min_amount":1000,"occurrence":0}',  1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(12,12,  1, 'BET_PLACED',     'BONUS_RELEASE', '{"occurrence":0}',                    1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(13,13,  1, 'BET_PLACED',     'BONUS_RELEASE', '{"occurrence":0}',                    1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(14,14,  1, 'LEADERBOARD_WON','BONUS_RELEASE', '{"occurrence":1}',                    1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(15,15,  1, 'LEADERBOARD_WON','BONUS_RELEASE', '{"occurrence":1}',                    1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(16,16,  1, 'LEADERBOARD_WON','BONUS_RELEASE', '{"occurrence":1}',                    1,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL),
(17,17,  1, 'BET_PLACED',     'BONUS_RELEASE', '{"occurrence":0}',                    0,'admin','admin','2026-05-25 10:00:00','2026-05-25 10:00:00',NULL);

-- -----------------------------------------------------------------------------
-- bonus_budget_limit  (8 rows)
-- limit_type: SOFT = advisory alert only; HARD = block new grants when exceeded
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_budget_limit` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_limit`, `limit_type`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (1,'HEAD',1,1,'DAILY',150000.00,'SOFT','admin','admin','2026-05-18 19:09:50','2026-05-18 19:09:50','2f9570c5dddb92143bc1418d02ff2dac41198f2a6912777264c277a1ff33dd18');
INSERT INTO `bonus_budget_limit` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_limit`, `limit_type`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (2,'HEAD',1,1,'WEEKLY',800000.00,'SOFT','admin','admin','2026-05-18 19:09:50','2026-05-18 19:09:50','c3881b9a7bf62263fd49947565cfcee2f7f31ae6a48aa0c1bf31ace2f08e0116');
INSERT INTO `bonus_budget_limit` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_limit`, `limit_type`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (3,'HEAD',1,1,'MONTHLY',3000000.00,'HARD','admin','admin','2026-05-18 19:09:50','2026-05-18 19:09:50','2641646338db000bad56d75cf792713984a5198f962319d29749947aa5d6d35f');
INSERT INTO `bonus_budget_limit` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_limit`, `limit_type`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (4,'HEAD',2,1,'DAILY',300000.00,'SOFT','admin','admin','2026-05-18 19:09:50','2026-05-18 19:09:50','c1a16ad98dce9fefb49a7d4bd1c16ad57e9890ebd5962c163a3354a7ade81453');
INSERT INTO `bonus_budget_limit` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_limit`, `limit_type`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (5,'HEAD',2,1,'WEEKLY',1500000.00,'SOFT','admin','admin','2026-05-18 19:09:50','2026-05-18 19:09:50','3d7c3108980d1e4c0c367f1d1fa628f81e3280ea7a61bdaa5bbb567f0a813946');
INSERT INTO `bonus_budget_limit` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_limit`, `limit_type`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (6,'HEAD',2,1,'MONTHLY',NULL,'SOFT','admin','admin','2026-05-18 19:09:50','2026-05-18 19:09:50','9564918bd099c81396c446c3ebaa85928dcfbdcde32b89976dc9d1ac1829b2d2');
INSERT INTO `bonus_budget_limit` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_limit`, `limit_type`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (7,'HEAD',3,1,'DAILY',200000.00,'SOFT','admin','admin','2026-05-18 19:09:50','2026-05-18 19:09:50','59f07cd3e8a435fc6e2c9b8071e991e44bc150a31601be970e8d17be4d1e18d4');
INSERT INTO `bonus_budget_limit` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_limit`, `limit_type`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (8,'HEAD',3,1,'MONTHLY',2500000.00,'HARD','admin','admin','2026-05-18 19:09:50','2026-05-18 19:09:50','d3122b9f35006d1d2172bcd6a23992b5897e74f4034644aafe243a558115d0a4');

-- -----------------------------------------------------------------------------
-- bonus_owners  (12 rows)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_owners` (`id`, `entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (1,'SUBHEAD',1,1,'khanin','OPS_LEAD',1,'khanin','khanin','2026-05-16 13:02:17','2026-05-16 13:02:17','b20679442d9a7aadea2a25a645eb68106157e8ba72154f01a954d74fae22dc3c');
INSERT INTO `bonus_owners` (`id`, `entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (2,'SUBHEAD',1,1,'abc','FINANCE_APPROVER',1,'khanin','khanin','2026-05-16 13:02:17','2026-05-16 13:02:17','004ebaba1e2e09ee8a1f3f9e6e038e5b6ffdfe54d0e8e6b3a72dce938b076d66');
INSERT INTO `bonus_owners` (`id`, `entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (3,'HEAD',1,1,'ops.lead','OPS_LEAD',1,'admin','admin','2026-05-18 19:09:39','2026-05-18 19:09:39','250c0e713ae39947740082bb1261fc3a20bb55fb23541f9b31159c84761943c5');
INSERT INTO `bonus_owners` (`id`, `entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (4,'HEAD',1,1,'sneha.ops','CAMPAIGN_MANAGER',1,'admin','admin','2026-05-18 19:09:39','2026-05-18 19:09:39','f909f33c7ba3f72281febfaacf9284b44b80d7974a3336516ab3b1bd94a9f4a7');
INSERT INTO `bonus_owners` (`id`, `entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (5,'HEAD',1,1,'finance.lead','FINANCE_APPROVER',1,'admin','admin','2026-05-18 19:09:39','2026-05-18 19:09:39','4fcd31b4d43439c03d6c8c7c509f6631afdf20e57898b77365c234dd2440461c');
INSERT INTO `bonus_owners` (`id`, `entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (6,'HEAD',2,1,'priya.sharma','OPS_LEAD',1,'admin','admin','2026-05-18 19:09:39','2026-05-18 19:09:39','a59863cebcfc3d53df8f5497f70bd45ecf83d2675bf58a4a7e7885225d884ce2');
INSERT INTO `bonus_owners` (`id`, `entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (7,'HEAD',2,1,'arjun.dev','CAMPAIGN_MANAGER',1,'admin','admin','2026-05-18 19:09:39','2026-05-18 19:09:39','0ce4f4bedff8f244e2468df0927606e315bdb12cc82ca4c40456d2c38ae874bd');
INSERT INTO `bonus_owners` (`id`, `entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (8,'HEAD',2,1,'finance.lead','FINANCE_APPROVER',1,'admin','admin','2026-05-18 19:09:39','2026-05-18 19:09:39','797f5d1ed0278234cbc70b903b672a2fd75cc42659cfc152b7ae2b0b851a678f');
INSERT INTO `bonus_owners` (`id`, `entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (9,'HEAD',2,1,'vanessa.ops','ESCALATION_CONTACT',1,'admin','admin','2026-05-18 19:09:39','2026-05-18 19:09:39','3541b5239eec0a6063a638302917c9ffe5bd64962a86f19d0622c3de9192d71d');
INSERT INTO `bonus_owners` (`id`, `entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (10,'HEAD',3,1,'arjun.dev','OPS_LEAD',1,'admin','admin','2026-05-18 19:09:39','2026-05-18 19:09:39','4e5c0053a051000904369e82ea312f5d4f038b9dbfd06195c1221a9212574b2e');
INSERT INTO `bonus_owners` (`id`, `entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (11,'HEAD',3,1,'priya.sharma','CAMPAIGN_MANAGER',1,'admin','admin','2026-05-18 19:09:39','2026-05-18 19:09:39','a489d3a4e74211c6b212434f24e854b6f5bc5f687f1936dab086883f680c636f');
INSERT INTO `bonus_owners` (`id`, `entity_type`, `entity_id`, `site_id`, `username`, `role`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `row_hash`) VALUES (12,'HEAD',3,1,'finance.lead','FINANCE_APPROVER',0,'admin','admin','2026-05-18 19:09:39','2026-05-18 19:09:39','c8ade639039c24530bd93e3e1b632c31da17fb4cdfadb61923b61b707028f000');

-- -----------------------------------------------------------------------------
-- bonus_budget_usage  (8 rows)
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_budget_usage` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_used`, `reset_at`, `updated_at`) VALUES (1,'HEAD',1,1,'DAILY',98400.00,'2026-05-18 00:00:00','2026-05-18 19:10:17');
INSERT INTO `bonus_budget_usage` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_used`, `reset_at`, `updated_at`) VALUES (2,'HEAD',1,1,'WEEKLY',521000.00,'2026-05-12 00:00:00','2026-05-18 19:10:17');
INSERT INTO `bonus_budget_usage` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_used`, `reset_at`, `updated_at`) VALUES (3,'HEAD',1,1,'MONTHLY',1843200.00,'2026-05-01 00:00:00','2026-05-18 19:10:17');
INSERT INTO `bonus_budget_usage` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_used`, `reset_at`, `updated_at`) VALUES (4,'HEAD',2,1,'DAILY',267900.00,'2026-05-18 00:00:00','2026-05-18 19:10:17');
INSERT INTO `bonus_budget_usage` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_used`, `reset_at`, `updated_at`) VALUES (5,'HEAD',2,1,'WEEKLY',1198000.00,'2026-05-12 00:00:00','2026-05-18 19:10:17');
INSERT INTO `bonus_budget_usage` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_used`, `reset_at`, `updated_at`) VALUES (6,'HEAD',2,1,'MONTHLY',3475250.00,'2026-05-01 00:00:00','2026-05-18 19:10:17');
INSERT INTO `bonus_budget_usage` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_used`, `reset_at`, `updated_at`) VALUES (7,'HEAD',3,1,'DAILY',87500.00,'2026-05-18 00:00:00','2026-05-18 19:10:17');
INSERT INTO `bonus_budget_usage` (`id`, `entity_type`, `entity_id`, `site_id`, `period_type`, `budget_used`, `reset_at`, `updated_at`) VALUES (8,'HEAD',3,1,'MONTHLY',940000.00,'2026-05-01 00:00:00','2026-05-18 19:10:17');

SET FOREIGN_KEY_CHECKS = 1;
