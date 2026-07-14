-- =============================================================================
-- TABLE: bonus_consumed
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Event-level record of each bonus consumption request. One row per API call
-- to consume_bonus(). Per-chunk breakdown is stored in bonus_chunk_consumed
-- (child table; one row per chunk drawn down by this event).
--
-- COLUMN GROUPS
-- ─────────────
-- Identity    : id, wager_ref
-- Game context: chip_type, session_key, client_id, product, game_type,
--               game_variant, game_name, game_action
-- Txn IDs     : primary_transaction_id, secondary_transaction_id,
--               tertiary_transaction_id, base_request_id
-- Amount      : amount, wager_amount, consumed_amount
-- Audit       : created_at
--
-- USAGE
-- ─────
-- • Inserted once per consume_bonus() call, before child bonus_chunk_consumed
--   rows are written. A row is written even when nothing could be consumed
--   (consumed_amount = 0, no child rows) so every request is trackable.
-- • consumed_amount is the pre-aggregated total across all child rows.
-- • wager_ref stores the caller's consume_txn_id (same value); it is the
--   request-level idempotency key checked before insert, and the lookup key
--   for the consume-status API. Child bonus_chunk_consumed keeps its own
--   UNIQUE KEY on (chunk_id, consumed_ref).
-- • Never updated after insert.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_chunk_consumed.bonus_consumed_id → bonus_consumed.id
--
-- =============================================================================

CREATE TABLE `bonus_consumed` (
    `id`                        BIGINT        NOT NULL AUTO_INCREMENT,
    `wager_ref`                 VARCHAR(100)  DEFAULT NULL,
    -- caller-supplied consume transaction reference (consume_txn_id)

    -- ── Game context ──────────────────────────────────────────────────────────
    `chip_type`                 VARCHAR(20)   DEFAULT NULL,
    -- wallet type: CASH | LOYALTY_PINTS | FUN_CHIPS
    `session_key`               VARCHAR(200)  DEFAULT NULL,
    -- client session key at time of consumption
    `client_id`                 VARCHAR(100)  DEFAULT NULL,
    -- platform client identifier (platform_client_id from request)
    `product`                   VARCHAR(100)  DEFAULT NULL,
    -- product vertical: RUMMY | FANTASY | POKER | etc.
    `game_type`                 VARCHAR(20)   DEFAULT NULL,
    -- game format: GAME | TOURNEY | CONTEST
    `game_variant`              VARCHAR(100)  DEFAULT NULL,
    -- e.g. CRICKET | FOOTBALL | holdem
    `game_name`                 VARCHAR(200)  DEFAULT NULL,
    -- friendly table or tournament name
    `game_action`               VARCHAR(100)  DEFAULT NULL,
    -- e.g. JOIN_TABLE | REGISTER_TOURNY

    -- ── Platform transaction IDs ──────────────────────────────────────────────
    `primary_transaction_id`    BIGINT        DEFAULT NULL,
    `secondary_transaction_id`  BIGINT        DEFAULT NULL,
    `tertiary_transaction_id`   BIGINT        DEFAULT NULL,
    `base_request_id`           BIGINT        DEFAULT NULL,

    -- ── Amount ────────────────────────────────────────────────────────────────
    `amount`                    DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    -- bonus balance drawn down by this consumption event
    `wager_amount`              DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    -- full stake (transaction_amount) placed by the player
    `consumed_amount`           DECIMAL(18,4) NOT NULL DEFAULT 0.0000,

    `created_at`                DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_bonus_consumed_wager_ref`              (`wager_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_consumed`
    (`id`, `wager_ref`,
     `chip_type`, `session_key`, `client_id`, `product`,
     `game_type`, `game_variant`, `game_name`, `game_action`,
     `primary_transaction_id`, `secondary_transaction_id`,
     `tertiary_transaction_id`, `base_request_id`,
     `amount`, `wager_amount`, `consumed_amount`)
VALUES
    (1, 'WAGER_REF_001',
     'CASH', 'sess_rummy_abc123', 'site1-backend-v0', 'RUMMY',
     'TOURNEY', 'holdem', 'Friday Holdem', 'REGISTER_TOURNY',
     1001, 1002, 1003, 1000,
     100.0000, 1000.0000, 100.0000);
