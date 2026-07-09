-- Adds an optional per-product wager multiplier override, denormalized the
-- same way wager_multiplier already is: bonus_configure (source of truth) →
-- bonus_grant (config snapshot at grant time) → bonus_chunk (per-chunk copy
-- so the hot release-event query in chunk_release_handler.py stays join-free).
-- Shape: {"RUMMY": 1.5, "AVIATOR": 2}. NULL = no override, fall back to the
-- flat wager_multiplier for every product.

ALTER TABLE `bonus_configure`
    ADD COLUMN `product_wager_multiplier` JSON DEFAULT NULL
        AFTER `wager_multiplier`;

ALTER TABLE `bonus_grant`
    ADD COLUMN `product_wager_multiplier` JSON DEFAULT NULL
        AFTER `wager_multiplier`;

ALTER TABLE `bonus_chunk`
    ADD COLUMN `product_wager_multiplier` JSON DEFAULT NULL
        AFTER `wager_multiplier`;
