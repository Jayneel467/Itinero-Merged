"""Payment routing — Itinero merchant settlement via Stripe only.

Hotel / flight inventory settlement stays on LiteAPI Payment SDK.
Razorpay is not supported.
"""

from __future__ import annotations

import os
from typing import Any

import httpx


def is_india_settlement(
    *,
    currency: str | None = None,
    country: str | None = None,
) -> bool:
    """Legacy helper — India detection only; settlement is always Stripe."""
    cur = (currency or "").strip().upper()
    cc = (country or "").strip().upper()
    if cc == "IN":
        return True
    if cur == "INR":
        return True
    return False


def itinero_provider_for(
    *,
    currency: str | None = None,
    country: str | None = None,
) -> str:
    """Always Stripe (Razorpay removed)."""
    return "stripe"


def _stripe_secret() -> str:
    return (
        (os.getenv("STRIPE_SECRET_KEY") or "")
        or (os.getenv("STRIPE_SECRET") or "")
        or (os.getenv("ITINERO_STRIPE_SECRET_KEY") or "")
    ).strip()


def _stripe_publishable() -> str:
    key = (
        (os.getenv("ITINERO_STRIPE_PUBLISHABLE_KEY") or "")
        or (os.getenv("STRIPE_PUBLISHABLE_KEY") or "")
        or (os.getenv("STRIPE_PK") or "")
    ).strip()
    return key if key.startswith("pk_") else ""


async def create_itinero_stripe_intent(
    *,
    amount: float,
    currency: str = "USD",
    email: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create a PaymentIntent on Itinero's Stripe account (world settlement)."""
    secret = _stripe_secret()
    if not secret:
        return {
            "ok": False,
            "error": "stripe_not_configured",
            "message": "Set STRIPE_SECRET_KEY for Itinero world payments.",
        }
    try:
        amt = float(amount)
    except (TypeError, ValueError):
        return {"ok": False, "error": "invalid_amount", "message": "Invalid amount."}
    if amt <= 0:
        return {"ok": False, "error": "invalid_amount", "message": "Amount must be positive."}

    cur = (currency or "USD").strip().upper()
    # Stripe minor units: most currencies *100; zero-decimal currencies stay as-is.
    zero_decimal = {
        "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
        "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
    }
    units = int(round(amt)) if cur in zero_decimal else int(round(amt * 100))
    if units < 1:
        return {"ok": False, "error": "invalid_amount", "message": "Amount too small."}

    data: dict[str, Any] = {
        "amount": str(units),
        "currency": cur.lower(),
        "automatic_payment_methods[enabled]": "true",
    }
    if email:
        data["receipt_email"] = email.strip()
    meta = metadata or {}
    for i, (k, v) in enumerate(list(meta.items())[:20]):
        data[f"metadata[{k}]"] = str(v)[:500]

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.post(
                "https://api.stripe.com/v1/payment_intents",
                data=data,
                auth=(secret, ""),
                headers={"Accept": "application/json"},
            )
        body = r.json() if r.content else {}
        if r.status_code >= 400:
            err = body.get("error") if isinstance(body.get("error"), dict) else {}
            return {
                "ok": False,
                "error": "stripe_intent_failed",
                "message": str(err.get("message") or f"Stripe intent failed ({r.status_code})."),
            }
        client_secret = body.get("client_secret")
        intent_id = body.get("id")
        if not client_secret or not intent_id:
            return {
                "ok": False,
                "error": "stripe_intent_incomplete",
                "message": "Stripe did not return a client secret.",
            }
        return {
            "ok": True,
            "provider": "stripe",
            "settlement": "itinero",
            "payment_intent_id": intent_id,
            "client_secret": client_secret,
            "publishable_key": _stripe_publishable() or None,
            "amount": amt,
            "currency": cur,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": "stripe_intent_error",
            "message": f"Stripe intent error ({type(exc).__name__}).",
        }


def is_itinero_merchant_payment(
    *,
    payment_id: str | None = None,
    payment_provider: str | None = None,
) -> bool:
    """True when the customer was charged on Itinero's Stripe account (pi_…).

    LiteAPI Payment SDK charges live on supplier Stripe and are refunded by LiteAPI cancel.
    Package (and any MoR) charges use Itinero Stripe PaymentIntents and need an explicit refund.
    """
    pid = str(payment_id or "").strip()
    prov = str(payment_provider or "").strip().lower()
    if pid.startswith("pi_"):
        return True
    return prov in {"itinero", "itinero_stripe"}


def customer_refund_rail(
    *,
    payment_id: str | None = None,
    payment_provider: str | None = None,
) -> str:
    """Which system refunds the traveller after cancel.

    Returns: itinero_stripe | liteapi | legacy_unsupported | none
    """
    pid = str(payment_id or "").strip()
    prov = str(payment_provider or "").strip().lower()
    if is_itinero_merchant_payment(payment_id=pid, payment_provider=prov):
        return "itinero_stripe"
    if pid.startswith("pay_") or prov == "razorpay":
        return "legacy_unsupported"
    if prov in {
        "",
        "stripe",
        "liteapi_sdk",
        "credit",
        "sandbox_mock",
        "transaction_id",
        "mock",
    }:
        return "liteapi"
    if not pid and not prov:
        return "none"
    return "liteapi"


async def refund_itinero_stripe_payment(
    *,
    payment_intent_id: str,
    amount: float | None = None,
    currency: str | None = None,
    reason: str = "requested_by_customer",
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Refund a succeeded Itinero Stripe PaymentIntent (full or partial)."""
    pi = (payment_intent_id or "").strip()
    if not pi or not pi.startswith("pi_"):
        return {
            "ok": False,
            "error": "invalid_payment_intent",
            "message": "Invalid Stripe payment intent id.",
        }
    secret = _stripe_secret()
    if not secret:
        return {
            "ok": False,
            "error": "stripe_not_configured",
            "message": "Set STRIPE_SECRET_KEY for Itinero refunds.",
        }

    data: dict[str, Any] = {"payment_intent": pi}
    if amount is not None:
        try:
            amt = float(amount)
        except (TypeError, ValueError):
            return {"ok": False, "error": "invalid_amount", "message": "Invalid refund amount."}
        if amt <= 0:
            return {"ok": False, "error": "invalid_amount", "message": "Refund amount must be positive."}
        cur = (currency or "INR").strip().upper()
        zero_decimal = {
            "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
            "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
        }
        units = int(round(amt)) if cur in zero_decimal else int(round(amt * 100))
        if units < 1:
            return {"ok": False, "error": "invalid_amount", "message": "Refund amount too small."}
        data["amount"] = str(units)
    if reason:
        # Stripe allows duplicate / fraudulent / requested_by_customer
        safe = reason if reason in {"duplicate", "fraudulent", "requested_by_customer"} else "requested_by_customer"
        data["reason"] = safe

    headers = {"Accept": "application/json"}
    if idempotency_key:
        headers["Idempotency-Key"] = str(idempotency_key)[:64]

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.post(
                "https://api.stripe.com/v1/refunds",
                data=data,
                auth=(secret, ""),
                headers=headers,
            )
        body = r.json() if r.content else {}
        if r.status_code >= 400:
            err = body.get("error") if isinstance(body.get("error"), dict) else {}
            code = str(err.get("code") or "")
            # Already fully refunded → treat as success for cancel idempotency.
            if code in {"charge_already_refunded"} or "already been refunded" in str(err.get("message") or "").lower():
                return {
                    "ok": True,
                    "skipped": True,
                    "reason": "already_refunded",
                    "provider": "itinero_stripe",
                    "payment_intent_id": pi,
                    "message": "Payment was already refunded on Stripe.",
                }
            return {
                "ok": False,
                "error": "stripe_refund_failed",
                "message": str(err.get("message") or f"Stripe refund failed ({r.status_code})."),
                "provider": "itinero_stripe",
                "payment_intent_id": pi,
            }
        refund_id = body.get("id")
        status = str(body.get("status") or "").lower()
        refunded_units = body.get("amount")
        cur = str(body.get("currency") or currency or "").upper()
        refund_amount = None
        if refunded_units is not None:
            zero_decimal = {
                "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
                "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
            }
            try:
                units = int(refunded_units)
                refund_amount = float(units) if cur in zero_decimal else units / 100.0
            except (TypeError, ValueError):
                refund_amount = None
        return {
            "ok": True,
            "provider": "itinero_stripe",
            "payment_intent_id": pi,
            "refund_id": refund_id,
            "status": status or "succeeded",
            "refund_amount": refund_amount,
            "currency": cur or None,
            "message": "Refund submitted to the original card via Stripe.",
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": "stripe_refund_error",
            "message": f"Stripe refund error ({type(exc).__name__}).",
            "provider": "itinero_stripe",
            "payment_intent_id": pi,
        }


async def maybe_refund_customer_after_cancel(
    *,
    payment_id: str | None = None,
    payment_provider: str | None = None,
    amount: float | None = None,
    currency: str | None = None,
    booking_id: str | None = None,
) -> dict[str, Any]:
    """Refund traveller money when cancel does not go through LiteAPI auto-refund."""
    rail = customer_refund_rail(payment_id=payment_id, payment_provider=payment_provider)
    if rail == "itinero_stripe":
        return await refund_itinero_stripe_payment(
            payment_intent_id=str(payment_id or "").strip(),
            amount=amount,
            currency=currency,
            idempotency_key=f"itinero-cancel-{booking_id or payment_id}"[:64],
        )
    if rail == "legacy_unsupported":
        return {
            "ok": False,
            "skipped": True,
            "reason": "legacy_unsupported",
            "message": "Legacy payment cannot be refunded automatically. Contact support.",
        }
    return {
        "ok": True,
        "skipped": True,
        "reason": rail,
        "message": "Customer refund is handled when the booking cancel completes."
        if rail == "liteapi"
        else "No customer payment to refund.",
    }


async def verify_itinero_stripe_payment(
    *,
    payment_intent_id: str,
    expected_amount: float | None = None,
    expected_currency: str | None = None,
) -> dict[str, Any]:
    """Confirm an Itinero Stripe PaymentIntent succeeded before package confirm."""
    pi = (payment_intent_id or "").strip()
    if not pi or not pi.startswith("pi_"):
        return {
            "ok": False,
            "error": "invalid_payment_intent",
            "message": "Invalid Stripe payment intent id.",
        }
    secret = _stripe_secret()
    if not secret:
        return {
            "ok": False,
            "error": "stripe_not_configured",
            "message": "Set STRIPE_SECRET_KEY for Itinero world payments.",
        }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(
                f"https://api.stripe.com/v1/payment_intents/{pi}",
                auth=(secret, ""),
                headers={"Accept": "application/json"},
            )
        body = r.json() if r.content else {}
        if r.status_code >= 400:
            err = body.get("error") if isinstance(body.get("error"), dict) else {}
            return {
                "ok": False,
                "error": "stripe_lookup_failed",
                "message": str(err.get("message") or f"Could not verify Stripe payment ({r.status_code})."),
            }
        status = str(body.get("status") or "").lower()
        if status not in {"succeeded", "processing"}:
            return {
                "ok": False,
                "error": "payment_not_succeeded",
                "message": f"Stripe payment status is '{status or 'unknown'}'.",
            }
        cur = str(body.get("currency") or "").upper()
        want_cur = (expected_currency or "").strip().upper()
        if want_cur and cur and cur != want_cur:
            return {
                "ok": False,
                "error": "currency_mismatch",
                "message": f"Payment currency {cur} does not match {want_cur}.",
            }
        paid_units = body.get("amount_received") or body.get("amount")
        if expected_amount is not None and paid_units is not None:
            zero_decimal = {
                "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
                "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
            }
            try:
                expected_units = (
                    int(round(float(expected_amount)))
                    if cur in zero_decimal
                    else int(round(float(expected_amount) * 100))
                )
                paid = int(paid_units)
                if abs(paid - expected_units) > 100:
                    return {
                        "ok": False,
                        "error": "amount_mismatch",
                        "message": (
                            f"Paid amount does not match Itinero share "
                            f"(expected ≈ {expected_units}, got {paid})."
                        ),
                    }
            except (TypeError, ValueError):
                pass
        return {
            "ok": True,
            "payment": {
                "id": pi,
                "status": status,
                "amount": paid_units,
                "currency": cur or want_cur,
            },
        }
    except Exception:
        return {
            "ok": False,
            "error": "stripe_verify_error",
            "message": "Stripe verification failed.",
        }
