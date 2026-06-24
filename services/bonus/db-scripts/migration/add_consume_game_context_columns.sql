-- Adds game-context and transaction-ID columns to bonus_consumed.
-- Also widens wager_ref to 100 chars and makes it nullable to match
-- the optional wager_tnx_id field in PlayerBonusConsumeCreate.

ALTER TABLE `bonus_consumed`
    MODIFY COLUMN `wager_ref`               VARCHAR(100)  DEFAULT NULL,
    ADD COLUMN `chip_type`                  VARCHAR(20)   DEFAULT NULL  AFTER `wager_ref`,
    ADD COLUMN `session_key`                VARCHAR(200)  DEFAULT NULL  AFTER `chip_type`,
    ADD COLUMN `client_id`                  VARCHAR(100)  DEFAULT NULL  AFTER `session_key`,
    ADD COLUMN `product`                    VARCHAR(100)  DEFAULT NULL  AFTER `client_id`,
    ADD COLUMN `game_type`                  VARCHAR(20)   DEFAULT NULL  AFTER `product`,
    ADD COLUMN `game_variant`               VARCHAR(100)  DEFAULT NULL  AFTER `game_type`,
    ADD COLUMN `game_name`                  VARCHAR(200)  DEFAULT NULL  AFTER `game_variant`,
    ADD COLUMN `game_action`                VARCHAR(100)  DEFAULT NULL  AFTER `game_name`,
    ADD COLUMN `primary_transaction_id`     BIGINT        DEFAULT NULL  AFTER `game_action`,
    ADD COLUMN `secondary_transaction_id`   BIGINT        DEFAULT NULL  AFTER `primary_transaction_id`,
    ADD COLUMN `tertiary_transaction_id`    BIGINT        DEFAULT NULL  AFTER `secondary_transaction_id`,
    ADD COLUMN `base_request_id`            BIGINT        DEFAULT NULL  AFTER `tertiary_transaction_id`;
