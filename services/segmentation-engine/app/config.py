from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_events_topic: str = "pam.events.raw.v1"
    kafka_consumer_group: str = "segmentation-trigger"

    mongo_url: str = "mongodb://localhost:27017"
    mongo_database: str = "pam"

    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_database: str = "pam"
    clickhouse_user: str = "default"
    clickhouse_password: str = ""

    redis_url: str = "redis://localhost:6379"
    segment_cache_ttl_seconds: int = 300

    # When disabled, segment_memberships are never written and the Redis membership
    # cache is never populated. Campaign-engine must re-evaluate the DSL at run time.
    # Enable only if you need entry/exit transition detection or fast membership lookups.
    membership_tracking_enabled: bool = False

    debug: bool = False
    version: str = "0.1.0"


settings = Settings()
