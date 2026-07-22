from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    base_url: str = "https://staging.wynta.com/api/v1"
    pam_base_url: str = "https://qa-app.fozilpartners.com/api/v1"

    model_config = SettingsConfigDict(env_prefix="WYNTA_MCP_", env_file=".env", extra="ignore")


settings = Settings()
