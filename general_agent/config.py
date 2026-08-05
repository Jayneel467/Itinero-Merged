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
_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(_ENV_PATH)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
LITEAPI_KEY = os.getenv("LITEAPI_KEY")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")  # used for Routes, Places (New), Geocoding

MODEL_NAME = os.getenv("ITINERO_MODEL", "gpt-4o-mini")
MODEL_TEMPERATURE = float(os.getenv("ITINERO_TEMPERATURE", "0.3"))


# Where the graph's flow diagram gets saved on first run.
GRAPH_IMAGE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "outputs", "graph.png"
)

REQUIRED_KEYS = {
    "OPENAI_API_KEY": OPENAI_API_KEY,
    "TAVILY_API_KEY": TAVILY_API_KEY,
    "OPENWEATHER_API_KEY": OPENWEATHER_API_KEY,
    "LITEAPI_KEY": LITEAPI_KEY,
    "GOOGLE_MAPS_API_KEY": GOOGLE_MAPS_API_KEY,
}


def validate_config():
    """Raise a clear error early if required API keys are missing, instead
    of failing deep inside a tool call mid-conversation."""
    missing = [k for k, v in REQUIRED_KEYS.items() if not v]
    if missing:
        raise ConfigurationError(
            f"Missing required environment variables: {', '.join(missing)}. "
            f"Copy .env.example to .env and fill them in."
        )