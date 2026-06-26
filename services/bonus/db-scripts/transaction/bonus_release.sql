-- =============================================================================
-- TABLE: bonus_release
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- Parent record for every wager-triggered release event. Captures the full
-- event context and aggregate totals for a single wager settlement that
-- causes one or more bonus chunks to be released.
--
-- One bonus_release row = one wager event × one bonus_grant.
-- Multiple bonus_chunk_release rows (children) record the per-chunk breakdown.
--
-- COLUMN GROUPS
-- ─────────────
-- Identity      : id, bonus_grant_id, site_id, pam_user_id
-- Event ref     : event_id, wager_ref
-- Event context : chip_type, product, game_type, game_name
-- Totals        : wager_amount, release_amount
-- Audit         : created_at
--
-- USAGE
-- ─────
-- • Written once per qualifying wager event, before the child
--   bonus_chunk_release rows are inserted.
-- • UNIQUE on (event_id, bonus_grant_id) — replay-safe; a duplicate wager
--   event for the same grant is rejected at the DB layer.
-- • release_amount is pre-aggregated from child rows so callers don't need
--   to SUM bonus_chunk_release for the common read path.
-- • Never updated after insert. All joins are read-only lookups.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_grant.id       ← bonus_release.bonus_grant_id
-- bonus_release.id     ← bonus_chunk_release.bonus_release_id
--
-- =============================================================================

CREATE TABLE `bonus_release` (
    `id`               BIGINT        NOT NULL AUTO_INCREMENT,
    -- references bonus_grant.id; the grant whose chunk(s) were released
    `site_id`          INT           NOT NULL,
    `pam_user_id`      VARCHAR(50)   NOT NULL,
    `event_id`         CHAR(36)      NOT NULL,
    -- UUID of the source wager event; idempotency key
    `wager_ref`        VARCHAR(100)  NOT NULL,
    -- upstream wager transaction ID (from event props.wager_tnx_id)

    -- ── Event context (copied from the triggering wager event) ────────────────
    `chip_type`        VARCHAR(50)   DEFAULT NULL,
    -- wager chip type (CASH, BONUS, etc.)
    `product`          VARCHAR(100)  DEFAULT NULL,
    -- game product from the wager event
    `game_type`        VARCHAR(20)   DEFAULT NULL,
    -- game category (SLOTS, TABLE, LIVE, etc.)
    `game_name`        VARCHAR(200)  DEFAULT NULL,
    -- game name from the wager event

    -- ── Release totals ────────────────────────────────────────────────────────
    `wager_amount`     DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- total wager amount attributed across all chunks in this event
    `release_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    -- total amount released to the player wallet; sum of child bonus_chunk_release rows

    `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bonus_release_event`              (`event_id`),
    -- one release record per wager event; prevents replay double-insert
    KEY `idx_bonus_release_pam_user_id`              (`pam_user_id`),
    KEY `idx_bonus_release_site_date`                (`site_id`, `created_at`),
    KEY `idx_bonus_release_wager_ref`                (`wager_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------
-- Mirrors the existing bonus_chunk_release sample rows:
--   WA010  → released chunk_id=1 (release_amount=50.00), bonus_grant_id=1
--   WA1010 → settled chunk_id=3 (no release),            bonus_grant_id=3
-- -----------------------------------------------------------------------------
INSERT INTO `bonus_release`
    (`id`, `site_id`, `pam_user_id`,
     `event_id`, `wager_ref`,
     `chip_type`, `product`, `game_type`, `game_name`,
     `wager_amount`, `release_amount`, `created_at`)
VALUES
    (1, 1, 'PLR00001',
     '00000000-0000-0000-0000-000000000010', 'WA010',
     'CASH', 'POKER', 'TABLE', NULL,
     40.00, 50.00, '2026-05-10 10:30:00'),

    (2, 1, 'PLR00003',
     '00000000-0000-0000-0000-000001010000', 'WA1010',
     'CASH', 'POKER', 'TABLE', NULL,
     0.00, 0.00, '2026-05-10 12:50:00');
