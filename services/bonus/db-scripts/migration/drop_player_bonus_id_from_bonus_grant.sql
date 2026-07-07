-- Removes player_bonus_id from bonus_grant. The column was a legacy reference
-- to the dead userapp_player_bonus table; the code generated it with
-- UUID_SHORT() and nothing ever queried by it. Its UNIQUE key also blocked a
-- configure from writing both a main grant and a cashback grant for the same
-- event (both rows shared one player_bonus_id).

ALTER TABLE `bonus_grant`
    DROP KEY `uk_bonus_grant_player_bonus_id`,
    DROP COLUMN `player_bonus_id`;
