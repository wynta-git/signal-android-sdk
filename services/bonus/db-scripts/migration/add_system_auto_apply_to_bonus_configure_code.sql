-- Migration: add system_auto_apply column to bonus_configure_code
-- Lets admins flag a promo code for automatic, server-side application on a
-- BONUS_RELEASE event, independent of the existing auto_apply front-end hint.
-- Existing rows default to NULL; NULL and 0 are both treated as "off".

ALTER TABLE `bonus_configure_code`
    ADD COLUMN `system_auto_apply` TINYINT(1) DEFAULT NULL
        COMMENT 'NULL/0 = off, 1 = system auto-applies this code to eligible players on a BONUS_RELEASE trigger'
    AFTER `auto_apply`;
