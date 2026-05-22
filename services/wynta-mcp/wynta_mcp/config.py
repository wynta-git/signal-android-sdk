from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    base_url: str = "https://staging.wynta.com/api/v1"
    bonus_base_url: str = "http://localhost:8100/api/v1/bonus"

    model_config = SettingsConfigDict(env_prefix="WYNTA_MCP_", env_file=".env", extra="ignore")


settings = Settings()
