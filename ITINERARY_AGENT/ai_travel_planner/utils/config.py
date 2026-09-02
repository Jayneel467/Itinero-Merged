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

        # ── OpenAI / DeepSeek ──────────────────────────────────────────────────
        openai_api_key: str = Field(
            default_factory=lambda: os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY") or "mock-key"
        )
        openai_base_url: str | None = Field(
            default_factory=lambda: os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1") if (os.getenv("DEEPSEEK_API_KEY") and not os.getenv("OPENAI_API_KEY")) else os.getenv("OPENAI_BASE_URL")
        )

        # ── Model names ───────────────────────────────────────────────────────
        itinerary_agent_model: str = Field(
            default_factory=lambda: os.getenv("ITINERARY_AGENT_MODEL") or ("deepseek-chat" if (os.getenv("DEEPSEEK_API_KEY") and not os.getenv("OPENAI_API_KEY")) else "gpt-4.1-mini")
        )
        flight_agent_model: str = Field(
            default_factory=lambda: os.getenv("FLIGHT_AGENT_MODEL") or ("deepseek-chat" if (os.getenv("DEEPSEEK_API_KEY") and not os.getenv("OPENAI_API_KEY")) else "gpt-4o-mini")
        )
        hotel_agent_model: str = Field(
            default_factory=lambda: os.getenv("HOTEL_AGENT_MODEL") or ("deepseek-chat" if (os.getenv("DEEPSEEK_API_KEY") and not os.getenv("OPENAI_API_KEY")) else "gpt-4o-mini")
        )

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
            key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY") or "mock-key"
            self.openai_api_key: str = key
            self.openai_base_url: str | None = (
                os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
                if (os.getenv("DEEPSEEK_API_KEY") and not os.getenv("OPENAI_API_KEY"))
                else os.getenv("OPENAI_BASE_URL")
            )
            self.itinerary_agent_model: str = os.getenv(
                "ITINERARY_AGENT_MODEL",
                "deepseek-chat" if (os.getenv("DEEPSEEK_API_KEY") and not os.getenv("OPENAI_API_KEY")) else "gpt-4.1-mini",
            )
            self.flight_agent_model: str = os.getenv(
                "FLIGHT_AGENT_MODEL",
                "deepseek-chat" if (os.getenv("DEEPSEEK_API_KEY") and not os.getenv("OPENAI_API_KEY")) else "gpt-4o-mini",
            )
            self.hotel_agent_model: str = os.getenv(
                "HOTEL_AGENT_MODEL",
                "deepseek-chat" if (os.getenv("DEEPSEEK_API_KEY") and not os.getenv("OPENAI_API_KEY")) else "gpt-4o-mini",
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
