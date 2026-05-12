-- =============================================================================
-- TABLE: bonus_subhead_change_log
-- =============================================================================
--
-- Tamper-evident, append-only change log for bonus_subhead.
-- entity_id = bonus_subhead.id
--
-- Hash chain:
--   entry_hash = SHA-256(prev_hash | action | changed_by | changed_at | old_values | new_values)
--
-- See bonus_head_change_log.sql for full description.
--
-- =============================================================================

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
