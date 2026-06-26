-- Links bonus_chunk_release to its parent bonus_release row.
-- DEFAULT NULL so existing rows survive without a backfill.
-- Tighten to NOT NULL in a follow-up migration once the application
-- populates the column on every new write.

ALTER TABLE `bonus_chunk_release`
    ADD COLUMN `bonus_release_id` BIGINT DEFAULT NULL
        COMMENT 'references bonus_release.id; NULL for rows written before this migration'
        AFTER `id`,
    ADD KEY `idx_bonus_chunk_release_bonus_release_id` (`bonus_release_id`);
