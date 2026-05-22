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

    # RS256 public key in PEM format — used to verify system JWTs from auth-service
    system_jwt_public_key: str = ""

    # Separate RS256 public key for portal UI tokens — set PORTAL_JWT_PUBLIC_KEY env var
    portal_jwt_public_key: str = ""

    debug: bool = False
    version: str = "0.1.0"


settings = Settings()
