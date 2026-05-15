from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_events_topic: str = "pam.events.raw.v1"
    kafka_dlq_topic: str = "pam.events.invalid.v1"
    kafka_consumer_group: str = "event-processor"

    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_database: str = "pam"
    clickhouse_user: str = "default"
    clickhouse_password: str = ""

    batch_size: int = 500
    batch_timeout_seconds: float = 5.0

    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "pam"

    redis_url: str = "redis://localhost:6379"
    schema_lock_ttl_seconds: int = 30
    schema_lock_poll_ms: int = 100
    schema_lock_timeout_seconds: int = 10

    debug: bool = False
    version: str = "0.1.0"


settings = Settings()
