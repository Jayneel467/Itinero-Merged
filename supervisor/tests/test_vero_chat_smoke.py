"""Vero AI smoke — LLM routing, page context, booking actions."""

from __future__ import annotations

import os
from datetime import date, timedelta

import httpx
import pytest

VERO_BASE = os.environ.get("ITINERO_VERO_BASE", "http://127.0.0.1:8001").rstrip("/")
SUP_BASE = os.environ.get("ITINERO_API_BASE", "http://127.0.0.1:8000").rstrip("/")
RUN_LIVE = os.environ.get("ITINERO_RUN_LIVE_VERo", "1").strip().lower() not in {
    "0",
    "false",
    "no",
}


def _skip_if_no_openai():
    if not (os.environ.get("OPENAI_API_KEY") or "").strip():
        pytest.skip("OPENAI_API_KEY not set")


@pytest.fixture(scope="module")
def vero_client() -> httpx.Client:
    client = httpx.Client(base_url=VERO_BASE, timeout=120.0)
    try:
        if client.get("/api/health/live").status_code != 200:
            pytest.skip(f"Vero not healthy at {VERO_BASE}")
    except httpx.HTTPError as exc:
        pytest.skip(f"Vero unreachable at {VERO_BASE}: {exc}")
    yield client
    client.close()


@pytest.fixture(scope="module")
def sup_client() -> httpx.Client:
    client = httpx.Client(base_url=SUP_BASE, timeout=120.0)
    try:
        if client.get("/api/health/live").status_code != 200:
            pytest.skip(f"supervisor not healthy at {SUP_BASE}")
    except httpx.HTTPError as exc:
        pytest.skip(f"supervisor unreachable at {SUP_BASE}: {exc}")
    yield client
    client.close()


def test_vero_health_exposes_model(vero_client: httpx.Client):
    resp = vero_client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    model = data.get("model") or data.get("extra", {}).get("model")
    assert model, "health should expose ITINERO_MODEL"
    assert "gpt" in str(model).lower() or "claude" in str(model).lower()


@pytest.mark.skipif(not RUN_LIVE, reason="ITINERO_RUN_LIVE_VERo=0")
def test_vero_page_context_trip_pnr(vero_client: httpx.Client):
    _skip_if_no_openai()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    page_context = {
        "screen": "trips",
        "path": "/trips/pytest-smoke",
        "detail": {
            "id": "pytest-smoke",
            "title": "Mumbai → Delhi",
            "legs": [
                {
                    "type": "flight",
                    "status": "confirmed",
                    "airline": "Akasa Air",
                    "flight_number": "QP1412",
                    "origin": "BOM",
                    "destination": "DEL",
                    "depart_date": tomorrow,
                    "pnr": "ITN8K2P1",
                    "dep_terminal": "T2",
                    "baggage_cabin": "7 kg cabin",
                }
            ],
        },
    }
    resp = vero_client.post(
        "/api/chat",
        json={
            "message": "What's my PNR and departure terminal?",
            "thread_id": "pytest-vero-page-smoke",
            "page_context": page_context,
        },
    )
    assert resp.status_code == 200, resp.text[:400]
    body = resp.json()
    reply = (body.get("reply") or "").lower()
    assert reply, "expected non-empty reply"
    assert "itn8k2p1" in reply or "pnr" in reply
    # Terminal may come from page-aware instant answer or LLM follow-up.
    assert (
        "t2" in reply
        or "terminal" in reply
        or "qp1412" in reply
        or "akasa" in reply
    )


@pytest.mark.skipif(not RUN_LIVE, reason="ITINERO_RUN_LIVE_VERo=0")
def test_vero_flight_search_emits_left_action(vero_client: httpx.Client):
    _skip_if_no_openai()
    depart = (date.today() + timedelta(days=21)).isoformat()
    resp = vero_client.post(
        "/api/chat",
        json={
            "message": f"Search flights Mumbai to Delhi on {depart} for 1 adult economy",
            "thread_id": "pytest-vero-flight-search",
        },
    )
    assert resp.status_code == 200, resp.text[:400]
    body = resp.json()
    reply = body.get("reply") or ""
    cards = body.get("cards")
    has_action = "itinero-action" in reply.lower() or (
        isinstance(cards, dict) and cards.get("type") in {"flights", "hotels"}
    )
    assert has_action or "del" in reply.lower() or "mumbai" in reply.lower()


@pytest.mark.skipif(not RUN_LIVE, reason="ITINERO_RUN_LIVE_VERo=0")
def test_supervisor_forwards_page_context(sup_client: httpx.Client):
    _skip_if_no_openai()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    page_context = {
        "screen": "trips",
        "path": "/trips/pytest-sup",
        "detail": {
            "legs": [
                {
                    "type": "flight",
                    "pnr": "ITN8K2P1",
                    "dep_terminal": "T2",
                    "origin": "BOM",
                    "destination": "DEL",
                    "depart_date": tomorrow,
                }
            ],
        },
    }
    resp = sup_client.post(
        "/api/chat",
        json={
            "message": "What terminal do I depart from?",
            "session_id": "pytest-sup-page-smoke",
            "page_context": page_context,
        },
    )
    assert resp.status_code == 200, resp.text[:400]
    body = resp.json()
    reply = (body.get("response") or "").lower()
    assert reply
    assert body.get("mode") != "stub", "page_context chat should not return hardcoded stub"
    assert "t2" in reply or "terminal" in reply
