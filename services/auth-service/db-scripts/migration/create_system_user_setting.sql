-- Creates system_user_setting — key-value configuration per system_user,
-- tagged UI (exposed to the front-end) or SYSTEM (internal-only). Brand-new
-- table, so this is a straight CREATE — no backfill/ALTER concerns.

CREATE TABLE `system_user_setting` (
    `id`               INT           NOT NULL AUTO_INCREMENT,
    `system_user_id`   INT           NOT NULL,
    `type`             VARCHAR(10)   NOT NULL DEFAULT 'UI',
    `config_key`       VARCHAR(100)  NOT NULL,
    `config_value`     VARCHAR(1000) NOT NULL,
    `active`           TINYINT(1)    NOT NULL DEFAULT 1,
    `created_by`       VARCHAR(100)  NOT NULL,
    `updated_by`       VARCHAR(100)  NOT NULL,
    `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`         CHAR(64)      DEFAULT NULL,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_system_user_setting_key`   (`system_user_id`, `config_key`),
    KEY `idx_system_user_setting_user`        (`system_user_id`),
    KEY `idx_system_user_setting_active`      (`active`),
    KEY `idx_system_user_setting_type`        (`type`),

    CONSTRAINT `fk_sus_user` FOREIGN KEY (`system_user_id`)
        REFERENCES `system_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
