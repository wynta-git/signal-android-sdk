-- =============================================================================
-- TABLE: user_site_mapping
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Maps a platform user to the site(s) they belong to. Each row represents
-- a single (user_id, site_id) pairing. A user may appear in multiple rows
-- if they have access to more than one site.
--
-- =============================================================================

CREATE TABLE `user_site_mapping` (
    `id`         INT      NOT NULL AUTO_INCREMENT,
    `site_id`    INT      NOT NULL,
    `user_id`    INT      NOT NULL,
    `created_on` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_site` (`user_id`, `site_id`),
    KEY `idx_user_site_site`  (`site_id`),
    KEY `idx_user_site_user`  (`user_id`)
);
