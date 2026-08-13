"""Supervisor API smoke-test fixtures."""

from __future__ import annotations

import os
from datetime import date, timedelta

import httpx
import pytest

API_BASE = os.environ.get("ITINERO_API_BASE", "http://127.0.0.1:8000").rstrip("/")
RUN_LIVE_BOOKING = os.environ.get("ITINERO_RUN_LIVE_BOOKING", "1").strip().lower() not in {
    "0",
    "false",
    "no",
}


def _future(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


@pytest.fixture
def api_client() -> httpx.Client:
    client = httpx.Client(base_url=API_BASE, timeout=120.0)
    try:
        if client.get("/api/health/live").status_code != 200:
            pytest.skip(f"supervisor not healthy at {API_BASE}")
    except httpx.HTTPError as exc:
        pytest.skip(f"supervisor unreachable at {API_BASE}: {exc}")
    yield client
    client.close()


@pytest.fixture
def travel_dates() -> dict[str, str]:
    return {
        "check_in": _future(21),
        "check_out": _future(22),
        "depart": _future(14),
    }


@pytest.fixture
def skip_live_booking():
    if not RUN_LIVE_BOOKING:
        pytest.skip("ITINERO_RUN_LIVE_BOOKING=0")


@pytest.fixture
def supervisor_sandbox(api_client: httpx.Client):
    try:
        health = api_client.get("/api/health")
        if health.status_code != 200:
            pytest.skip("supervisor health unavailable")
        if (health.json() or {}).get("environment") == "production":
            pytest.skip(
                "supervisor in production — restart with ./scripts/dev-supervisor.sh --force"
            )
    except httpx.HTTPError:
        pytest.skip("could not verify supervisor environment")
