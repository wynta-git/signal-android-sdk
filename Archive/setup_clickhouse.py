#!/usr/bin/env python
"""
Setup script to create ClickHouse database and tables for PAM POC.
Run this once before starting the worker.

Usage:
    python setup_clickhouse.py
"""

import os
from dotenv import load_dotenv
import clickhouse_connect

load_dotenv()

CLICKHOUSE_HOST = os.environ["CLICKHOUSE_HOST"]
CLICKHOUSE_PORT = int(os.environ.get("CLICKHOUSE_PORT", "8123"))
CLICKHOUSE_USERNAME = os.environ.get("CLICKHOUSE_USERNAME", "default")
CLICKHOUSE_PASSWORD = os.environ.get("CLICKHOUSE_PASSWORD", "")

# SQL to create database and tables
SQL_COMMANDS = [
    # Create database
    "CREATE DATABASE IF NOT EXISTS poc",
    
    # Create events_raw table
    """
    CREATE TABLE IF NOT EXISTS poc.events_raw (
        client_id String,
        user_id String,
        event_id UUID,
        event_time DateTime,
        event_name String,
        canonical_event String,
        props_json String,
        ingest_time DateTime
    ) ENGINE = MergeTree()
    ORDER BY (client_id, user_id, event_time)
    """,
    
    # Create event_props table (EAV)
    """
    CREATE TABLE IF NOT EXISTS poc.event_props (
        client_id String,
        user_id String,
        event_id UUID,
        event_time DateTime,
        event_name String,
        key String,
        value_string Nullable(String),
        value_number Nullable(Float64),
        value_bool Nullable(UInt8),
        ingest_time DateTime
    ) ENGINE = MergeTree()
    ORDER BY (client_id, user_id, event_time, key)
    """
]

def main():
    print(f"Connecting to ClickHouse at {CLICKHOUSE_HOST}:{CLICKHOUSE_PORT}...")
    
    try:
        client = clickhouse_connect.get_client(
            host=CLICKHOUSE_HOST,
            port=CLICKHOUSE_PORT,
            username=CLICKHOUSE_USERNAME,
            password=CLICKHOUSE_PASSWORD,
        )
        print("✓ Connected to ClickHouse")
        
        for i, cmd in enumerate(SQL_COMMANDS, 1):
            print(f"\n[{i}/{len(SQL_COMMANDS)}] Executing: {cmd.strip().split()[0:5]}...")
            try:
                client.command(cmd)
                print(f"✓ Success")
            except Exception as e:
                print(f"✗ Error: {e}")
                return False
        
        print("\n" + "="*60)
        print("✓ ClickHouse setup complete!")
        print("="*60)
        print("\nYou can now run:")
        print("  python -m worker.consumer")
        return True
        
    except Exception as e:
        print(f"\n✗ Connection failed: {e}")
        print("\nTroubleshooting:")
        print(f"  - Host: {CLICKHOUSE_HOST}")
        print(f"  - Port: {CLICKHOUSE_PORT}")
        print(f"  - Username: {CLICKHOUSE_USERNAME}")
        print("\nMake sure ClickHouse is running and accessible.")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
