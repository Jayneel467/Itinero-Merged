"""
Application configuration loaded from environment variables / .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str = ""
    tavily_api_key: str = ""
    liteapi_api_key: str = ""
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # Max distance (km) between the current hotel and the next day's
    # activities before we ask the user whether to search a new hotel.
    hotel_reuse_max_distance_km: float = 5.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


# Singleton
settings = Settings()
