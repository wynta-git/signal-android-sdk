from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # S2S clients: {"client_id": "shared_secret", ...}
    # Set via env: BONUS_S2S_CLIENTS='{"game_server":"secret1","admin":"secret2"}'
    s2s_clients: dict[str, str] = {}

    # RS256 public key (PEM) for portal UI tokens — set BONUS_PORTAL_JWT_PUBLIC_KEY
    portal_jwt_public_key: str = ""

    db_host: str = "43.204.90.164"
    db_port: int = 3306
    db_user: str = "wynta_bonus"
    db_password: str = "wynta_bonus@1234"
    db_name: str = "wynta_bonus"
    db_pool_minsize: int = 2
    db_pool_maxsize: int = 10

    common_db_host: str = "43.204.90.164"
    common_db_port: int = 3306
    common_db_user: str = "wynta_bonus"
    common_db_password: str = "wynta_bonus@1234"
    common_db_name: str = "wynta_common"
    common_db_pool_minsize: int = 1
    common_db_pool_maxsize: int = 5

    kafka_bootstrap_servers: str = "43.204.90.164:9093"
    kafka_topic: str = "pam.bonus.raw.v1"
    kafka_group_id: str = "pam-bonus-consumer"
    kafka_security_protocol: str = "SASL_PLAINTEXT"
    kafka_sasl_mechanism: str = "PLAIN"
    kafka_sasl_username: str = "ddf"
    kafka_sasl_password: str= "787"
    kafka_dlq_topic: str = "pam.bonus.invalid.v1"
    kafka_batch_size: int = 100
    kafka_batch_timeout_ms: int = 1_000

    kafka_manual_bonus_topic: str = "pam.bonus.manual.v1"
    kafka_manual_bonus_group_id: str = "pam-bonus-manual-consumer"

    redis_url: str = "redis://localhost:6379/0"
    trigger_cache_ttl: int = 300  # seconds
    dedup_event_ttl: int = 604800  # 7 days

    scheduler_interval_minutes: int = 60
    scheduler_batch_size: int = 500

    # Logging — set BONUS_LOG_DIR to enable file output, e.g. /var/log/bonus-service
    # Leave empty to log to stdout only.
    log_dir: str = ""
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_prefix="BONUS_", env_file=".env", extra="ignore")

    s3_bucket: str = "pam-bulk-bonus"
    s3_endpoint_url: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_region: str = ""

    @field_validator("portal_jwt_public_key", mode="before")
    @classmethod
    def normalize_pem(cls, v: str) -> str:
        return v.replace("\\n", "\n") if isinstance(v, str) else v


settings = Settings()
