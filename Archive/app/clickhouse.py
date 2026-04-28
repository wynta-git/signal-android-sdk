from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

import clickhouse_connect
from fastapi import HTTPException

from app.schemas import PropertyPredicate


# Safe set of allowed operators to prevent SQL injection
ALLOWED_OPS = {"eq", "neq", "gt", "gte", "lt", "lte", "in"}

# Map operator to SQL operator string
OP_SQL_MAP = {
    "eq": "=",
    "neq": "!=",
    "gt": ">",
    "gte": ">=",
    "lt": "<",
    "lte": "<=",
    "in": "IN",
}


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


def validate_predicate(predicate: PropertyPredicate) -> None:
    """Validate a single predicate to ensure safety."""
    if predicate.op not in ALLOWED_OPS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid operator '{predicate.op}'. Allowed: {', '.join(ALLOWED_OPS)}",
        )
    
    if predicate.type not in ("string", "number", "bool"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type '{predicate.type}'. Allowed: string, number, bool",
        )


def build_predicate_conditions(predicates: List[PropertyPredicate]) -> Tuple[List[str], List[str]]:
    """
    Build safe WHERE conditions from predicates.
    
    Returns:
        Tuple of (conditions_list, where_clause_parts)
        - conditions_list: List of individual condition strings for debugging
        - where_clause_parts: Parts to be JOINed with AND for use in SQL
    """
    conditions = []
    where_parts = []

    for pred in predicates:
        # Validate first
        validate_predicate(pred)

        key = pred.key
        op = OP_SQL_MAP[pred.op]
        value = pred.value
        value_type = pred.type

        # Build condition based on type and operator
        if value_type == "number":
            # For numeric comparisons, use value_number column
            if op == "IN":
                # IN operator expects a list
                if not isinstance(value, list):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Operator 'in' expects a list value for predicate key '{key}'",
                    )
                placeholders = ",".join(str(v) for v in value)
                condition = f"(key = '{key}' AND value_number {op} ({placeholders}))"
            else:
                condition = f"(key = '{key}' AND value_number {op} {float(value)})"
            
        elif value_type == "bool":
            # For boolean, use value_bool column (0 or 1)
            bool_val = 1 if value else 0
            condition = f"(key = '{key}' AND value_bool {op} {bool_val})"
            
        else:  # string
            # For string, use value_string column
            if op == "IN":
                if not isinstance(value, list):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Operator 'in' expects a list value for predicate key '{key}'",
                    )
                # Escape single quotes in string values
                escaped_vals = [str(v).replace("'", "''") for v in value]
                placeholders = ",".join(f"'{v}'" for v in escaped_vals)
                condition = f"(key = '{key}' AND value_string {op} ({placeholders}))"
            else:
                # Escape single quotes
                escaped_val = str(value).replace("'", "''")
                condition = f"(key = '{key}' AND value_string {op} '{escaped_val}')"

        conditions.append(condition)
        where_parts.append(condition)

    return conditions, where_parts


def segment_users(
    client_id: str,
    since_days: int = 30,
    event_name: Optional[str] = None,
    canonical_event: Optional[str] = None,
    predicates: List[PropertyPredicate] = None,
) -> List[str]:
    """
    Query ClickHouse to find users matching the given segment criteria.
    
    Args:
        client_id: The client ID to filter on
        since_days: Number of days to look back (default 30)
        event_name: Optional filter on raw event_name
        canonical_event: Optional filter on canonical_event
        predicates: List of property predicates to match
    
    Returns:
        List of user_ids matching the criteria
    """
    if predicates is None:
        predicates = []

    # Validate all predicates
    for pred in predicates:
        validate_predicate(pred)

    client = get_clickhouse_client()

    # Build the base FROM clause with time window
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=since_days)

    # Build WHERE clause for time and client
    where_clauses = [
        f"client_id = '{client_id}'",
        f"event_time >= '{cutoff_date.isoformat()}'",
    ]

    # Add event_name filter if provided
    if event_name:
        escaped_name = event_name.replace("'", "''")
        where_clauses.append(f"event_name = '{escaped_name}'")

    # Add canonical_event filter if provided
    if canonical_event:
        escaped_canonical = canonical_event.replace("'", "''")
        where_clauses.append(f"canonical_event = '{escaped_canonical}'")

    # Build predicate conditions
    if predicates:
        _, predicate_parts = build_predicate_conditions(predicates)
        # Group predicate conditions with OR since they apply to the same row
        predicate_where = " OR ".join(predicate_parts)
        where_clauses.append(f"({predicate_where})")

    where_clause = " AND ".join(where_clauses)

    # Build final query using GROUP BY to get distinct users
    # If we have predicates, we need to use HAVING or filter the grouped results
    if predicates:
        # Query event_props with predicates
        query = f"""
        SELECT DISTINCT user_id
        FROM poc.event_props
        WHERE {where_clause}
        ORDER BY user_id
        """
    else:
        # Query events_raw if no property predicates
        query = f"""
        SELECT DISTINCT user_id
        FROM poc.events_raw
        WHERE {where_clause}
        ORDER BY user_id
        """

    try:
        result = client.query(query)
        user_ids = [row[0] for row in result.result_rows]
        return user_ids
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"ClickHouse query failed: {str(e)}",
        ) from e
    finally:
        client.close()
