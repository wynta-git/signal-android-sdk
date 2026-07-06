SET FOREIGN_KEY_CHECKS = 0;

-- 5. Log
TRUNCATE TABLE `bonus_change_log`;

-- 4. Reporting

TRUNCATE TABLE `bonus_spend`;

-- 3. Budget
TRUNCATE TABLE `bonus_code_usage`;
TRUNCATE TABLE `bonus_budget_usage`;
TRUNCATE TABLE `bonus_code_usage_limit`;
TRUNCATE TABLE `bonus_budget_limit`;

-- 2. Runtime
TRUNCATE TABLE `bonus_manual_bulk_pending`;
TRUNCATE TABLE `bonus_manual_bulk_grant`;
TRUNCATE TABLE `bonus_chunk_forfeit`;
TRUNCATE TABLE `bonus_forfeit`;
TRUNCATE TABLE `bonus_consumed`;
TRUNCATE TABLE `bonus_chunk_expiry`;
TRUNCATE TABLE `bonus_chunk_release`;
TRUNCATE TABLE `bonus_chunk_consumed`;
TRUNCATE TABLE `bonus_chunk`;
TRUNCATE TABLE `bonus_grant`;

-- 1. Master Configuration
TRUNCATE TABLE `bonus_owners`;
TRUNCATE TABLE `bonus_release_trigger`;
TRUNCATE TABLE `bonus_eligibility`;
TRUNCATE TABLE `bonus_configure_code`;
TRUNCATE TABLE `bonus_configure`;
TRUNCATE TABLE `bonus_subhead`;
TRUNCATE TABLE `bonus_head`;

SET FOREIGN_KEY_CHECKS = 1;
