from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongo_url: str
    mongo_database: str = "pam"

    kafka_bootstrap_servers: str
    kafka_scheduler_topic: str = "pam.campaigns.schedule.v1"
    kafka_dlq_topic: str = "pam.campaigns.schedule.dlq.v1"
    kafka_send_topic: str = "pam.campaigns.send.v1"
    kafka_send_topic_grouped_email: str = "pam.campaigns.send.grouped.email.v1"
    kafka_consumer_group: str = "scheduler-service"
    kafka_sasl_username: str = ""
    kafka_sasl_password: str = ""

    # Per-channel batch size for grouped sends (run_campaign_grouped) — how many
    # user_ids get embedded in one GroupedSendJob message. Overridable per-project
    # via projects.settings.batch_size_overrides.
    batch_size_default: int = 500
    batch_size_email: int = 500
    batch_size_sms: int = 1000
    batch_size_whatsapp: int = 10000

    redis_url: str

    poll_interval_seconds: float = 1.0
    max_lock_batch: int = 10
    stale_lock_timeout_seconds: int = 300
    max_retry_count: int = 3

    segmentation_engine_url: str = "http://localhost:8003"
    segment_prefetch_lead_minutes: int = 15
    segment_prefetch_interval_seconds: int = 30

    log_dir: str = ""
    log_level: str = "INFO"

    debug: bool = False
    version: str = "0.1.0"

    class Config:
        env_file = ".env"


settings = Settings()  # type: ignore[call-arg]
