"""LiteAPI whitelabel / CMI THIRD_PARTY payment JWT for merchant-of-record checkout."""

from __future__ import annotations

import os
import time


def _private_key_pem() -> str:
    raw = (
        os.getenv("LITEAPI_WL_PAYMENT_PRIVATE_KEY")
        or os.getenv("LITEAPI_CMI_PAYMENT_PRIVATE_KEY")
        or ""
    ).strip()
    if not raw:
        raise ValueError(
            "LITEAPI_WL_PAYMENT_PRIVATE_KEY is not set. "
            "In the Nuitee Connect dashboard, enable payment bypass + whitelabel/CMI "
            "and paste the RSA private key PEM here (\\n escapes are fine)."
        )
    return raw.replace("\\n", "\n")


def build_third_party_payment_token(
    *,
    prebook_id: str,
    gateway_transaction_id: str,
    ttl_seconds: int = 300,
) -> str:
    """RSA-signed JWT for POST /flights/bookings payment.method=THIRD_PARTY."""
    pid = (prebook_id or "").strip()
    txn = (gateway_transaction_id or "").strip()
    if not pid:
        raise ValueError("prebook_id is required for THIRD_PARTY payment token.")
    if not txn:
        raise ValueError("gateway_transaction_id is required for THIRD_PARTY payment token.")

    try:
        import jwt
    except ImportError as exc:
        raise ValueError("PyJWT is required for LiteAPI THIRD_PARTY payments.") from exc

    now = int(time.time())
    payload = {
        "prebookId": pid,
        "transactionId": txn,
        "iat": now,
        "exp": now + max(60, ttl_seconds),
    }
    return jwt.encode(payload, _private_key_pem(), algorithm="RS256")
