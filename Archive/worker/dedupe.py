"""
Dedupe module for event idempotency.

Ensures that events with the same (client_id, event_id) pair are only processed once.
Uses Option A: Check existence before insert (acceptable for low volume POC).

Why not Option B (ReplacingMergeTree)?
- ReplacingMergeTree provides eventual dedup during merges (async, unpredictable timing)
- ReplacingMergeTree adds overhead: need order_by + ReplacingMergeTree table engine
- Option A is simpler for POC: synchronous, deterministic, clear semantics
- "at least once" processing is acceptable if we check before insert

See DEDUPE_STRATEGY.md for detailed tradeoffs.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import clickhouse_connect


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


def event_exists(client_id: str, event_id: str) -> bool:
    """
    Check if an event with the given (client_id, event_id) already exists in ClickHouse.
    
    Args:
        client_id: The client ID
        event_id: The event UUID (as string)
    
    Returns:
        True if event exists, False otherwise
    """
    client = get_clickhouse_client()
    
    try:
        # Query the raw events table to check existence
        # Using both tables would be redundant, so we check raw only
        query = f"""
        SELECT 1 FROM poc.events_raw
        WHERE client_id = '{client_id}' 
          AND event_id = parseUUID('{event_id}')
        LIMIT 1
        """
        
        result = client.query(query)
        exists = bool(result.result_rows)
        
        if exists:
            print(f"[DEDUPE] Event {event_id} (client={client_id}) already exists, skipping")
        
        return exists
    
    except Exception as e:
        print(f"[WARNING] Dedupe check failed for {event_id}: {e}")
        # On error, assume it doesn't exist (permissive, "at least once" semantics)
        # In production, you might want stricter error handling
        return False
    
    finally:
        client.close()


def should_process_event(client_id: str, event_id: str) -> bool:
    """
    Determine if an event should be processed based on dedupe check.
    
    This is the main function to call in the consumer loop.
    
    Args:
        client_id: The client ID
        event_id: The event UUID (as string)
    
    Returns:
        True if event is new and should be processed, False if it's a duplicate
    """
    return not event_exists(client_id, event_id)
