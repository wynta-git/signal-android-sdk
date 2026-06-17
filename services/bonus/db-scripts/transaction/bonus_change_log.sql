-- =============================================================================
-- TABLE: bonus_change_log
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Append-only audit trail. Every INSERT or UPDATE on the mutable bonus
-- config tables writes one row here, guaranteeing that the audit log is
-- always consistent with the live tables.
--
-- USAGE
-- ─────
-- • Written by the application service layer — never by triggers or migrations.
-- • old_values is NULL for INSERT actions; new_values holds the full new state.
-- • For UPDATE actions old_values contains only the fields that changed, so
--   the diff is immediately readable without comparing two full snapshots.
-- • Rows are never updated or deleted; hard deletes of config rows (rare) are
--   recorded as a final UPDATE with active=0 before physical deletion.
--
-- ENTITY TYPES (table_name values)
-- ─────────────────────────────────
-- bonus_head            → entity_id = bonus_head.id
-- bonus_head_budget     → entity_id = bonus_head.id
-- bonus_subhead         → entity_id = bonus_subhead.id
-- bonus_subhead_budget  → entity_id = bonus_subhead.id
-- bonus_configure       → entity_id = bonus_configure.id
-- site_client           → entity_id = site_client.id
-- site                  → entity_id = site.id
--
-- =============================================================================

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
