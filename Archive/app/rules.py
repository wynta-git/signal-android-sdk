from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import clickhouse_connect
from fastapi import HTTPException


def get_clickhouse_client():
    """Get a ClickHouse client configured from environment."""
    clickhouse_host = os.environ["CLICKHOUSE_HOST"]
    clickhouse_port = int(os.environ.get("CLICKHOUSE_PORT", "8123"))
    clickhouse_database = os.environ.get("CLICKHOUSE_DATABASE", "poc")
    clickhouse_username = os.environ.get("CLICKHOUSE_USERNAME", "default")
    clickhouse_password = os.environ.get("CLICKHOUSE_PASSWORD", "")

    return clickhouse_connect.get_client(
        host=clickhouse_host,
        port=clickhouse_port,
        username=clickhouse_username,
        password=clickhouse_password,
        database=clickhouse_database,
    )


def sql_str(s: str) -> str:
    """Escape a string for use in SQL queries (POC approach)."""
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def check_high_value_inr_deposit(client_id: str, user_id: str) -> bool:
    """
    Rule 1: User has a successful INR deposit with amount >= 500 in last 30 days.
    Returns True if the rule would fire.
    """
    client = get_clickhouse_client()
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    
    query = f"""
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
    
    try:
        result = client.query(query)
        return bool(result.result_rows)
    except Exception as e:
        # In dry-run, we can be more lenient with query failures
        # Log but don't raise
        print(f"[WARNING] Rule 1 query failed: {e}")
        return False
    finally:
        client.close()


def check_recent_transfer(client_id: str, user_id: str) -> bool:
    """
    Rule 2: User has done a transfer in last 7 days (any currency).
    Returns True if the rule would fire.
    """
    client = get_clickhouse_client()
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    
    query = f"""
    SELECT 1
    FROM poc.events_raw
    WHERE client_id = {sql_str(client_id)}
      AND user_id = {sql_str(user_id)}
      AND canonical_event = 'money.transfer'
      AND event_time >= parseDateTime64BestEffort({sql_str(since)})
    LIMIT 1
    """
    
    try:
        result = client.query(query)
        return bool(result.result_rows)
    except Exception as e:
        print(f"[WARNING] Rule 2 query failed: {e}")
        return False
    finally:
        client.close()


def evaluate_all_rules(client_id: str, user_id: str, canonical_event: str) -> list:
    """
    Evaluate all rules for the given event context.
    
    Args:
        client_id: The client ID
        user_id: The user ID
        canonical_event: The canonical event name
    
    Returns:
        List of dicts with keys: rule_name, fired, description
    """
    rules = []
    
    # Rule 1: High-value INR depositor
    rule1_fired = (canonical_event == "money.deposit" and 
                   check_high_value_inr_deposit(client_id, user_id))
    rules.append({
        "rule_name": "high_value_inr_depositor",
        "fired": rule1_fired,
        "description": "User has a successful INR deposit with amount >= 500 in last 30 days"
    })
    
    # Rule 2: Recent transfer
    rule2_fired = check_recent_transfer(client_id, user_id)
    rules.append({
        "rule_name": "recent_transfer",
        "fired": rule2_fired,
        "description": "User has done a transfer in last 7 days"
    })
    
    return rules
