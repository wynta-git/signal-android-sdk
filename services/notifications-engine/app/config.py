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
    kafka_sasl_username: str = ""
    kafka_sasl_password: str = ""

    template_cache_ttl_seconds: int = 300

    # Email (SendGrid) — API key/from-address are per-brand/per-project via
    # Mongo brand_settings/projects.settings, not here; these are service-wide
    # operational settings only.
    kafka_send_topic_grouped_email: str = "pam.campaigns.send.grouped.email.v1"
    email_grouped_consumer_group: str = "notif-sender-grouped-email"
    email_grouped_kafka_batch_size: int = 20
    email_grouped_kafka_batch_timeout_ms: int = 1_000
    sendgrid_max_personalizations: int = 1000
    sendgrid_webhook_public_key: str = ""
    unsubscribe_hmac_secret: str = "change-me-in-prod"
    public_base_url: str = "http://localhost:8005"

    health_port: int = 8005

    log_dir: str = ""
    log_level: str = "INFO"

    debug: bool = False
    version: str = "0.1.0"


settings = Settings()
