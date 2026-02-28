"""
CIVITAS – Application configuration via pydantic-settings.
Values are read from environment variables / .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql://civitas:civitas@localhost:5432/civitas"
    anthropic_api_key: str = ""
    environment: str = "development"
    geo_radius_meters: int = 50
    reports_dir: str = "backend/reports"
    max_narrative_tokens: int = 800

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
