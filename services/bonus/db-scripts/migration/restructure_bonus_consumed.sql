-- Moves chunk-specific columns out of bonus_consumed into bonus_chunk_consumed.
-- Run AFTER creating bonus_chunk_consumed (bonus_chunk_consumed.sql).
-- Existing rows are not migrated; this is a forward-only schema change.

ALTER TABLE `bonus_consumed`
    DROP KEY   `uk_bonus_consumed_ref`,
    DROP KEY   `idx_bonus_consumed_chunk_id`,
    DROP KEY   `idx_bonus_consumed_bonus_grant_id`,
    DROP COLUMN `consumed_ref`,
    DROP COLUMN `chunk_id`,
    DROP COLUMN `bonus_grant_id`;
