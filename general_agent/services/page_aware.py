"""
Answer from left-page UI context without calling the LLM.

When the user is browsing flights/hotels on the Itinero site, questions like
"cheapest", "most expensive", "fastest" must use the on-screen list — never
re-ask origin/destination/dates.
"""
from __future__ import annotations

import re
from typing import Any, Optional

from services.airline_facts import (
    baggage_facts,
    first_flight_leg,
    format_baggage_reply,
    format_terminal_reply,
)
from services.live_unknowns import instant_live_guard, skip_all_instant, skip_booking_instant


_LIST_INTENT = re.compile(
    r"\b(cheap(?:est)?|lowest|budget|expensive|priciest|highest|fastest|"
    r"shortest|quickest|non[- ]?stop|direct|compare|top\s*3|best (?:value|deal|price)|"
    r"under|below|less than|morning|evening)\b",
    re.I,
)
_OUT_OF_PAGE = re.compile(
    r"\b(weather|visa|passport|restaurant|food|eat|cuisine|itinerary|"
    r"plan a trip|honeymoon|eliminate|constraint|package|capital|"
    r"time ?zone|language|currency of|who is)\b",
    re.I,
)
_BOOKING_OPS = re.compile(
    r"(?:\b(baggage|bags?|luggage|check[- ]?in bag|cabin bag|hand ?bag|allowance|"
    r"terminal|gate|pnr|booking (?:id|ref|reference)|boarding)\b|"
    r"સામાન|बैगेज|सामान|टर्मिनल|पीएनआर)",
    re.I,
)

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
_MONTH_ALT = r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
_DATE_ONLY = re.compile(
    rf"^\s*(?:on\s+|for\s+|depart(?:ure)?\s+|try\s+)?"
    rf"(?:\d{{1,2}}(?:st|nd|rd|th)?\s+(?:{_MONTH_ALT})|(?:{_MONTH_ALT})\s+\d{{1,2}}(?:st|nd|rd|th)?|20\d{{2}}-\d{{2}}-\d{{2}})"
    rf"\s*$",
    re.I,
)


def _parse_loose_date(text: str) -> Optional[str]:
    from datetime import date as dtdate

    t = (text or "").strip()
    m = re.search(r"\b(20\d{2})-(\d{2})-(\d{2})\b", t)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.search(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH_ALT})\b", t, re.I)
    if not m:
        m = re.search(rf"\b({_MONTH_ALT})\s+(\d{{1,2}})(?:st|nd|rd|th)?\b", t, re.I)
        if m:
            month_s, day_s = m.group(1), m.group(2)
        else:
            return None
    else:
        day_s, month_s = m.group(1), m.group(2)
    key = month_s.lower()
    month = _MONTHS.get(key) or _MONTHS.get(key[:3]) or _MONTHS.get(key[:4])
    if not month:
        return None
    day = int(day_s)
    today = dtdate.today()
    year = today.year
    try:
        parsed = dtdate(year, month, day)
    except ValueError:
        return None
    if parsed < today:
        try:
            parsed = dtdate(year + 1, month, day)
        except ValueError:
            return None
    return parsed.isoformat()


def _inr(n, currency="INR") -> str:
    try:
        v = float(n)
    except (TypeError, ValueError):
        return ""
    code = str(currency or "INR").upper()
    if code in ("INR", ""):
        return f"₹{int(round(v)):,}"
    return f"{code} {int(round(v)):,}"


def _flight_line(p: dict | None) -> str:
    if not isinstance(p, dict):
        return ""
    stops = p.get("stops")
    stop_bit = "direct" if stops in (0, "0") else (f"{stops} stop" if stops is not None else "")
    num = f" {p['flight_number']}" if p.get("flight_number") else ""
    dep, arr = p.get("dep_time") or "", p.get("arr_time") or ""
    time = f"{dep}→{arr}" if dep or arr else ""
    dur = p.get("duration") or stop_bit
    extra = f", {dur}" if dur else ""
    price = _inr(p.get("price"), p.get("currency"))
    return f"**{p.get('airline') or 'Flight'}{num}** {time}{extra} · {price}".strip()


def _hotel_line(p: dict | None) -> str:
    if not isinstance(p, dict):
        return ""
    stars = f" {p['stars']}★" if p.get("stars") else ""
    area = f" · {p['area']}" if p.get("area") else ""
    price = _inr(p.get("price_per_night"), p.get("currency"))
    return f"**{p.get('name') or 'Stay'}**{stars}{area} · {price}/night"


def is_out_of_page_question(text: str) -> bool:
    t = text or ""
    if _BOOKING_OPS.search(t):
        return False
    return bool(_OUT_OF_PAGE.search(t))


def _city_from_label(label: Any) -> str:
    s = str(label or "")
    return re.sub(r"\s*\([A-Z]{3}\)\s*$", "", s).strip()


def _answer_booking_ops(text: str, ui_page: dict) -> Optional[str]:
    if not _BOOKING_OPS.search(text or ""):
        return None
    screen = ui_page.get("screen")
    if screen not in ("trips", "passenger_info", "booking_success"):
        return None
    flight = first_flight_leg(ui_page)
    if not flight:
        return None

    if re.search(r"\b(pnr|booking (?:id|ref|reference)|ticket (?:number|no))\b", text, re.I):
        ref = flight.get("pnr") or flight.get("booking_id")
        if not ref:
            return (
                f"I don’t have a PNR stored on this {flight.get('airline') or 'flight'} booking yet. "
                "I won’t invent one — open the e-ticket on the left if payment already captured."
            )
        label = " ".join(p for p in (flight.get("airline"), flight.get("flight_number")) if p) or "flight"
        return f"Your **{label}** booking ref / PNR is **{ref}**. That’s the Itinero reference to show at check-in."

    if re.search(r"\b(terminal|gate)\b", text, re.I) and not re.search(
        r"\bbaggage|bags?|luggage|allowance\b", text, re.I
    ):
        return format_terminal_reply(
            airline_code=flight.get("airline_code"),
            airline_name=flight.get("airline"),
            flight_no=flight.get("flight_number"),
            origin=flight.get("origin"),
            dest=flight.get("destination"),
            origin_city=_city_from_label(flight.get("origin_label")),
            dest_city=_city_from_label(flight.get("destination_label")),
            dep_terminal=flight.get("dep_terminal"),
            arr_terminal=flight.get("arr_terminal"),
        )

    if re.search(
        r"\b(baggage|bags?|luggage|check[- ]?in bag|cabin bag|hand ?bag|allowance)\b",
        text,
        re.I,
    ):
        facts = baggage_facts(
            airline_code=flight.get("airline_code"),
            airline_name=flight.get("airline"),
            origin=flight.get("origin"),
            dest=flight.get("destination"),
            ticket_cabin=flight.get("baggage_cabin"),
            ticket_checked=flight.get("baggage_checked"),
        )
        return format_baggage_reply(
            facts,
            flight_no=flight.get("flight_number"),
            origin=flight.get("origin"),
            dest=flight.get("destination"),
            origin_city=_city_from_label(flight.get("origin_label")),
            dest_city=_city_from_label(flight.get("destination_label")),
        )
    return None


def format_left_page_brief(ui_page: dict | None) -> str:
    if not isinstance(ui_page, dict) or not ui_page.get("screen"):
        return ""
    screen = ui_page.get("screen")
    search = ui_page.get("search") or {}
    summary = ui_page.get("results_summary") or {}
    picks = summary.get("picks") or {}

    if screen == "flights" and search.get("origin"):
        cheap = picks.get("cheapest") or {}
        fast = picks.get("fastest") or {}
        bits = [
            f"[LEFT PAGE] Flights {search.get('origin')}→{search.get('destination')} "
            f"on {search.get('depart_date') or '?'}",
            f"{summary.get('count', 0)} options",
        ]
        if cheap:
            bits.append(
                f"cheapest {cheap.get('airline')} {cheap.get('dep_time') or ''} {cheap.get('price')}"
            )
        if fast:
            bits.append(f"fastest {fast.get('airline')} {fast.get('duration') or ''}")
        return bits[0] + " | " + " | ".join(bits[1:]) + ". Do not re-ask origin/destination/date."

    if screen == "hotels" and search.get("city"):
        cheap = picks.get("cheapest") or {}
        bits = [
            f"[LEFT PAGE] Hotels in {search.get('city')} "
            f"{search.get('check_in') or '?'}→{search.get('check_out') or '?'}",
            f"{summary.get('count', 0)} stays",
        ]
        if cheap:
            bits.append(f"cheapest {cheap.get('name')} {cheap.get('price_per_night')}")
        return bits[0] + " | " + " | ".join(bits[1:]) + ". Do not re-ask city/dates."

    detail = ui_page.get("detail") or {}
    if screen == "trips" and detail:
        flight = next(
            (
                l
                for l in (detail.get("legs") or [])
                if isinstance(l, dict) and str(l.get("type") or "").lower() == "flight"
            ),
            None,
        ) or {}
        return (
            f"[LEFT PAGE] Trip {detail.get('title')} ({detail.get('status')}) "
            f"{detail.get('origin') or ''}→{detail.get('destination') or ''}. "
            f"Airline {flight.get('airline') or ''} {flight.get('flight_number') or ''} "
            f"dep {flight.get('depart_time') or ''} {flight.get('depart_date') or ''} "
            f"PNR={flight.get('pnr') or 'none'}. "
            "Quote baggage kg ONLY if they ask about bags/PNR/terminal. "
            "Do not lead a crisis or multi-problem turn with baggage."
        )
    pkg = ui_page.get("package") or {}
    if screen == "package_detail" and pkg:
        return (
            f"[LEFT PAGE] Package instance {pkg.get('title')}. "
            "Same trip — preview then apply. Do not restart the package. "
            "Do not invent bookable prices. Ground/meals/darshan are estimates."
        )
    explore = ui_page.get("explore") or {}
    if screen == "explore_detail" and explore.get("detail"):
        detail = explore.get("detail") or {}
        intel = explore.get("intel") or {}
        alerts = intel.get("alerts") or []
        return (
            f"[LEFT PAGE] Explore {detail.get('city')} ({detail.get('country') or ''}) "
            f"{detail.get('iata') or ''}. "
            f"Yellow fever snapshot: {intel.get('yellow_fever') or 'n/a'}. "
            f"Malaria: {intel.get('malaria') or 'n/a'}. "
            f"Best time: {intel.get('best_time') or 'n/a'}. "
            f"Alerts: {'; '.join(alerts) if alerts else 'none'}. "
            "Health/season snapshots are NOT immigration authority. "
            "Visa / ETA / transit → call check_visa (official sources). Do not invent prescriptions."
        )
    if screen == "notifications":
        alerts = ui_page.get("alerts") if isinstance(ui_page.get("alerts"), dict) else {}
        routes = alerts.get("routes") or []
        route_bit = f" Routes: {', '.join(str(r) for r in routes[:4])}." if routes else ""
        return (
            f"[LEFT PAGE] Alerts / price watches. "
            f"price_alerts={'on' if alerts.get('priceAlerts', True) else 'off'}, "
            f"trip_reminders={'on' if alerts.get('tripReminders', True) else 'off'}, "
            f"watches={alerts.get('watches') or 0}, feed={alerts.get('feed') or 0}."
            f"{route_bit} "
            "Help the user add/check watches on the left. Never invent fares, gates, or boarding status. "
            "Live prices only come from tools / the left page after a Check."
        )
    if screen == "profile":
        profile = ui_page.get("profile") if isinstance(ui_page.get("profile"), dict) else {}
        name = profile.get("name") or "traveller"
        return (
            f"[LEFT PAGE] Account / profile for {name}. "
            "Help with travellers, trips, preferences, or open Flights/Hotels/My Trips on the left. "
            "Do not invent bookings."
        )
    if screen == "saved":
        saved = ui_page.get("saved") if isinstance(ui_page.get("saved"), dict) else {}
        return (
            f"[LEFT PAGE] Saved board count={saved.get('count') or summary.get('count') or 0}. "
            "Inspiration only — not bookings. Help compare destinations or open Explore."
        )
    if screen == "help":
        help_meta = ui_page.get("help") if isinstance(ui_page.get("help"), dict) else {}
        return (
            f"[LEFT PAGE] Help & support topic={help_meta.get('topic_label') or help_meta.get('topic') or 'general'}. "
            "Guide next steps without inventing PNRs, gates, or airline policy."
        )
    return f"[LEFT PAGE] Screen: {screen}"


_EXPLORE_HEALTH = re.compile(
    r"\b(vaccin|yellow\s*fever|malaria|hepatitis|typhoid|injection|immuni|"
    r"shot|health|mosquito|dengue|tap\s*water|drink(?:ing)?\s*water|altitude|"
    r"ams|rabies|cholera)\b",
    re.I,
)
_EXPLORE_VISA = re.compile(
    r"\b(visa|e-?visa|e-?ta|\beta\b|passport|entry|immigration|voa)\b", re.I
)
_EXPLORE_WHEN = re.compile(
    r"\b(best time|when to go|season|weather|month|rain|monsoon|migration)\b", re.I
)
_EXPLORE_PRACTICAL = re.compile(
    r"\b(currency|money|atm|tip|plug|socket|adaptor|adapter|language|"
    r"timezone|time zone|emergency)\b",
    re.I,
)
_EXPLORE_SAFETY = re.compile(r"\b(safe|safety|crime|danger|scam)\b", re.I)


def _answer_explore_intel(text: str, ui_page: dict) -> Optional[str]:
    if ui_page.get("screen") != "explore_detail":
        return None
    explore = ui_page.get("explore") or {}
    intel = explore.get("intel") or {}
    detail = explore.get("detail") or {}
    if not intel:
        return None
    city = detail.get("city") or "this destination"
    country = detail.get("country") or ""
    where = f"**{city}, {country}**" if country else f"**{city}**"
    disclaimer = intel.get("disclaimer") or (
        "Planning snapshot only — confirm vaccines with a travel clinic "
        "and visas with the embassy."
    )

    if _EXPLORE_HEALTH.search(text):
        bits = [f"{where} — health snapshot"]
        if intel.get("yellow_fever"):
            bits.append(f"**Yellow fever:** {intel['yellow_fever']}")
        if intel.get("malaria"):
            bits.append(f"**Malaria:** {intel['malaria']}")
        rec = intel.get("recommended_vaccines") or []
        if rec:
            bits.append("**Often recommended:** " + ", ".join(rec))
        if intel.get("water"):
            bits.append(f"**Water:** {intel['water']}")
        if intel.get("altitude"):
            bits.append(f"**Altitude:** {intel['altitude']}")
        other = intel.get("health_other") or []
        if other:
            bits.append(" ".join(str(x) for x in other[:3]))
        bits.append(f"_{disclaimer}_")
        return "\n\n".join(bits)

    if _EXPLORE_VISA.search(text):
        # Snapshots on Explore are not immigration authority — let check_visa run.
        return None

    if _EXPLORE_WHEN.search(text):
        best = intel.get("best_time") or "See seasons on the left."
        avoid = intel.get("avoid") or ""
        return f"{where} — **best time:** {best}" + (f"\n\nMind: {avoid}" if avoid else "")

    if _EXPLORE_PRACTICAL.search(text):
        em = intel.get("emergency") or {}
        em_line = " · ".join(
            p
            for p in (
                f"all {em['all']}" if em.get("all") else "",
                f"police {em['police']}" if em.get("police") else "",
                f"ambulance {em['ambulance']}" if em.get("ambulance") else "",
            )
            if p
        )
        bits = [f"{where} — practical"]
        if intel.get("currency"):
            tip = intel.get("money_tip") or ""
            bits.append(
                f"**Currency:** {intel['currency']}" + (f" — {tip}" if tip else "")
            )
        if intel.get("language"):
            bits.append(f"**Language:** {intel['language']}")
        if intel.get("timezone"):
            bits.append(f"**Time:** {intel['timezone']}")
        if intel.get("plugs"):
            bits.append(f"**Plugs:** {intel['plugs']}")
        if em_line:
            bits.append(f"**Emergency:** {em_line}")
        return "\n\n".join(bits)

    if _EXPLORE_SAFETY.search(text):
        tips = "\n".join(f"• {x}" for x in (intel.get("safety_tips") or [])[:4])
        return (
            f"{where} — **safety:** {intel.get('safety') or 'normal tourist caution'}"
            + (f"\n\n{tips}" if tips else "")
        )
    return None


def try_answer_from_ui_page(message: str, ui_page: dict | None) -> Optional[str]:
    """Hard-lock instant answers only — money safety, live unknowns, on-screen ranks.

    Explore intel / culture / soft Q&A is NOT answered here; the LLM thinks with
    page context instead. Instant path is for:
      - live_unknowns refusals (PNR/gate/live status we must not invent)
      - booking ops from left-page booking object (baggage/terminal facts)
      - mid-passenger / date-only search nudges
      - cheapest/fastest/etc when results_summary is already on screen
    """
    text = (message or "").strip()
    if not text:
        return None

    live = instant_live_guard(text)
    if live:
        return live

    if skip_all_instant(text):
        return None

    if not isinstance(ui_page, dict):
        return None

    if skip_booking_instant(text):
        booking_ops = None
    else:
        booking_ops = _answer_booking_ops(text, ui_page)
    if booking_ops:
        return booking_ops

    # Soft explore facts (currency/language/safety blurbs) → LLM + page brief,
    # not a canned short-circuit. Keep ranking math below as grounded UI facts.

    screen = ui_page.get("screen")
    search = ui_page.get("search") or {}
    if screen == "passenger_info" and re.search(
        r"\b(continue|proceed|finish|complete|booking|passenger|payment|pay)\b",
        text,
        re.I,
    ):
        booking = ui_page.get("booking") or {}
        label = " ".join(
            p for p in (booking.get("airline"), booking.get("flight_number")) if p
        ) or "this flight"
        route = " → ".join(
            p for p in (booking.get("origin"), booking.get("destination")) if p
        )
        return (
            f"You're on passenger details for **{label}**"
            + (f" ({route})" if route else "")
            + ". Fill the form on the left, then tap **Continue to Payment**. "
            "I won't switch to another route."
        )

    parsed_date = _parse_loose_date(text)
    if (
        parsed_date
        and screen == "flights"
        and search.get("origin")
        and search.get("destination")
        and _DATE_ONLY.match(text)
    ):
        return (
            f"Searching **{search.get('origin')} → {search.get('destination')}** "
            f"on **{parsed_date}** on the left — live fares will load there."
        )

    if is_out_of_page_question(text) and not _LIST_INTENT.search(text):
        return None
    if not _LIST_INTENT.search(text):
        return None

    summary = ui_page.get("results_summary") or {}
    picks = summary.get("picks") or {}

    if screen == "flights" and search.get("origin"):
        route = f"{search.get('origin')} → {search.get('destination')}"
        date = search.get("depart_date") or "this date"
        cheap = picks.get("cheapest")
        fast = picks.get("fastest")
        pricey = picks.get("expensive")

        if re.search(r"\b(cheap(?:est)?|lowest|least expensive|budget)\b", text, re.I):
            if not cheap:
                return None
            return (
                f"Cheapest on **{route}** ({date}) is {_flight_line(cheap)}. "
                "I'd take that unless you want a morning slot or a specific airline."
            )
        if re.search(r"\b(expensive|priciest|highest|most expensive)\b", text, re.I):
            if not pricey:
                return None
            return (
                f"Most expensive on **{route}** ({date}) is {_flight_line(pricey)}. "
                "Sorted high→low on the left."
            )
        if re.search(r"\b(fastest|shortest|quickest)\b", text, re.I):
            if not fast:
                return None
            return (
                f"Fastest on **{route}** ({date}) is {_flight_line(fast)}. "
                "Duration sort is on the left."
            )
        if re.search(r"\b(non[- ]?stop|direct)\b", text, re.I):
            extra = f" Best value right now: {_flight_line(cheap)}." if cheap else ""
            return f"Filtering **{route}** for nonstop.{extra}"
        under = re.search(r"\b(?:under|below|less than)\s*[₹$]?\s*([\d,]+)\b", text, re.I)
        if under:
            cap = float(under.group(1).replace(",", ""))
            try:
                min_price = float(summary.get("min_price"))
            except (TypeError, ValueError):
                min_price = None
            ok = min_price is not None and min_price <= cap
            cur = summary.get("currency") or "INR"
            if ok:
                return (
                    f"Yes — several on **{route}** under {_inr(cap, cur)}. "
                    f"Cheapest is {_flight_line(cheap)}."
                )
            return (
                f"Nothing under {_inr(cap, cur)} on **{route}**. "
                f"Cheapest is {_flight_line(cheap)}."
            )
        if re.search(r"\b(compare|top\s*3|best (?:value|deal|price))\b", text, re.I):
            samples = summary.get("sample_offers") or []
            lines = [_flight_line(s) for s in samples[:3] if s]
            numbered = "\n".join(f"{i}. {line}" for i, line in enumerate(lines, 1) if line)
            pick = f"\n\nI'd take {_flight_line(cheap)} for value." if cheap else ""
            return f"On **{route}** ({date}):\n{numbered or 'list is on the left'}{pick}"

    if screen == "hotels" and search.get("city"):
        city = search.get("city")
        cheap = picks.get("cheapest")
        rated = picks.get("top_rated")
        pricey = picks.get("expensive")
        if re.search(r"\b(cheap(?:est)?|lowest|budget|least expensive)\b", text, re.I):
            if not cheap:
                return None
            return f"Cheapest stay in **{city}** is {_hotel_line(cheap)}. Sorted low→high on the left."
        if re.search(r"\b(expensive|priciest|highest|most expensive)\b", text, re.I):
            if not pricey:
                return None
            return f"Most expensive in **{city}** is {_hotel_line(pricey)}."
        if re.search(r"\b(best rated|top rated|highest rated|rating)\b", text, re.I):
            if not rated:
                return None
            return f"Best rated in **{city}** is {_hotel_line(rated)}."

    return None
