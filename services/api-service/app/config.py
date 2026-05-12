from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "pam"
    mongo_min_pool_size: int = 5
    mongo_max_pool_size: int = 50

    redis_url: str = "redis://localhost:6379"
    redis_max_connections: int = 20

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_events_topic: str = "pam.events.raw.v1"
    kafka_bonus_topic: str = "pam.bonus.raw.v1"

    bonus_event_collection: str = "bonus_event_types"
    bonus_event_refresh_hours: float = 6.0

    cors_origins: list[str] = ["*"]

    debug: bool = False
    version: str = "0.1.0"


settings = Settings()
