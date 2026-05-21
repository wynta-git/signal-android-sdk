from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "pam"
    mongo_min_pool_size: int = 2
    mongo_max_pool_size: int = 10

    # RS256 private key in PEM format (multiline — use \n escaping in env vars)
    jwt_private_key: str = ""

    jwt_token_ttl: int = 3600

    debug: bool = False
    version: str = "0.1.0"


settings = Settings()
