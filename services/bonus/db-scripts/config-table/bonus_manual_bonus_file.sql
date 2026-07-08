-- =============================================================================
-- TABLE: bonus_manual_bonus_file
-- =============================================================================
--
-- DESCRIPTION
-- ───────────
-- S3 upload metadata for the CSV file backing a manual bonus promo code
-- (bonus_configure_code.is_manual_bonus = 1). One row per uploaded file,
-- linked 1:1 to the bonus_configure_code row it was uploaded for.
--
-- PROCESSING COLUMNS
-- ───────────────────
-- total_players / total_bonus_amount   Parsed from the CSV filename
--                                       (TOTPLAYERSCOUNT / TOTALGRANTAMOUNT).
-- success_players / success_amount     Running totals of grants applied
--                                       successfully while processing the file.
-- failed_players / failed_amount       Running totals of grants that failed
--                                       while processing the file.
-- status                               Lifecycle of the batch grant job for
--                                       this file: PENDING → PROCESSING →
--                                       COMPLETED / PARTIAL_SUCCESS / FAILED.
--
-- RELATIONSHIPS
-- ─────────────
-- bonus_configure_code.id ← bonus_manual_bonus_file.bonus_configure_code_id
--
-- =============================================================================

CREATE TABLE `bonus_manual_bonus_file` (
    `id`                      INT            NOT NULL AUTO_INCREMENT,
    `bonus_configure_code_id` INT            NOT NULL,
    -- references bonus_configure_code.id
    `original_file_name`      VARCHAR(255)   NOT NULL,
    `s3_bucket`               VARCHAR(255)   DEFAULT NULL,
    -- NULL when S3 is not configured / upload failed — see file_size for original bytes
    `s3_key`                  VARCHAR(500)   DEFAULT NULL,
    `file_size`               BIGINT         NOT NULL DEFAULT 0,
    `uploaded_at`             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- ── batch processing progress ──────────────────────────────────────────
    `total_players`           INT            NOT NULL DEFAULT 0,
    `total_bonus_amount`      DECIMAL(18,2)  NOT NULL DEFAULT 0,
    `success_players`         INT            NOT NULL DEFAULT 0,
    `success_amount`          DECIMAL(18,2)  NOT NULL DEFAULT 0,
    `failed_players`          INT            NOT NULL DEFAULT 0,
    `failed_amount`           DECIMAL(18,2)  NOT NULL DEFAULT 0,
    `status`                  ENUM('PENDING','PROCESSING','COMPLETED','PARTIAL_SUCCESS','FAILED')
                                             NOT NULL DEFAULT 'PENDING',

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_manual_bonus_file_code`       (`bonus_configure_code_id`),
    KEY `idx_manual_bonus_file_uploaded_at`      (`uploaded_at`),
    KEY `idx_manual_bonus_file_status`           (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
