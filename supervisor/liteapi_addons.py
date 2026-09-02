"""LiteAPI hotel add-ons — Uber vouchers + eSimply eSIM (prebook addons array)."""

from __future__ import annotations

import os
from typing import Any

import httpx

_LITEAPI_BASE = "https://api.liteapi.travel/v3.0"
_UBER_VALUES_USD = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]


def _api_key() -> str:
    return (
        (os.getenv("API_KEY") or "")
        or (os.getenv("LITEAPI_API_KEY") or "")
        or (os.getenv("LITEAPI_KEY") or "")
    ).strip()


def uber_addon(*, value_usd: int) -> dict[str, Any] | None:
    try:
        val = int(value_usd)
    except (TypeError, ValueError):
        return None
    if val not in _UBER_VALUES_USD:
        return None
    return {"addon": "uber", "value": val, "currency": "USD"}


def esim_addon(
    *,
    package_id: int,
    destination_code: str,
    calculated_price: float,
    start_date: str,
    end_date: str,
) -> dict[str, Any] | None:
    cc = (destination_code or "").strip().upper()[:2]
    if not cc or len(cc) != 2:
        return None
    try:
        pid = int(package_id)
        price = float(calculated_price)
    except (TypeError, ValueError):
        return None
    if price <= 0:
        return None
    sd = (start_date or "")[:10]
    ed = (end_date or "")[:10]
    if not sd or not ed:
        return None
    return {
        "addon": "esimply",
        "value": round(price, 2),
        "currency": "USD",
        "addonDetails": {
            "package_id": pid,
            "destination_code": cc,
            "start_date": sd,
            "end_date": ed,
        },
    }


def normalize_addons(raw: list[Any] | None) -> list[dict[str, Any]]:
    """Build LiteAPI addons[] from frontend selection payloads."""
    out: list[dict[str, Any]] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("type") or item.get("addon") or "").strip().lower()
        if kind == "uber":
            row = uber_addon(value_usd=int(item.get("valueUsd") or item.get("value") or 0))
            if row:
                out.append(row)
        elif kind in {"esim", "esimply"}:
            row = esim_addon(
                package_id=int(item.get("packageId") or item.get("package_id") or 0),
                destination_code=str(item.get("destinationCode") or item.get("destination_code") or ""),
                calculated_price=float(
                    item.get("calculatedPrice")
                    or item.get("calculated_price")
                    or item.get("priceUsd")
                    or item.get("valueUsd")
                    or item.get("value")
                    or item.get("price")
                    or 0
                ),
                start_date=str(item.get("startDate") or item.get("start_date") or ""),
                end_date=str(item.get("endDate") or item.get("end_date") or ""),
            )
            if row:
                out.append(row)
    return out


async def fetch_esim_packages(*, country_code: str) -> dict[str, Any]:
    key = _api_key()
    cc = (country_code or "").strip().upper()[:2]
    if not key:
        return {"ok": False, "error": "missing_liteapi_key", "packages": []}
    if len(cc) != 2:
        return {"ok": False, "error": "invalid_country", "packages": []}
    url = f"{_LITEAPI_BASE}/addons/esimply/packages/{cc}"
    headers = {"Accept": "application/json", "X-API-Key": key}
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
        body = r.json() if r.content else {}
    except Exception as exc:
        return {"ok": False, "error": "fetch_failed", "message": str(exc), "packages": []}
    if r.status_code >= 400:
        return {
            "ok": False,
            "error": "upstream_error",
            "message": str(body.get("message") or body.get("error") or r.status_code),
            "packages": [],
        }
    packages = body.get("data") if isinstance(body, dict) else []
    if not isinstance(packages, list):
        packages = []
    return {
        "ok": True,
        "countryCode": cc,
        "packages": packages,
        "currency": "USD",
        "provider": "esimply",
    }


def normalize_booking_addons(booking: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Extract add-on voucher / eSIM details from LiteAPI book response."""
    if not isinstance(booking, dict):
        return []
    rows = booking.get("addons")
    if not isinstance(rows, list):
        entry = booking.get("booking") if isinstance(booking.get("booking"), dict) else {}
        rows = entry.get("addons")
    if not isinstance(rows, list):
        return []
    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        kind = str(row.get("addon") or "").lower()
        out.append(
            {
                "type": kind,
                "status": row.get("status"),
                "valueUsd": row.get("value") or row.get("originalValue"),
                "currency": row.get("currency") or row.get("originalCurrency") or "USD",
                "voucherUrl": row.get("addonVoucherCode"),
                "expiryDate": row.get("expiryDate"),
                "qrCode": (
                    (row.get("addonDetails") or {})
                    .get("esimply", {})
                    .get("purchases", [{}])[0]
                    .get("qrCode")
                    if kind == "esimply"
                    else None
                ),
                "iccid": (
                    (row.get("addonDetails") or {})
                    .get("esimply", {})
                    .get("purchases", [{}])[0]
                    .get("iccid")
                    if kind == "esimply"
                    else None
                ),
                "message": row.get("message"),
            }
        )
    return out
