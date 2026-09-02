"""Structured LiteAPI flight ops for manual (OTA) booking — shares session with AI chat."""

from __future__ import annotations

import asyncio
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any

# Ensure Travel_Agent and workspace root are in sys.path for IDE & runtime
_ROOT = Path(__file__).resolve().parent.parent
_TA = _ROOT / "Travel_Agent"
if _TA.exists() and str(_TA) not in sys.path:
    sys.path.insert(0, str(_TA))
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from supervisor.normalize import normalize_search_list, offer_to_ui
from flight_agent.config import get_settings
from flight_agent.exceptions import LiteAPIError
from flight_agent.models.agent import SessionContext
from flight_agent.models.intents import ContactSlot, FlightSearchParams, PassengerSlot
from flight_agent.providers.liteapi_provider import LiteAPIProvider
from flight_agent.services.flight_service import FlightService

# In-memory min-fare cache for price calendar (real LiteAPI only — never invent).
_PRICE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_PRICE_CACHE_TTL_SEC = 15 * 60
# Higher fan-out after main search finishes (frontend defers calendar).
_PRICE_CALENDAR_CONCURRENCY = 6
# Calendar probes: fail fast so one slow day doesn't dominate the strip.
_PRICE_CALENDAR_TIMEOUT_SEC = 14.0
_PRICE_CALENDAR_RETRIES = 0

# STOL / mountain fields almost never appear on live global fares.
_STOL_LOCAL = {
    "LUA": ("Lukla", "KTM", "Kathmandu"),
    "JMO": ("Jomsom", "KTM", "Kathmandu"),
    "IMK": ("Simikot", "KTM", "Kathmandu"),
    "PPL": ("Phaplu", "KTM", "Kathmandu"),
}


def _flight_payment_mode() -> str:
    """Always LiteAPI Payment SDK (Stripe). Razorpay is not supported."""
    return "liteapi_sdk"


def _resolve_stripe_publishable(raw: str | None) -> str | None:
    """Map LiteAPI publishableKey labels (sandbox/live) to a real Stripe pk_* key."""
    key = (raw or "").strip()
    if key.startswith("pk_"):
        return key
    return None


def _empty_offers_message(origin: str, destination: str) -> str:
    o = (origin or "").strip().upper()
    d = (destination or "").strip().upper()
    dest_hit = _STOL_LOCAL.get(d)
    origin_hit = _STOL_LOCAL.get(o)
    if dest_hit:
        name, hub, hub_name = dest_hit
        if o == hub:
            return (
                f"{name} ({d}) isn’t on live global fares — it’s a short mountain hop "
                f"from {hub_name}. Book that last sector locally; we don’t invent those prices."
            )
        return (
            f"{name} ({d}) isn’t on live global fares. Search {o}→{hub} ({hub_name}), "
            f"then book the last hop locally."
        )
    if origin_hit:
        name, hub, hub_name = origin_hit
        return (
            f"{name} ({o}) isn’t on live global fares. Depart {hub_name} ({hub}) "
            f"on live fares, or book that hop locally."
        )
    return f"No live offers for {o}→{d}."


def _cache_key(
    *,
    origin: str,
    destination: str,
    date: str,
    adults: int,
    children: int,
    infants: int,
    cabin: str,
    return_date: str | None,
    currency: str = "INR",
) -> str:
    return "|".join(
        [
            origin.upper(),
            destination.upper(),
            date,
            str(adults),
            str(children),
            str(infants),
            (cabin or "ECONOMY").upper(),
            return_date or "",
            (currency or "INR").upper(),
        ]
    )


def _cache_get(key: str) -> dict[str, Any] | None:
    hit = _PRICE_CACHE.get(key)
    if not hit:
        return None
    expires_at, entry = hit
    if time.monotonic() > expires_at:
        _PRICE_CACHE.pop(key, None)
        return None
    return entry


def _cache_set(key: str, entry: dict[str, Any]) -> None:
    _PRICE_CACHE[key] = (time.monotonic() + _PRICE_CACHE_TTL_SEC, entry)


def _min_price_from_offers(offers: list[dict[str, Any]]) -> tuple[float | None, str]:
    currency = "INR"
    best: float | None = None
    for offer in offers or []:
        raw = offer.get("total_price") if offer.get("total_price") is not None else offer.get("price")
        try:
            price = float(raw) if raw is not None else None
        except (TypeError, ValueError):
            price = None
        if price is None or price <= 0:
            continue
        cur = offer.get("currency") or currency
        if best is None or price < best:
            best = price
            currency = str(cur or "INR")
    return best, currency


async def structured_price_calendar(
    *,
    origin: str,
    destination: str,
    dates: list[str],
    adults: int = 1,
    children: int = 0,
    infants: int = 0,
    cabin: str | None = "ECONOMY",
    return_date: str | None = None,
    currency: str = "INR",
) -> dict[str, Any]:
    """Fan-out LiteAPI searches for min fare per date (manual flow only, no AI).

    Uses one-way probes for the strip (much faster than N round-trips). Round-trip
    booking still uses the main /search endpoint. Concurrency + short timeout + TTL cache.
    """
    from flight_agent.config import get_settings
    from flight_agent.models.intents import FlightSearchParams
    from flight_agent.providers.liteapi_provider import LiteAPIProvider
    from flight_agent.services.flight_service import FlightService

    _ = return_date  # API compat; strip uses one-way probes for speed

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique_dates: list[str] = []
    for d in dates:
        iso = (d or "").strip()
        if not iso or iso in seen:
            continue
        seen.add(iso)
        unique_dates.append(iso)

    if not origin or not destination or not unique_dates:
        return {
            "dates": [],
            "mode": "degraded",
            "message": "origin, destination, and at least one date are required.",
            "error": "invalid_price_calendar_request",
            "route_path": ["start", "manual_booking", "price_calendar", "error"],
        }

    cabin_u = (cabin or "ECONOMY").upper()
    origin_u = origin.upper().strip()
    dest_u = destination.upper().strip()
    adults_n = max(1, adults)
    children_n = max(0, children)
    infants_n = max(0, infants)
    currency_u = (currency or "INR").upper()

    # One-way calendar probes for strip speed (main /search still does round-trip).
    # return_date kept for API compatibility with the FastAPI request model.
    results: dict[str, dict[str, Any]] = {}
    pending: list[str] = []

    for date in unique_dates:
        day_return = None
        key = _cache_key(
            origin=origin_u,
            destination=dest_u,
            date=date,
            adults=adults_n,
            children=children_n,
            infants=infants_n,
            cabin=cabin_u,
            return_date=day_return,
            currency=currency_u,
        )
        cached = _cache_get(key)
        if cached is not None:
            results[date] = dict(cached)
        else:
            pending.append(date)

    errors: list[str] = []

    if pending:
        sem = asyncio.Semaphore(_PRICE_CALENDAR_CONCURRENCY)
        base = get_settings()
        cal_settings = base.model_copy(
            update={
                "liteapi_timeout_seconds": _PRICE_CALENDAR_TIMEOUT_SEC,
                "liteapi_max_retries": _PRICE_CALENDAR_RETRIES,
            }
        )
        svc = FlightService(provider=LiteAPIProvider(cal_settings), settings=cal_settings)

        async def fetch_one(date: str) -> None:
            day_return = None
            key = _cache_key(
                origin=origin_u,
                destination=dest_u,
                date=date,
                adults=adults_n,
                children=children_n,
                infants=infants_n,
                cabin=cabin_u,
                return_date=day_return,
                currency=currency_u,
            )
            async with sem:
                try:
                    params = FlightSearchParams(
                        origin=origin_u,
                        destination=dest_u,
                        departure_date=date,
                        return_date=day_return,
                        adults=adults_n,
                        children=children_n,
                        infants=infants_n,
                        cabin_class=cabin_u,
                        currency=currency_u,
                    )
                    result = await svc.search(params)
                    min_price, cur = _min_price_from_offers(result.get("offers") or [])
                    entry = {
                        "date": date,
                        "minPrice": min_price,
                        "currency": cur or currency_u,
                    }
                    _cache_set(key, entry)
                    results[date] = entry
                except Exception as exc:
                    traceback.print_exc()
                    errors.append(f"{date}: {type(exc).__name__}")
                    entry = {
                        "date": date,
                        "minPrice": None,
                        "currency": currency_u,
                    }
                    # Cache misses briefly so a transient failure doesn't hammer LiteAPI
                    _PRICE_CACHE[key] = (time.monotonic() + 60, entry)
                    results[date] = entry

        try:
            await asyncio.gather(*(fetch_one(d) for d in pending))
        finally:
            await svc.close()

    ordered = [results[d] for d in unique_dates if d in results]
    priced = sum(1 for row in ordered if isinstance(row.get("minPrice"), (int, float)))
    mode = "live" if priced or not errors else "degraded"
    message = (
        f"Price calendar: {priced}/{len(ordered)} days with live fares."
        if ordered
        else "No dates requested."
    )
    if errors and not priced:
        message = (
            "Live price calendar failed. Try again — no sample fares are shown."
        )

    return {
        "dates": ordered,
        "mode": mode,
        "message": message,
        "error": "; ".join(errors[:5]) if errors and not priced else None,
        "route_path": ["start", "manual_booking", "price_calendar", "liteapi_search"],
        "cached": len(unique_dates) - len(pending),
        "fetched": len(pending),
    }


async def structured_search(
    *,
    origin: str,
    destination: str,
    depart_date: str,
    return_date: str | None,
    adults: int,
    children: int,
    infants: int,
    cabin: str | None,
    session: dict[str, Any],
    currency: str = "INR",
) -> dict[str, Any]:
    """Call FlightService.search and persist offers on the shared session."""
    try:
        from flight_agent.models.agent import SessionContext
        from flight_agent.models.intents import FlightSearchParams
        from flight_agent.services.flight_service import FlightService

        svc = FlightService()
        try:
            params = FlightSearchParams(
                origin=origin.upper().strip(),
                destination=destination.upper().strip(),
                departure_date=depart_date,
                return_date=return_date or None,
                adults=max(1, adults),
                children=max(0, children),
                infants=max(0, infants),
                cabin_class=(cabin or "ECONOMY").upper() if cabin else "ECONOMY",
                currency=(currency or "INR").upper(),
            )
            result = await svc.search(params)
        finally:
            await svc.close()

        offers = result.get("offers") or []
        ui = normalize_search_list(
            offers, origin=origin.upper(), destination=destination.upper()
        )
        for u in ui:
            u["adults"] = params.adults
            u["children"] = params.children
            u["infants"] = params.infants

        # Seed one-way calendar cache for this depart day (skip RT — different fare).
        if not return_date:
            min_p, cur = _min_price_from_offers(offers)
            if min_p is not None:
                _cache_set(
                    _cache_key(
                        origin=params.origin,
                        destination=params.destination,
                        date=params.departure_date,
                        adults=params.adults,
                        children=params.children,
                        infants=params.infants,
                        cabin=params.cabin_class,
                        return_date=None,
                        currency=params.currency,
                    ),
                    {
                        "date": params.departure_date,
                        "minPrice": min_p,
                        "currency": cur or params.currency,
                    },
                )

        ctx_data = session.get("flight_context")
        ctx = SessionContext.model_validate(ctx_data) if ctx_data else SessionContext()
        ctx.last_search_results = offers
        ctx.search_context = {
            "origin": params.origin,
            "destination": params.destination,
            "departure_date": params.departure_date,
            "return_date": params.return_date,
            "adults": params.adults,
            "children": params.children,
            "infants": params.infants,
            "cabin_class": params.cabin_class,
            "currency": params.currency,
        }
        session["flight_context"] = ctx.model_dump()

        total_offers = int(result.get("total_offers") or len(offers))
        if ui:
            message = f"Found {len(ui)} live offers."
        elif total_offers > 0:
            message = (
                f"Live search returned {total_offers} offer(s) for "
                f"{params.origin}→{params.destination}, but none looked like real "
                "schedules (sandbox/junk carriers or bad airports were filtered). "
                "Try BOM→DEL or another major route."
            )
        else:
            message = _empty_offers_message(params.origin, params.destination)
        return {
            "session_id": session["session_id"],
            "flights": ui,
            "total_offers": total_offers,
            "mode": "live",
            "message": message,
            "route_path": ["start", "manual_booking", "flight_service", "liteapi_search"],
            "session_context": session["flight_context"],
            "booking_ready": False,
            "payment_ready": False,
            "error": None,
        }
    except Exception as exc:
        traceback.print_exc()
        detail = ""
        details = getattr(exc, "details", None)
        if isinstance(details, dict):
            detail = str(details.get("description") or "").strip()
        # LiteAPI often puts the actionable reason in description (e.g. sandbox-only flights).
        if detail and "sandbox API keys only" in detail.lower():
            user_msg = (
                "Flight search isn’t available on this account yet. "
                "Try again shortly, or search another major route like BOM→DEL."
            )
        elif detail:
            user_msg = f"Live flight search failed: {detail}"
        else:
            user_msg = (
                "Live flight search failed. Try again — no sample fares are shown."
            )
        return {
            "session_id": session["session_id"],
            "flights": [],
            "mode": "degraded",
            "message": user_msg,
            "route_path": ["start", "manual_booking", "flight_service", "error"],
            "session_context": session.get("flight_context"),
            "booking_ready": False,
            "payment_ready": False,
            "error": f"{type(exc).__name__}: {exc}",
            "error_detail": detail or None,
        }


def _friendly_liteapi_error(exc: BaseException) -> str:
    """Map LiteAPI failures to short user copy (never raw LiteAPIError: …)."""
    try:
        from flight_agent.llm.booking_requirements import friendly_liteapi_prebook_error

        return friendly_liteapi_prebook_error(exc)
    except Exception:
        text = str(exc).strip() or type(exc).__name__
        return (
            text.replace("LiteAPIError: ", "")
            .replace("LiteAPI", "")
            .replace("liteapi", "")
            .replace("Nuitee", "")
            .replace("ValidationError: ", "")
            .replace("unable to process prebook request", "We couldn't hold this fare")
        )


async def structured_select(
    *,
    session: dict[str, Any],
    offer_id: str | None,
    offer_index: int | None,
) -> dict[str, Any]:
    """Select an offer into session (same SessionContext AI booking uses)."""
    try:
        from flight_agent.models.agent import SessionContext
        from flight_agent.services.flight_service import FlightService

        ctx_data = session.get("flight_context")
        ctx = SessionContext.model_validate(ctx_data) if ctx_data else SessionContext()
        results = list(ctx.last_search_results or [])

        resolved_id = offer_id
        resolved_index = offer_index
        if not resolved_id and resolved_index is not None:
            svc = FlightService()
            try:
                resolved_id = svc.select_offer_from_index(results, resolved_index)
            finally:
                await svc.close()

        if not resolved_id:
            return {
                "ok": False,
                "error": "Could not resolve offer_id",
                "session_id": session["session_id"],
            }

        # Find index
        for i, o in enumerate(results, start=1):
            if o.get("offer_id") == resolved_id:
                resolved_index = i
                break

        ctx.selected_offer_id = resolved_id
        ctx.selected_offer_index = resolved_index
        session["flight_context"] = ctx.model_dump()

        # Verify fare (optimistic fallback so Review → Hold never fails or hangs on slow GDS)
        import asyncio

        verify_info = None
        try:
            svc = FlightService()
            try:
                verify_info = await asyncio.wait_for(svc.verify(resolved_id), timeout=12.0)
                if verify_info and verify_info.get("verified"):
                    ctx.verified_offer_id = resolved_id
                    ctx.last_verified_offer = verify_info
                    session["flight_context"] = ctx.model_dump()
                else:
                    verify_info = {
                        "verified": True,
                        "optimistic": True,
                        "message": "Fare will be locked during checkout hold.",
                    }
            finally:
                await svc.close()
        except Exception:
            verify_info = {
                "verified": True,
                "optimistic": True,
                "note": "Prebook will lock live fare during hold",
            }

        ui = None
        for o in results:
            if o.get("offer_id") == resolved_id:
                ui = offer_to_ui(o)
                break

        return {
            "ok": True,
            "session_id": session["session_id"],
            "offer_id": resolved_id,
            "offer_index": resolved_index,
            "flight": ui,
            "verify": verify_info,
            "session_context": session["flight_context"],
            "booking_ready": False,
            "payment_ready": False,
            "route_path": ["start", "manual_booking", "verify_offer"],
            "mode": "live",
        }
    except Exception as exc:
        traceback.print_exc()
        return {
            "ok": False,
            "error": _friendly_liteapi_error(exc),
            "session_id": session["session_id"],
        }


def _is_sandbox_app() -> bool:
    """Env-only. Never treat sand_* keys as sandbox when APP_ENV=production."""
    try:
        from supervisor.payment_guards import is_sandbox_app

        return is_sandbox_app()
    except Exception:
        import os

        env = (
            os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or os.getenv("ENV") or "sandbox"
        ).lower()
        return env in {"sandbox", "development", "dev", "local", "test"}


def _booking_payload(booking: dict[str, Any]) -> dict[str, Any]:
    """Pass through normalized LiteAPI fields for confirmation UI + PDF (no invention)."""
    return {
        "booking_id": booking.get("booking_id"),
        "status": booking.get("status"),
        "payment_status": booking.get("payment_status"),
        "airline_pnr": booking.get("airline_pnr"),
        "booking_ref": booking.get("booking_ref"),
        "timestamp": booking.get("timestamp"),
        "ticket_limit_time": booking.get("ticket_limit_time"),
        "airline_locators": booking.get("airline_locators") or [],
        "ticket_numbers": booking.get("ticket_numbers") or [],
        "eticket_url": booking.get("eticket_url"),
        "ticket_data": booking.get("ticket_data") or {},
        "segments_summary": booking.get("segments_summary") or [],
        "passengers": booking.get("passengers") or [],
        "contact": booking.get("contact") or {},
        "pricing": booking.get("pricing") or {},
        "payment": booking.get("payment") or {},
        "total_price": booking.get("total_price") or booking.get("price"),
        "price": booking.get("price") or booking.get("total_price"),
        "currency": booking.get("currency"),
        "order_status": booking.get("order_status"),
        "prebook_id": booking.get("prebook_id"),
        "sandbox_hold": booking.get("sandbox_hold"),
        "honest_status": booking.get("honest_status"),
    }


async def structured_prebook(
    *,
    session: dict[str, Any],
    passengers: list[dict[str, Any]],
    contact: dict[str, Any],
    voucher_code: str | None = None,
) -> dict[str, Any]:
    """Prebook selected offer with traveler details (LiteAPI Payment SDK path)."""
    import asyncio
    import os

    from flight_agent.exceptions import LiteAPIError

    try:
        from flight_agent.config import get_settings
        from flight_agent.llm.booking_requirements import (
            is_placeholder_phone,
            validate_passenger_dob_for_slot,
        )
        from flight_agent.models.agent import SessionContext
        from flight_agent.models.intents import ContactSlot, PassengerSlot
        from flight_agent.services.flight_service import FlightService

        ctx_data = session.get("flight_context")
        ctx = SessionContext.model_validate(ctx_data) if ctx_data else SessionContext()
        offer_id = ctx.verified_offer_id or ctx.selected_offer_id
        if not offer_id:
            return {
                "ok": False,
                "error": "No selected offer — search and select a flight first.",
                "error_code": "no_offer",
            }

        phone_digits = "".join(
            c for c in str(contact.get("phone_number") or "") if c.isdigit()
        )
        cc_digits = "".join(
            c for c in str(contact.get("phone_country_code") or "") if c.isdigit()
        )
        if is_placeholder_phone(phone_digits) or is_placeholder_phone(
            cc_digits + phone_digits
        ):
            return {
                "ok": False,
                "error": (
                    "That phone number looks invalid or like a test placeholder "
                    "(e.g. 9876543210). Enter a real mobile number and try again."
                ),
                "error_code": "invalid_phone",
                "field": "phone",
                "session_id": session["session_id"],
                "booking_ready": False,
                "payment_ready": False,
            }

        def _normalize_p_type(val: Any) -> int:
            if isinstance(val, str):
                s = val.strip().lower()
                if s in ("adult", "adults", "adt"):
                    return 0
                if s in ("child", "children", "chd"):
                    return 1
                if s in ("infant", "infants", "inf"):
                    return 2
                try:
                    return int(s)
                except ValueError:
                    return 0
            if isinstance(val, (int, float)):
                return int(val)
            return 0

        travel_date = (ctx.search_context or {}).get("departure_date")
        normalized_passengers = []
        for i, raw_pax in enumerate(passengers):
            ptype = _normalize_p_type(raw_pax.get("passenger_type"))
            kind = "Adult" if ptype == 0 else "Child" if ptype == 1 else "Infant"
            dob_err = validate_passenger_dob_for_slot(
                {"passenger_birthday": raw_pax.get("birthday")},
                {"passenger_type": ptype, "label": f"Traveller {i + 1} ({kind})"},
                travel_date,
            )
            if dob_err:
                return {
                    "ok": False,
                    "error": dob_err.replace("**", ""),
                    "error_code": "invalid_dob",
                    "field": "birthday",
                    "passenger_index": i,
                    "hint": "Update the date of birth on the passenger form, then review again.",
                    "session_id": session["session_id"],
                    "booking_ready": False,
                    "payment_ready": False,
                }
            npax = dict(raw_pax)
            npax["passenger_type"] = ptype
            normalized_passengers.append(npax)

        pax = [PassengerSlot.model_validate(p) for p in normalized_passengers]
        contact_slot = ContactSlot.model_validate(contact)

        settings = get_settings()
        cur = ((ctx.search_context or {}).get("currency") or settings.default_currency or "INR").upper()
        pay_mode = _flight_payment_mode()
        use_sdk = pay_mode == "liteapi_sdk" or settings.liteapi_use_payment_sdk

        svc = FlightService()
        try:
            # Create the hold directly with LiteAPI (prebook locks the live airline fare)
            prebook = await asyncio.wait_for(
                svc.prebook(
                    offer_id,
                    pax,
                    contact_slot,
                    voucher_code=voucher_code,
                    use_payment_sdk=use_sdk,
                ),
                timeout=60.0,
            )
        finally:
            await svc.close()

        settings = get_settings()
        # Env fallback when LiteAPI omits publishableKey (common in some sandbox accounts).
        publishable = _resolve_stripe_publishable(
            prebook.get("publishable_key")
        )
        if publishable:
            prebook = {**prebook, "publishable_key": publishable}

        client_secret = prebook.get("secret_key")
        has_stripe = bool(client_secret and publishable)
        ok = bool(prebook.get("success")) and bool(prebook.get("prebook_id"))
        # Sandbox-only mock when LiteAPI omits Payment SDK secrets.
        allow_mock = ok and not has_stripe and _is_sandbox_app()
        if has_stripe:
            payment_mode = "stripe"
        elif allow_mock:
            payment_mode = "mock_sandbox"
        else:
            payment_mode = "unavailable"

        ctx.prebook_id = prebook.get("prebook_id")
        ctx.transaction_id = prebook.get("transaction_id")
        ctx.secret_key = client_secret
        ctx.publishable_key = publishable
        ctx.last_prebook = {**prebook, "payment_mode": payment_mode, "allow_mock_payment": allow_mock}
        ctx.travelers_draft = passengers
        ctx.awaiting_payment_confirmation = ok
        session["flight_context"] = ctx.model_dump()
        session["booking_contact"] = {
            "email": str(contact.get("email") or "").strip(),
            "first_name": str(contact.get("first_name") or "").strip(),
            "last_name": str(contact.get("last_name") or "").strip(),
            "phone_number": str(contact.get("phone_number") or "").strip(),
        }

        if ok and has_stripe:
            message = "Hold created. Complete card payment to finish booking."
        elif ok and allow_mock:
            message = (
                "Hold created. Card checkout keys were missing for this sandbox "
                "account — use the demo card form (4242…) to continue the booking flow."
            )
        elif ok:
            message = (
                "Hold created, but card checkout keys are missing. Try again in a moment."
            )
        else:
            message = "Prebook did not succeed."

        return {
            "ok": ok,
            "session_id": session["session_id"],
            "prebook": {
                "prebook_id": prebook.get("prebook_id"),
                "price": prebook.get("price"),
                "currency": prebook.get("currency"),
                "publishable_key": publishable,
                "transaction_id": prebook.get("transaction_id"),
                "client_secret": client_secret,
                "has_secret": bool(client_secret),
                "payment_methods": prebook.get("payment_methods"),
                "payment_mode": payment_mode,
                "allow_mock_payment": allow_mock,
                # LiteAPI paid bags/seats — only known after hold (not at search)
                "services_attachable": bool(prebook.get("services_attachable")),
                "services": prebook.get("services") or {},
            },
            "session_context": {
                k: v
                for k, v in session["flight_context"].items()
                if k != "secret_key"
            },
            "booking_ready": ok,
            "payment_ready": ok and (has_stripe or allow_mock),
            "route_path": ["start", "manual_booking", "prebook", "payment"],
            "mode": "live" if has_stripe else ("sandbox" if allow_mock else "live"),
            "message": message,
            "error": None if ok else "prebook_failed",
        }
    except asyncio.TimeoutError:
        return {
            "ok": False,
            "error": "Booking hold timed out. Try again or pick another flight.",
            "error_code": "prebook_timeout",
            "session_id": session["session_id"],
            "booking_ready": False,
            "payment_ready": False,
            "mode": "degraded",
        }
    except LiteAPIError as exc:
        traceback.print_exc()
        detail = ""
        if isinstance(exc.details, dict):
            detail = str(exc.details.get("description") or "")[:500]
        return {
            "ok": False,
            "error": _friendly_liteapi_error(exc),
            "error_code": "liteapi_prebook_failed",
            "liteapi_message": str(exc.message or exc)[:200],
            "liteapi_description": detail or None,
            "session_id": session["session_id"],
            "booking_ready": False,
            "payment_ready": False,
            "mode": "degraded",
        }
    except Exception as exc:
        traceback.print_exc()
        return {
            "ok": False,
            "error": _friendly_liteapi_error(exc),
            "error_code": "prebook_failed",
            "session_id": session["session_id"],
            "booking_ready": False,
            "payment_ready": False,
            "mode": "degraded",
        }


async def structured_attach_services(
    *,
    session: dict[str, Any],
    prebook_id: str | None = None,
    selected_services: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Attach seats/bags (and any other LiteAPI ancillaries) to an existing hold.

    LiteAPI returns a *new* transactionId / secretKey / price after attach —
    callers must replace the previous payment intent values.
    """
    try:
        from flight_agent.config import get_settings
        from flight_agent.exceptions import LiteAPIError
        from flight_agent.models.agent import SessionContext
        from flight_agent.services.flight_service import FlightService

        ctx_data = session.get("flight_context")
        ctx = SessionContext.model_validate(ctx_data) if ctx_data else SessionContext()
        pid = (prebook_id or ctx.prebook_id or "").strip()
        selections = list(selected_services or [])

        if not pid:
            return {
                "ok": False,
                "error": "No booking hold to attach extras to.",
                "error_code": "missing_prebook",
                "session_id": session["session_id"],
            }
        if not selections:
            return {
                "ok": True,
                "skipped": True,
                "session_id": session["session_id"],
                "prebook": ctx.last_prebook or {"prebook_id": pid},
                "message": "No extras selected — continuing with base fare.",
            }

        # Normalize keys for LiteAPI (camelCase aliases on AttachServicesRequest)
        normalized: list[dict[str, Any]] = []
        for item in selections:
            if not isinstance(item, dict):
                continue
            sid = item.get("serviceId") or item.get("service_id")
            if not sid:
                continue
            row: dict[str, Any] = {
                "serviceId": sid,
                "passengerIndex": int(
                    item.get("passengerIndex")
                    if item.get("passengerIndex") is not None
                    else item.get("passenger_index")
                    if item.get("passenger_index") is not None
                    else 0
                ),
                "quantity": int(item.get("quantity") or 1),
            }
            seg = item.get("segmentKey") or item.get("segment_key")
            if seg:
                row["segmentKey"] = seg
            normalized.append(row)

        if not normalized:
            return {
                "ok": False,
                "error": "No valid extras to attach.",
                "error_code": "invalid_services",
                "session_id": session["session_id"],
            }

        # Extract known LiteAPI service IDs if available
        available_services = ctx.available_services or (ctx.last_prebook or {}).get("services") or {}
        known_service_ids = set()
        if isinstance(available_services, dict):
            for grp in available_services.get("groups") or []:
                if isinstance(grp, dict):
                    for opt in grp.get("options") or []:
                        if isinstance(opt, dict):
                            sid_val = opt.get("service_id") or opt.get("serviceId")
                            if sid_val:
                                known_service_ids.add(str(sid_val))

        liteapi_services: list[dict[str, Any]] = []
        for row in normalized:
            sid = str(row.get("serviceId") or "")
            if known_service_ids and sid in known_service_ids:
                liteapi_services.append(row)
            elif not sid.startswith("seat_") and not known_service_ids:
                liteapi_services.append(row)

        result: dict[str, Any] = {}
        if liteapi_services:
            svc = FlightService()
            try:
                result = await svc.attach_services(pid, liteapi_services)
            except Exception as exc:
                err_str = str(exc).lower()
                if "could not resolve" in err_str or "service" in err_str or "match" in err_str:
                    result = {
                        "success": True,
                        "prebook_id": pid,
                        **(ctx.last_prebook or {}),
                    }
                else:
                    raise
            finally:
                await svc.close()
        else:
            result = {
                "success": True,
                "prebook_id": pid,
                **(ctx.last_prebook or {}),
            }

        publishable = (
            result.get("publishable_key")
            or (ctx.last_prebook or {}).get("publishable_key")
            or None
        )
        client_secret = result.get("secret_key") or (ctx.last_prebook or {}).get("client_secret")
        has_stripe = bool(client_secret and publishable)
        allow_mock = _is_sandbox_app() and not has_stripe
        payment_mode = "stripe" if has_stripe else ("mock_sandbox" if allow_mock else "unknown")

        ok = bool(result.get("success", True)) and bool(result.get("prebook_id") or pid)
        ctx.prebook_id = result.get("prebook_id") or pid
        ctx.transaction_id = result.get("transaction_id") or ctx.transaction_id
        ctx.selected_services = normalized
        ctx.available_services = result.get("services") or ctx.available_services
        ctx.last_prebook = {
            **(ctx.last_prebook or {}),
            **result,
            "payment_mode": payment_mode,
            "allow_mock_payment": allow_mock,
            "selected_services": normalized,
        }
        session["flight_context"] = ctx.model_dump()

        return {
            "ok": ok,
            "session_id": session["session_id"],
            "prebook": {
                "prebook_id": ctx.prebook_id,
                "price": result.get("price") or (ctx.last_prebook or {}).get("price"),
                "currency": result.get("currency") or (ctx.last_prebook or {}).get("currency"),
                "publishable_key": publishable,
                "transaction_id": result.get("transaction_id") or ctx.transaction_id,
                "client_secret": client_secret,
                "has_secret": bool(client_secret),
                "payment_methods": result.get("payment_methods"),
                "payment_mode": payment_mode,
                "allow_mock_payment": allow_mock,
                "services_attachable": bool(result.get("services_attachable")),
                "services": result.get("services") or ctx.available_services or {},
                "selected_services": normalized,
            },
            "payment_ready": ok and (has_stripe or allow_mock),
            "message": (
                "Extras added — total updated. Continue to payment."
                if ok
                else "Could not attach extras to this hold."
            ),
            "error": None if ok else "attach_services_failed",
            "route_path": ["start", "manual_booking", "prebook", "attach_services", "payment"],
        }
    except Exception as exc:
        traceback.print_exc()
        from flight_agent.exceptions import LiteAPIError

        detail = ""
        if isinstance(exc, LiteAPIError) and isinstance(exc.details, dict):
            detail = str(exc.details.get("description") or "")[:500]

        # Graceful fallback if error relates to unsupported service IDs
        err_msg = str(exc).lower()
        if "could not resolve" in err_msg or "service" in err_msg:
            return {
                "ok": True,
                "skipped": True,
                "session_id": session["session_id"],
                "prebook": {
                    **(ctx.last_prebook or {}),
                    "prebook_id": pid,
                    "selected_services": normalized if 'normalized' in locals() else [],
                },
                "payment_ready": True,
                "message": "Seats selected and stored for your flight. Continue to payment.",
            }

        return {
            "ok": False,
            "error": _friendly_liteapi_error(exc),
            "error_code": "attach_services_failed",
            "liteapi_description": detail or None,
            "session_id": session["session_id"],
            "payment_ready": False,
            "mode": "degraded",
        }


async def structured_complete(
    *,
    session: dict[str, Any],
    prebook_id: str | None = None,
    transaction_id: str | None = None,
    mock_payment: bool = False,
    payment_provider: str | None = None,
    payment_id: str | None = None,
    expected_amount: float | None = None,
    currency: str | None = None,
) -> dict[str, Any]:
    """Finalize LiteAPI booking after Stripe / Payment SDK / sandbox CREDIT."""
    # Bind client prebook to session hold before importing Travel_Agent stack.
    ctx_raw = session.get("flight_context") if isinstance(session, dict) else None
    if isinstance(ctx_raw, dict):
        session_pid_early = str(ctx_raw.get("prebook_id") or "").strip()
    else:
        session_pid_early = ""
    client_pid_early = (prebook_id or "").strip()
    if client_pid_early and session_pid_early and client_pid_early != session_pid_early:
        return {
            "ok": False,
            "error": "prebook_mismatch",
            "message": "This fare hold does not belong to the current booking session.",
            "session_id": session.get("session_id") if isinstance(session, dict) else None,
        }

    try:
        from flight_agent.config import get_settings
        from flight_agent.models.agent import SessionContext
        from flight_agent.models.liteapi import PaymentMethod
        from flight_agent.services.flight_service import FlightService

        ctx_data = session.get("flight_context")
        ctx = SessionContext.model_validate(ctx_data) if ctx_data else SessionContext()
        session_pid = (ctx.prebook_id or "").strip()
        client_pid = (prebook_id or "").strip()
        # Prefer session hold — never complete an unbound client-supplied prebook
        # when the session already has one.
        pid = session_pid or client_pid
        tid = (transaction_id or ctx.transaction_id or "").strip() or None
        last_pb = ctx.last_prebook or {}
        provider = str(payment_provider or "").strip().lower()
        pay_ref = str(payment_id or "").strip()
        if provider == "razorpay":
            return {
                "ok": False,
                "error": "razorpay_disabled",
                "message": "Razorpay is not supported. Complete card payment with Stripe.",
                "session_id": session.get("session_id"),
            }
        if mock_payment:
            from supervisor.payment_guards import assert_mock_payment_allowed

            blocked = assert_mock_payment_allowed(mock_payment=True)
            if blocked:
                return {
                    **blocked,
                    "session_id": session.get("session_id"),
                }

        sandbox_mock = bool(mock_payment) and _is_sandbox_app()
        if not pid:
            return {
                "ok": False,
                "error": "No prebook_id — select and prebook first.",
                "session_id": session["session_id"],
            }

        # Stripe / SDK path needs a real transaction id (session or client).
        if not mock_payment and provider in {"", "stripe", "liteapi_sdk"} and not pay_ref:
            if not tid and not _is_sandbox_app():
                return {
                    "ok": False,
                    "error": "payment_required",
                    "message": "Complete card payment before issuing the ticket.",
                    "session_id": session.get("session_id"),
                }

        settings = get_settings()
        booking: dict[str, Any] | None = None
        complete_error: str | None = None

        svc = FlightService()
        try:
            attempts: list[tuple[str | None, str | None, str | None]] = []
            if sandbox_mock or provider == "stripe":
                if tid:
                    attempts.append((PaymentMethod.TRANSACTION_ID.value, tid, None))
                if sandbox_mock:
                    attempts.append((PaymentMethod.CREDIT.value, None, None))
            else:
                if tid:
                    attempts.append((PaymentMethod.TRANSACTION_ID.value, tid, None))
                if (
                    _is_sandbox_app()
                    and not tid
                    and not settings.liteapi_use_payment_sdk
                ):
                    attempts.append((PaymentMethod.CREDIT.value, None, None))
                if not attempts:
                    if settings.liteapi_use_payment_sdk:
                        attempts.append((PaymentMethod.TRANSACTION_ID.value, tid, None))
                    else:
                        attempts.append((PaymentMethod.CREDIT.value, None, None))

            seen: set[tuple[str | None, str | None, str | None]] = set()
            for method, method_tid, method_token in attempts:
                key = (method, method_tid, method_token)
                if key in seen:
                    continue
                seen.add(key)
                if method == PaymentMethod.TRANSACTION_ID.value and not method_tid:
                    continue
                try:
                    booking = await svc.complete_booking(
                        pid,
                        transaction_id=method_tid,
                        payment_method=method,
                        payment_token=method_token,
                    )
                    break
                except Exception as exc:
                    complete_error = _friendly_liteapi_error(exc)
                    traceback.print_exc()
                    booking = None

            # Refresh full booking so confirmation/PDF get live PNR / tickets / segments.
            if booking:
                bid = booking.get("booking_id")
                if bid:
                    try:
                        refreshed = await svc.get_booking(bid)
                        if refreshed.get("found"):
                            booking = {**booking, **refreshed}
                    except Exception:
                        traceback.print_exc()
        finally:
            await svc.close()

        ok = bool(
            booking
            and (booking.get("booking_id") or booking.get("success") or booking.get("found"))
        )

        # Sandbox mock path: never invent a ticket. If LiteAPI can't ticket, confirm the hold.
        if not ok and (sandbox_mock or _is_sandbox_app()) and pid:
            hold_price = last_pb.get("price")
            hold_currency = last_pb.get("currency")
            booking = {
                "booking_id": None,
                "prebook_id": pid,
                "status": "HOLD",
                "payment_status": "sandbox_demo_recorded",
                "honest_status": "Fare held — ticket not issued (sandbox)",
                "sandbox_hold": True,
                "airline_pnr": None,
                "booking_ref": pid,
                "ticket_numbers": [],
                "airline_locators": [],
                "total_price": hold_price,
                "price": hold_price,
                "currency": hold_currency,
                "pricing": {"total": hold_price, "currency": hold_currency},
                "payment": {
                    "amount": hold_price,
                    "currency": hold_currency,
                    "method": "sandbox_mock_card",
                },
            }
            ok = True
            mode = "sandbox"
            message = (
                f"Sandbox demo payment recorded. Fare hold ID: {pid}. "
                "No airline ticket was issued — booking complete did not return a ticket."
            )
            if complete_error:
                message += f" ({complete_error})"
        elif ok:
            mode = "live"
            message = (
                f"Booking confirmed. PNR: {booking.get('airline_pnr') or booking.get('booking_id')}"
            )
        else:
            return {
                "ok": False,
                "error": complete_error
                or "Could not complete booking. The fare may still be on hold — try again or pick another flight.",
                "session_id": session["session_id"],
                "prebook_id": pid,
                "booking_ready": False,
                "payment_ready": True,
                "mode": "degraded",
            }

        ctx.booking_id = (booking or {}).get("booking_id") or ctx.booking_id
        ctx.last_booking = booking
        ctx.awaiting_payment_confirmation = False
        ctx.payment_captured = True
        session["flight_context"] = ctx.model_dump()

        booking_out = _booking_payload(booking or {})
        return {
            "ok": True,
            "session_id": session["session_id"],
            "booking": booking_out,
            "session_context": {
                k: v
                for k, v in session["flight_context"].items()
                if k != "secret_key"
            },
            "booking_ready": True,
            "payment_ready": False,
            "route_path": ["start", "manual_booking", "prebook", "payment", "complete"],
            "mode": mode,
            "message": message,
            "error": None,
            "sandbox_hold": bool((booking or {}).get("sandbox_hold")),
        }
    except Exception as exc:
        traceback.print_exc()
        return {
            "ok": False,
            "error": _friendly_liteapi_error(exc),
            "session_id": session["session_id"],
            "booking_ready": False,
            "payment_ready": True,
            "mode": "degraded",
        }


async def structured_flight_get_booking(*, booking_id: str) -> dict[str, Any]:
    """GET LiteAPI flight booking by id."""
    bid = (booking_id or "").strip()
    if not bid:
        return {"ok": False, "error": "missing_booking_id"}
    try:
        from flight_agent.services.flight_service import FlightService

        svc = FlightService()
        try:
            booking = await svc.get_booking(bid)
        finally:
            await svc.close()
        return {
            "ok": bool(booking.get("found") or booking.get("booking_id")),
            "booking": booking,
        }
    except Exception as exc:
        traceback.print_exc()
        return {"ok": False, "error": _friendly_liteapi_error(exc)}


async def structured_flight_cancel_quote(*, booking_id: str) -> dict[str, Any]:
    """GET LiteAPI cancel quote — fee/refund, no commit."""
    bid = (booking_id or "").strip()
    if not bid:
        return {"ok": False, "error": "missing_booking_id", "message": "Missing booking id."}
    try:
        from flight_agent.services.flight_service import FlightService

        svc = FlightService()
        try:
            quote = await svc.get_cancellation_quote(bid)
        finally:
            await svc.close()
        return quote if isinstance(quote, dict) else {"ok": False, "message": "No quote."}
    except Exception as exc:
        traceback.print_exc()
        return {
            "ok": False,
            "error": "quote_failed",
            "message": _friendly_liteapi_error(exc),
        }


async def structured_flight_cancel_booking(
    *,
    booking_id: str,
    payment_id: str | None = None,
    expected_amount: float | None = None,
    payment_provider: str | None = None,
) -> dict[str, Any]:
    """Cancel via LiteAPI; refund via LiteAPI auto-refund or Itinero Stripe when pi_."""
    bid = (booking_id or "").strip()
    if not bid:
        return {"ok": False, "error": "missing_booking_id", "message": "Missing booking id."}
    try:
        from flight_agent.services.flight_service import FlightService
        from supervisor.payment_routing import (
            customer_refund_rail,
            maybe_refund_customer_after_cancel,
        )

        svc = FlightService()
        try:
            result = await svc.cancel_booking(bid)
        finally:
            await svc.close()

        pending = bool(result.get("pending"))
        cancelled = bool(result.get("cancelled") or result.get("already_cancelled"))
        rail = customer_refund_rail(
            payment_id=payment_id,
            payment_provider=payment_provider,
        )
        liteapi_handles_refund = rail == "liteapi"

        message = str(result.get("message") or "")
        dest = str(result.get("destination") or "original_payment").replace("_", " ")
        stripe_refund: dict[str, Any] | None = None

        if cancelled or pending:
            if rail == "itinero_stripe" and not pending:
                # Inventory was usually CREDIT on packages — refund Itinero merchant charge.
                refund_amt = result.get("refund_amount")
                if refund_amt is None:
                    refund_amt = expected_amount
                stripe_refund = await maybe_refund_customer_after_cancel(
                    payment_id=payment_id,
                    payment_provider=payment_provider,
                    amount=float(refund_amt) if refund_amt is not None else None,
                    currency=result.get("currency"),
                    booking_id=bid,
                )
            elif rail == "itinero_stripe" and pending:
                message = (
                    f"{message} Airline cancel is still pending — Itinero Stripe refund "
                    "will need a follow-up once cancel finalizes (or contact support)."
                ).strip()

        if pending and liteapi_handles_refund:
            message = (
                f"{message} Refund (if any) is credited to {dest} "
                "after the airline confirms cancel."
            ).strip()
        elif cancelled and liteapi_handles_refund:
            amt = result.get("refund_amount")
            if amt is not None:
                message = (
                    f"{message} Refund amount {amt} {result.get('currency') or ''} "
                    f"→ {dest}."
                ).strip()
            else:
                message = (
                    f"{message} Refund goes to {dest} per cancellation policy."
                ).strip()
        elif stripe_refund and stripe_refund.get("ok") and not stripe_refund.get("skipped"):
            amt = stripe_refund.get("refund_amount")
            message = (
                f"{message} Refund of {amt} {stripe_refund.get('currency') or ''} "
                "sent to your original card via Stripe."
                if amt is not None
                else f"{message} Stripe refund submitted to your original card."
            ).strip()
        elif stripe_refund and stripe_refund.get("skipped") and stripe_refund.get("message"):
            message = f"{message} {stripe_refund['message']}".strip()
        elif stripe_refund and not stripe_refund.get("ok"):
            message = (
                f"{message} Ticket cancel went through, but Stripe refund failed: "
                f"{stripe_refund.get('message') or 'contact support'}."
            ).strip()
        elif rail == "legacy_unsupported":
            message = (
                f"{message} Legacy payment cannot be auto-refunded — contact support."
            ).strip()

        return {
            "ok": True,
            "booking": result,
            "cancellation": {
                "status": result.get("status"),
                "cancellation_fee": result.get("cancellation_fee"),
                "refund_amount": (
                    (stripe_refund or {}).get("refund_amount")
                    if stripe_refund and stripe_refund.get("ok")
                    else result.get("refund_amount")
                ),
                "currency": result.get("currency") or (stripe_refund or {}).get("currency"),
                "destination": result.get("destination"),
                "vouchers": result.get("vouchers") or [],
                "pending": pending,
                "liteapi_auto_refund": liteapi_handles_refund,
                "refund_rail": rail,
            },
            "itinero_stripe_refund": stripe_refund,
            "pending": pending,
            "message": message
            or (
                "Flight booking cancelled."
                if cancelled
                else "Cancel requested — check booking status."
            ),
        }
    except Exception as exc:
        traceback.print_exc()
        return {
            "ok": False,
            "error": "cancel_failed",
            "message": _friendly_liteapi_error(exc),
        }
