ALTER TABLE `bonus_consumed`
  ADD COLUMN `reverted_at` DATETIME DEFAULT NULL AFTER `created_at`;
