"""Dual Stripe rails — LiteAPI Payment SDK vs Itinero merchant Stripe.

Run: .venv/bin/python -m supervisor.tests.test_dual_stripe_rails
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def test_refund_rail_detection():
    from supervisor.payment_routing import customer_refund_rail, is_itinero_merchant_payment

    assert is_itinero_merchant_payment(payment_id="pi_abc") is True
    assert is_itinero_merchant_payment(payment_provider="itinero_stripe") is True
    assert is_itinero_merchant_payment(payment_id="txn_x", payment_provider="stripe") is False
    assert customer_refund_rail(payment_id="pi_x") == "itinero_stripe"
    assert customer_refund_rail(payment_provider="liteapi_sdk") == "liteapi"
    assert customer_refund_rail(payment_provider="stripe") == "liteapi"
    assert customer_refund_rail(payment_id="pay_legacy") == "legacy_unsupported"


def test_itinero_stripe_refund_posts_to_stripe():
    async def _run():
        from supervisor.payment_routing import refund_itinero_stripe_payment

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{"id":"re_1","status":"succeeded","amount":50000,"currency":"inr"}'
        mock_resp.json.return_value = {
            "id": "re_1",
            "status": "succeeded",
            "amount": 50000,
            "currency": "inr",
        }

        with patch.dict(os.environ, {"STRIPE_SECRET_KEY": "sk_test_x"}, clear=False):
            with patch("httpx.AsyncClient") as client_cls:
                client = AsyncMock()
                client.__aenter__.return_value = client
                client.__aexit__.return_value = None
                client.post = AsyncMock(return_value=mock_resp)
                client_cls.return_value = client
                out = await refund_itinero_stripe_payment(
                    payment_intent_id="pi_test123",
                    amount=500.0,
                    currency="INR",
                    idempotency_key="itinero-cancel-pkg1",
                )
        assert out.get("ok") is True
        assert out.get("refund_id") == "re_1"
        assert out.get("provider") == "itinero_stripe"
        assert abs(float(out.get("refund_amount") or 0) - 500.0) < 0.01
        args, kwargs = client.post.call_args
        assert args[0] == "https://api.stripe.com/v1/refunds"
        assert kwargs["data"]["payment_intent"] == "pi_test123"

    asyncio.run(_run())


def test_hotel_cancel_itinero_stripe_refunds_merchant():
    async def _run():
        from supervisor.hotel_structured import structured_hotel_cancel_booking

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{"data":{"bookingId":"hb1","status":"CANCELLED"}}'
        mock_resp.json.return_value = {
            "data": {"bookingId": "hb1", "status": "CANCELLED", "currency": "INR"}
        }

        with patch("supervisor.hotel_structured._api_key", return_value="live_x"):
            with patch("httpx.AsyncClient") as client_cls:
                client = AsyncMock()
                client.__aenter__.return_value = client
                client.__aexit__.return_value = None
                client.put = AsyncMock(return_value=mock_resp)
                client_cls.return_value = client
                with patch(
                    "supervisor.payment_routing.refund_itinero_stripe_payment",
                    new_callable=AsyncMock,
                ) as refund:
                    refund.return_value = {
                        "ok": True,
                        "provider": "itinero_stripe",
                        "refund_id": "re_x",
                        "refund_amount": 1200.0,
                        "currency": "INR",
                    }
                    out = await structured_hotel_cancel_booking(
                        booking_id="hb1",
                        payment_id="pi_package",
                        payment_provider="itinero_stripe",
                        expected_amount=1200.0,
                    )
        assert out.get("ok") is True
        assert out["cancellation"]["refund_rail"] == "itinero_stripe"
        assert out["cancellation"]["liteapi_auto_refund"] is False
        assert out.get("itinero_stripe_refund", {}).get("ok") is True
        refund.assert_awaited()

    asyncio.run(_run())


def test_hotel_cancel_liteapi_sdk_skips_itinero_refund():
    async def _run():
        from supervisor.hotel_structured import structured_hotel_cancel_booking

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{"data":{"bookingId":"hb2","status":"CANCELLED","refund_amount":900}}'
        mock_resp.json.return_value = {
            "data": {
                "bookingId": "hb2",
                "status": "CANCELLED",
                "currency": "INR",
                "refund_amount": 900,
            }
        }

        with patch("supervisor.hotel_structured._api_key", return_value="live_x"):
            with patch("httpx.AsyncClient") as client_cls:
                client = AsyncMock()
                client.__aenter__.return_value = client
                client.__aexit__.return_value = None
                client.put = AsyncMock(return_value=mock_resp)
                client_cls.return_value = client
                with patch(
                    "supervisor.payment_routing.refund_itinero_stripe_payment",
                    new_callable=AsyncMock,
                ) as refund:
                    out = await structured_hotel_cancel_booking(
                        booking_id="hb2",
                        payment_id=None,
                        payment_provider="liteapi_sdk",
                    )
        assert out.get("ok") is True
        assert out["cancellation"]["refund_rail"] == "liteapi"
        assert out["cancellation"]["liteapi_auto_refund"] is True
        refund.assert_not_called()

    asyncio.run(_run())


def test_flight_cancel_itinero_stripe_refunds_when_not_pending():
    async def _run():
        from supervisor.flight_structured import structured_flight_cancel_booking

        travel_agent = _ROOT / "Travel_Agent"
        if str(travel_agent) not in sys.path:
            sys.path.insert(0, str(travel_agent))

        mock_svc = MagicMock()
        mock_svc.cancel_booking = AsyncMock(
            return_value={
                "cancelled": True,
                "pending": False,
                "status": "CANCELLED",
                "currency": "INR",
                "refund_amount": None,
                "message": "Cancelled",
            }
        )
        mock_svc.close = AsyncMock()

        with patch(
            "flight_agent.services.flight_service.FlightService",
            return_value=mock_svc,
        ):
            with patch(
                "supervisor.payment_routing.refund_itinero_stripe_payment",
                new_callable=AsyncMock,
            ) as refund:
                refund.return_value = {
                    "ok": True,
                    "provider": "itinero_stripe",
                    "refund_id": "re_f",
                    "refund_amount": 4500.0,
                    "currency": "INR",
                }
                out = await structured_flight_cancel_booking(
                    booking_id="fb1",
                    payment_id="pi_flight_pkg",
                    expected_amount=4500.0,
                    payment_provider="itinero_stripe",
                )
        assert out.get("ok") is True
        assert out["cancellation"]["refund_rail"] == "itinero_stripe"
        assert out.get("itinero_stripe_refund", {}).get("ok") is True
        refund.assert_awaited()

    asyncio.run(_run())


def test_package_cancel_refunds_once():
    async def _run():
        from supervisor import packages_structured as ps

        record = {
            "bookingId": "PKG-TEST1",
            "mode": "booked",
            "guest": {"email": "a@b.com"},
            "payment": {
                "currency": "INR",
                "totalCharged": 15000,
                "customer": {
                    "provider": "itinero_stripe",
                    "paymentId": "pi_pkg1",
                    "amount": 15000,
                },
                "hotel": {"amount": 10000, "provider": "liteapi_credit"},
                "flight": {"amount": 4000, "provider": "liteapi_credit"},
                "margin": {"amount": 1000, "provider": "itinero_stripe"},
            },
            "stay": {"liteapi": {"bookingId": "hotel-uuid"}, "total": 10000},
            "flightBooking": {"booking_id": "flight-uuid", "price": 4000},
        }

        with patch.object(ps, "get_package_booking", return_value={"ok": True, "booking": record}):
            with patch.object(ps, "_update_booking") as upd:
                with patch.object(
                    ps,
                    "_refresh_inventory_settlement",
                    new_callable=AsyncMock,
                ) as refresh:
                    async def _passthrough(**kwargs):
                        return kwargs.get("hotel_cancel"), kwargs.get("flight_cancel")

                    refresh.side_effect = _passthrough
                    with patch(
                        "supervisor.hotel_structured.structured_hotel_cancel_booking",
                        new_callable=AsyncMock,
                    ) as hcancel:
                        # Settled non-refundable hotel (explicit refund_amount 0)
                        hcancel.return_value = {
                            "ok": True,
                            "cancelled": True,
                            "pending": False,
                            "message": "Stay cancelled.",
                            "cancellation": {
                                "status": "CANCELLED",
                                "cancellation_fee": 10000,
                                "refund_amount": 0,
                                "currency": "INR",
                            },
                            "booking": {
                                "status": "CANCELLED",
                                "cancellation_fee": 10000,
                                "refund_amount": 0,
                            },
                        }
                        with patch(
                            "supervisor.flight_structured.structured_flight_cancel_booking",
                            new_callable=AsyncMock,
                        ) as fcancel:
                            # Settled flight refund confirmed by supplier
                            fcancel.return_value = {
                                "ok": True,
                                "cancelled": True,
                                "pending": False,
                                "message": "Flight cancelled.",
                                "cancellation": {
                                    "status": "CANCELLED",
                                    "cancellation_fee": 500,
                                    "refund_amount": 3500,
                                    "currency": "INR",
                                },
                            }
                            with patch(
                                "supervisor.payment_routing.maybe_refund_customer_after_cancel",
                                new_callable=AsyncMock,
                            ) as refund:
                                refund.return_value = {
                                    "ok": True,
                                    "provider": "itinero_stripe",
                                    "refund_amount": 4500,
                                    "currency": "INR",
                                }
                                out = await ps.cancel_package(
                                    booking_id="PKG-TEST1",
                                    email="a@b.com",
                                )
        assert out.get("ok") is True
        assert out.get("awaiting_supplier_funds") is False
        assert out["cancellation"]["refund_rail"] == "itinero_stripe"
        # hotel 0 + flight 3500 + margin 1000 = 4500 — NOT full 15000
        assert refund.await_args.kwargs.get("amount") == 4500.0
        assert out["refund_breakdown"]["hotel_refund"] == 0.0
        assert out["refund_breakdown"]["flight_refund"] == 3500.0
        assert out["refund_breakdown"]["margin_refund"] == 1000.0
        assert out["refund_breakdown"]["customer_refund"] == 4500.0
        assert hcancel.await_args.kwargs.get("payment_id") in (None, "")
        assert fcancel.await_args.kwargs.get("payment_id") in (None, "")
        refund.assert_awaited_once()
        upd.assert_called_once()

    asyncio.run(_run())


def test_package_holds_refund_until_supplier_settles():
    async def _run():
        from supervisor import packages_structured as ps

        record = {
            "bookingId": "PKG-WAIT",
            "mode": "booked",
            "guest": {"email": "a@b.com"},
            "payment": {
                "currency": "INR",
                "totalCharged": 10000,
                "customer": {"provider": "itinero_stripe", "paymentId": "pi_wait", "amount": 10000},
                "hotel": {"amount": 9000},
                "margin": {"amount": 1000},
            },
            "stay": {"liteapi": {"bookingId": "hotel-wait"}, "total": 9000},
        }

        with patch.object(ps, "get_package_booking", return_value={"ok": True, "booking": record}):
            with patch.object(ps, "_update_booking"):
                with patch.object(
                    ps,
                    "_refresh_inventory_settlement",
                    new_callable=AsyncMock,
                ) as refresh:
                    async def _passthrough(**kwargs):
                        return kwargs.get("hotel_cancel"), kwargs.get("flight_cancel")

                    refresh.side_effect = _passthrough
                    with patch(
                        "supervisor.hotel_structured.structured_hotel_cancel_booking",
                        new_callable=AsyncMock,
                    ) as hcancel:
                        # Cancel accepted but airline/hotel refund not finalized yet
                        hcancel.return_value = {
                            "ok": True,
                            "pending": True,
                            "cancelled": False,
                            "cancellation": {"cancellation_fee": 0},
                        }
                        with patch(
                            "supervisor.payment_routing.maybe_refund_customer_after_cancel",
                            new_callable=AsyncMock,
                        ) as refund:
                            out = await ps.cancel_package(booking_id="PKG-WAIT", email="a@b.com")
        assert out.get("awaiting_supplier_funds") is True
        assert out["refund_breakdown"]["customer_refund"] == 0.0
        assert out["refund_breakdown"]["margin_refund"] == 0.0
        refund.assert_not_called()
        assert out["booking"]["mode"] == "awaiting_supplier_refund"

    asyncio.run(_run())


def test_package_refund_slice_helpers():
    from supervisor.packages_structured import _inventory_refund_slice, _supplier_funds_settled

    amt, meta = _inventory_refund_slice(
        {
            "ok": True,
            "cancelled": True,
            "pending": False,
            "cancellation": {"refund_amount": 0, "cancellation_fee": 9000, "status": "CANCELLED"},
        },
        9000.0,
    )
    assert amt == 0.0
    assert meta["funds_settled"] is True
    assert meta["reason"] == "supplier_funds_received"

    # Fee-only estimate without finalized refund_amount must NOT pay out yet
    amt2, meta2 = _inventory_refund_slice(
        {
            "ok": True,
            "cancelled": True,
            "pending": False,
            "cancellation": {"cancellation_fee": 200, "status": "CANCELLED"},
        },
        5000.0,
    )
    assert amt2 == 0.0
    assert meta2["awaiting_supplier_funds"] is True
    assert meta2.get("pending_estimate") == 4800.0

    amt3, _ = _inventory_refund_slice({"ok": True, "pending": True}, 4000.0)
    assert amt3 == 0.0

    assert _supplier_funds_settled(
        {"ok": True, "pending": False, "cancellation": {"refund_amount": 100}}
    )
    assert not _supplier_funds_settled(
        {"ok": True, "pending": False, "cancellation": {"cancellation_fee": 10}}
    )


def main() -> int:
    tests = [
        ("rail_detect", test_refund_rail_detection),
        ("stripe_refund_api", test_itinero_stripe_refund_posts_to_stripe),
        ("hotel_itinero_refund", test_hotel_cancel_itinero_stripe_refunds_merchant),
        ("hotel_liteapi_skip", test_hotel_cancel_liteapi_sdk_skips_itinero_refund),
        ("flight_itinero_refund", test_flight_cancel_itinero_stripe_refunds_when_not_pending),
        ("package_cancel_once", test_package_cancel_refunds_once),
        ("package_holds_until_settle", test_package_holds_refund_until_supplier_settles),
        ("package_refund_slices", test_package_refund_slice_helpers),
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
