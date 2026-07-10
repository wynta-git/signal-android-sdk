-- =============================================================================
-- MIGRATION: rename `project` table to `program`, `project_key` to `program_key`
-- =============================================================================
--
-- Run by hand against the live `wynta_common` database. Not applied
-- automatically by any tooling in this repo.
--
-- =============================================================================

-- Single atomic ALTER TABLE — renaming the table and its column/indexes in one
-- statement avoids a window where the table is already `program` but the
-- column/indexes are still named `project_key`/`uk_project_key`/etc.
ALTER TABLE `project`
    RENAME TO `program`,
    CHANGE COLUMN `project_key` `program_key` VARCHAR(50) NOT NULL,
    RENAME INDEX `uk_project_key`     TO `uk_program_key`,
    RENAME INDEX `uk_project_name`    TO `uk_program_name`,
    RENAME INDEX `idx_project_active` TO `idx_program_active`;
