"""Environment-based configuration for the Flight Agent."""

from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM provider
    llm_provider: Literal["groq", "openai", ""] = Field(
        default="",
        validation_alias=AliasChoices("LLM_PROVIDER", "llm_provider"),
    )
    llm_fallback: bool = Field(default=True, validation_alias=AliasChoices("LLM_FALLBACK", "llm_fallback"))

    # Groq LLM
    groq_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("GROQ_API_KEY", "Grock_API_KEY", "groq_api_key"),
    )
    groq_model: str = Field(
        default="qwen/qwen3.6-27b",
        validation_alias=AliasChoices("GROQ_MODEL", "GROQ_MODEL_ID", "groq_model"),
    )
    groq_fallback_model: str = Field(
        default="",
        validation_alias=AliasChoices("GROQ_FALLBACK_MODEL", "groq_fallback_model"),
    )
    groq_temperature: float = Field(default=0.0, validation_alias="GROQ_TEMPERATURE")
    groq_max_retries: int = Field(default=1, validation_alias="GROQ_MAX_RETRIES")

    # OpenAI GPT
    openai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("OPENAI_API_KEY", "OPENAI_KEY", "openai_api_key"),
    )
    openai_model: str = Field(
        default="gpt-4o-mini",
        validation_alias=AliasChoices("OPENAI_MODEL", "MODEL", "Model", "GPT_MODEL"),
    )
    openai_temperature: float = Field(default=0.0, validation_alias="OPENAI_TEMPERATURE")
    openai_max_retries: int = Field(default=0, validation_alias="OPENAI_MAX_RETRIES")

    # LiteAPI
    liteapi_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("LITEAPI_API_KEY", "API_KEY", "liteapi_api_key"),
    )
    liteapi_base_url: str = Field(
        default="https://api.liteapi.travel/v3.0",
        validation_alias=AliasChoices("LITEAPI_BASE_URL", "BASE_URL", "liteapi_base_url"),
    )
    liteapi_timeout_seconds: float = Field(default=28.0, validation_alias="LITEAPI_TIMEOUT_SECONDS")
    liteapi_use_payment_sdk: bool = Field(default=False, validation_alias="LITEAPI_USE_PAYMENT_SDK")

    # Defaults for flight search
    default_currency: str = Field(default="INR", validation_alias="DEFAULT_CURRENCY")
    default_country: str = Field(default="IN", validation_alias="DEFAULT_COUNTRY")
    agent_recursion_limit: int = Field(default=32, validation_alias="AGENT_RECURSION_LIMIT")

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(
        default="INFO",
        validation_alias="LOG_LEVEL",
    )

    @property
    def resolved_groq_api_key(self) -> str:
        key = self.groq_api_key
        if key.startswith("gsk_"):
            return key
        return ""

    @property
    def resolved_openai_api_key(self) -> str:
        if self.openai_api_key.startswith(("sk-", "sk_proj")):
            return self.openai_api_key
        return ""

    @property
    def primary_llm_provider(self) -> Literal["groq", "openai"]:
        if self.llm_provider == "openai":
            return "openai"
        if self.llm_provider == "groq":
            return "groq"
        if self.resolved_groq_api_key:
            return "groq"
        if self.resolved_openai_api_key:
            return "openai"
        return "groq"

    @property
    def resolved_llm_provider(self) -> Literal["groq", "openai"]:
        """Primary provider (kept for compatibility)."""
        return self.primary_llm_provider

    @property
    def has_groq(self) -> bool:
        return bool(self.resolved_groq_api_key)

    @property
    def has_openai(self) -> bool:
        return bool(self.resolved_openai_api_key)

    @property
    def resolved_llm_model(self) -> str:
        if self.resolved_llm_provider == "openai":
            return self.openai_model
        return self.groq_model

    @property
    def resolved_liteapi_api_key(self) -> str:
        return self.liteapi_api_key

    @property
    def resolved_liteapi_base_url(self) -> str:
        return (self.liteapi_base_url or "https://api.liteapi.travel/v3.0").rstrip("/")

    @field_validator("openai_model")
    @classmethod
    def normalize_openai_model(cls, value: str) -> str:
        cleaned = value.strip().lower().replace(" ", "-")
        aliases = {
            "gpt-4omini": "gpt-4o-mini",
            "gpt-4o-mini": "gpt-4o-mini",
            "gpt-4o": "gpt-4o",
            "gpt-4": "gpt-4",
            "gpt-4.1-mini": "gpt-4.1-mini",
            "gpt-4.1": "gpt-4.1",
        }
        return aliases.get(cleaned, value.strip())

    @field_validator("default_currency")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.upper()


@lru_cache
def get_settings() -> Settings:
    """Return cached settings singleton."""
    return Settings()
