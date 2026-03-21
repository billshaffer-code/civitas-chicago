"""
CIVITAS MCP – Shared configuration via pydantic-settings.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class MCPSettings(BaseSettings):
    database_url: str = "postgresql://civitas:civitas@localhost:5432/civitas"
    socrata_app_token: str = ""
    mcp_db_query_timeout_seconds: int = 10
    mcp_db_max_query_rows: int = 1000

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = MCPSettings()
