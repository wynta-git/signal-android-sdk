from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # S2S clients: {"client_id": "shared_secret", ...}
    # Set via env: BONUS_S2S_CLIENTS='{"game_server":"secret1","admin":"secret2"}'
    s2s_clients: dict[str, str] = {}

    db_host: str = "43.204.90.164"
    db_port: int = 3306
    db_user: str = "wynta_bonus"
    db_password: str = "wynta_bonus@1234"
    db_name: str = "wynta_bonus"
    db_pool_minsize: int = 2
    db_pool_maxsize: int = 10

    kafka_bootstrap_servers: str = "43.204.90.164:9093"
    kafka_topic: str = "pam.bonus.raw.v1"
    kafka_group_id: str = "pam-bonus-consumer"
    kafka_security_protocol: str = "SASL_PLAINTEXT"
    kafka_sasl_mechanism: str = "PLAIN"
    kafka_sasl_username: str = "ddf"
    kafka_sasl_password: str= "787"
    kafka_batch_size: int = 100
    kafka_batch_timeout_ms: int = 1_000

    redis_url: str = "redis://localhost:6379/0"
    trigger_cache_ttl: int = 300  # seconds

    model_config = SettingsConfigDict(env_prefix="BONUS_", env_file=".env", extra="ignore")


settings = Settings()
