"""Curated holiday packages — Itinero catalog + live LiteAPI hotel quotes."""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from supervisor.hotel_structured import (
    structured_hotel_book,
    structured_hotel_rates,
    structured_hotel_search,
)
from supervisor.package_engine import (
    component_status,
    derived_badge,
    instantiate,
    lighten_day,
    normalize_template,
    pricing_breakdown,
)

_DATA_PATH = Path(__file__).resolve().parent / "data" / "packages.json"
_BOOKINGS_PATH = Path(__file__).resolve().parent / "data" / "package_bookings.json"


def _infer_markets(pkg: dict[str, Any]) -> list[str]:
    """Backfill markets for legacy rows. Catalog `domestic` historically = India."""
    explicit = pkg.get("markets")
    if isinstance(explicit, list) and explicit:
        return [str(m).strip().upper() for m in explicit if str(m).strip()]
    region = str(pkg.get("region") or "").strip().lower()
    if region == "domestic":
        return ["IN"]
    if region == "international":
        return ["*"]
    return ["*"]


def _package_visible_in_market(pkg: dict[str, Any], market: str | None) -> bool:
    market_s = (market or "").strip().upper()
    if not market_s or market_s in ("ANY", "ALL", "GLOBAL"):
        return True
    markets = _infer_markets(pkg)
    if "*" in markets or "GLOBAL" in markets:
        return True
    return market_s in markets


def _load_packages() -> list[dict[str, Any]]:
    if not _DATA_PATH.exists():
        return []
    raw = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for pkg in raw:
        if not isinstance(pkg, dict):
            continue
        row = dict(pkg)
        row["markets"] = _infer_markets(row)
        from supervisor.destination_covers import fill_package_cover

        out.append(fill_package_cover(row))
    return out



def _load_all_bookings() -> list[dict[str, Any]]:
    if not _BOOKINGS_PATH.exists():
        return []
    try:
        rows = json.loads(_BOOKINGS_PATH.read_text(encoding="utf-8"))
        return rows if isinstance(rows, list) else []
    except Exception:
        return []


def _update_booking(record: dict[str, Any]) -> None:
    """Replace an existing booking row by bookingId (append if missing)."""
    bid = str(record.get("bookingId") or "")
    rows = _load_all_bookings()
    found = False
    for i, row in enumerate(rows):
        if isinstance(row, dict) and str(row.get("bookingId")) == bid:
            rows[i] = record
            found = True
            break
    if not found:
        rows.append(record)
    _BOOKINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    _BOOKINGS_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")


def _save_booking(record: dict[str, Any]) -> None:
    _BOOKINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing: list[dict[str, Any]] = []
    if _BOOKINGS_PATH.exists():
        try:
            existing = json.loads(_BOOKINGS_PATH.read_text(encoding="utf-8"))
            if not isinstance(existing, list):
                existing = []
        except Exception:
            existing = []
    existing.append(record)
    _BOOKINGS_PATH.write_text(json.dumps(existing, indent=2), encoding="utf-8")


def _find_package(package_id: str) -> dict[str, Any] | None:
    needle = str(package_id or "").strip().lower()
    if not needle:
        return None
    for pkg in _load_packages():
        if str(pkg.get("id") or "").lower() == needle:
            return pkg
        if str(pkg.get("slug") or "").lower() == needle:
            return pkg
        aliases = pkg.get("aliases") or []
        if any(str(a).lower() == needle for a in aliases):
            return pkg
    return None


def _package_themes(pkg: dict[str, Any]) -> list[str]:
    out: list[str] = []
    primary = str(pkg.get("theme") or "").strip().lower()
    if primary:
        out.append(primary)
    for t in pkg.get("themes") or []:
        s = str(t or "").strip().lower()
        if s and s not in out:
            out.append(s)
    try:
        from supervisor.activity_kit import inferred_activity_ids

        for act in inferred_activity_ids(pkg, include_local=True):
            if act not in out:
                out.append(act)
    except Exception:
        pass
    return out


def _card_view(pkg: dict[str, Any]) -> dict[str, Any]:
    tpl = normalize_template(pkg)
    rec = tpl.get("recommendedDurationDays") or []
    rec_label = None
    if rec:
        a, b = int(rec[0]), int(rec[-1])
        rec_label = f"{a} days" if a == b else f"{a}–{b} days"
    from supervisor.activity_kit import build_activity_kit

    kit = build_activity_kit(tpl)
    return {
        "id": tpl.get("id"),
        "slug": tpl.get("slug"),
        "title": tpl.get("title"),
        "tagline": tpl.get("tagline"),
        "overview": tpl.get("overview") or tpl.get("tagline"),
        "theme": tpl.get("theme"),
        "themes": _package_themes(tpl),
        "activityTags": kit.get("activities") or [],
        "region": tpl.get("region"),
        "productType": "curated_template",
        "badge": None,
        "fromPrice": None,
        "currency": tpl.get("currency") or "INR",
        "durationNights": tpl.get("durationNights"),
        "durationDays": tpl.get("durationDays"),
        "recommendedDurationDays": rec,
        "minDurationDays": tpl.get("minDurationDays"),
        "durationLabel": rec_label,
        "requiredAnchors": tpl.get("requiredAnchors") or [],
        "destinations": tpl.get("destinations") or tpl.get("routeConcept") or [],
        "coverImage": tpl.get("coverImage"),
        "highlights": (tpl.get("highlights") or [])[:4],
        "inclusions": (tpl.get("inclusions") or [])[:4],
        "idealMonths": tpl.get("idealMonths") or [],
        "difficulty": tpl.get("difficulty"),
        "groupSizeHint": tpl.get("groupSizeHint"),
        "featured": bool(tpl.get("featured")),
        "markets": _infer_markets(tpl),
    }


def list_packages(
    *,
    region: str | None = None,
    theme: str | None = None,
    max_price: float | None = None,
    q: str | None = None,
    duration: int | None = None,
    market: str | None = None,
) -> dict[str, Any]:
    packages = _load_packages()
    region_s = (region or "").strip().lower()
    theme_s = (theme or "").strip().lower()
    q_s = (q or "").strip().lower()
    market_s = (market or "").strip().upper()

    out: list[dict[str, Any]] = []
    for pkg in packages:
        if not _package_visible_in_market(pkg, market_s):
            continue
        if region_s and region_s != "any" and str(pkg.get("region") or "").lower() != region_s:
            continue
        if theme_s and theme_s != "any" and theme_s not in _package_themes(pkg):
            continue
        if max_price is not None and pkg.get("fromPrice") is not None:
            try:
                if float(pkg.get("fromPrice") or 0) > float(max_price):
                    continue
            except (TypeError, ValueError):
                continue
        if duration is not None:
            try:
                if int(pkg.get("durationNights") or 0) != int(duration):
                    continue
            except (TypeError, ValueError):
                continue
        if q_s:
            blob = " ".join(
                [
                    str(pkg.get("title") or ""),
                    str(pkg.get("tagline") or ""),
                    str(pkg.get("theme") or ""),
                    " ".join(_package_themes(pkg)),
                    " ".join(pkg.get("destinations") or []),
                    " ".join(pkg.get("highlights") or []),
                    " ".join(pkg.get("goodToKnow") or []),
                ]
            ).lower()
            if q_s not in blob:
                continue
        out.append(_card_view(pkg))

    out.sort(key=lambda p: (not p.get("featured"), str(p.get("title") or "")))
    themes = sorted({t for p in packages for t in _package_themes(p)})
    return {
        "packages": out,
        "total": len(out),
        "themes": themes,
        "regions": ["domestic", "international"],
        "market": market_s or None,
        "budgetLanes": [
            {"id": "under_15k", "label": "Live stay under ₹15k", "maxPrice": 15000},
            {"id": "under_30k", "label": "Live stay under ₹30k", "maxPrice": 30000},
            {"id": "under_60k", "label": "Live stay under ₹60k", "maxPrice": 60000},
        ],
        "mode": "live",
        "message": "Curated templates · live stays when you pick dates",
    }


def get_package(
    package_id: str,
    *,
    check_in: str | None = None,
    check_out: str | None = None,
    guests: int = 2,
    origin: str | None = None,
    variant: str | None = None,
) -> dict[str, Any]:
    pkg = _find_package(package_id)
    if not pkg:
        return {
            "package": None,
            "mode": "degraded",
            "error": "not_found",
            "message": "Package not found.",
        }
    tpl = normalize_template(pkg)
    from supervisor.activity_kit import build_activity_kit

    activity_kit = build_activity_kit(tpl)
    gateway = _flight_gateway(tpl)
    nights = int(tpl.get("durationNights") or 3)
    cin = (check_in or "").strip()
    cout = (check_out or "").strip()
    if not cin or not cout:
        cin, cout = _default_dates(nights)
    instance = instantiate(
        tpl,
        check_in=cin,
        check_out=cout,
        guests=guests,
        origin=origin,
        variant=variant,
    )
    public = {
        **tpl,
        "itinerary": instance.get("days") or [],
        "flightGateway": gateway,
        "instance": instance,
        "activityKit": activity_kit,
        "activityTags": activity_kit.get("activities") or [],
        "productType": "curated_template",
        "fromPrice": None,
        "badge": None,
    }
    return {
        "package": public,
        "instance": instance,
        "mode": "live",
        "message": "Template + validated instance for your dates. Live inventory is on /quote.",
    }


def _default_dates(nights: int) -> tuple[str, str]:
    start = date.today() + timedelta(days=14)
    end = start + timedelta(days=max(1, nights))
    return start.isoformat(), end.isoformat()


def _nights(check_in: str, check_out: str) -> int:
    try:
        a = date.fromisoformat(check_in[:10])
        b = date.fromisoformat(check_out[:10])
        return max(1, (b - a).days)
    except Exception:
        return 1


def _add_days(iso: str, n: int) -> str:
    d = date.fromisoformat(iso[:10]) + timedelta(days=n)
    return d.isoformat()


def _stay_segments(pkg: dict[str, Any], check_in: str) -> list[dict[str, Any]]:
    """
    Build consecutive overnight hotel segments from itinerary stayCity.
    Uses the first `durationNights` itinerary days (day N's stayCity = night N).
    Multi-city packages (e.g. Kedarnath Haridwar→Guptkashi) become multiple stays.
    """
    nights = max(1, int(pkg.get("durationNights") or 3))
    itin = pkg.get("itinerary") or []
    fallback = str(
        (pkg.get("stay") or {}).get("city")
        or (pkg.get("destinations") or ["India"])[0]
    )
    cities: list[str] = []
    for i in range(nights):
        day = itin[i] if i < len(itin) else {}
        city = str(day.get("stayCity") or "").strip() or fallback
        cities.append(city)

    segments: list[dict[str, Any]] = []
    i = 0
    while i < len(cities):
        city = cities[i]
        j = i + 1
        while j < len(cities) and cities[j] == city:
            j += 1
        seg_nights = j - i
        cin = _add_days(check_in, i)
        cout = _add_days(cin, seg_nights)
        segments.append(
            {
                "id": f"stay-{len(segments)}",
                "city": city,
                "nights": seg_nights,
                "checkIn": cin,
                "checkOut": cout,
                "label": f"{city} · {seg_nights} night{'s' if seg_nights != 1 else ''}",
            }
        )
        i = j
    return segments


async def _quote_one_stay(
    *,
    city: str,
    check_in: str,
    check_out: str,
    guests: int,
    rooms: int,
    currency: str,
    min_stars: Any = None,
    board_hint: str | None = None,
    hotel_id: str | None = None,
) -> dict[str, Any]:
    """Live quote for a single city/date window."""
    hid = (hotel_id or "").strip()
    hotel_ui: dict[str, Any] | None = None
    room: dict[str, Any] | None = None
    message = ""
    mode = "live"

    if hid:
        rates = await structured_hotel_rates(
            hotel_id=hid,
            check_in=check_in,
            check_out=check_out,
            guests=guests,
            rooms=rooms,
            currency=currency,
        )
        hotel_ui = rates.get("hotel")
        rooms_list = rates.get("rooms") or []
        if rooms_list:
            room = rooms_list[0]
        else:
            message = rates.get("message") or "No live rates for this stay."
            mode = rates.get("mode") or "degraded"
    else:
        search = await structured_hotel_search(
            city=city,
            check_in=check_in,
            check_out=check_out,
            guests=guests,
            rooms=rooms,
            currency=currency,
            page=1,
            page_size=8,
        )
        hotels = search.get("hotels") or []
        if min_stars and hotels:
            filtered = [
                h
                for h in hotels
                if float(h.get("stars") or h.get("rating") or 0) >= float(min_stars)
            ]
            if filtered:
                hotels = filtered
        if not hotels:
            return {
                "hotel": None,
                "room": None,
                "stayTotal": None,
                "taxes": None,
                "mode": search.get("mode") or "degraded",
                "message": search.get("message") or f"No hotels found in {city}.",
                "error": search.get("error") or "no_hotels",
            }
        pick = hotels[0]
        hid = str(pick.get("id") or "")
        hotel_ui = pick
        rates = await structured_hotel_rates(
            hotel_id=hid,
            check_in=check_in,
            check_out=check_out,
            guests=guests,
            rooms=rooms,
            currency=currency,
        )
        if rates.get("hotel"):
            hotel_ui = {**pick, **(rates.get("hotel") or {})}
        rooms_list = rates.get("rooms") or []
        if rooms_list:
            room = rooms_list[0]
        else:
            try:
                total = float(pick.get("totalPrice") or pick.get("price") or 0) * _nights(
                    check_in, check_out
                )
            except (TypeError, ValueError):
                total = 0.0
            if total > 0:
                room = {
                    "id": f"fallback-{hid}",
                    "offerId": None,
                    "title": "Standard room",
                    "board": board_hint or "Room Only",
                    "price": float(pick.get("price") or 0),
                    "taxes": 0,
                    "totalPrice": total,
                    "freeCancellation": False,
                    "hotelId": hid,
                }
            message = rates.get("message") or ""
            mode = "partial" if room else (rates.get("mode") or "degraded")

    stay_total = None
    taxes = None
    if room:
        stay_total = float(room.get("totalPrice") or 0)
        taxes = float(room.get("taxes") or 0)
        if stay_total <= 0 and room.get("price"):
            stay_total = float(room["price"]) * _nights(check_in, check_out)

    return {
        "hotel": hotel_ui,
        "room": room,
        "stayTotal": stay_total,
        "taxes": taxes,
        "mode": mode,
        "message": message,
        "error": None,
    }


def _flight_gateway(pkg: dict[str, Any]) -> dict[str, str] | None:
    """Resolve arrival airport for package flights (origin → gateway)."""
    flight = pkg.get("flight") if isinstance(pkg.get("flight"), dict) else {}
    code = str(flight.get("gatewayAirport") or flight.get("airport") or "").upper().strip()
    label = str(flight.get("gatewayCity") or flight.get("city") or "").strip()
    if code and len(code) == 3:
        return {"airport": code, "city": label or code}

    # Infer from destinations / stay cities
    blob = " ".join(
        [
            str(pkg.get("title") or ""),
            " ".join(pkg.get("destinations") or []),
            str((pkg.get("stay") or {}).get("city") or ""),
            " ".join(str(d.get("stayCity") or "") for d in (pkg.get("itinerary") or [])),
        ]
    ).lower()
    infer = [
        (("maldives", "malé", "male"), "MLE", "Malé"),
        (("dubai",), "DXB", "Dubai"),
        (("singapore",), "SIN", "Singapore"),
        (("andaman", "port blair", "havelock"), "IXZ", "Port Blair"),
        (("goa",), "GOI", "Goa"),
        # Himalaya / Char Dham before "kashi" (Guptkashi contains that substring)
        (
            ("haridwar", "guptkashi", "kedarnath", "chardham", "barkot", "uttarkashi", "dehradun", "rishikesh"),
            "DED",
            "Dehradun",
        ),
        (("varanasi",), "VNS", "Varanasi"),
        (("srinagar", "kashmir", "gulmarg", "pahalgam"), "SXR", "Srinagar"),
        (("manali", "kullu"), "KUU", "Kullu"),
        (("udaipur",), "UDR", "Udaipur"),
    ]
    for keys, airport, city in infer:
        if any(k in blob for k in keys):
            return {"airport": airport, "city": city}
    return None


def _flight_card_from_offer(
    offer: dict[str, Any],
    *,
    origin: str,
    destination: str,
    check_in: str,
    check_out: str,
    currency: str,
) -> dict[str, Any]:
    try:
        price = float(offer.get("price") or offer.get("total_price") or 0)
    except (TypeError, ValueError):
        price = 0.0
    return {
        "id": offer.get("id") or offer.get("offer_id"),
        "offerId": offer.get("offer_id") or offer.get("id"),
        "airline": offer.get("airline") or offer.get("airline_name"),
        "airlineCode": offer.get("airline_code"),
        "origin": origin,
        "destination": destination,
        "departDate": check_in,
        "returnDate": check_out,
        "departTime": offer.get("depart_time")
        or (
            offer.get("departure", {}).get("time")
            if isinstance(offer.get("departure"), dict)
            else None
        ),
        "arriveTime": offer.get("arrive_time"),
        "duration": offer.get("duration"),
        "stops": offer.get("stops"),
        "price": price,
        "currency": offer.get("currency") or currency,
        "tripType": "return",
    }


async def _search_package_flight_offers(
    *,
    origin: str,
    gateway: str,
    check_in: str,
    check_out: str,
    guests: int,
    currency: str,
) -> dict[str, Any]:
    from supervisor.flight_structured import structured_search

    origin_u = origin.upper().strip()[:3]
    dest_u = gateway.upper().strip()[:3]
    if not origin_u or not dest_u or origin_u == dest_u:
        return {
            "flights": [],
            "mode": "skipped",
            "message": "Pick a different origin airport than the package gateway.",
            "origin": origin_u,
            "destination": dest_u,
        }

    session = {"session_id": f"pkg-flight-{uuid.uuid4().hex[:8]}"}
    try:
        result = await structured_search(
            origin=origin_u,
            destination=dest_u,
            depart_date=check_in,
            return_date=check_out,
            adults=max(1, int(guests or 1)),
            children=0,
            infants=0,
            cabin="ECONOMY",
            session=session,
            currency=currency,
        )
    except Exception as exc:
        return {
            "flights": [],
            "mode": "degraded",
            "message": f"Flight search failed: {exc}",
            "origin": origin_u,
            "destination": dest_u,
            "sessionId": session["session_id"],
        }

    from supervisor import session_store

    session_store.save_session(session["session_id"], session)

    raw = result.get("flights") or []
    cards = [
        _flight_card_from_offer(
            f,
            origin=origin_u,
            destination=dest_u,
            check_in=check_in,
            check_out=check_out,
            currency=currency,
        )
        for f in raw
    ]
    cards.sort(key=lambda c: float(c.get("price") or 1e18))
    return {
        "flights": cards,
        "mode": result.get("mode") or ("live" if cards else "degraded"),
        "message": result.get("message")
        or (f"Return flights {origin_u}→{dest_u}." if cards else f"No flights {origin_u}→{dest_u}."),
        "origin": origin_u,
        "destination": dest_u,
        "sessionId": session["session_id"],
    }


async def _quote_package_flight(
    *,
    origin: str,
    gateway: str,
    check_in: str,
    check_out: str,
    guests: int,
    currency: str,
    flight_offer_id: str | None = None,
) -> dict[str, Any]:
    """Return flight for package dates — pinned offer or cheapest."""
    searched = await _search_package_flight_offers(
        origin=origin,
        gateway=gateway,
        check_in=check_in,
        check_out=check_out,
        guests=guests,
        currency=currency,
    )
    flights = searched.get("flights") or []
    if not flights:
        return {
            "flight": None,
            "flightTotal": None,
            "mode": searched.get("mode") or "degraded",
            "message": searched.get("message"),
            "origin": searched.get("origin"),
            "destination": searched.get("destination"),
            "alternates": 0,
        }

    pinned = (flight_offer_id or "").strip()
    best = None
    if pinned:
        for f in flights:
            if str(f.get("offerId") or "") == pinned or str(f.get("id") or "") == pinned:
                best = f
                break
    if best is None:
        best = flights[0]

    price = float(best.get("price") or 0)
    return {
        "flight": {**best, "sessionId": searched.get("sessionId")},
        "flightTotal": price if price > 0 else None,
        "flightSessionId": searched.get("sessionId"),
        "mode": "live",
        "message": searched.get("message")
        or f"Return flights {best.get('origin')}→{best.get('destination')} for your package dates.",
        "origin": best.get("origin"),
        "destination": best.get("destination"),
        "alternates": len(flights),
    }


async def hold_package_flight(
    *,
    package_id: str,
    origin: str,
    check_in: str,
    check_out: str,
    guests: int = 2,
    currency: str = "INR",
    flight_offer_id: str | None = None,
    guest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Select + prebook package flight on LiteAPI (same Stripe settlement as standalone flights)."""
    from supervisor import session_store
    from supervisor.flight_structured import structured_prebook, structured_select

    pkg = _find_package(package_id)
    if not pkg:
        return {"ok": False, "error": "not_found", "message": "Package not found."}
    gateway = _flight_gateway(pkg)
    if not gateway:
        return {"ok": False, "error": "no_gateway", "message": "This package has no flight gateway."}

    searched = await _search_package_flight_offers(
        origin=origin,
        gateway=gateway["airport"],
        check_in=check_in,
        check_out=check_out,
        guests=guests,
        currency=currency,
    )
    sid = searched.get("sessionId")
    if not sid:
        return {"ok": False, "error": "no_session", "message": "Flight search session missing."}
    flights = searched.get("flights") or []
    if not flights:
        return {
            "ok": False,
            "error": "no_flights",
            "message": searched.get("message") or "No flights for these dates.",
        }

    pinned = (flight_offer_id or "").strip()
    pick = None
    if pinned:
        for f in flights:
            if str(f.get("offerId") or f.get("id") or "") == pinned:
                pick = f
                break
    if pick is None:
        pick = flights[0]

    offer_id = str(pick.get("offerId") or pick.get("id") or "").strip()
    if not offer_id:
        return {"ok": False, "error": "no_offer", "message": "Flight offer id missing."}

    session = session_store.get_session(sid)
    selected = await structured_select(session=session, offer_id=offer_id, offer_index=None)
    if not selected.get("ok", True) and selected.get("error"):
        return {
            "ok": False,
            "error": "select_failed",
            "message": selected.get("message") or "Could not select this flight.",
        }
    session = session_store.get_session(sid)

    g = guest or {}
    first = str(g.get("firstName") or g.get("first_name") or "Guest").strip()
    last = str(g.get("lastName") or g.get("last_name") or "Traveller").strip()
    email = str(g.get("email") or "").strip()
    phone = str(g.get("phone") or "")
    phone_digits = "".join(ch for ch in phone if ch.isdigit()) or "9999999999"

    passengers = [
        {
            "first_name": first,
            "last_name": last,
            "birthday": str(g.get("dob") or g.get("dateOfBirth") or "1990-06-15"),
            "gender": "M",
            "nationality": "IN",
            "document_type": "PASSPORT",
            "document_number": str(g.get("passport") or "P1234567"),
            "document_expiry": "2030-12-31",
            "document_issue_country": "IN",
            "passenger_type": "adult",
        }
    ]
    for _ in range(max(0, int(guests or 1) - 1)):
        passengers.append({**passengers[0], "first_name": first, "last_name": last})

    prebooked = await structured_prebook(
        session=session,
        passengers=passengers,
        contact={
            "first_name": first,
            "last_name": last,
            "email": email,
            "phone_country_code": "91",
            "phone_number": phone_digits[-10:],
        },
    )
    session_store.save_session(sid, session)
    if not prebooked.get("ok") or not (prebooked.get("prebook") or {}).get("prebook_id"):
        return {
            "ok": False,
            "error": prebooked.get("error") or "prebook_failed",
            "message": prebooked.get("message") or "Could not hold this flight.",
        }
    pb = prebooked["prebook"]
    return {
        "ok": True,
        "prebook": pb,
        "sessionId": sid,
        "flight": pick,
        "message": "Flight hold ready.",
    }


async def package_flights(
    package_id: str,
    *,
    origin: str,
    check_in: str | None = None,
    check_out: str | None = None,
    guests: int = 2,
    currency: str = "INR",
    limit: int = 12,
) -> dict[str, Any]:
    """Alternate return flights for package flight swap."""
    pkg = _find_package(package_id)
    if not pkg:
        return {
            "flights": [],
            "mode": "degraded",
            "error": "not_found",
            "message": "Package not found.",
        }
    gateway = _flight_gateway(pkg)
    if not gateway:
        return {
            "flights": [],
            "mode": "unsupported",
            "message": "This package doesn’t have a flight gateway yet.",
        }
    nights = int(pkg.get("durationNights") or 3)
    cin = (check_in or "").strip()
    cout = (check_out or "").strip()
    if not cin or not cout:
        cin, cout = _default_dates(nights)

    searched = await _search_package_flight_offers(
        origin=origin,
        gateway=gateway["airport"],
        check_in=cin,
        check_out=cout,
        guests=guests,
        currency=currency,
    )
    flights = (searched.get("flights") or [])[: max(1, min(int(limit or 12), 24))]
    return {
        "flights": flights,
        "packageId": pkg.get("id"),
        "gateway": gateway,
        "origin": searched.get("origin"),
        "destination": searched.get("destination"),
        "checkIn": cin,
        "checkOut": cout,
        "mode": searched.get("mode"),
        "message": searched.get("message"),
    }


async def quote_package(
    package_id: str,
    *,
    check_in: str | None = None,
    check_out: str | None = None,
    guests: int = 2,
    rooms: int = 1,
    hotel_id: str | None = None,
    hotel_ids: dict[str, str] | None = None,
    origin: str | None = None,
    include_flights: bool = True,
    flight_offer_id: str | None = None,
    currency: str = "INR",
    variant: str | None = None,
    quote_mode: str = "full",
) -> dict[str, Any]:
    pkg = _find_package(package_id)
    if not pkg:
        return {
            "package": None,
            "quote": None,
            "mode": "degraded",
            "error": "not_found",
            "message": "Package not found.",
        }

    tpl = normalize_template(pkg)
    nights = int(tpl.get("durationNights") or 3)
    cin = (check_in or "").strip()
    cout = (check_out or "").strip()
    if not cin or not cout:
        cin, cout = _default_dates(nights)
    if cin and not cout:
        try:
            cout = (date.fromisoformat(cin[:10]) + timedelta(days=nights)).isoformat()
        except Exception:
            cin, cout = _default_dates(nights)

    instance = instantiate(
        tpl,
        check_in=cin,
        check_out=cout,
        guests=guests,
        origin=origin,
        variant=variant,
    )
    # Instance check-out may be the traveler window; stay nights follow instance nights.
    cin = instance.get("checkIn") or cin
    cout = instance.get("checkOut") or cout

    stay = tpl.get("stay") or {}
    min_stars = stay.get("minStars")
    board_hint = stay.get("boardHint")
    id_map = {str(k): str(v) for k, v in (hotel_ids or {}).items() if k and v}

    segments = list(instance.get("staySegments") or []) or _stay_segments(
        {**tpl, "itinerary": instance.get("days") or [], "durationNights": instance.get("nights")},
        cin,
    )
    listing = str(quote_mode or "full").lower() == "listing"
    if listing and len(segments) > 1:
        # Card price = live floor from the longest stay, not 5 sequential searches.
        segments = [max(segments, key=lambda s: int(s.get("nights") or 0))]

    if hotel_id and segments and segments[0]["city"] not in id_map:
        id_map[segments[0]["city"]] = str(hotel_id)

    stays_out: list[dict[str, Any]] = []
    hotel_total = 0.0
    taxes_total = 0.0
    modes: list[str] = []
    messages: list[str] = []
    nights_ok = 0
    nights_total = 0

    for seg in segments:
        city = seg["city"]
        quoted = await _quote_one_stay(
            city=city,
            check_in=seg["checkIn"],
            check_out=seg["checkOut"],
            guests=guests,
            rooms=rooms,
            currency=currency,
            min_stars=min_stars,
            board_hint=board_hint,
            hotel_id=id_map.get(city) or id_map.get(seg["id"]),
        )
        modes.append(quoted.get("mode") or "live")
        if quoted.get("message"):
            messages.append(str(quoted["message"]))
        st = quoted.get("stayTotal")
        tx = quoted.get("taxes")
        seg_nights = int(seg.get("nights") or _nights(seg["checkIn"], seg["checkOut"]))
        nights_total += seg_nights
        if st:
            hotel_total += float(st)
            nights_ok += seg_nights
        if tx:
            taxes_total += float(tx)
        stays_out.append(
            {
                **seg,
                "hotel": quoted.get("hotel"),
                "room": quoted.get("room"),
                "stayTotal": st,
                "taxes": tx,
                "mode": quoted.get("mode"),
                "message": quoted.get("message"),
                "error": quoted.get("error"),
                "status": "AVAILABLE" if quoted.get("room") else "UNAVAILABLE",
            }
        )

    primary = stays_out[0] if stays_out else None
    gateway = _flight_gateway(tpl)
    origin_code = (origin or "").upper().strip()[:3]
    flight_block: dict[str, Any] | None = None
    flight_total = None

    if listing:
        include_flights = False

    if include_flights and origin_code and gateway:
        flight_block = await _quote_package_flight(
            origin=origin_code,
            gateway=gateway["airport"],
            check_in=cin,
            check_out=cout,
            guests=guests,
            currency=currency,
            flight_offer_id=flight_offer_id,
        )
        flight_total = flight_block.get("flightTotal")
        if flight_block.get("mode") in ("degraded", "partial"):
            modes.append(flight_block["mode"])
    elif include_flights and not origin_code:
        flight_block = {
            "flight": None,
            "flightTotal": None,
            "mode": "needs_origin",
            "message": "Add where you’re flying from to include return flights.",
            "gateway": gateway,
        }
    elif include_flights and not gateway:
        flight_block = {
            "flight": None,
            "flightTotal": None,
            "mode": "unsupported",
            "message": "This package doesn’t have a flight gateway yet.",
        }

    itin_status = (instance.get("validation") or {}).get("status") or "NEEDS_REVIEW"
    status = component_status(
        itinerary_status=itin_status,
        hotel_nights_ok=nights_ok,
        hotel_nights_total=nights_total or int(instance.get("nights") or 0),
        hotel_searching=False,
        flight_origin=origin_code,
        flight_selected=bool(flight_total and flight_offer_id),
        flight_available=bool(flight_total),
        flight_supported=bool(gateway),
    )
    pricing = pricing_breakdown(
        stay_total=hotel_total if nights_ok else None,
        flight_total=flight_total,
        estimates=instance.get("estimates"),
        guests=guests,
        stay_nights=nights_ok or int(instance.get("nights") or 0),
        can_pay=bool(status.get("canPay")),
        template=tpl,
    )
    badge = derived_badge(pricing, region=tpl.get("region")) if not listing else None

    multi_note = None
    if len(stays_out) > 1:
        cities = " → ".join(dict.fromkeys(s["city"] for s in stays_out))
        multi_note = f"{len(stays_out)} stays: {cities}."

    mode = "live"
    if any(m in ("degraded", "partial") for m in modes):
        mode = "partial" if any(s.get("room") for s in stays_out) else "degraded"

    validation = instance.get("validation") or {}
    honesty = pricing.get("honesty") or "Live hotels are bookable. Ground is estimate-only."
    if not validation.get("ok"):
        honesty = "Itinerary is not ready to book until the circuit fits your dates."

    return {
        "package": {
            **_card_view(tpl),
            "flightGateway": gateway,
            "instance": instance,
            "itinerary": instance.get("days") or [],
        },
        "instance": instance,
        "quote": {
            "checkIn": cin,
            "checkOut": cout,
            "nights": instance.get("nights") or _nights(cin, cout),
            "guests": guests,
            "rooms": rooms,
            "currency": currency,
            "fromPrice": None,
            "hotel": (primary or {}).get("hotel"),
            "room": (primary or {}).get("room"),
            "stayTotal": hotel_total if nights_ok else None,
            "taxes": taxes_total if stays_out else None,
            "flight": (flight_block or {}).get("flight"),
            "flightTotal": flight_total,
            "flightMeta": {
                "mode": (flight_block or {}).get("mode"),
                "message": (flight_block or {}).get("message"),
                "gateway": gateway,
                "origin": origin_code or None,
                "alternates": (flight_block or {}).get("alternates"),
                "status": status.get("flight"),
            },
            "packageTotal": pricing.get("bookableTotal"),
            "bookableTotal": pricing.get("bookableTotal"),
            "payLiteApi": pricing.get("payLiteApi"),
            "payHotel": pricing.get("payHotel"),
            "payFlight": pricing.get("payFlight"),
            "payItinero": pricing.get("payItinero"),
            "payMargin": pricing.get("payMargin"),
            "packageMargin": pricing.get("packageMargin"),
            "inventoryTotal": pricing.get("inventoryTotal"),
            "estimatedExtrasMin": pricing.get("estimatedExtrasMin"),
            "estimatedExtrasMax": pricing.get("estimatedExtrasMax"),
            "estimatedTripMin": pricing.get("estimatedTripMin"),
            "estimatedTripMax": pricing.get("estimatedTripMax"),
            "stayPerNight": pricing.get("stayPerNight"),
            "payNow": pricing.get("payNow"),
            "canPay": pricing.get("canPay"),
            "pricing": pricing,
            "status": status,
            "validation": validation,
            "stays": stays_out,
            "multiStay": len(stays_out) > 1,
            "priceNote": None,
            "multiStayNote": multi_note,
            "honesty": honesty,
            "needsOrigin": bool(include_flights and not origin_code and gateway),
            "badge": badge,
            "variant": instance.get("variant"),
        },
        "mode": mode,
        "message": (
            (validation.get("issues") or [{}])[0].get("message")
            if not validation.get("ok")
            else multi_note or (messages[0] if messages else "Quote ready.")
        ),
    }


def preview_package_day(package_id: str, day: int, *, check_in: str, check_out: str, variant: str | None = None) -> dict[str, Any]:
    pkg = _find_package(package_id)
    if not pkg:
        return {"ok": False, "error": "not_found"}
    instance = instantiate(pkg, check_in=check_in, check_out=check_out, variant=variant)
    target = next((d for d in instance.get("days") or [] if int(d.get("day") or 0) == int(day)), None)
    if not target:
        return {"ok": False, "error": "day_not_found", "message": f"No day {day} on this instance."}
    return {"ok": True, "preview": lighten_day(target), "instanceId": instance.get("templateId")}


async def package_hotels(
    package_id: str,
    *,
    check_in: str | None = None,
    check_out: str | None = None,
    guests: int = 2,
    rooms: int = 1,
    currency: str = "INR",
    page: int = 1,
    page_size: int = 12,
    city: str | None = None,
) -> dict[str, Any]:
    pkg = _find_package(package_id)
    if not pkg:
        return {
            "hotels": [],
            "mode": "degraded",
            "error": "not_found",
            "message": "Package not found.",
        }
    stay = pkg.get("stay") or {}
    nights = int(pkg.get("durationNights") or 3)
    cin = (check_in or "").strip()
    cout = (check_out or "").strip()
    if not cin or not cout:
        cin, cout = _default_dates(nights)
    # Prefer explicit city (multi-stay swap); else package default
    search_city = str(
        city or stay.get("city") or (pkg.get("destinations") or ["India"])[0]
    ).strip()
    result = await structured_hotel_search(
        city=search_city,
        check_in=cin,
        check_out=cout,
        guests=guests,
        rooms=rooms,
        currency=currency,
        page=page,
        page_size=page_size,
    )
    result["packageId"] = pkg.get("id")
    result["city"] = search_city
    result["checkIn"] = cin
    result["checkOut"] = cout
    return result

async def book_package(
    *,
    package_id: str,
    offer_id: str | None,
    hotel_id: str | None,
    check_in: str,
    check_out: str,
    guests: int = 2,
    rooms: int = 1,
    guest: dict[str, Any] | None = None,
    room_snapshot: dict[str, Any] | None = None,
    hotel_snapshot: dict[str, Any] | None = None,
    mock_payment: bool = False,
    currency: str = "INR",
    prebook_id: str | None = None,
    transaction_id: str | None = None,
    payment_provider: str | None = None,
    expected_amount: float | None = None,
    itinero_amount: float | None = None,
    itinero_payment_id: str | None = None,
    itinero_payment_provider: str | None = None,
    flight_prebook_id: str | None = None,
    flight_transaction_id: str | None = None,
    flight_expected_amount: float | None = None,
    flight_session_id: str | None = None,
    flight_snapshot: dict[str, Any] | None = None,
    single_payment: bool = True,
    loyalty_discount: float | None = None,
) -> dict[str, Any]:
    """Confirm package booking.

    Default (single_payment=True): one Itinero Stripe charge for the full total.
    Hotel + flights are fulfilled via LiteAPI (credit) after payment is verified.
    """
    from supervisor.payment_guards import assert_mock_payment_allowed

    blocked = assert_mock_payment_allowed(mock_payment=bool(mock_payment))
    if blocked:
        return blocked

    pkg = _find_package(package_id)
    if not pkg:
        return {
            "ok": False,
            "error": "not_found",
            "message": "Package not found.",
        }

    instance = instantiate(
        pkg,
        check_in=check_in,
        check_out=check_out,
        guests=guests,
    )
    instance_days = list(instance.get("days") or [])
    guest = guest or {}
    pid = (prebook_id or "").strip()
    if not pid:
        return {
            "ok": False,
            "error": "payment_required",
            "message": "Hold the stay and complete hotel payment before confirming the package.",
        }

    first = (guest.get("firstName") or guest.get("first_name") or "Guest").strip()
    last = (guest.get("lastName") or guest.get("last_name") or "Traveller").strip()
    email = (guest.get("email") or "").strip()
    if not email:
        return {
            "ok": False,
            "error": "missing_guest",
            "message": "Guest email is required.",
        }

    from supervisor.package_engine import compute_package_margin

    try:
        payment_total = float(itinero_amount or 0)
    except (TypeError, ValueError):
        payment_total = 0.0
    if payment_total < 0:
        payment_total = 0.0

    hotel_total_est = expected_amount
    if hotel_total_est is None and room_snapshot:
        try:
            hotel_total_est = float(room_snapshot.get("totalPrice") or 0) or None
        except (TypeError, ValueError):
            hotel_total_est = None
    flight_due = 0.0
    if flight_snapshot:
        try:
            flight_due = float(
                flight_expected_amount
                or flight_snapshot.get("price")
                or flight_snapshot.get("flightTotal")
                or 0
            )
        except (TypeError, ValueError):
            flight_due = 0.0
    inventory_est = float(hotel_total_est or 0) + float(flight_due or 0)
    margin_est = float(
        compute_package_margin(template=pkg, inventory_total=inventory_est, guests=guests)
    )
    expected_total = inventory_est + margin_est
    try:
        discount_applied = max(0.0, float(loyalty_discount or 0))
    except (TypeError, ValueError):
        discount_applied = 0.0
    payable_total = max(0.0, expected_total - discount_applied)

    pay_id = (itinero_payment_id or "").strip()
    itinero_provider = (itinero_payment_provider or "").strip().lower()
    if single_payment and not mock_payment:
        if payment_total <= 0:
            return {
                "ok": False,
                "error": "payment_required",
                "message": "Complete package payment before confirming.",
            }
        if not pay_id:
            return {
                "ok": False,
                "error": "payment_required",
                "message": "Payment id missing — try checkout again.",
            }
        if payable_total > 0 and abs(payment_total - payable_total) > max(100, payable_total * 0.02):
            return {
                "ok": False,
                "error": "amount_mismatch",
                "message": "Payment amount does not match the quoted package total.",
            }
        from supervisor.payment_routing import verify_itinero_stripe_payment

        verified = await verify_itinero_stripe_payment(
            payment_intent_id=pay_id,
            expected_amount=payment_total,
            expected_currency=(currency or "INR").upper(),
        )
        itinero_provider = "stripe"
        if not verified.get("ok"):
            return {
                "ok": False,
                "error": verified.get("error") or "payment_unverified",
                "message": verified.get("message")
                or "Could not verify payment. Package was not confirmed.",
            }
    elif mock_payment:
        itinero_provider = "mock"
    else:
        itinero_provider = None

    holder = {
        "firstName": first,
        "lastName": last,
        "email": email,
        "phone": guest.get("phone"),
    }
    # After customer pays Itinero once, inventory is booked on LiteAPI credit.
    inventory_provider = "credit" if (single_payment and not mock_payment) else (
        "credit" if mock_payment else (payment_provider or "stripe")
    ).strip().lower()
    if inventory_provider == "razorpay":
        inventory_provider = "stripe"  # legacy; Razorpay unsupported

    hotel_res = await structured_hotel_book(
        prebook_id=pid,
        holder=holder,
        guests=[
            {
                "occupancyNumber": 1,
                "firstName": first,
                "lastName": last,
                "email": email,
            }
        ],
        transaction_id=None if single_payment else transaction_id,
        mock_payment=bool(mock_payment),
        payment_provider=inventory_provider,
        payment_id=None,
        expected_amount=expected_amount,
        allow_agency_credit=True,
    )
    if not hotel_res.get("ok"):
        return {
            "ok": False,
            "error": hotel_res.get("error") or "hotel_book_failed",
            "message": hotel_res.get("message")
            or "Hotel payment received but confirming the stay failed. Contact support.",
            "hotel": hotel_res,
        }

    hotel_booking = hotel_res.get("booking") if isinstance(hotel_res.get("booking"), dict) else {}
    hotel_total = expected_amount
    if hotel_total is None and room_snapshot:
        try:
            hotel_total = float(room_snapshot.get("totalPrice") or 0) or None
        except (TypeError, ValueError):
            hotel_total = None
    if hotel_total is None:
        try:
            hotel_total = float(hotel_booking.get("price") or 0) or None
        except (TypeError, ValueError):
            hotel_total = None

    flight_booking: dict[str, Any] | None = None
    flight_total: float | None = None
    fpid = (flight_prebook_id or "").strip()
    if flight_due > 0:
        if not fpid and not mock_payment:
            return {
                "ok": False,
                "error": "flight_hold_required",
                "message": "Flight hold missing — restart checkout.",
            }
        if fpid:
            from supervisor import session_store
            from supervisor.flight_structured import structured_complete

            sid = (flight_session_id or "").strip() or f"pkg-flight-{uuid.uuid4().hex[:8]}"
            session = session_store.get_session(sid)
            flight_res = await structured_complete(
                session=session,
                prebook_id=fpid,
                transaction_id=None if single_payment else flight_transaction_id,
                mock_payment=bool(mock_payment),
                payment_provider=inventory_provider,
                expected_amount=flight_due,
                currency=currency,
            )
            if not flight_res.get("ok"):
                return {
                    "ok": False,
                    "error": flight_res.get("error") or "flight_book_failed",
                    "message": flight_res.get("message")
                    or "Hotel confirmed but flight ticketing failed. Contact support.",
                    "hotel": hotel_res,
                    "flight": flight_res,
                }
            flight_booking = flight_res.get("booking") if isinstance(flight_res.get("booking"), dict) else {}
            try:
                flight_total = float(flight_due or flight_booking.get("price") or 0) or None
            except (TypeError, ValueError):
                flight_total = flight_due or None

    margin_amount = margin_est if single_payment else max(0.0, payment_total - inventory_est)
    booking_id = f"PKG-{uuid.uuid4().hex[:10].upper()}"
    customer_provider = (
        "itinero_stripe"
        if (single_payment and not mock_payment and pay_id.startswith("pi_"))
        else (itinero_provider or None)
    )
    customer_block = {
        "provider": customer_provider,
        "settlement": "itinero",
        "paymentId": pay_id or None,
        "amount": payment_total if payment_total > 0 else None,
        "singlePayment": bool(single_payment),
    }
    margin_block = {
        "provider": itinero_provider,
        "settlement": "itinero",
        "paymentId": pay_id or None,
        "amount": margin_amount if margin_amount > 0 else None,
        "label": "package_margin",
        "includedInCustomerCharge": bool(single_payment),
    }
    record = {
        "bookingId": booking_id,
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "mode": "booked",
        "payment": {
            "split": True,
            "currency": currency,
            "mock": bool(mock_payment),
            "hotel": {
                "provider": "liteapi_credit" if single_payment else "liteapi_stripe",
                "settlement": "liteapi",
                "transactionId": None if single_payment else transaction_id,
                "prebookId": pid,
                "amount": hotel_total,
            },
            "flight": {
                "provider": "liteapi_credit" if (single_payment and flight_total) else "liteapi_stripe",
                "settlement": "liteapi",
                "transactionId": None,
                "prebookId": fpid or None,
                "amount": flight_total,
            },
            "customer": customer_block,
            "margin": margin_block,
            "itinero": margin_block,
            "totalCharged": (
                float(payment_total or 0)
                or (float(hotel_total or 0) + float(flight_total or 0) + float(margin_amount or 0))
            )
            or None,
        },
        "package": {
            "id": pkg.get("id"),
            "slug": pkg.get("slug"),
            "title": pkg.get("title"),
            "theme": pkg.get("theme"),
            "region": pkg.get("region"),
            "itinerary": instance_days,
            "inclusions": pkg.get("inclusions") or [],
            "exclusions": pkg.get("exclusions") or [],
            "knowBeforeYouGo": pkg.get("knowBeforeYouGo") or pkg.get("know_before_you_go") or [],
            "groundEstimates": pkg.get("groundEstimates") or pkg.get("ground_estimates") or {},
            "coverImage": pkg.get("coverImage"),
            "destinations": pkg.get("destinations") or [],
            "requiredAnchors": pkg.get("requiredAnchors") or [],
            "durationNights": instance.get("nights") or pkg.get("durationNights"),
            "durationDays": len(instance_days) or pkg.get("durationDays"),
            "idealMonths": pkg.get("idealMonths") or [],
            "difficulty": pkg.get("difficulty"),
            "overview": pkg.get("overview") or pkg.get("tagline"),
        },
        "instance": {
            "checkIn": check_in,
            "checkOut": check_out,
            "variant": instance.get("variant"),
            "estimates": instance.get("estimates"),
        },
        "stay": {
            "hotelId": hotel_id,
            "hotel": hotel_snapshot,
            "room": room_snapshot,
            "checkIn": check_in,
            "checkOut": check_out,
            "guests": guests,
            "rooms": rooms,
            "currency": currency,
            "total": hotel_total,
            "offerId": (offer_id or "").strip() or None,
            "liteapi": {
                "prebookId": pid,
                "bookingId": hotel_booking.get("booking_id") or hotel_booking.get("bookingId"),
                "hotelConfirmationCode": hotel_booking.get("hotel_confirmation_code"),
                "status": hotel_booking.get("status") or "BOOKED",
                "price": hotel_booking.get("price"),
            },
        },
        "flight": flight_snapshot,
        "flightBooking": flight_booking,
        "guest": {
            "firstName": first,
            "lastName": last,
            "email": email,
            "phone": guest.get("phone"),
        },
        "honesty": (
            "Paid in one checkout to Itinero"
            + (" · hotel and flights included" if inventory_est > 0 else "")
            + " · itinerary curated by Itinero"
        ),
    }
    _save_booking(record)

    email_sent = False
    try:
        from supervisor.email_service import send_package_confirmation

        email_out = await send_package_confirmation(booking=record)
        email_sent = bool(email_out.get("ok"))
        if email_sent:
            record["emailSent"] = True
            record["emailChannel"] = email_out.get("channel")
            _save_booking(record)
    except Exception:
        pass

    return {
        "ok": True,
        "bookingId": booking_id,
        "mode": "booked",
        "booking": record,
        "hotelBooking": hotel_booking,
        "flightBooking": flight_booking,
        "emailSent": email_sent,
        "message": "Package confirmed — hotel"
        + (" + flights included" if flight_total else " paid")
        + (f" · package fee to Itinero" if itinero_due > 0 else "")
        + (" · confirmation email sent." if email_sent else "."),
    }



def _as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _cancel_blob(cancel_result: dict[str, Any] | None) -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(cancel_result, dict):
        return {}, {}
    cancel = (
        cancel_result.get("cancellation")
        if isinstance(cancel_result.get("cancellation"), dict)
        else {}
    )
    booking = (
        cancel_result.get("booking") if isinstance(cancel_result.get("booking"), dict) else {}
    )
    return cancel, booking


def _supplier_funds_settled(cancel_result: dict[str, Any] | None) -> bool:
    """True only when supplier cancel is final and refund outcome is known.

    Estimates (fee-only, pending airline) do NOT count as money received.
    Explicit refund_amount (including 0) or confirmed non-refundable = settled.
    """
    if not isinstance(cancel_result, dict) or not cancel_result.get("ok"):
        return False
    if cancel_result.get("pending"):
        return False
    cancel, booking = _cancel_blob(cancel_result)
    status = str(
        cancel.get("status")
        or booking.get("status")
        or cancel_result.get("status")
        or ""
    ).upper()
    if cancel_result.get("cancelled") is False and status and "CANCEL" not in status:
        # Explicit not cancelled yet
        if cancel_result.get("cancelled") is False:
            return False

    refund = cancel.get("refund_amount")
    if refund is None:
        refund = booking.get("refund_amount")
    if refund is not None:
        return True

    # Confirmed non-refundable → nothing coming back (settled at 0)
    if cancel.get("is_refundable") is False or booking.get("is_refundable") is False:
        return True
    if cancel_result.get("is_refundable") is False:
        return True

    pay_status = str(
        booking.get("payment_status")
        or booking.get("paymentStatus")
        or cancel.get("payment_status")
        or ""
    ).lower()
    if any(tok in pay_status for tok in ("refunded", "credited", "reversed", "settled")):
        return True

    # CANCELLED_WITH_CHARGES without refund_amount → treat as settled non-refund (0)
    if "CANCELLED_WITH_CHARGES" in status or "CANCELED_WITH_CHARGES" in status:
        return True

    return False


def _inventory_refund_slice(
    cancel_result: dict[str, Any] | None,
    component_amount: float | None,
) -> tuple[float, dict[str, Any]]:
    """Customer-payable hotel/flight slice — only after supplier funds are settled.

    Waits for confirmed refund_amount / non-refundable finalization.
    Does not Stripe-refund on fee estimates alone.
    """
    meta: dict[str, Any] = {
        "component": component_amount,
        "funds_settled": False,
        "awaiting_supplier_funds": False,
    }
    if not cancel_result:
        return 0.0, {**meta, "reason": "no_booking", "refund": 0.0}
    if not cancel_result.get("ok"):
        return 0.0, {
            **meta,
            "reason": "cancel_failed",
            "refund": 0.0,
            "awaiting_supplier_funds": True,
        }
    if cancel_result.get("pending"):
        return 0.0, {
            **meta,
            "reason": "pending_airline",
            "refund": 0.0,
            "awaiting_supplier_funds": True,
        }

    cancel, booking = _cancel_blob(cancel_result)
    refund = cancel.get("refund_amount")
    if refund is None:
        refund = booking.get("refund_amount")
    fee = cancel.get("cancellation_fee")
    if fee is None:
        fee = booking.get("cancellation_fee")
    fee_f = _as_float(fee) or 0.0
    meta["fee"] = fee_f

    settled = _supplier_funds_settled(cancel_result)
    meta["funds_settled"] = settled
    if not settled:
        # Keep an estimate for UX / pending ledger only — not for Stripe yet
        estimate = None
        if refund is not None:
            estimate = max(0.0, float(refund))
            if component_amount is not None:
                estimate = min(estimate, float(component_amount))
        elif component_amount is not None:
            estimate = max(0.0, float(component_amount) - fee_f)
        meta.update(
            {
                "reason": "awaiting_supplier_funds",
                "refund": 0.0,
                "pending_estimate": estimate,
                "awaiting_supplier_funds": True,
            }
        )
        return 0.0, meta

    if refund is not None:
        amt = max(0.0, float(refund))
        if component_amount is not None:
            amt = min(amt, float(component_amount))
        meta.update({"reason": "supplier_funds_received", "refund": amt})
        return amt, meta

    # Settled non-refundable / with-charges and no positive refund
    meta.update({"reason": "supplier_settled_non_refundable", "refund": 0.0})
    return 0.0, meta


async def _refresh_inventory_settlement(
    *,
    hotel_bid: str | None,
    flight_bid: str | None,
    hotel_cancel: dict[str, Any] | None,
    flight_cancel: dict[str, Any] | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Re-check supplier bookings so we only refund after money is actually back."""
    hotel_out = hotel_cancel
    flight_out = flight_cancel

    if hotel_bid and (not hotel_out or not _supplier_funds_settled(hotel_out)):
        try:
            from supervisor.hotel_structured import structured_hotel_get_booking

            live = await structured_hotel_get_booking(booking_id=hotel_bid)
            if live.get("ok") and isinstance(live.get("booking"), dict):
                b = live["booking"]
                status = str(b.get("status") or "").upper()
                raw = b.get("raw") if isinstance(b.get("raw"), dict) else {}
                refund = b.get("refund_amount")
                if refund is None:
                    refund = raw.get("refund_amount") or raw.get("refundAmount")
                fee = raw.get("cancellation_fee") or raw.get("cancellationFee")
                cancelled = "CANCEL" in status
                hotel_out = {
                    "ok": True,
                    "pending": bool(cancelled is False),
                    "cancelled": cancelled,
                    "booking": {
                        **b,
                        "status": status,
                        "refund_amount": refund,
                        "cancellation_fee": fee,
                        "payment_status": raw.get("payment_status") or raw.get("paymentStatus"),
                        "is_refundable": raw.get("isRefundable"),
                    },
                    "cancellation": {
                        "status": status,
                        "refund_amount": refund,
                        "cancellation_fee": fee,
                        "pending": not cancelled,
                    },
                }
        except Exception:
            pass

    if flight_bid and (not flight_out or not _supplier_funds_settled(flight_out)):
        try:
            from flight_agent.services.flight_service import FlightService

            svc = FlightService()
            try:
                live = await svc.get_booking(flight_bid)
            finally:
                await svc.close()
            if isinstance(live, dict) and (live.get("found") or live.get("booking_id") or live.get("status")):
                status = str(live.get("status") or "").upper()
                pending = "CANCEL" not in status and bool(
                    live.get("cancel_intent_at") or live.get("provider_cancel_status")
                )
                cancelled = (not pending) and "CANCEL" in status
                refund = live.get("refund_amount")
                fee = live.get("cancellation_fee")
                flight_out = {
                    "ok": True,
                    "pending": pending,
                    "cancelled": cancelled,
                    "status": status,
                    "booking": live,
                    "cancellation": {
                        "status": status,
                        "refund_amount": refund,
                        "cancellation_fee": fee,
                        "pending": pending,
                        "is_refundable": live.get("is_refundable"),
                    },
                    "is_refundable": live.get("is_refundable"),
                }
        except Exception:
            pass

    return hotel_out, flight_out


async def cancel_package(
    *,
    booking_id: str,
    email: str | None = None,
) -> dict[str, Any]:
    """Cancel package inventory via LiteAPI; Stripe-refund only after supplier funds settle.

    Hotel/flight customer slices wait until LiteAPI confirms refund (or non-refundable).
    Itinero margin waits until every inventory leg that exists is settled.
    Re-calling cancel settles any remaining customer refund once money is back.
    """
    from supervisor.flight_structured import structured_flight_cancel_booking
    from supervisor.hotel_structured import structured_hotel_cancel_booking
    from supervisor.payment_routing import maybe_refund_customer_after_cancel

    looked = get_package_booking(booking_id=booking_id, email=email)
    if not looked.get("ok") or not isinstance(looked.get("booking"), dict):
        return {
            "ok": False,
            "error": looked.get("error") or "not_found",
            "message": looked.get("message") or "Package booking not found.",
        }
    record = dict(looked["booking"])
    mode = str(record.get("mode") or "").lower()
    prior_cancel = record.get("cancellation") if isinstance(record.get("cancellation"), dict) else {}
    already_refunded = _as_float(prior_cancel.get("customer_refunded_total")) or 0.0
    settle_retry = mode in {
        "awaiting_supplier_refund",
        "cancel_partial",
        "cancelled_awaiting_refund",
    } or bool(prior_cancel.get("awaiting_supplier_funds"))

    if mode in {"cancelled", "canceled"} and not settle_retry:
        # Fully done (inventory + customer refund finished)
        if not prior_cancel.get("awaiting_supplier_funds"):
            return {
                "ok": True,
                "already_cancelled": True,
                "bookingId": record.get("bookingId"),
                "booking": record,
                "message": "Package already cancelled.",
            }

    payment = record.get("payment") if isinstance(record.get("payment"), dict) else {}
    customer = payment.get("customer") if isinstance(payment.get("customer"), dict) else {}
    hotel_pay = payment.get("hotel") if isinstance(payment.get("hotel"), dict) else {}
    flight_pay = payment.get("flight") if isinstance(payment.get("flight"), dict) else {}
    margin_pay = (
        payment.get("margin")
        if isinstance(payment.get("margin"), dict)
        else (payment.get("itinero") if isinstance(payment.get("itinero"), dict) else {})
    )
    pay_id = str(customer.get("paymentId") or "").strip()
    currency = str(payment.get("currency") or "INR")
    charged = _as_float(payment.get("totalCharged") or customer.get("amount"))

    stay = record.get("stay") if isinstance(record.get("stay"), dict) else {}
    lite = stay.get("liteapi") if isinstance(stay.get("liteapi"), dict) else {}
    hotel_bid = str(lite.get("bookingId") or "").strip()

    flight_booking = record.get("flightBooking") if isinstance(record.get("flightBooking"), dict) else {}
    flight_bid = str(
        flight_booking.get("booking_id")
        or flight_booking.get("bookingId")
        or ""
    ).strip()

    hotel_component = _as_float(hotel_pay.get("amount")) or _as_float(stay.get("total"))
    flight_component = _as_float(flight_pay.get("amount")) or _as_float(
        flight_booking.get("price") or flight_booking.get("total_price")
    )
    margin_component = _as_float(margin_pay.get("amount"))

    errors: list[str] = []
    hotel_cancel = prior_cancel.get("hotel") if isinstance(prior_cancel.get("hotel"), dict) else None
    flight_cancel = prior_cancel.get("flight") if isinstance(prior_cancel.get("flight"), dict) else None

    # First pass: request supplier cancels (skip if settle-only retry already requested).
    if hotel_bid and not settle_retry:
        hotel_cancel = await structured_hotel_cancel_booking(
            booking_id=hotel_bid,
            payment_provider="credit",
            payment_id=None,
        )
        if not hotel_cancel.get("ok"):
            errors.append(hotel_cancel.get("message") or "Hotel cancel failed.")
    if flight_bid and not settle_retry:
        flight_cancel = await structured_flight_cancel_booking(
            booking_id=flight_bid,
            payment_provider="credit",
            payment_id=None,
        )
        if not flight_cancel.get("ok"):
            errors.append(flight_cancel.get("message") or "Flight cancel failed.")

    # Always refresh live supplier status before deciding Stripe refund.
    hotel_cancel, flight_cancel = await _refresh_inventory_settlement(
        hotel_bid=hotel_bid or None,
        flight_bid=flight_bid or None,
        hotel_cancel=hotel_cancel,
        flight_cancel=flight_cancel,
    )

    hotel_slice, hotel_meta = _inventory_refund_slice(hotel_cancel, hotel_component)
    flight_slice, flight_meta = _inventory_refund_slice(flight_cancel, flight_component)

    hotel_settled = (not hotel_bid) or bool(hotel_meta.get("funds_settled"))
    flight_settled = (not flight_bid) or bool(flight_meta.get("funds_settled"))
    awaiting = bool(hotel_meta.get("awaiting_supplier_funds") or flight_meta.get("awaiting_supplier_funds"))

    # Margin only after every inventory leg has settled (money back or confirmed $0).
    margin_slice = 0.0
    margin_meta: dict[str, Any] = {"component": margin_component, "reason": "withheld"}
    if margin_component and margin_component > 0 and hotel_settled and flight_settled:
        margin_slice = float(margin_component)
        margin_meta = {
            "component": margin_component,
            "reason": "package_fee_after_supplier_settlement",
            "refund": margin_slice,
            "funds_settled": True,
        }
    elif margin_component and margin_component > 0:
        margin_meta = {
            "component": margin_component,
            "reason": "awaiting_supplier_funds",
            "refund": 0.0,
            "awaiting_supplier_funds": True,
            "funds_settled": False,
        }

    refund_breakdown = {
        "hotel": hotel_meta,
        "flight": flight_meta,
        "margin": margin_meta,
        "hotel_refund": hotel_slice,
        "flight_refund": flight_slice,
        "margin_refund": margin_slice,
        "total_charged": charged,
        "already_refunded_to_customer": already_refunded,
        "awaiting_supplier_funds": awaiting,
    }
    newly_settled_total = round(hotel_slice + flight_slice + margin_slice, 2)
    # Only refund what is newly settled beyond what we already sent to the card.
    refund_total = max(0.0, round(newly_settled_total - already_refunded, 2))
    if charged is not None:
        refund_total = min(refund_total, max(0.0, round(float(charged) - already_refunded, 2)))
    refund_breakdown["settled_total"] = newly_settled_total
    refund_breakdown["customer_refund"] = refund_total

    stripe_refund = None
    if pay_id.startswith("pi_"):
        if refund_total <= 0:
            stripe_refund = {
                "ok": True,
                "skipped": True,
                "reason": "awaiting_supplier_funds" if awaiting else "nothing_refundable",
                "provider": "itinero_stripe",
                "payment_intent_id": pay_id,
                "refund_amount": 0,
                "currency": currency,
                "message": (
                    "Card refund held until hotel/flight money is confirmed back from the supplier. "
                    "Open cancel again later to settle any remaining refund."
                    if awaiting
                    else "No card refund — supplier confirmed non-refundable amounts (or nothing new to refund)."
                ),
                "breakdown": refund_breakdown,
            }
        else:
            stripe_refund = await maybe_refund_customer_after_cancel(
                payment_id=pay_id,
                payment_provider="itinero_stripe",
                amount=refund_total,
                currency=currency,
                # Distinct idempotency per settled tranche so retries can add later slices.
                booking_id=f"{record.get('bookingId') or booking_id}-settled-{int(newly_settled_total * 100)}",
            )
            if isinstance(stripe_refund, dict):
                stripe_refund = {**stripe_refund, "breakdown": refund_breakdown}
            if not stripe_refund.get("ok"):
                errors.append(stripe_refund.get("message") or "Stripe refund failed.")
            elif stripe_refund.get("ok"):
                already_refunded = round(already_refunded + refund_total, 2)

    if awaiting or errors:
        record["mode"] = "awaiting_supplier_refund" if awaiting else "cancel_partial"
    else:
        record["mode"] = "cancelled"
    record["cancelledAt"] = record.get("cancelledAt") or (datetime.utcnow().isoformat() + "Z")
    record["cancellation"] = {
        "hotel": hotel_cancel,
        "flight": flight_cancel,
        "itinero_stripe_refund": stripe_refund,
        "refund_breakdown": refund_breakdown,
        "awaiting_supplier_funds": awaiting,
        "customer_refunded_total": already_refunded,
        "errors": errors,
    }
    _update_booking(record)

    ok = not errors or (hotel_cancel and hotel_cancel.get("ok")) or (flight_cancel and flight_cancel.get("ok")) or (
        stripe_refund and stripe_refund.get("ok")
    )
    msg_parts = ["Package cancel requested."]
    if hotel_cancel and hotel_cancel.get("ok"):
        msg_parts.append("Stay cancel submitted to supplier.")
    if flight_cancel and flight_cancel.get("ok"):
        msg_parts.append("Flight cancel submitted to supplier.")
    if awaiting:
        msg_parts.append(
            "Card refund waits until hotel/flight funds are confirmed back — tap Cancel again later to settle."
        )
    if stripe_refund and stripe_refund.get("ok") and not stripe_refund.get("skipped"):
        amt = stripe_refund.get("refund_amount")
        msg_parts.append(
            f"Refund of {amt} {stripe_refund.get('currency') or currency} sent to your card "
            f"(only amounts already recovered from hotel/flight"
            + (f"; total refunded so far {already_refunded}" if already_refunded else "")
            + ")."
            if amt is not None
            else "Stripe refund submitted for supplier-settled amounts only."
        )
    elif stripe_refund and stripe_refund.get("skipped") and not awaiting:
        msg_parts.append(stripe_refund.get("message") or "No additional Stripe refund.")
    if errors:
        msg_parts.append("Issues: " + " ".join(errors))

    return {
        "ok": bool(ok) and not (errors and stripe_refund and not stripe_refund.get("ok")),
        "bookingId": record.get("bookingId"),
        "booking": record,
        "hotel_cancel": hotel_cancel,
        "flight_cancel": flight_cancel,
        "itinero_stripe_refund": stripe_refund,
        "refund_breakdown": refund_breakdown,
        "awaiting_supplier_funds": awaiting,
        "cancellation": {
            "pending": awaiting or bool((flight_cancel or {}).get("pending")),
            "liteapi_auto_refund": False,
            "refund_rail": "itinero_stripe" if pay_id.startswith("pi_") else "none",
            "refund_amount": refund_total if stripe_refund and not stripe_refund.get("skipped") else 0,
            "currency": (stripe_refund or {}).get("currency") or currency,
            "total_charged": charged,
            "customer_refunded_total": already_refunded,
            "awaiting_supplier_funds": awaiting,
            "withheld": (
                round(float(charged) - float(already_refunded), 2)
                if charged is not None
                else None
            ),
        },
        "errors": errors,
        "message": " ".join(msg_parts),
    }


def get_package_booking(booking_id: str, email: str | None = None) -> dict[str, Any]:
    """Return a booking only when guest email matches (IDOR guard)."""
    if not _BOOKINGS_PATH.exists():
        return {"booking": None, "error": "not_found"}
    want = (email or "").strip().lower()
    if not want or "@" not in want:
        return {
            "booking": None,
            "error": "email_required",
            "message": "Provide the guest email used at checkout to look up this booking.",
        }
    try:
        rows = json.loads(_BOOKINGS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"booking": None, "error": "read_error"}
    for row in rows if isinstance(rows, list) else []:
        if str(row.get("bookingId")) != str(booking_id):
            continue
        guest = row.get("guest") if isinstance(row.get("guest"), dict) else {}
        got = str(guest.get("email") or "").strip().lower()
        if got and got == want:
            return {"booking": row, "ok": True}
        return {
            "booking": None,
            "error": "forbidden",
            "message": "Email does not match this booking.",
        }
    return {"booking": None, "error": "not_found"}
