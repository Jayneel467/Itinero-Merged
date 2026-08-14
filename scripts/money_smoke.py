#!/usr/bin/env python3
"""Live money smoke — sandbox hotel book, flight ticket, package Stripe intent, Plus checkout.

Usage (from repo root, supervisor on :8000):

  python scripts/money_smoke.py
  python scripts/money_smoke.py --base http://127.0.0.1:8000 --live-book

`--live-book` actually calls hotel book + flight complete with mock_payment
(sandbox only). Without it, stops after prebook + Plus Checkout session +
package PaymentIntent.

Plus subscribe still needs a signed-in browser click with 4242… after this
prints a Checkout URL (or create a test user token via OTP).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

CONTACT = {
    "first_name": "Audit",
    "last_name": "Tester",
    "email": "audit.smoke@example.com",
    "phone_country_code": "91",
    "phone_number": "9812345678",
}
PASSENGER = {
    "first_name": "Audit",
    "last_name": "Tester",
    "birthday": "1995-03-22",
    "gender": "M",
    "nationality": "IN",
    "document_type": "passport",
    "document_number": "P1234567",
    "document_expiry": "2030-12-31",
    "document_issue_country": "IN",
    "passenger_type": 0,
}


def _dates():
    check_in = date.today() + timedelta(days=21)
    check_out = check_in + timedelta(days=2)
    return {
        "check_in": check_in.isoformat(),
        "check_out": check_out.isoformat(),
        "depart": check_in.isoformat(),
    }


def _first_offer(rates: dict) -> str | None:
    for room in rates.get("rooms") or rates.get("offers") or []:
        for offer in room.get("offers") or room.get("rates") or [room]:
            oid = offer.get("offerId") or offer.get("offer_id") or offer.get("id")
            if oid:
                return str(oid)
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=os.getenv("ITINERO_API_BASE", "http://127.0.0.1:8000"))
    parser.add_argument("--live-book", action="store_true", help="Complete sandbox hotel+flight book")
    parser.add_argument("--token", default=os.getenv("ITINERO_SMOKE_TOKEN", ""), help="Bearer for Plus checkout")
    args = parser.parse_args()
    base = args.base.rstrip("/")
    dates = _dates()
    report: dict = {"ok": True, "steps": {}}

    with httpx.Client(base_url=base, timeout=90.0) as client:
        live = client.get("/api/health/live")
        ready = client.get("/api/health/ready")
        report["steps"]["health"] = {
            "live": live.status_code,
            "ready": ready.status_code,
            "ready_body": ready.json() if ready.headers.get("content-type", "").startswith("application/json") else ready.text[:200],
        }
        if live.status_code != 200:
            report["ok"] = False
            print(json.dumps(report, indent=2, default=str))
            return 1

        # ── Hotel prebook (+ optional sandbox book) ───────────────────
        search = client.get(
            "/api/hotels/search",
            params={
                "city": "Mumbai",
                "check_in": dates["check_in"],
                "check_out": dates["check_out"],
                "guests": 2,
                "rooms": 1,
                "currency": "INR",
                "page_size": 5,
            },
        )
        hotels = (search.json() or {}).get("hotels") or []
        hotel_id = (hotels[0].get("id") or hotels[0].get("hotelId")) if hotels else None
        offer_id = None
        prebook_id = None
        if hotel_id:
            rates = client.get(
                f"/api/hotels/{hotel_id}/rates",
                params={
                    "check_in": dates["check_in"],
                    "check_out": dates["check_out"],
                    "guests": 2,
                    "rooms": 1,
                    "currency": "INR",
                },
            ).json()
            offer_id = _first_offer(rates or {})
        if offer_id:
            pb = client.post(
                "/api/hotels/prebook",
                json={
                    "offer_id": offer_id,
                    "currency": "INR",
                    "use_payment_sdk": False,
                    "hotel_id": hotel_id,
                    "check_in": dates["check_in"],
                    "check_out": dates["check_out"],
                    "guests": 2,
                    "rooms": 1,
                },
            ).json()
            inner = pb.get("prebook") or pb
            prebook_id = pb.get("prebook_id") or inner.get("prebook_id")
            report["steps"]["hotel_prebook"] = {"ok": bool(prebook_id), "prebook_id": prebook_id, "mock": inner.get("allow_mock_payment")}
            if args.live_book and prebook_id and inner.get("allow_mock_payment"):
                book = client.post(
                    "/api/hotels/book",
                    json={
                        "prebook_id": prebook_id,
                        "holder": {
                            "firstName": CONTACT["first_name"],
                            "lastName": CONTACT["last_name"],
                            "email": CONTACT["email"],
                            "phone": CONTACT["phone_number"],
                        },
                        "guests": [
                            {
                                "occupancyNumber": 1,
                                "firstName": CONTACT["first_name"],
                                "lastName": CONTACT["last_name"],
                                "email": CONTACT["email"],
                            }
                        ],
                        "mock_payment": True,
                        "payment_provider": "credit",
                        "payment_id": f"pi_smoke_{uuid.uuid4().hex[:12]}",
                        "expected_amount": float(inner.get("price") or 0) or None,
                    },
                ).json()
                report["steps"]["hotel_book"] = {
                    "ok": bool(book.get("ok")),
                    "booking_id": (book.get("booking") or book).get("booking_id"),
                    "error": book.get("error") or book.get("message"),
                }
            elif args.live_book:
                report["steps"]["hotel_book"] = {"ok": False, "error": "mock_payment_unavailable"}
        else:
            report["steps"]["hotel_prebook"] = {"ok": False, "error": "no_offer"}
            report["ok"] = False

        # ── Flight prebook (+ optional sandbox complete) ──────────────
        session_id = str(uuid.uuid4())
        search_f = client.post(
            "/api/flights/search",
            json={
                "origin": "BOM",
                "destination": "DEL",
                "depart_date": dates["depart"],
                "adults": 1,
                "currency": "INR",
                "session_id": session_id,
            },
        ).json()
        offers = search_f.get("offers") or search_f.get("flights") or []
        if offers:
            offer = offers[0]
            select = client.post(
                "/api/flights/select",
                json={
                    "session_id": session_id,
                    "offer_id": offer.get("offer_id") or offer.get("offerId"),
                    "offer_index": offer.get("index", 0),
                    "session_context": search_f.get("session_context"),
                },
            ).json()
            pre = client.post(
                "/api/flights/prebook",
                json={
                    "session_id": session_id,
                    "passengers": [PASSENGER],
                    "contact": CONTACT,
                    "session_context": select.get("session_context"),
                },
            ).json()
            inner = pre.get("prebook") or pre
            f_pre = pre.get("prebook_id") or inner.get("prebook_id")
            report["steps"]["flight_prebook"] = {"ok": bool(f_pre), "prebook_id": f_pre, "mock": inner.get("allow_mock_payment")}
            if args.live_book and f_pre and inner.get("allow_mock_payment"):
                done = client.post(
                    "/api/flights/complete",
                    json={
                        "session_id": session_id,
                        "prebook_id": f_pre,
                        "mock_payment": True,
                        "payment_provider": "stripe",
                        "payment_id": f"pi_smoke_{uuid.uuid4().hex[:12]}",
                        "expected_amount": float(inner.get("price") or 0) or None,
                        "currency": "INR",
                    },
                ).json()
                report["steps"]["flight_ticket"] = {
                    "ok": bool(done.get("ok")),
                    "booking_id": done.get("booking_id")
                    or (done.get("booking") or {}).get("booking_id")
                    or done.get("booking_ref"),
                    "error": done.get("error") or done.get("message"),
                }
            elif args.live_book:
                report["steps"]["flight_ticket"] = {"ok": False, "error": "mock_payment_unavailable"}
        else:
            report["steps"]["flight_prebook"] = {"ok": False, "error": "no_offers"}
            report["ok"] = False

        # ── Package Stripe charge (Itinero PaymentIntent) ─────────────
        pkgs = client.get("/api/packages", params={"limit": 1}).json()
        pkg_id = None
        rows = pkgs.get("packages") or pkgs.get("items") or []
        if rows:
            pkg_id = rows[0].get("id") or rows[0].get("package_id") or rows[0].get("slug")
        intent = client.post(
            "/api/packages/itinero-payment-intent",
            json={
                "amount": 49900,
                "currency": "INR",
                "email": CONTACT["email"],
                "package_id": pkg_id or "smoke-package",
            },
        )
        intent_data = intent.json() if intent.headers.get("content-type", "").startswith("application/json") else {"raw": intent.text[:300]}
        report["steps"]["package_stripe"] = {
            "ok": intent.status_code < 400 and bool(intent_data.get("ok") or intent_data.get("client_secret") or intent_data.get("id")),
            "status": intent.status_code,
            "id": intent_data.get("id") or (intent_data.get("paymentIntent") or {}).get("id"),
            "error": intent_data.get("detail") or intent_data.get("message") or intent_data.get("error"),
        }
        if not report["steps"]["package_stripe"]["ok"]:
            report["ok"] = False

        # ── Plus subscribe Checkout (4242… in browser) ────────────────
        headers = {"Authorization": f"Bearer {args.token}"} if args.token else {}
        plus = client.post(
            "/api/billing/checkout",
            json={"interval": "month", "currency": "INR"},
            headers=headers,
        )
        plus_data = plus.json() if plus.headers.get("content-type", "").startswith("application/json") else {"raw": plus.text[:300]}
        report["steps"]["plus_checkout"] = {
            "ok": plus.status_code == 200 and bool(plus_data.get("url") or plus_data.get("id")),
            "status": plus.status_code,
            "url": plus_data.get("url"),
            "session_id": plus_data.get("id") or plus_data.get("session_id"),
            "error": plus_data.get("detail") or plus_data.get("message") or plus_data.get("error"),
            "hint": "Open url and pay with 4242… while signed in. Prod Plus needs STRIPE_WEBHOOK_SECRET.",
        }
        if plus.status_code == 401:
            report["steps"]["plus_checkout"]["hint"] = (
                "Pass --token itn_… (signed-in session) then open Checkout URL with test card 4242."
            )

        plans = client.get("/api/billing/plans?currency=INR")
        report["steps"]["plus_plans"] = {
            "ok": plans.status_code == 200,
            "configured": (plans.json() or {}).get("billingConfigured") if plans.status_code == 200 else None,
        }

    print(json.dumps(report, indent=2, default=str))
    hotel_ok = report["steps"].get("hotel_prebook", {}).get("ok") or report["steps"].get("hotel_book", {}).get("ok")
    flight_ok = report["steps"].get("flight_prebook", {}).get("ok") or report["steps"].get("flight_ticket", {}).get("ok")
    pkg_ok = report["steps"].get("package_stripe", {}).get("ok")
    plus_ok = report["steps"].get("plus_checkout", {}).get("ok") or report["steps"].get("plus_plans", {}).get("ok")
    return 0 if hotel_ok and flight_ok and pkg_ok and plus_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
