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
    segment_cache_ttl_seconds: int = 300

    # How often (seconds) the scheduler polls for due one-off campaigns
    oneoff_poll_interval_seconds: int = 60

    debug: bool = False
    version: str = "0.1.0"


settings = Settings()
