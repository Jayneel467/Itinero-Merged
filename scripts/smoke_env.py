"""Smoke-test supervisor without printing secrets."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / "supervisor" / ".env")


def mask_present(name: str) -> str:
    v = os.getenv(name)
    return "SET" if v else "MISSING"


def main() -> None:
    print("env_check:")
    for k in (
        "OPENAI_API_KEY",
        "API_KEY",
        "LITEAPI_KEY",
        "TAVILY_API_KEY",
        "OPENWEATHER_API_KEY",
        "GOOGLE_MAPS_API_KEY",
        "LANGSMITH_API_KEY",
        "LANGSMITH_TRACING",
        "LANGSMITH_PROJECT",
        "LITEAPI_USE_PAYMENT_SDK",
    ):
        print(f"  {k}: {mask_present(k)}")

    from supervisor.main import app, health

    print("gateway:", app.title)
    h = health()
    # Ensure no secret values nested
    print("health:", json.dumps(h, indent=2))


if __name__ == "__main__":
    main()
