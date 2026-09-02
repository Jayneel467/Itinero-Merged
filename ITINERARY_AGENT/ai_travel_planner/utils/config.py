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
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

_UTIL_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _UTIL_DIR.parent.parent.parent
for _p in [
    _PROJECT_ROOT / ".env",
    _PROJECT_ROOT / "supervisor" / ".env",
    _PROJECT_ROOT / "general_agent" / ".env",
    _UTIL_DIR.parent.parent / ".env",
]:
    if _p.exists():
        load_dotenv(_p, override=False)


def resolve_llm_config() -> dict[str, Any]:
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    deepseek_key = (os.getenv("DEEPSEEK_API_KEY") or "").strip()
    if openai_key and (openai_key.startswith("sk-proj-") or (openai_key.startswith("sk-") and len(openai_key) > 30 and "your_" not in openai_key)):
        return {
            "api_key": openai_key,
            "base_url": os.getenv("OPENAI_BASE_URL"),
            "model": "gpt-4o-mini",
        }
    if deepseek_key:
        return {
            "api_key": deepseek_key,
            "base_url": os.getenv("DEEPSEEK_BASE_URL") or "https://api.deepseek.com/v1",
            "model": os.getenv("DEEPSEEK_MODEL") or "deepseek-chat",
        }
    return {
        "api_key": openai_key or deepseek_key or "mock-key",
        "base_url": None,
        "model": "gpt-4o-mini",
    }


try:
    from pydantic import Field, model_validator
    from pydantic_settings import BaseSettings  # type: ignore[import-untyped]

    class Settings(BaseSettings):
        """Application-wide configuration loaded from environment variables."""

        # ── OpenAI / DeepSeek ──────────────────────────────────────────────────
        openai_api_key: str = Field(
            default_factory=lambda: resolve_llm_config()["api_key"]
        )
        openai_base_url: str | None = Field(
            default_factory=lambda: resolve_llm_config()["base_url"]
        )

        # ── Model names ───────────────────────────────────────────────────────
        itinerary_agent_model: str = Field(
            default_factory=lambda: os.getenv("ITINERARY_AGENT_MODEL") or resolve_llm_config()["model"]
        )
        flight_agent_model: str = Field(
            default_factory=lambda: os.getenv("FLIGHT_AGENT_MODEL") or resolve_llm_config()["model"]
        )
        hotel_agent_model: str = Field(
            default_factory=lambda: os.getenv("HOTEL_AGENT_MODEL") or resolve_llm_config()["model"]
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

        @model_validator(mode="after")
        def _ensure_llm_credentials(self) -> "Settings":
            cfg = resolve_llm_config()
            raw = str(self.openai_api_key or "").strip()
            if not raw or raw == "mock-key" or not (raw.startswith("sk-proj-") or (raw.startswith("sk-") and len(raw) > 30 and "your_" not in raw)):
                self.openai_api_key = cfg["api_key"]
                self.openai_base_url = cfg["base_url"]
                if not os.getenv("FLIGHT_AGENT_MODEL"):
                    self.flight_agent_model = cfg["model"]
                if not os.getenv("HOTEL_AGENT_MODEL"):
                    self.hotel_agent_model = cfg["model"]
                if not os.getenv("ITINERARY_AGENT_MODEL"):
                    self.itinerary_agent_model = cfg["model"]
            return self

except ImportError:
    # ── Fallback: plain class reading from os.getenv ──────────────────────────
    class Settings:  # type: ignore[no-redef]
        """Fallback settings class using os.getenv directly."""

        def __init__(self) -> None:
            cfg = resolve_llm_config()
            self.openai_api_key: str = cfg["api_key"]
            self.openai_base_url: str | None = cfg["base_url"]
            self.itinerary_agent_model: str = os.getenv(
                "ITINERARY_AGENT_MODEL", cfg["model"]
            )
            self.flight_agent_model: str = os.getenv(
                "FLIGHT_AGENT_MODEL", cfg["model"]
            )
            self.hotel_agent_model: str = os.getenv(
                "HOTEL_AGENT_MODEL", cfg["model"]
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
