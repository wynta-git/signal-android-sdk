-- Per-client event tables (pam.events_{project_id}) are created dynamically at
-- runtime by SchemaManager.bootstrap_table() the first time an event arrives for
-- a new client.  No DDL is needed here.
--
-- This file is a placeholder so the migration sequence remains contiguous and
-- the intent is visible alongside the static migrations.
SELECT 1;
