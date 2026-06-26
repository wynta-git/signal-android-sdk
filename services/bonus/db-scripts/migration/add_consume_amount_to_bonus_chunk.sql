-- Adds a consume_amount running total to bonus_chunk so the chunk-level
-- consumed balance is readable without aggregating bonus_chunk_consumed.
-- Existing rows default to 0.00 (correct for unconsumed chunks).

ALTER TABLE `bonus_chunk`
    ADD COLUMN `consume_amount` DECIMAL(18,4) NOT NULL DEFAULT 0.0000
        AFTER `wager_amount`;
