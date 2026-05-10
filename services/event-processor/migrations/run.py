"""Run all migrations idempotently against ClickHouse.

Usage:
    uv run python -m migrations.run

Note: per-client tables (pam.events_{project_id}) are NOT created here.
They are bootstrapped automatically at runtime by SchemaManager.bootstrap_table()
when the first event for a new client arrives.
"""

from pathlib import Path

import clickhouse_connect

from app.config import settings


def main() -> None:
    # Connect to the default database to allow CREATE DATABASE.
    client = clickhouse_connect.get_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        database="default",
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
    )

    migrations_dir = Path(__file__).parent
    sql_files = sorted(migrations_dir.glob("*.sql"))

    for sql_file in sql_files:
        print(f"Running {sql_file.name}...")
        sql = sql_file.read_text()
        for statement in sql.split(";"):
            stmt = statement.strip()
            if stmt:
                client.command(stmt)
        print(f"  done.")

    client.close()
    print("All migrations complete.")


if __name__ == "__main__":
    main()
