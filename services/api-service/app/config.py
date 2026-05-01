from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "pam"
    mongo_min_pool_size: int = 5
    mongo_max_pool_size: int = 50

    redis_url: str = "redis://localhost:6379"
    redis_max_connections: int = 20

    event_handler_url: str = "http://localhost:8002"

    debug: bool = False
    version: str = "0.1.0"


settings = Settings()
