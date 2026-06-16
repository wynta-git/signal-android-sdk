-- =============================================================================
-- TABLE: user_site_role
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Maps a system_user to a site and assigns them a role within that site.
-- A user may hold different roles across different sites. A user with no
-- active rows here has no portal access to any site.
--
-- CHANGE LOGGING
-- ──────────────
-- All INSERTs and UPDATEs are recorded in change_log with
-- table_name = 'user_site_role'. No DDL change is needed to that table.
--
-- RELATIONSHIPS
-- ─────────────
-- user_site_role.user_id  → system_user.id
-- user_site_role.site_id  → site.id
-- user_site_role.role_id  → role.id
--
-- =============================================================================

CREATE TABLE `user_site_role` (
    `id`            INT           NOT NULL AUTO_INCREMENT,
    `user_id`       INT           NOT NULL,
    -- FK → system_user.id
    `site_id`       INT           NOT NULL,
    -- FK → site.id
    `role_id`       INT           NOT NULL,
    -- FK → role.id
    `active`        TINYINT(1)    NOT NULL DEFAULT 1,
    `created_by`    VARCHAR(100)  NOT NULL,
    `updated_by`    VARCHAR(100)  NOT NULL,
    `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    `row_hash`      CHAR(64)      DEFAULT NULL,
    -- SHA-256 of mutable fields; recompute to detect tampering

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_site_role`              (`user_id`, `site_id`),
    KEY `idx_user_site_role_user`               (`user_id`),
    KEY `idx_user_site_role_site`               (`site_id`),
    KEY `idx_user_site_role_active`             (`active`),
    KEY `idx_user_site_role_role`               (`role_id`),

    CONSTRAINT `fk_usr_user` FOREIGN KEY (`user_id`)
        REFERENCES `system_user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_usr_site` FOREIGN KEY (`site_id`)
        REFERENCES `site` (`id`)        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_usr_role` FOREIGN KEY (`role_id`)
        REFERENCES `role` (`id`)        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `user_site_role`
    (`id`, `user_id`, `site_id`, `role_id`, `active`,
     `created_by`, `updated_by`, `created_at`, `updated_at`)
VALUES
    (1,  1,  1, 1,  1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),  -- alice.morgan   → ACCOUNT_MANAGER
    (2,  2,  1, 2,  1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),  -- bob.chen       → MARKETING_MANAGER
    (3,  3,  1, 3,  1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),  -- carol.patel    → FINANCE_MANAGER
    (4,  4,  1, 4,  1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),  -- david.kim      → OPS_LEAD
    (5,  5,  1, 5,  1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),  -- eva.smith      → CAMPAIGN_MANAGER
    (6,  6,  1, 6,  1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),  -- frank.jones    → ADMIN
    (7,  7,  1, 7,  1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),  -- grace.liu      → ANALYST
    (8,  8,  1, 8,  1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),  -- henry.obi      → SUPPORT
    (9,  9,  1, 9,  1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00'),  -- isla.reyes     → BRAND_MANAGER
    (10, 10, 1, 10, 1, 'system', 'system', '2026-01-01 09:00:00', '2026-01-01 09:00:00');  -- james.wu       → PRODUCT_MANAGER
