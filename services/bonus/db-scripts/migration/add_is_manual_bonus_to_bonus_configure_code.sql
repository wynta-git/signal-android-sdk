-- Migration: add is_manual_bonus column to bonus_configure_code
-- Flags a promo code created from a manual-bonus CSV upload (the uploaded
-- filename becomes the code) rather than the standard promo code creation
-- flow. See bonus_manual_bonus_file for the linked S3 upload metadata.

ALTER TABLE `bonus_configure_code`
    ADD COLUMN `is_manual_bonus` TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '0 = normal promo code, 1 = manual bonus promo code created via CSV upload'
        AFTER `row_hash`;
