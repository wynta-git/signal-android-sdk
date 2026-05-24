from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongo_url: str
    mongo_database: str = "pam"

    kafka_bootstrap_servers: str
    kafka_scheduler_topic: str = "pam.campaigns.schedule.v1"
    kafka_dlq_topic: str = "pam.campaigns.schedule.dlq.v1"
    kafka_send_topic: str = "pam.campaigns.send.v1"
    kafka_consumer_group: str = "scheduler-service"

    redis_url: str

    poll_interval_seconds: float = 1.0
    max_lock_batch: int = 10
    stale_lock_timeout_seconds: int = 300
    max_retry_count: int = 3

    debug: bool = False
    version: str = "0.1.0"

    class Config:
        env_file = ".env"


settings = Settings()  # type: ignore[call-arg]
