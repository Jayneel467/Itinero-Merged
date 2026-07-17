"""
Application Configuration
==========================
Loads settings from environment variables (or .env file).

Uses pydantic-settings when available; falls back to a plain dataclass that
reads from os.getenv so the project works even without pydantic-settings
installed (useful in minimal environments).
"""
from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

try:
    from pydantic import Field
    from pydantic_settings import BaseSettings  # type: ignore[import-untyped]

    class Settings(BaseSettings):
        """Application-wide configuration loaded from environment variables."""

        # ── OpenAI ────────────────────────────────────────────────────────────
        openai_api_key: str = Field(..., alias="OPENAI_API_KEY")

        # ── Model names ───────────────────────────────────────────────────────
        itinerary_agent_model: str = Field("gpt-4o", alias="ITINERARY_AGENT_MODEL")
        flight_agent_model: str = Field("gpt-4o-mini", alias="FLIGHT_AGENT_MODEL")
        hotel_agent_model: str = Field("gpt-4o-mini", alias="HOTEL_AGENT_MODEL")

        # ── Temperatures ──────────────────────────────────────────────────────
        itinerary_agent_temperature: float = Field(
            0.3, alias="ITINERARY_AGENT_TEMPERATURE"
        )
        flight_agent_temperature: float = Field(0.2, alias="FLIGHT_AGENT_TEMPERATURE")
        hotel_agent_temperature: float = Field(0.2, alias="HOTEL_AGENT_TEMPERATURE")

        # ── App ───────────────────────────────────────────────────────────────
        app_env: str = Field("development", alias="APP_ENV")
        log_level: str = Field("INFO", alias="LOG_LEVEL")

        model_config = {"populate_by_name": True, "extra": "ignore"}

except ImportError:
    # ── Fallback: plain class reading from os.getenv ──────────────────────────
    class Settings:  # type: ignore[no-redef]
        """Fallback settings class using os.getenv directly."""

        def __init__(self) -> None:
            key = os.getenv("OPENAI_API_KEY", "")
            if not key:
                raise ValueError(
                    "OPENAI_API_KEY is not set. "
                    "Copy .env.example to .env and add your key."
                )
            self.openai_api_key: str = key
            self.itinerary_agent_model: str = os.getenv(
                "ITINERARY_AGENT_MODEL", "gpt-4o"
            )
            self.flight_agent_model: str = os.getenv(
                "FLIGHT_AGENT_MODEL", "gpt-4o-mini"
            )
            self.hotel_agent_model: str = os.getenv(
                "HOTEL_AGENT_MODEL", "gpt-4o-mini"
            )
            self.itinerary_agent_temperature: float = float(
                os.getenv("ITINERARY_AGENT_TEMPERATURE", "0.3")
            )
            self.flight_agent_temperature: float = float(
                os.getenv("FLIGHT_AGENT_TEMPERATURE", "0.2")
            )
            self.hotel_agent_temperature: float = float(
                os.getenv("HOTEL_AGENT_TEMPERATURE", "0.2")
            )
            self.app_env: str = os.getenv("APP_ENV", "development")
            self.log_level: str = os.getenv("LOG_LEVEL", "INFO")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton Settings instance."""
    return Settings()  # type: ignore[call-arg]
