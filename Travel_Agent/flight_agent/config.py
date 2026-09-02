from __future__ import annotations
"""Environment settings for the Flight Agent."""

from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Loaded from environment / Travel_Agent/.env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "sandbox", "production"] = Field(
        default="sandbox",
        validation_alias=AliasChoices("APP_ENV", "ENVIRONMENT", "ENV"),
    )

    # OpenAI GPT only
    openai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("OPENAI_API_KEY", "OPENAI_KEY", "openai_api_key"),
    )
    openai_model: str = Field(
        default="gpt-4o-mini",
        validation_alias=AliasChoices("OPENAI_MODEL", "MODEL", "GPT_MODEL"),
    )
    openai_temperature: float = Field(default=0.0, validation_alias="OPENAI_TEMPERATURE")
    openai_max_retries: int = Field(default=2, validation_alias="OPENAI_MAX_RETRIES")

    # LiteAPI
    liteapi_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "LITEAPI_API_KEY", "API_KEY", "LITEAPI_KEY", "liteapi_api_key"
        ),
    )
    liteapi_base_url: str = Field(
        default="https://api.liteapi.travel/v3.0",
        validation_alias=AliasChoices("LITEAPI_BASE_URL", "BASE_URL", "liteapi_base_url"),
    )
    liteapi_timeout_seconds: float = Field(
        default=90.0,
        validation_alias="LITEAPI_TIMEOUT_SECONDS",
        description="Read timeout for LiteAPI calls (long-haul / connecting searches need headroom).",
    )
    liteapi_search_timeout_seconds: float = Field(
        default=90.0,
        validation_alias="LITEAPI_SEARCH_TIMEOUT_SECONDS",
        description="Dedicated timeout for /flights/rates (connecting itineraries).",
    )
    liteapi_max_retries: int = Field(default=2, validation_alias="LITEAPI_MAX_RETRIES")
    liteapi_use_payment_sdk: bool = Field(default=True, validation_alias="LITEAPI_USE_PAYMENT_SDK")
    stripe_publishable_key: str = Field(
        default="",
        validation_alias=AliasChoices("STRIPE_PUBLISHABLE_KEY", "STRIPE_PK"),
    )

    default_currency: str = Field(default="INR", validation_alias="DEFAULT_CURRENCY")
    default_country: str = Field(default="IN", validation_alias="DEFAULT_COUNTRY")
    agent_recursion_limit: int = Field(default=32, validation_alias="AGENT_RECURSION_LIMIT")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(
        default="INFO",
        validation_alias="LOG_LEVEL",
    )

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def resolved_openai_api_key(self) -> str:
        key = self.openai_api_key.strip()
        return key if key.startswith(("sk-", "sk_proj", "sk-proj")) else ""

    @property
    def resolved_liteapi_api_key(self) -> str:
        return self.liteapi_api_key.strip()

    @property
    def resolved_liteapi_base_url(self) -> str:
        return (self.liteapi_base_url or "https://api.liteapi.travel/v3.0").rstrip("/")

    @property
    def payment_mode(self) -> Literal["credit", "payment_sdk"]:
        return "payment_sdk" if self.liteapi_use_payment_sdk else "credit"

    def assert_payment_allowed(self) -> None:
        """Block sandbox CREDIT in production unless Payment SDK is on."""
        if self.payment_mode == "payment_sdk":
            return
        if self.is_production:
            raise ValueError(
                "Production requires LITEAPI_USE_PAYMENT_SDK=true (card/Payment SDK)."
            )

    @field_validator("openai_api_key", "liteapi_api_key")
    @classmethod
    def strip_keys(cls, value: str) -> str:
        return value.strip()

    @field_validator("openai_model")
    @classmethod
    def normalize_model(cls, value: str) -> str:
        cleaned = value.strip().lower().replace(" ", "-")
        aliases = {
            "gpt-4omini": "gpt-4o-mini",
            "gpt-4o-mini": "gpt-4o-mini",
            "gpt-4o": "gpt-4o",
            "gpt-4": "gpt-4",
        }
        return aliases.get(cleaned, value.strip())

    @field_validator("default_currency")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.upper()


@lru_cache
def get_settings() -> Settings:
    return Settings()
