-- =============================================================================
-- TABLE: bonus_head_change_log
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Tamper-evident, append-only change log for bonus_head.
--
-- Each row records a full before/after snapshot of a change, plus a
-- blockchain-style hash chain:
--
--   entry_hash = SHA-256(prev_hash | action | changed_by | changed_at | old_values | new_values)
--
-- Where prev_hash is the entry_hash of the immediately preceding row for the
-- same entity_id (NULL for the first entry — the genesis block).
--
-- Any modification or deletion of a row breaks the chain and can be detected
-- by recomputing entry_hash and comparing it to the stored value.
--
-- COMPLEMENTARY INTEGRITY
-- ───────────────────────
-- bonus_head.row_hash = SHA-256 of the live row's mutable fields.
-- A mismatch between recomputed and stored row_hash reveals a direct SQL edit
-- that bypassed the application layer.
--
-- USAGE
-- ─────
-- • Written by the application within the same transaction as the config change.
-- • Never updated or deleted.
-- • Verify with: SELECT and recompute entry_hash for each row ordered by id.
--
-- =============================================================================

CREATE TABLE `bonus_head_change_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT,
    `entity_id`   INT           NOT NULL,
    -- bonus_head.id
    `site_id`     INT           NOT NULL,
    `action`      VARCHAR(10)   NOT NULL,
    -- INSERT | UPDATE
    `changed_by`  VARCHAR(100)  NOT NULL,
    `changed_at`  DATETIME      NOT NULL,
    `old_values`  JSON          DEFAULT NULL,
    -- NULL for INSERT; full row snapshot for UPDATE
    `new_values`  JSON          DEFAULT NULL,
    -- full new row state
    `prev_hash`   CHAR(64)      DEFAULT NULL,
    -- entry_hash of the previous row for this entity_id; NULL = genesis
    `entry_hash`  CHAR(64)      NOT NULL,
    -- SHA-256 of the chain inputs (see description)
    PRIMARY KEY (`id`),
    KEY `idx_head_cl_entity`     (`entity_id`),
    KEY `idx_head_cl_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
