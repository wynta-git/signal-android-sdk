from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_events_topic: str = "pam.events.raw.v1"
    kafka_send_topic: str = "pam.campaigns.send.v1"
    kafka_consumer_group: str = "campaign-trigger"

    mongo_url: str = "mongodb://localhost:27017"
    mongo_database: str = "pam"

    redis_url: str = "redis://localhost:6379"

    # How often (seconds) the scheduler polls for due one-off campaigns
    oneoff_poll_interval_seconds: int = 60

    # How many minutes before send_at to pre-refresh the segment for one-off campaigns
    segment_prefetch_lead_minutes: int = 15

    # Internal URL for the segmentation engine admin API
    segmentation_engine_url: str = "http://localhost:8003"

    # RS256 public key in PEM format — used to verify system JWTs from auth-service
    system_jwt_public_key: str = ""

    # Separate RS256 public key for portal UI tokens — set PORTAL_JWT_PUBLIC_KEY env var
    portal_jwt_public_key: str = ""

    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_database: str = "pam"
    clickhouse_username: str = "default"
    clickhouse_password: str = ""

    log_dir: str = ""
    log_level: str = "INFO"

    debug: bool = False
    version: str = "0.1.0"

    @field_validator("system_jwt_public_key", "portal_jwt_public_key", mode="before")
    @classmethod
    def normalize_pem(cls, v: str) -> str:
        return v.replace("\\n", "\n") if isinstance(v, str) else v


settings = Settings()
