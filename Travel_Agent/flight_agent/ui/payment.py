"""Payment UI is owned by backend checkout — flight agent does not collect cards."""

from __future__ import annotations

from typing import Any

from flight_agent.models.agent import SessionContext


def should_show_payment_panel(session: SessionContext) -> bool:
    """Flight agent never mounts Stripe / Payment SDK."""
    return False


def render_payment_panel(session: SessionContext) -> None:
    """No-op: payment is handled by the backend team."""
    return


def payment_panel_snapshot(session: SessionContext) -> dict[str, Any]:
    return {
        "show": False,
        "payment_captured": session.payment_captured,
        "has_secret": bool(session.secret_key),
        "has_publishable": bool(session.publishable_key),
        "transaction_id": (session.transaction_id or "")[:16],
        "handoff": "backend_checkout",
    }
