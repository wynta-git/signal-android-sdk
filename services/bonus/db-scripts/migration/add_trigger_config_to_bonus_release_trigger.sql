-- Migration: add trigger_config column to bonus_release_trigger
-- The column was defined in the original schema but not present in the live table.

ALTER TABLE `bonus_release_trigger`
    ADD COLUMN `trigger_config` JSON DEFAULT NULL
        COMMENT 'Free-form key-value qualifying conditions (min_amount, max_amount, payment_method, product, occurrence, etc.)'
    AFTER `trigger_type`;
