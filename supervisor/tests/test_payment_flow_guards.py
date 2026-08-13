"""Payment-flow security checks (no network / no LiveAPI).

Run: .venv/bin/python -m supervisor.tests.test_payment_flow_guards
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def test_mock_blocked_in_production():
    from supervisor.payment_guards import assert_mock_payment_allowed, mock_payment_allowed

    with patch.dict(os.environ, {"APP_ENV": "production", "ITINERO_ALLOW_MOCK_PAYMENT": "true"}, clear=False):
        assert mock_payment_allowed() is False
        assert assert_mock_payment_allowed(mock_payment=True) is not None


def test_flight_sandbox_ignores_sand_key_in_prod():
    from supervisor.flight_structured import _is_sandbox_app

    with patch.dict(
        os.environ,
        {"APP_ENV": "production", "LITEAPI_KEY": "sand_abc", "API_KEY": "sand_abc"},
        clear=False,
    ):
        assert _is_sandbox_app() is False


def test_hotel_book_rejects_bare_credit():
    async def _run():
        from supervisor.hotel_structured import structured_hotel_book

        with patch.dict(os.environ, {"APP_ENV": "production", "LITEAPI_KEY": "live_x"}, clear=False):
            with patch("supervisor.hotel_structured._api_key", return_value="live_x"):
                out = await structured_hotel_book(
                    prebook_id="pb_test",
                    holder={"firstName": "A", "lastName": "B", "email": "a@b.com"},
                    payment_provider="credit",
                    allow_agency_credit=False,
                )
        assert out.get("ok") is False
        assert out.get("error") == "payment_required"

    asyncio.run(_run())


def test_flight_complete_rejects_prebook_mismatch():
    async def _run():
        from supervisor.flight_structured import structured_complete

        session = {
            "session_id": "s1",
            "flight_context": {
                "prebook_id": "hold-session",
                "last_prebook": {"price": 100, "currency": "INR"},
            },
        }
        out = await structured_complete(
            session=session,
            prebook_id="hold-attacker",
            mock_payment=False,
            payment_provider="stripe",
            transaction_id="txn_x",
        )
        assert out.get("ok") is False
        assert out.get("error") == "prebook_mismatch"

    asyncio.run(_run())


def main() -> int:
    tests = [
        ("mock_prod", test_mock_blocked_in_production),
        ("sand_key_prod", test_flight_sandbox_ignores_sand_key_in_prod),
        ("hotel_credit", test_hotel_book_rejects_bare_credit),
        ("flight_mismatch", test_flight_complete_rejects_prebook_mismatch),
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
