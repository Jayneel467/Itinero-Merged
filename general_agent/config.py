"""
Central configuration for the Itinero agent.
Loads API keys and model settings from environment variables (.env file).
"""
import os
from dotenv import load_dotenv

from exceptions import ConfigurationError

# Load .env from this file's own directory explicitly, rather than relying
# on load_dotenv()'s default working-directory search. This keeps config
# loading identical whether this agent is run directly
# (`cd general_agent && python main.py`) or via the project root's
# main.py, which imports this module from a different working directory.
_GA_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_GA_DIR)
# Own .env first. Sibling service envs are a local-dev convenience only —
# never inherit Travel_Agent/supervisor sandbox keys or APP_ENV in production.
load_dotenv(os.path.join(_GA_DIR, ".env"))
_APP_ENV = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "").lower()
_IS_PROD = _APP_ENV in {"production", "prod"}
if not _IS_PROD:
    load_dotenv(os.path.join(_PROJECT_ROOT, ".env"), override=False)
    load_dotenv(os.path.join(_PROJECT_ROOT, "Travel_Agent", ".env"), override=False)
    load_dotenv(os.path.join(_PROJECT_ROOT, "supervisor", ".env"), override=False)
else:
    load_dotenv(os.path.join(_PROJECT_ROOT, ".env"), override=False)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
# Vero dual-LLM: DeepSeek for trip plans / post-tool synthesis (optional).
DEEPSEEK_API_KEY = (os.getenv("DEEPSEEK_API_KEY") or "").strip()
DEEPSEEK_MODEL = (os.getenv("DEEPSEEK_MODEL") or "deepseek-chat").strip()
DEEPSEEK_BASE_URL = (os.getenv("DEEPSEEK_BASE_URL") or "https://api.deepseek.com/v1").strip()
VERO_LLM_COMBO = (os.getenv("VERO_LLM_COMBO") or "1").strip()
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
LITEAPI_KEY = (
    os.getenv("LITEAPI_KEY")
    or os.getenv("LITEAPI_API_KEY")
    or os.getenv("API_KEY")
)
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")  # used for Routes, Places (New), Geocoding
SARVAM_API_KEY = (
    os.getenv("SARVAM_API_KEY")
    or os.getenv("SARVAM_SUBSCRIPTION_KEY")
    or ""
)
# Ticketmaster Discovery — consumer key is the apikey. Secret is for future
# Commerce/OAuth only. Never expose either to the frontend (no VITE_).
TICKETMASTER_API_KEY = (
    os.getenv("TICKETMASTER_API_KEY")
    or os.getenv("TICKETMASTER_CONSUMER_KEY")
    or os.getenv("TM_API_KEY")
    or ""
)
TICKETMASTER_CONSUMER_SECRET = (
    os.getenv("TICKETMASTER_CONSUMER_SECRET")
    or os.getenv("TM_CONSUMER_SECRET")
    or ""
)
# Optional live flight status (schedule / gate / delay). ADS-B position works without these.
AIRLABS_API_KEY = (os.getenv("AIRLABS_API_KEY") or "").strip()
AVIATIONSTACK_API_KEY = (
    os.getenv("AVIATIONSTACK_API_KEY")
    or os.getenv("AVIATION_STACK_API_KEY")
    or ""
).strip()

MODEL_NAME = os.getenv("ITINERO_MODEL", "gpt-4o-mini")
MODEL_TEMPERATURE = float(os.getenv("ITINERO_TEMPERATURE", "0.3"))


# Where the graph's flow diagram gets saved on first run.
GRAPH_IMAGE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "outputs", "graph.png"
)

REQUIRED_KEYS = {
    "TAVILY_API_KEY": TAVILY_API_KEY,
    "OPENWEATHER_API_KEY": OPENWEATHER_API_KEY,
    "LITEAPI_KEY": LITEAPI_KEY,
}


def validate_config():
    """Raise a clear error early if required API keys are missing, instead
    of failing deep inside a tool call mid-conversation."""
    if _IS_PROD and LITEAPI_KEY and str(LITEAPI_KEY).startswith("sand_"):
        raise ConfigurationError(
            "APP_ENV=production cannot use a sandbox LiteAPI key (sand_*)."
        )
    if not (OPENAI_API_KEY or DEEPSEEK_API_KEY):
        raise ConfigurationError(
            "Missing LLM API key: please set DEEPSEEK_API_KEY or OPENAI_API_KEY in .env"
        )
    missing = [k for k, v in REQUIRED_KEYS.items() if not v]
    if missing:
        # Log missing optional tool keys but don't hard crash if basic keys exist
        pass