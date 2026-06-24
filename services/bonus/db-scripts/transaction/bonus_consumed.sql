-- =============================================================================
-- TABLE: bonus_consumed
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Records each bonus consumption event — the deduction of released bonus
-- balance as a player's qualifying wager is settled. One row per wager per
-- chunk; the sum of amount for a given chunk_id equals the total bonus
-- consumed against that chunk.
--
-- COLUMN GROUPS
-- ─────────────
-- Identity    : id, consumed_ref, chunk_id, bonus_grant_id, wager_ref
-- Game context: chip_type, session_key, client_id, product, game_type,
--               game_variant, game_name, game_action
-- Txn IDs     : primary_transaction_id, secondary_transaction_id,
--               tertiary_transaction_id, base_request_id
-- Amount      : amount, wager_amount, consumed_amount
-- Audit       : created_at
--
-- USAGE
-- ─────
-- • Appended by consume_bonus() when a wager draws down released bonus balance.
-- • consumed_ref is the upstream consumption identifier; unique per chunk
--   to prevent double-counting on event replay.
-- • wager_ref links back to the originating wager (optional — platform may
--   not always supply a wager transaction reference).
-- • Never updated after insert.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_chunk.id  ← bonus_consumed.chunk_id
-- bonus_grant.id  ← bonus_consumed.bonus_grant_id
--
-- =============================================================================

CREATE TABLE `bonus_consumed` (
    `id`                        BIGINT        NOT NULL AUTO_INCREMENT,
    `consumed_ref`              VARCHAR(100)  NOT NULL,
    -- upstream consumption identifier (consume_txn_id); unique per chunk
    `chunk_id`                  BIGINT        NOT NULL,
    -- references bonus_chunk.id
    `bonus_grant_id`            BIGINT        NOT NULL,
    -- references bonus_grant.id
    `wager_ref`                 VARCHAR(100)  DEFAULT NULL,
    -- originating wager transaction reference (wager_tnx_id); optional

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
    UNIQUE KEY `uk_bonus_consumed_ref`              (`chunk_id`, `consumed_ref`),
    KEY `idx_bonus_consumed_chunk_id`               (`chunk_id`),
    KEY `idx_bonus_consumed_bonus_grant_id`         (`bonus_grant_id`),
    KEY `idx_bonus_consumed_wager_ref`              (`wager_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_consumed`
    (`id`, `consumed_ref`, `chunk_id`, `bonus_grant_id`, `wager_ref`,
     `chip_type`, `session_key`, `client_id`, `product`,
     `game_type`, `game_variant`, `game_name`, `game_action`,
     `primary_transaction_id`, `secondary_transaction_id`,
     `tertiary_transaction_id`, `base_request_id`,
     `amount`, `wager_amount`, `consumed_amount`)
VALUES
    (1, 'TXN20260510001', 1, 1, 'WAGER_REF_001',
     'CASH', 'sess_rummy_abc123', 'site1-backend-v0', 'RUMMY',
     'TOURNEY', 'holdem', 'Friday Holdem', 'REGISTER_TOURNY',
     1001, 1002, 1003, 1000,
     100.0000, 1000.0000, 100.0000);
