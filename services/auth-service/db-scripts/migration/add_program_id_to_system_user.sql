-- Adds program_id to system_user so an auto-provisioned portal user can be
-- tagged with the program (program.id) they authenticated against. Nullable,
-- no FK constraint — same convention as site.program_id (see site.sql).
-- Existing rows are left NULL; nothing backfills them.

ALTER TABLE `system_user`
    ADD COLUMN `program_id` INT DEFAULT NULL AFTER `display_name`,
    ADD KEY `idx_system_user_program_id` (`program_id`);
