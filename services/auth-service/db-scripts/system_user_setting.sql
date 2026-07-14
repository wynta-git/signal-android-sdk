-- =============================================================================
-- TABLE: system_user_setting
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Key-value configuration store for a system_user. Each row holds one named
-- setting (config_key) and its value (config_value) for a given user.
--
-- TYPES
-- ─────
-- UI     — exposed to the front-end via GET /api/v1/system/users/me/settings
-- SYSTEM — internal-only; never returned by that endpoint
--
-- CHANGE LOGGING
-- ──────────────
-- Not currently wired into change_log (that table requires a site_id, which
-- this table has no natural scope for — a system_user's settings aren't
-- tied to one site). Revisit if/when a write API is added.
--
-- RELATIONSHIPS
-- ─────────────
-- system_user_setting.system_user_id → system_user.id
--
-- =============================================================================

CREATE TABLE `system_user_setting` (
    `id`               INT           NOT NULL AUTO_INCREMENT,
    `system_user_id`   INT           NOT NULL,
    -- FK → system_user.id
    `type`             VARCHAR(10)   NOT NULL DEFAULT 'UI',
    -- UI | SYSTEM — see TYPES above
    `config_key`       VARCHAR(100)  NOT NULL,
    -- lowercase_snake_case; never rename a key in production
    `config_value`     VARCHAR(1000) NOT NULL,
    `active`           TINYINT(1)    NOT NULL DEFAULT 1,
    `created_by`       VARCHAR(100)  NOT NULL,
    `updated_by`       VARCHAR(100)  NOT NULL,
    `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`         CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_system_user_setting_key`   (`system_user_id`, `config_key`),
    KEY `idx_system_user_setting_user`        (`system_user_id`),
    KEY `idx_system_user_setting_active`      (`active`),
    KEY `idx_system_user_setting_type`        (`type`),

    CONSTRAINT `fk_sus_user` FOREIGN KEY (`system_user_id`)
        REFERENCES `system_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `system_user_setting`
    (`id`, `system_user_id`, `type`, `config_key`, `config_value`, `active`,
     `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    (1, 1, 'UI', 'theme',             'dark',  1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (2, 1, 'UI', 'sidebar_collapsed', 'false', 1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
    (3, 2, 'UI', 'theme',             'light', 1, 'admin', 'admin', '2026-01-01 09:00:00', '2026-01-01 09:00:00');
