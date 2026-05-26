from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongo_url: str = "mongodb://localhost:27017"
    mongo_database: str = "pam"

    redis_url: str = "redis://localhost:6379"

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_send_topic: str = "pam.campaigns.send.v1"
    kafka_delivery_topic: str = "pam.notifications.delivery.v1"
    kafka_consumer_group: str = "notif-sender"
    kafka_batch_size: int = 10_000
    kafka_batch_timeout_ms: int = 1_000

    template_cache_ttl_seconds: int = 300

    debug: bool = False
    version: str = "0.1.0"


settings = Settings()
