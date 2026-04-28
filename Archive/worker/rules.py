from __future__ import annotations

from datetime import datetime, timedelta, timezone


def segment_high_value_inr_deposit_query(client_id: str, user_id: str) -> str:
    """
    Segment: user has a successful INR deposit with amount >= 500 in last 30 days.
    Implemented via event_props existence checks.
    """
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    # This is a POC query; for strict correctness you would join on event_id to ensure
    # amount/currency/status belong to the SAME event.
    return f"""
    SELECT 1
    FROM poc.events_raw e
    WHERE e.client_id = {sql_str(client_id)}
      AND e.user_id = {sql_str(user_id)}
      AND e.canonical_event = 'money.deposit'
      AND e.event_time >= parseDateTime64BestEffort({sql_str(since)})
      AND e.event_id IN (
          SELECT event_id
          FROM poc.event_props
          WHERE client_id = {sql_str(client_id)}
            AND user_id = {sql_str(user_id)}
            AND event_time >= parseDateTime64BestEffort({sql_str(since)})
          GROUP BY event_id
          HAVING
            maxIf(value_number, key='amount') >= 500
            AND maxIf(value_string, key='currency') = 'INR'
            AND lower(maxIf(value_string, key='status')) IN ('success','ok','succeeded')
      )
    LIMIT 1
    """


def rule_trigger_on_transfer_query(client_id: str, user_id: str) -> str:
    """
    Segment-like check: user has ever done a transfer in last 7 days (any currency).
    """
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    return f"""
    SELECT 1
    FROM poc.events_raw
    WHERE client_id = {sql_str(client_id)}
      AND user_id = {sql_str(user_id)}
      AND canonical_event = 'money.transfer'
      AND event_time >= parseDateTime64BestEffort({sql_str(since)})
    LIMIT 1
    """


def sql_str(s: str) -> str:
    # minimal SQL string literal escaping for the POC
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


# ============================================================================
# KYC (Know Your Customer) Rules
# ============================================================================

def kyc_initiated_query(client_id: str, user_id: str) -> str:
    """
    Check: User has initiated KYC process (any time).
    """
    return f"""
    SELECT 1
    FROM poc.events_raw
    WHERE client_id = {sql_str(client_id)}
      AND user_id = {sql_str(user_id)}
      AND canonical_event = 'kyc.initiated'
    LIMIT 1
    """


def kyc_documents_uploaded_query(client_id: str, user_id: str) -> str:
    """
    Check: User has uploaded KYC documents.
    """
    return f"""
    SELECT 1
    FROM poc.events_raw
    WHERE client_id = {sql_str(client_id)}
      AND user_id = {sql_str(user_id)}
      AND canonical_event = 'kyc.uploaded'
    LIMIT 1
    """


def kyc_completed_success_query(client_id: str, user_id: str) -> str:
    """
    Check: User has successfully completed KYC (status='success').
    """
    return f"""
    SELECT 1
    FROM poc.events_raw e
    WHERE e.client_id = {sql_str(client_id)}
      AND e.user_id = {sql_str(user_id)}
      AND e.canonical_event = 'kyc.completed'
      AND e.event_id IN (
          SELECT event_id
          FROM poc.event_props
          WHERE client_id = {sql_str(client_id)}
            AND user_id = {sql_str(user_id)}
          GROUP BY event_id
          HAVING lower(maxIf(value_string, key='status')) = 'success'
      )
    LIMIT 1
    """


def kyc_completed_failed_query(client_id: str, user_id: str) -> str:
    """
    Check: User's KYC was rejected (status='failed').
    """
    return f"""
    SELECT 1
    FROM poc.events_raw e
    WHERE e.client_id = {sql_str(client_id)}
      AND e.user_id = {sql_str(user_id)}
      AND e.canonical_event = 'kyc.completed'
      AND e.event_id IN (
          SELECT event_id
          FROM poc.event_props
          WHERE client_id = {sql_str(client_id)}
            AND user_id = {sql_str(user_id)}
          GROUP BY event_id
          HAVING lower(maxIf(value_string, key='status')) = 'failed'
      )
    LIMIT 1
    """


def kyc_cancelled_query(client_id: str, user_id: str) -> str:
    """
    Check: User has cancelled KYC process.
    """
    return f"""
    SELECT 1
    FROM poc.events_raw
    WHERE client_id = {sql_str(client_id)}
      AND user_id = {sql_str(user_id)}
      AND canonical_event = 'kyc.cancelled'
    LIMIT 1
    """


def kyc_verified_user_query(client_id: str, user_id: str) -> str:
    """
    Check: User is KYC verified (has successful kyc.completed with status=success).
    Can be used for eligibility checks.
    """
    return kyc_completed_success_query(client_id, user_id)