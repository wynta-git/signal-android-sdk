CREATE TABLE `pam_user_mapping` (
    `id`         BIGINT       NOT NULL AUTO_INCREMENT,
    `site_id`    INT          NOT NULL,
    `user_id`    VARCHAR(50)  NOT NULL,
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_pam_user_site` (`user_id`, `site_id`),
    KEY `idx_pam_user_site_site` (`site_id`),
    KEY `idx_pam_user_site_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
