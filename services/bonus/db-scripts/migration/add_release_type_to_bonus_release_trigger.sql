-- Migration: add release_type column to bonus_release_trigger
-- Values: BONUS_RELEASE (bonus is granted) | CHUNK_RELEASE (chunk wager condition)
-- Default existing rows to BONUS_RELEASE.

ALTER TABLE `bonus_release_trigger`
    ADD COLUMN `release_type` VARCHAR(20) NOT NULL DEFAULT 'BONUS_RELEASE'
    AFTER `trigger_type`;

-- Widen the unique constraint to include release_type so both release types
-- can have the same trigger_type on a single configure.
ALTER TABLE `bonus_release_trigger`
    DROP INDEX `uk_bonus_release_trigger`,
    ADD UNIQUE KEY `uk_bonus_release_trigger` (`configure_id`, `trigger_type`, `release_type`);
