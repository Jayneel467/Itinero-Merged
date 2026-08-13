"""Supervisor booking API smoke tests."""

from __future__ import annotations

import uuid

import httpx
import pytest

from helpers import (
    CONTACT,
    PASSENGER,
    assert_json,
    first_hotel_offer,
    skip_if_payment_gated,
)


def test_health_endpoints(api_client: httpx.Client):
    assert api_client.get("/api/health/live").status_code == 200
    ready = api_client.get("/api/health/ready")
    assert ready.status_code in {200, 503}


def test_capabilities(api_client: httpx.Client):
    resp = api_client.get("/api/capabilities")
    assert_json(resp, "capabilities")
    assert resp.status_code == 200


@pytest.mark.usefixtures("skip_live_booking")
def test_hotel_search_and_prebook(api_client: httpx.Client, travel_dates: dict[str, str]):
    search = api_client.get(
        "/api/hotels/search",
        params={
            "city": "Mumbai",
            "check_in": travel_dates["check_in"],
            "check_out": travel_dates["check_out"],
            "guests": 2,
            "rooms": 1,
            "currency": "INR",
            "page": 1,
            "page_size": 10,
        },
    )
    search_data = assert_json(search, "hotel_search")
    assert search.status_code == 200 and search_data.get("ok", True)

    hotels = search_data.get("hotels") or search_data.get("results") or []
    assert hotels, "expected hotel results"
    hotel_id = hotels[0].get("id") or hotels[0].get("hotelId") or hotels[0].get("hotel_id")

    rates = api_client.get(
        f"/api/hotels/{hotel_id}/rates",
        params={
            "check_in": travel_dates["check_in"],
            "check_out": travel_dates["check_out"],
            "guests": 2,
            "rooms": 1,
            "currency": "INR",
        },
    )
    rates_data = assert_json(rates, "hotel_rates")
    offer_id = first_hotel_offer(rates_data)
    assert offer_id, "expected bookable offer"

    prebook = api_client.post(
        "/api/hotels/prebook",
        json={
            "offer_id": offer_id,
            "currency": "INR",
            "use_payment_sdk": True,
            "hotel_id": hotel_id,
            "check_in": travel_dates["check_in"],
            "check_out": travel_dates["check_out"],
            "guests": 2,
            "rooms": 1,
        },
    )
    prebook_data = assert_json(prebook, "hotel_prebook")
    assert prebook.status_code == 200 and prebook_data.get("ok")
    prebook_id = prebook_data.get("prebook_id") or (prebook_data.get("prebook") or {}).get("prebook_id")
    assert prebook_id


@pytest.mark.usefixtures("skip_live_booking", "supervisor_sandbox")
def test_hotel_book_smoke(api_client: httpx.Client, travel_dates: dict[str, str]):
    search = api_client.get(
        "/api/hotels/search",
        params={
            "city": "Mumbai",
            "check_in": travel_dates["check_in"],
            "check_out": travel_dates["check_out"],
            "guests": 2,
            "rooms": 1,
            "currency": "INR",
            "page_size": 5,
        },
    )
    hotels = (assert_json(search, "hotel_search").get("hotels") or [])[:1]
    if not hotels:
        pytest.skip("no hotel results")

    hotel_id = hotels[0].get("id") or hotels[0].get("hotelId")
    rates_data = assert_json(
        api_client.get(
            f"/api/hotels/{hotel_id}/rates",
            params={
                "check_in": travel_dates["check_in"],
                "check_out": travel_dates["check_out"],
                "guests": 2,
                "rooms": 1,
                "currency": "INR",
            },
        ),
        "hotel_rates",
    )
    offer_id = first_hotel_offer(rates_data)
    if not offer_id:
        pytest.skip("no offer")

    prebook_data = assert_json(
        api_client.post(
            "/api/hotels/prebook",
            json={
                "offer_id": offer_id,
                "currency": "INR",
                "use_payment_sdk": False,
                "hotel_id": hotel_id,
                "check_in": travel_dates["check_in"],
                "check_out": travel_dates["check_out"],
                "guests": 2,
                "rooms": 1,
            },
        ),
        "hotel_prebook",
    )
    prebook_inner = prebook_data.get("prebook") or {}
    prebook_id = prebook_data.get("prebook_id") or prebook_inner.get("prebook_id")
    if not prebook_inner.get("allow_mock_payment"):
        pytest.skip("sandbox mock payment unavailable")

    book_data = assert_json(
        api_client.post(
            "/api/hotels/book",
            json={
                "prebook_id": prebook_id,
                "holder": {
                    "firstName": "Audit",
                    "lastName": "Tester",
                    "email": CONTACT["email"],
                    "phone": CONTACT["phone_number"],
                },
                "guests": [
                    {
                        "occupancyNumber": 1,
                        "firstName": "Audit",
                        "lastName": "Tester",
                        "email": CONTACT["email"],
                    }
                ],
                "mock_payment": True,
                "payment_provider": "credit",
                "payment_id": f"pi_audit_{uuid.uuid4().hex[:12]}",
                "expected_amount": float(prebook_inner.get("price") or 0) or None,
            },
        ),
        "hotel_book",
    )
    skip_if_payment_gated(book_data, "hotel book")
    assert book_data.get("ok")

    booking_id = (book_data.get("booking") or book_data).get("booking_id")
    assert booking_id
    assert api_client.get(f"/api/hotels/bookings/{booking_id}").status_code == 200


@pytest.mark.usefixtures("skip_live_booking")
def test_flight_search_and_prebook(api_client: httpx.Client, travel_dates: dict[str, str]):
    session_id = str(uuid.uuid4())
    search_data = assert_json(
        api_client.post(
            "/api/flights/search",
            json={
                "origin": "BOM",
                "destination": "DEL",
                "depart_date": travel_dates["depart"],
                "adults": 1,
                "currency": "INR",
                "session_id": session_id,
            },
        ),
        "flight_search",
    )
    offers = search_data.get("offers") or search_data.get("flights") or []
    assert offers, "expected flight offers"

    offer = offers[0]
    select_data = assert_json(
        api_client.post(
            "/api/flights/select",
            json={
                "session_id": session_id,
                "offer_id": offer.get("offer_id") or offer.get("offerId"),
                "offer_index": offer.get("index", 0),
                "session_context": search_data.get("session_context"),
            },
        ),
        "flight_select",
    )

    prebook_data = assert_json(
        api_client.post(
            "/api/flights/prebook",
            json={
                "session_id": session_id,
                "passengers": [PASSENGER],
                "contact": CONTACT,
                "session_context": select_data.get("session_context"),
            },
        ),
        "flight_prebook",
    )
    assert prebook_data.get("ok", True)
    prebook_id = prebook_data.get("prebook_id") or (prebook_data.get("prebook") or {}).get("prebook_id")
    assert prebook_id


@pytest.mark.usefixtures("skip_live_booking", "supervisor_sandbox")
def test_flight_complete_smoke(api_client: httpx.Client, travel_dates: dict[str, str]):
    session_id = str(uuid.uuid4())
    search_data = assert_json(
        api_client.post(
            "/api/flights/search",
            json={
                "origin": "BOM",
                "destination": "DEL",
                "depart_date": travel_dates["depart"],
                "adults": 1,
                "currency": "INR",
                "session_id": session_id,
            },
        ),
        "flight_search",
    )
    offers = search_data.get("offers") or search_data.get("flights") or []
    if not offers:
        pytest.skip("no offers")

    offer = offers[0]
    select_data = assert_json(
        api_client.post(
            "/api/flights/select",
            json={
                "session_id": session_id,
                "offer_id": offer.get("offer_id") or offer.get("offerId"),
                "offer_index": offer.get("index", 0),
                "session_context": search_data.get("session_context"),
            },
        ),
        "flight_select",
    )
    prebook_data = assert_json(
        api_client.post(
            "/api/flights/prebook",
            json={
                "session_id": session_id,
                "passengers": [PASSENGER],
                "contact": CONTACT,
                "session_context": select_data.get("session_context"),
            },
        ),
        "flight_prebook",
    )
    prebook_inner = prebook_data.get("prebook") or prebook_data
    prebook_id = prebook_data.get("prebook_id") or prebook_inner.get("prebook_id")
    if not prebook_inner.get("allow_mock_payment"):
        pytest.skip("sandbox mock payment unavailable")

    complete_data = assert_json(
        api_client.post(
            "/api/flights/complete",
            json={
                "session_id": session_id,
                "prebook_id": prebook_id,
                "mock_payment": True,
                "payment_provider": "stripe",
                "payment_id": f"pi_audit_{uuid.uuid4().hex[:12]}",
                "expected_amount": float(prebook_inner.get("price") or 0) or None,
                "currency": "INR",
            },
        ),
        "flight_complete",
    )
    skip_if_payment_gated(complete_data, "flight complete")

    booking_id = (
        complete_data.get("booking_id")
        or (complete_data.get("booking") or {}).get("booking_id")
        or complete_data.get("booking_ref")
    )
    if not booking_id:
        pytest.skip("no booking id returned")
    assert api_client.get(f"/api/flights/bookings/{booking_id}").status_code == 200
