from pydantic import field_validator
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

    # Separate RS256 key pair for portal UI tokens — never share with system token key
    portal_jwt_private_key: str = ""
    portal_jwt_public_key: str = ""

    portal_token_ttl: int = 900
    portal_refresh_interval: int = 720

    # Secret key for external JWT validation (HS256)
    external_jwt_secret_key: str = ""

    redis_url: str = "redis://localhost:6379/0"
    redis_cache_ttl: int = 600  # 10 minutes

    common_db_host: str = "43.204.90.164"
    common_db_port: int = 3306
    common_db_user: str = "xxxx"
    common_db_password: str = "xxxx"
    common_db_name: str = "wynta_common"
    common_db_pool_minsize: int = 1
    common_db_pool_maxsize: int = 5

    log_dir: str = ""
    log_level: str = "INFO"

    debug: bool = False
    version: str = "0.1.0"

    @field_validator("jwt_private_key", "portal_jwt_private_key", "portal_jwt_public_key", mode="before")
    @classmethod
    def normalize_pem(cls, v: str) -> str:
        return v.replace("\\n", "\n") if isinstance(v, str) else v


settings = Settings()
