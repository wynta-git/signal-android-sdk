-- Widen consumed_ref and wager_ref from VARCHAR(20) to VARCHAR(50)
-- to accommodate longer upstream identifiers (e.g. con_P1001_1750000000000).

ALTER TABLE `bonus_consumed`
    MODIFY COLUMN `consumed_ref` VARCHAR(50) NOT NULL,
    MODIFY COLUMN `wager_ref`    VARCHAR(50) NOT NULL;
