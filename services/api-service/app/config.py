from pydantic_settings import BaseSettings, SettingsConfigDict

from shared.cors import CORS_ORIGINS


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongo_url: str = "mongodb://admin:ccc@localhost:27017/"
    mongo_db: str = "pam"
    mongo_min_pool_size: int = 5
    mongo_max_pool_size: int = 50

    redis_url: str = "redis://localhost:6379"
    redis_max_connections: int = 20

    kafka_bootstrap_servers: str = "localhost:9093"
    kafka_events_topic: str = "pam.events.raw.v1"
    kafka_sasl_username: str = ""
    kafka_sasl_password: str = ""

    common_db_host: str = "localhost"
    common_db_port: int = 3306
    common_db_user: str = "root"
    common_db_password: str = ""
    common_db_name: str = "wynta_common"
    common_db_min_pool: int = 2
    common_db_max_pool: int = 10

    rate_limit_enabled: bool = True

    cors_origins: list[str] = CORS_ORIGINS

    log_dir: str = ""
    log_level: str = "INFO"

    debug: bool = False
    version: str = "0.1.0"


settings = Settings()
