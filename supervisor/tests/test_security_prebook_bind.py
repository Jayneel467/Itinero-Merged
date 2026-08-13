"""Unit checks for medium security remediations (no network).

Run: .venv/bin/python -m supervisor.tests.test_security_prebook_bind
"""

from __future__ import annotations

import os
import re
import sys
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch

_ROOT = Path(__file__).resolve().parents[2]
for p in (_ROOT, _ROOT / "ITINERARY_AGENT", _ROOT / "general_agent"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


def test_flight_prebook_rejects_unbound_offer():
    from ai_travel_planner.agents.flight_agent import FlightAgent
    from ai_travel_planner.state.models import CabinClass, FlightOption

    flight = FlightOption(
        flight_id="F1",
        airline="TestAir",
        flight_number="TA100",
        origin="BOM",
        destination="DEL",
        departure_time=datetime(2026, 9, 1, 10, 0),
        arrival_time=datetime(2026, 9, 1, 12, 0),
        duration_minutes=120,
        stops=0,
        cabin_class=CabinClass.ECONOMY,
        price_per_adult=5000,
        price_per_child=4000,
        total_price=5000,
        currency="INR",
        offer_id="attacker-offer-xyz",
    )
    agent = FlightAgent.__new__(FlightAgent)
    resp = agent.prebook_flight(
        instruction="",
        flight=flight,
        passengers={"adults": 1, "children": 0},
        allowed_offer_ids={"legit-offer-1"},
    )
    assert resp.status.value == "error"
    assert any("not bound" in e for e in (resp.errors or []))


def test_hotel_prebook_blocks_agency_credit_without_flag():
    from ai_travel_planner.agents.hotel_agent import HotelAgent
    from ai_travel_planner.state.models import HotelOption, MealPlan

    hotel = HotelOption(
        hotel_id="H1",
        name="Test Hotel",
        star_rating=4,
        location="Lisbon center",
        area="Baixa",
        distance_from_center_km=0.5,
        room_type="Deluxe",
        meal_plan=MealPlan.BREAKFAST,
        cancellation_policy="Free cancel 24h",
        price_per_night=100,
        total_price=200,
        offer_id="hotel-offer-1",
    )
    agent = HotelAgent.__new__(HotelAgent)
    env = {
        "APP_ENV": "development",
        "LITEAPI_USE_PAYMENT_SDK": "false",
        "LITEAPI_KEY": "live_not_sandbox",
        "ITINERO_ALLOW_AGENCY_CREDIT": "0",
    }
    with patch.dict(os.environ, env, clear=False):
        resp = agent.prebook_hotel(
            instruction="",
            hotel=hotel,
            check_in=date(2026, 9, 1),
            check_out=date(2026, 9, 3),
            guests={"adults": 1, "children": 0},
            day_label="Day 1",
            allowed_offer_ids={"hotel-offer-1"},
        )
    assert resp.status.value == "error"
    assert any("CREDIT" in e for e in (resp.errors or []))


def test_match_quick_flight_cache_rejects_swapped_offer():
    from general_agent.itinerary_bridge import _match_quick_flight_cache

    trip_ctx = {
        "quick_flight_search": {
            "results": [
                {
                    "flight_id": "F1",
                    "offer_id": "real-offer",
                    "airline": "AI",
                    "flight_number": "101",
                    "origin": "BOM",
                    "destination": "DEL",
                    "departure_time": "2026-09-01T10:00:00",
                    "arrival_time": "2026-09-01T12:00:00",
                    "duration_minutes": 120,
                    "stops": 0,
                    "cabin_class": "Economy",
                    "price_per_adult": 5000,
                    "price_per_child": 0,
                    "total_price": 5000,
                    "currency": "INR",
                }
            ]
        }
    }
    bad = {"flight_id": "F1", "offer_id": "attacker-offer"}
    assert _match_quick_flight_cache(trip_ctx, bad) is None
    good = {"flight_id": "F1", "offer_id": "real-offer"}
    assert _match_quick_flight_cache(trip_ctx, good) is not None


def test_go_search_phrases_not_soft():
    pattern = re.compile(
        r"\b(yes|yep|yeah|search flights?|go ahead|please search|looks good)\b"
    )
    assert pattern.search("yes")
    assert pattern.search("search flights")
    assert not pattern.search("i'm flexible on dates")
    assert not pattern.search("ready when you are")
    assert not pattern.search("please proceed")
    assert not pattern.search("yesterday")


def main() -> int:
    tests = [
        ("flight_unbind", test_flight_prebook_rejects_unbound_offer),
        ("hotel_credit", test_hotel_prebook_blocks_agency_credit_without_flag),
        ("cache_swap", test_match_quick_flight_cache_rejects_swapped_offer),
        ("confirm_phrases", test_go_search_phrases_not_soft),
    ]
    ok = True
    for name, fn in tests:
        try:
            fn()
            print(f"PASS {name}")
        except Exception as e:
            ok = False
            print(f"FAIL {name}: {e!r}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
