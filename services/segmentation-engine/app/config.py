from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_events_topic: str = "pam.events.raw.v1"
    kafka_consumer_group: str = "segmentation-trigger"
    kafka_sasl_username: str = ""
    kafka_sasl_password: str = ""

    mongo_url: str = "mongodb://localhost:27017"
    mongo_database: str = "pam"

    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_database: str = "pam"
    clickhouse_user: str = "default"
    clickhouse_password: str = ""

    redis_url: str = "redis://localhost:6379"

    # RS256 public key in PEM format — used to verify system JWTs from auth-service
    system_jwt_public_key: str = ""

    # Separate RS256 public key for portal UI tokens — set PORTAL_JWT_PUBLIC_KEY env var
    portal_jwt_public_key: str = ""

    # S3 — custom audience CSV storage
    s3_bucket: str = "pam-custom-audiences"
    s3_endpoint_url: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_region: str = "ap-south-1"
    custom_audience_max_bytes: int = 52_428_800   # 50 MB
    custom_audience_max_rows: int = 500_000

    log_dir: str = ""
    log_level: str = "INFO"

    debug: bool = False
    version: str = "0.1.0"

    @field_validator("system_jwt_public_key", "portal_jwt_public_key", mode="before")
    @classmethod
    def normalize_pem(cls, v: str) -> str:
        return v.replace("\\n", "\n") if isinstance(v, str) else v


settings = Settings()
