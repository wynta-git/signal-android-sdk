-- =============================================================================
-- TABLE: bonus_eligibility_change_log
-- =============================================================================
--
-- Tamper-evident, append-only change log for bonus_eligibility.
-- entity_id = bonus_eligibility.id
--
-- Hash chain:
--   entry_hash = SHA-256(prev_hash | action | changed_by | changed_at | old_values | new_values)
--
-- See bonus_head_change_log.sql for full description.
--
-- =============================================================================

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
