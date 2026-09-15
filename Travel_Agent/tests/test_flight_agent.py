"""Core Flight Agent unit tests (no live API calls)."""

from __future__ import annotations

import os

import pytest

os.environ.setdefault("APP_ENV", "sandbox")
os.environ.setdefault("OPENAI_API_KEY", "sk-test-not-real")
os.environ.setdefault("API_KEY", "sand_test")


@pytest.fixture(autouse=True)
def _clear_settings():
    from flight_agent.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_sandbox_allows_credit(monkeypatch):
    monkeypatch.setenv("APP_ENV", "sandbox")
    monkeypatch.setenv("LITEAPI_USE_PAYMENT_SDK", "false")
    from flight_agent.config import get_settings

    get_settings.cache_clear()
    get_settings().assert_payment_allowed()


def test_production_blocks_credit(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("LITEAPI_USE_PAYMENT_SDK", "false")
    from flight_agent.config import get_settings

    get_settings.cache_clear()
    with pytest.raises(ValueError, match="Payment SDK"):
        get_settings().assert_payment_allowed()


def test_session_context_defaults():
    from flight_agent.models.agent import SessionContext

    ctx = SessionContext()
    assert ctx.booking_id is None
    assert ctx.travelers_draft == []


def test_hold_ready_prompt_has_no_card_ui():
    from flight_agent.llm.confirmation import hold_ready_prompt
    from flight_agent.models.agent import SessionContext

    ctx = SessionContext(prebook_id="pb_test", last_prebook={"price": 100, "currency": "INR"})
    text = hold_ready_prompt(ctx).lower()
    assert "hold" in text
    assert "4242" not in text
    assert "payment box" not in text
    assert "checkout" in text


def test_parse_route_only_mumbai_delhi():
    from flight_agent.llm.booking_progress import parse_route_only, parse_search_trip

    route = parse_route_only("Mumbai to Delhi")
    assert route == {"origin": "BOM", "destination": "DEL"}
    assert parse_search_trip("Mumbai to Delhi") is None  # date still required for search


def test_general_agent_routes_flight_talk_to_flight():
    from flight_agent.models.agent import SessionContext
    from itinero.general_agent import GeneralAgent

    ga = GeneralAgent.__new__(GeneralAgent)
    assert ga._heuristic_route("Mumbai to Delhi", SessionContext()) == "flight"
    active = SessionContext(search_context={"origin": "BOM", "destination": "DEL"})
    assert ga._session_active_flight(active) is True
    assert ga._heuristic_route("26 July", active) == "flight"
    assert ga._heuristic_route("2 adults", active) == "flight"
    # Soft sticky: hotel can interrupt before offers are shown
    assert ga._heuristic_route("hotels in Goa", active) == "hotel"
    deep = SessionContext(last_search_results=[{"offer_id": "x"}])
    assert ga._session_deep_flight(deep) is True
    assert ga._heuristic_route("hotels in Goa", deep) == "flight"


def test_general_agent_routes_hotel_and_itinerary():
    from flight_agent.models.agent import SessionContext
    from itinero.general_agent import GeneralAgent

    ga = GeneralAgent.__new__(GeneralAgent)
    assert ga._heuristic_route("find hotels in Goa", SessionContext()) == "hotel"
    assert ga._heuristic_route("plan a trip to Goa", SessionContext()) == "itinerary"
    assert ga._heuristic_route("hi", SessionContext()) == "general"
    assert ga._heuristic_route("what can you do", SessionContext()) == "general"


def test_itinerary_agent_calls_hotel():
    import asyncio

    from flight_agent.models.agent import SessionContext
    from itinero.itinerary_agent import ItineraryAgent

    async def _run():
        agent = ItineraryAgent()
        out = await agent.plan_hotel(
            message="hotels in Mumbai",
            session=SessionContext(),
            path_prefix=["start", "general_agent"],
        )
        assert out.routed_to == "hotel_agent"
        assert "itinerary_agent" in out.route_path
        assert "hotel_agent" in out.route_path
        assert "Mumbai" in out.response
        assert out.session_context.hotel_context.get("city") == "Mumbai"
        await agent.aclose()

    asyncio.run(_run())


def test_itinerary_plan_trip_calls_hotel_for_destination():
    import asyncio

    from flight_agent.models.agent import SessionContext
    from itinero.itinerary_agent import ItineraryAgent

    async def _run():
        agent = ItineraryAgent()
        out = await agent.plan_trip(
            message="plan a trip to Goa",
            session=SessionContext(),
            path_prefix=["start", "general_agent"],
        )
        assert "hotel_agent" in (out.route_path or [])
        assert "Goa" in out.response
        assert "flight" in out.response.lower()
        await agent.aclose()

    asyncio.run(_run())


def test_hotel_agent_collects_dates():
    import asyncio

    from flight_agent.models.agent import SessionContext
    from itinero.hotel_agent import HotelAgent

    async def _run():
        agent = HotelAgent()
        session = SessionContext()
        out1 = await agent.run(message="hotels in Goa", session=session)
        assert session.hotel_context.get("city") == "Goa"
        assert "check-in" in out1.response.lower()
        out2 = await agent.run(message="12 August to 15 August", session=session)
        assert session.hotel_context.get("check_in")
        assert session.hotel_context.get("check_out")
        assert "check-in" in out2.response.lower() or "Goa" in out2.response
        await agent.aclose()

    asyncio.run(_run())

def test_booking_progress_asks_date_then_passengers():
    import asyncio
    from unittest.mock import MagicMock

    from flight_agent.llm.booking_progress import try_booking_progress
    from flight_agent.models.agent import SessionContext

    async def _run():
        session = SessionContext()
        svc = MagicMock()
        out = await try_booking_progress(
            flight_service=svc, session=session, message="Mumbai to Delhi"
        )
        assert out is not None
        assert "date" in out.response.lower()
        assert session.search_context["origin"] == "BOM"
        assert session.search_context["destination"] == "DEL"

        session.last_search_results = [
            {
                "index": 1,
                "offer_id": "off_1",
                "total_price": 5000,
                "currency": "INR",
                "stops": 0,
            }
        ]
        svc.select_offer_from_index = MagicMock(return_value="off_1")
        out2 = await try_booking_progress(
            flight_service=svc, session=session, message="option 1"
        )
        assert out2 is not None
        assert "passenger" in out2.response.lower() or "adult" in out2.response.lower()
        assert session.selected_offer_index == 1

    asyncio.run(_run())


def test_flight_agent_tools_exclude_complete(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    from unittest.mock import MagicMock

    from flight_agent.config import get_settings
    from flight_agent.llm.tools import build_flight_tools
    from flight_agent.models.agent import SessionContext

    get_settings.cache_clear()
    names = {t.name for t in build_flight_tools(MagicMock(), SessionContext())}
    assert "prebook_flight" in names
    assert "complete_flight_booking" not in names


def test_flight_agent_builds(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    from flight_agent.config import get_settings
    from flight_agent.agent import FlightAgent

    get_settings.cache_clear()
    agent = FlightAgent()
    assert agent._graph is not None
