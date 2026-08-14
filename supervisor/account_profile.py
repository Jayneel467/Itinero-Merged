"""Signed-in travellers, prefs, and Saved hearts.

Device-local storage remains the cache. This table is the account copy so
signed-in travellers keep names, prefs, and Saved items across browsers.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from supervisor.db import configured, connection

log = logging.getLogger("itinero.account")

MAX_TRAVELLERS = 8
MAX_SAVED = 80
_SAVED_TYPES = {"hotel", "destination", "package", "idea", "explore", "event"}
_IATA = re.compile(r"^[A-Z]{3}$")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _clip(value: Any, n: int) -> str:
    return str(value or "").strip()[:n]


def sanitize_traveller(raw: Any, idx: int = 0) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    first = _clip(raw.get("firstName") or raw.get("first_name"), 40)
    last = _clip(raw.get("lastName") or raw.get("last_name"), 40)
    if not first and not last:
        return None
    ptype = raw.get("passengerType", raw.get("passenger_type", 0))
    try:
        ptype_n = int(ptype)
    except (TypeError, ValueError):
        ptype_n = 0
    if ptype_n not in (0, 1, 2):
        ptype_n = 0
    gender = _clip(raw.get("gender"), 1).upper()
    if gender not in ("M", "F", "X"):
        gender = ""
    title = _clip(raw.get("title"), 8) or "Mr"
    nat = _clip(raw.get("nationality"), 2).upper() or "IN"
    issue = _clip(raw.get("documentIssueCountry") or raw.get("document_issue_country"), 2).upper() or "IN"
    tid = _clip(raw.get("id"), 48) or f"pax_{idx}_{first[:8] or 't'}"
    return {
        "id": tid,
        "title": title,
        "firstName": first,
        "lastName": last,
        "gender": gender,
        "dob": _clip(raw.get("dob") or raw.get("birthday"), 10),
        "nationality": nat,
        "documentNumber": _clip(raw.get("documentNumber") or raw.get("document_number"), 20),
        "documentExpiry": _clip(raw.get("documentExpiry") or raw.get("document_expiry"), 10),
        "documentIssueCountry": issue,
        "passengerType": ptype_n,
    }


def sanitize_travellers(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, row in enumerate(raw[: MAX_TRAVELLERS * 2]):
        item = sanitize_traveller(row, i)
        if not item or item["id"] in seen:
            continue
        seen.add(item["id"])
        out.append(item)
        if len(out) >= MAX_TRAVELLERS:
            break
    return out


def sanitize_prefs(raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    airport_raw = _clip(src.get("homeAirport"), 8).upper()
    airport = airport_raw if _IATA.match(airport_raw) else ""
    email = _clip(src.get("invoiceEmail"), 120).lower()
    if email and not _EMAIL.match(email):
        email = ""
    return {
        "homeAirport": airport,
        "homeCity": _clip(src.get("homeCity"), 40),
        "priceAlerts": bool(src.get("priceAlerts", True)),
        "tripReminders": bool(src.get("tripReminders", True)),
        "gstin": _clip(src.get("gstin"), 15).upper(),
        "companyName": _clip(src.get("companyName"), 80),
        "invoiceEmail": email,
    }


def sanitize_contact(raw: Any) -> dict[str, str]:
    src = raw if isinstance(raw, dict) else {}
    email = _clip(src.get("email"), 120).lower()
    if email and not _EMAIL.match(email):
        email = ""
    phone = "".join(ch for ch in str(src.get("phone") or "") if ch.isdigit())[-10:]
    return {"email": email, "phone": phone}


def sanitize_saved_item(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    sid = _clip(raw.get("id"), 80)
    if not sid:
        return None
    url = _clip(raw.get("url"), 200)
    if not url.startswith("/") or url.startswith("//") or "://" in url:
        url = "/"
    typ = _clip(raw.get("type"), 20).lower() or "idea"
    if typ not in _SAVED_TYPES:
        typ = "idea"
    image = _clip(raw.get("image"), 500)
    low = image.lower()
    if low.startswith("javascript:") or low.startswith("data:") or low.startswith("vbscript:"):
        image = ""
    return {
        "id": sid,
        "type": typ,
        "title": _clip(raw.get("title"), 80) or "Saved",
        "subtitle": _clip(raw.get("subtitle"), 80),
        "url": url,
        "image": image,
        "savedAt": _clip(raw.get("savedAt") or raw.get("saved_at"), 40),
    }


def sanitize_saved(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in raw[: MAX_SAVED * 2]:
        item = sanitize_saved_item(row)
        if not item or item["id"] in seen:
            continue
        seen.add(item["id"])
        out.append(item)
        if len(out) >= MAX_SAVED:
            break
    return out


def merge_saved(left: Any, right: Any) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for row in [*sanitize_saved(left), *sanitize_saved(right)]:
        prev = by_id.get(row["id"])
        if not prev or str(row.get("savedAt") or "") > str(prev.get("savedAt") or ""):
            by_id[row["id"]] = row
    return sorted(
        by_id.values(),
        key=lambda r: str(r.get("savedAt") or ""),
        reverse=True,
    )[:MAX_SAVED]


def _empty() -> dict[str, Any]:
    return {
        "ok": True,
        "travellers": [],
        "prefs": sanitize_prefs({}),
        "contact": {"email": "", "phone": ""},
        "saved": [],
        "synced": False,
    }


def get_state(user_id: str) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    if not uid:
        return {**_empty(), "ok": False, "error": "missing_user"}
    if not configured():
        return {**_empty(), "ok": False, "error": "db_unset"}
    try:
        with connection() as conn:
            row = conn.execute(
                """
                SELECT travellers, prefs, contact, saved, updated_at
                FROM account_profiles
                WHERE user_id = %s
                """,
                (uid,),
            ).fetchone()
        if not row:
            return {**_empty(), "synced": True}
        travellers, prefs, contact, saved, updated = row
        return {
            "ok": True,
            "travellers": sanitize_travellers(travellers or []),
            "prefs": sanitize_prefs(prefs or {}),
            "contact": sanitize_contact(contact or {}),
            "saved": sanitize_saved(saved or []),
            "updatedAt": updated.isoformat() if hasattr(updated, "isoformat") else updated,
            "synced": True,
        }
    except Exception:
        log.exception("account_profile get failed")
        return {**_empty(), "ok": False, "error": "read_failed"}


def put_state(
    user_id: str,
    *,
    travellers: Any = None,
    prefs: Any = None,
    contact: Any = None,
    saved: Any = None,
) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    if not uid:
        return {"ok": False, "error": "missing_user"}
    current = get_state(uid)
    next_travellers = (
        sanitize_travellers(travellers)
        if travellers is not None
        else current.get("travellers") or []
    )
    next_prefs = (
        sanitize_prefs({**(current.get("prefs") or {}), **(prefs or {})})
        if prefs is not None
        else sanitize_prefs(current.get("prefs") or {})
    )
    next_contact = (
        sanitize_contact({**(current.get("contact") or {}), **(contact or {})})
        if contact is not None
        else sanitize_contact(current.get("contact") or {})
    )
    next_saved = (
        sanitize_saved(saved) if saved is not None else sanitize_saved(current.get("saved") or [])
    )
    if not configured():
        return {
            "ok": False,
            "error": "db_unset",
            "travellers": next_travellers,
            "prefs": next_prefs,
            "contact": next_contact,
            "saved": next_saved,
        }
    payload_t = json.dumps(next_travellers)
    payload_p = json.dumps(next_prefs)
    payload_c = json.dumps(next_contact)
    payload_s = json.dumps(next_saved)
    try:
        with connection() as conn:
            conn.execute(
                """
                INSERT INTO account_profiles (user_id, travellers, prefs, contact, saved, updated_at)
                VALUES (%s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, now())
                ON CONFLICT (user_id) DO UPDATE SET
                  travellers = EXCLUDED.travellers,
                  prefs = EXCLUDED.prefs,
                  contact = EXCLUDED.contact,
                  saved = EXCLUDED.saved,
                  updated_at = now()
                """,
                (uid, payload_t, payload_p, payload_c, payload_s),
            )
        return {
            "ok": True,
            "travellers": next_travellers,
            "prefs": next_prefs,
            "contact": next_contact,
            "saved": next_saved,
            "synced": True,
        }
    except Exception:
        log.exception("account_profile put failed")
        return {"ok": False, "error": "write_failed"}
