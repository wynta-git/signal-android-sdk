-- Adds external_id and email to system_user.
--
-- external_id is the bridge token's "user_id" claim (see
-- shared/auth/external_token.py) — becomes the real lookup/uniqueness key
-- for "does this user already exist" during auto-provisioning, replacing
-- the previous display_name-based check.
--
-- email is the bridge token's "email" claim. (email, program_id) together
-- are the intended identification pair for a user within a given program.
--
-- DEFAULT '' on both lets this apply safely to the live table without
-- knowing real data up front — existing rows all currently have
-- program_id = NULL, so the (email, program_id) unique key can't conflict
-- among them regardless of email value (NULL is never equal to itself in a
-- unique index). Existing rows should be backfilled with real external_id/
-- email values by ops afterward.

ALTER TABLE `system_user`
    ADD COLUMN `external_id` VARCHAR(100) NOT NULL DEFAULT '' AFTER `id`,
    ADD COLUMN `email` VARCHAR(255) NOT NULL DEFAULT '' AFTER `external_id`,
    ADD UNIQUE KEY `uk_system_user_external_id` (`external_id`),
    ADD UNIQUE KEY `uk_system_user_email_program` (`email`, `program_id`);
