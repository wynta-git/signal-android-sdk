from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    db_host: str = "localhost"
    db_port: int = 3306
    db_user: str = "root"
    db_password: str = "password"
    db_name: str = "wynta_bonus"
    db_pool_minsize: int = 2
    db_pool_maxsize: int = 10

    model_config = SettingsConfigDict(env_prefix="BONUS_", env_file=".env", extra="ignore")


settings = Settings()
