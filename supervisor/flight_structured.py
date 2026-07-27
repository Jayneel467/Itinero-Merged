"""Structured LiteAPI flight ops for manual (OTA) booking — shares session with AI chat."""

from __future__ import annotations

import asyncio
import os
import time
import traceback
from typing import Any

from supervisor.normalize import normalize_search_list, offer_to_ui

# In-memory min-fare cache for price calendar (real LiteAPI only — never invent).
_PRICE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_PRICE_CACHE_TTL_SEC = 15 * 60
_PRICE_CALENDAR_CONCURRENCY = 3


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
) -> dict[str, Any]:
    """Fan-out LiteAPI searches for min fare per date (manual flow only, no AI).

    Does not mutate booking session offer state. Uses concurrency limits + TTL cache.
    """
    from flight_agent.models.intents import FlightSearchParams
    from flight_agent.services.flight_service import FlightService

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

    results: dict[str, dict[str, Any]] = {}
    pending: list[str] = []

    for date in unique_dates:
        day_return = return_date if return_date and return_date > date else None
        key = _cache_key(
            origin=origin_u,
            destination=dest_u,
            date=date,
            adults=adults_n,
            children=children_n,
            infants=infants_n,
            cabin=cabin_u,
            return_date=day_return,
        )
        cached = _cache_get(key)
        if cached is not None:
            results[date] = dict(cached)
        else:
            pending.append(date)

    errors: list[str] = []

    if pending:
        sem = asyncio.Semaphore(_PRICE_CALENDAR_CONCURRENCY)
        svc = FlightService()

        async def fetch_one(date: str) -> None:
            day_return = return_date if return_date and return_date > date else None
            key = _cache_key(
                origin=origin_u,
                destination=dest_u,
                date=date,
                adults=adults_n,
                children=children_n,
                infants=infants_n,
                cabin=cabin_u,
                return_date=day_return,
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
                        currency="INR",
                    )
                    result = await svc.search(params)
                    min_price, currency = _min_price_from_offers(result.get("offers") or [])
                    entry = {
                        "date": date,
                        "minPrice": min_price,
                        "currency": currency,
                    }
                    _cache_set(key, entry)
                    results[date] = entry
                except Exception as exc:
                    traceback.print_exc()
                    errors.append(f"{date}: {type(exc).__name__}")
                    entry = {
                        "date": date,
                        "minPrice": None,
                        "currency": "INR",
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
        f"Price calendar: {priced}/{len(ordered)} days with live LiteAPI fares."
        if ordered
        else "No dates requested."
    )
    if errors and not priced:
        message = (
            "Live price calendar failed. Check LiteAPI / API_KEY — no sample fares are shown."
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
                currency="INR",
            )
            result = await svc.search(params)
        finally:
            await svc.close()

        offers = result.get("offers") or []
        ui = normalize_search_list(
            offers, origin=origin.upper(), destination=destination.upper()
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
        }
        session["flight_context"] = ctx.model_dump()

        total_offers = int(result.get("total_offers") or len(offers))
        if ui:
            message = f"Found {len(ui)} live offers via LiteAPI."
        elif total_offers > 0:
            message = (
                f"LiteAPI returned {total_offers} offer(s) for "
                f"{params.origin}→{params.destination}, but none looked like real "
                "schedules (sandbox/junk carriers or bad airports were filtered). "
                "Try BOM→DEL or another major route."
            )
        else:
            message = f"No LiteAPI offers for {params.origin}→{params.destination}."
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
        return {
            "session_id": session["session_id"],
            "flights": [],
            "mode": "degraded",
            "message": (
                f"Live flight search failed ({type(exc).__name__}). "
                "Check LiteAPI / API_KEY and try again — no sample fares are shown."
            ),
            "route_path": ["start", "manual_booking", "flight_service", "error"],
            "session_context": session.get("flight_context"),
            "booking_ready": False,
            "payment_ready": False,
            "error": f"{type(exc).__name__}: {exc}",
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

        # Verify fare (hard ceiling so Review → Continue cannot hang forever)
        import asyncio

        verify_info = None
        try:
            svc = FlightService()
            try:
                verify_info = await asyncio.wait_for(svc.verify(resolved_id), timeout=40.0)
                if verify_info.get("verified"):
                    ctx.verified_offer_id = resolved_id
                    ctx.last_verified_offer = verify_info
                    session["flight_context"] = ctx.model_dump()
                else:
                    verify_info = {
                        "verified": False,
                        "error": verify_info.get("message")
                        or "This fare is no longer available. Pick another flight.",
                    }
            finally:
                await svc.close()
        except asyncio.TimeoutError:
            verify_info = {
                "verified": False,
                "error": "Fare verification timed out. Try again or pick another flight.",
            }
        except Exception as exc:
            verify_info = {"verified": False, "error": _friendly_liteapi_error(exc)}

        if verify_info and verify_info.get("verified") is False:
            return {
                "ok": False,
                "error": verify_info.get("error") or "Could not verify this fare.",
                "session_id": session["session_id"],
                "offer_id": resolved_id,
                "verify": verify_info,
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
    import os

    env = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or os.getenv("ENV") or "sandbox").lower()
    if env in {"sandbox", "development", "dev", "local", "test"}:
        return True
    # LiteAPI sandbox keys are prefixed sand_
    for key_name in ("LITEAPI_API_KEY", "LITEAPI_KEY", "API_KEY"):
        val = (os.getenv(key_name) or "").strip().lower()
        if val.startswith("sand_"):
            return True
    return False


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

        travel_date = (ctx.search_context or {}).get("departure_date")
        for i, raw_pax in enumerate(passengers):
            ptype = int(raw_pax.get("passenger_type") or 0)
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

        pax = [PassengerSlot.model_validate(p) for p in passengers]
        contact_slot = ContactSlot.model_validate(contact)

        svc = FlightService()
        try:
            async def _run_prebook() -> dict[str, Any]:
                if not ctx.verified_offer_id:
                    verified = await svc.verify(offer_id)
                    ctx.verified_offer_id = offer_id
                    ctx.last_verified_offer = verified
                return await svc.prebook(offer_id, pax, contact_slot)

            # Cap wall time so Review → payment never hangs forever server-side.
            prebook = await asyncio.wait_for(_run_prebook(), timeout=50.0)
        finally:
            await svc.close()

        settings = get_settings()
        # Env fallback when LiteAPI omits publishableKey (common in some sandbox accounts).
        publishable = (
            prebook.get("publishable_key")
            or (settings.stripe_publishable_key or "").strip()
            or (os.getenv("STRIPE_PUBLISHABLE_KEY") or "").strip()
            or None
        )
        if publishable and not prebook.get("publishable_key"):
            prebook = {**prebook, "publishable_key": publishable}

        client_secret = prebook.get("secret_key")
        has_stripe = bool(client_secret and publishable)
        ok = bool(prebook.get("success")) and bool(prebook.get("prebook_id"))
        # When LiteAPI omits Payment SDK secrets, always allow mock card in sandbox
        # so Review → Payment works locally (test card 4242…).
        force_mock = (os.getenv("ITINERO_ALLOW_MOCK_PAYMENT") or "true").lower() in {
            "1",
            "true",
            "yes",
        }
        allow_mock = ok and not has_stripe and (_is_sandbox_app() or force_mock)
        payment_mode = "stripe" if has_stripe else ("mock_sandbox" if allow_mock else "unavailable")

        ctx.prebook_id = prebook.get("prebook_id")
        ctx.transaction_id = prebook.get("transaction_id")
        ctx.secret_key = client_secret
        ctx.publishable_key = publishable
        ctx.last_prebook = {**prebook, "payment_mode": payment_mode, "allow_mock_payment": allow_mock}
        ctx.travelers_draft = passengers
        ctx.awaiting_payment_confirmation = ok
        session["flight_context"] = ctx.model_dump()

        if ok and has_stripe:
            message = "Hold created. Complete card payment with LiteAPI Payment SDK (Stripe)."
        elif ok and allow_mock:
            message = (
                "Hold created. LiteAPI did not return Stripe Payment SDK keys for this sandbox "
                "account — use the demo card form (4242…) to continue the booking flow."
            )
        elif ok:
            message = (
                "Hold created, but Payment SDK keys are missing. "
                "Set STRIPE_PUBLISHABLE_KEY or enable Payment SDK on the LiteAPI account."
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
            },
            "session_context": {
                k: v
                for k, v in session["flight_context"].items()
                if k != "secret_key"
            },
            "booking_ready": ok,
            # UI can open payment when Stripe is ready OR sandbox mock is allowed.
            "payment_ready": ok and (has_stripe or allow_mock),
            "route_path": ["start", "manual_booking", "prebook", "payment"],
            "mode": "live" if has_stripe else ("sandbox" if allow_mock else "live"),
            "message": message,
            "error": None if ok else "prebook_failed",
        }
    except asyncio.TimeoutError:
        return {
            "ok": False,
            "error": "Booking hold timed out waiting for LiteAPI. Try again or pick another flight.",
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


async def structured_complete(
    *,
    session: dict[str, Any],
    prebook_id: str | None = None,
    transaction_id: str | None = None,
    mock_payment: bool = False,
) -> dict[str, Any]:
    """Finalize LiteAPI booking after payment (TRANSACTION_ID) or sandbox CREDIT/mock."""
    try:
        from flight_agent.config import get_settings
        from flight_agent.models.agent import SessionContext
        from flight_agent.models.liteapi import PaymentMethod
        from flight_agent.services.flight_service import FlightService

        ctx_data = session.get("flight_context")
        ctx = SessionContext.model_validate(ctx_data) if ctx_data else SessionContext()
        pid = prebook_id or ctx.prebook_id
        tid = transaction_id or ctx.transaction_id
        last_pb = ctx.last_prebook or {}
        sandbox_mock = bool(mock_payment) and _is_sandbox_app()
        if not pid:
            return {
                "ok": False,
                "error": "No prebook_id — select and prebook first.",
                "session_id": session["session_id"],
            }

        settings = get_settings()
        booking: dict[str, Any] | None = None
        complete_error: str | None = None

        svc = FlightService()
        try:
            attempts: list[tuple[str | None, str | None]] = []
            if sandbox_mock:
                # Demo card path: prefer CREDIT (no Stripe confirm), then TRANSACTION_ID if present.
                attempts.append((PaymentMethod.CREDIT.value, None))
                if tid:
                    attempts.append((PaymentMethod.TRANSACTION_ID.value, tid))
            else:
                if tid:
                    attempts.append((PaymentMethod.TRANSACTION_ID.value, tid))
                if (
                    _is_sandbox_app()
                    and not tid
                    and not settings.liteapi_use_payment_sdk
                ):
                    attempts.append((PaymentMethod.CREDIT.value, None))
                if not attempts:
                    if settings.liteapi_use_payment_sdk:
                        attempts.append((PaymentMethod.TRANSACTION_ID.value, tid))
                    else:
                        attempts.append((PaymentMethod.CREDIT.value, None))

            seen: set[tuple[str | None, str | None]] = set()
            for method, method_tid in attempts:
                key = (method, method_tid)
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
        if not ok and sandbox_mock and pid:
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
                "No airline ticket was issued — LiteAPI complete did not return a booking."
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
