"""Dynamic traveler requirements and LiteAPI ancillary services for booking."""

from __future__ import annotations

from typing import Any

from flight_agent.models.agent import SessionContext

# Indian domestic airport codes (same as flight_service CITY_IATA values)
INDIAN_AIRPORTS = frozenset(
    {
        "BOM", "DEL", "BLR", "MAA", "CCU", "HYD", "PNQ", "GOI", "AMD", "COK",
        "JAI", "LKO", "GAU", "IXC", "BBI", "TRV", "VNS", "PAT", "IDR", "NAG",
    }
)

CABIN_CLASSES = ("ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST")


def _segment_countries(segments: list[dict[str, Any]]) -> set[str]:
    countries: set[str] = set()
    for seg in segments or []:
        for key in (
            "originCountry",
            "originCountryCode",
            "destinationCountry",
            "destinationCountryCode",
        ):
            val = seg.get(key)
            if val:
                countries.add(str(val).upper()[:2])
    return countries


def detect_route_type(
    segments: list[dict[str, Any]] | None,
    origin: str | None,
    destination: str | None,
) -> str:
    """Return 'domestic' or 'international' based on LiteAPI segments or airport codes."""
    countries = _segment_countries(segments or [])
    if len(countries) == 1:
        return "domestic"
    if len(countries) > 1:
        return "international"

    origin_code = (origin or "").upper()[:3]
    dest_code = (destination or "").upper()[:3]
    if origin_code in INDIAN_AIRPORTS and dest_code in INDIAN_AIRPORTS:
        return "domestic"
    if origin_code and dest_code and origin_code == dest_code:
        return "domestic"
    return "international"


def build_booking_requirements(
    *,
    route_type: str,
    origin: str | None = None,
    destination: str | None = None,
    adults: int = 1,
    children: int = 0,
    infants: int = 0,
    cabin_class: str | None = None,
    verify_data: dict[str, Any] | None = None,
    default_country: str = "IN",
) -> dict[str, Any]:
    """Build what the LLM should collect before prebook."""
    verify_data = verify_data or {}
    is_domestic = route_type == "domestic"
    document_type = "id_card" if is_domestic and default_country == "IN" else "passport"

    if is_domestic and default_country == "IN":
        doc_label = "government ID / Aadhaar number"
        expiry_label = "ID expiry (YYYY-MM-DD) — optional for domestic"
        expiry_required = False
        route_note = (
            "Domestic flight within India — **passport is NOT required**. "
            "A valid government photo ID (Aadhaar, voter ID, driving licence) is enough."
        )
    else:
        doc_label = "passport number"
        expiry_label = "passport expiry (YYYY-MM-DD)"
        expiry_required = True
        route_note = "International or cross-border flight — valid **passport** required."

    passenger_total = adults + children + infants
    cabin = cabin_class or verify_data.get("cabin_class") or "ECONOMY"

    required_fields = [
        {"key": "passenger_first_name", "label": "first name", "group": "traveler"},
        {"key": "passenger_last_name", "label": "last name", "group": "traveler"},
        {"key": "contact_email", "label": "email", "group": "contact"},
        {"key": "contact_phone_number", "label": "phone with country code (e.g. +91…)", "group": "contact"},
        {"key": "passenger_birthday", "label": "date of birth (YYYY-MM-DD)", "group": "traveler"},
        {"key": "passenger_gender", "label": "gender (M/F)", "group": "traveler"},
        {"key": "passenger_document_number", "label": doc_label, "group": "document"},
    ]
    if expiry_required:
        required_fields.append(
            {
                "key": "passenger_document_expiry",
                "label": expiry_label,
                "group": "document",
            }
        )

    return {
        "route_type": route_type,
        "origin": origin,
        "destination": destination,
        "document_type": document_type,
        "document_expiry_required": expiry_required,
        "route_note": route_note,
        "passengers": {"adults": adults, "children": children, "infants": infants, "total": passenger_total},
        "cabin_class": cabin,
        "required_fields": required_fields,
        "optional_extras": [
            "seat selection (after prebook, if LiteAPI offers it)",
            "extra baggage (after prebook, if available)",
        ],
        "booking_scope": "flights only — no hotels or other travel products",
    }


def requirements_from_session(session: SessionContext, default_country: str = "IN") -> dict[str, Any]:
    """Return stored requirements or infer from verified offer + search context."""
    if session.booking_requirements:
        return session.booking_requirements

    search = session.search_context or {}
    verified = session.last_verified_offer or {}
    segments = verified.get("segments_summary") or []
    return build_booking_requirements(
        route_type=detect_route_type(
            segments,
            search.get("origin") or _first_segment_origin(segments),
            search.get("destination") or _last_segment_dest(segments),
        ),
        origin=search.get("origin"),
        destination=search.get("destination"),
        adults=int(search.get("adults") or 1),
        children=int(search.get("children") or 0),
        infants=int(search.get("infants") or 0),
        cabin_class=search.get("cabin_class"),
        verify_data=verified,
        default_country=default_country,
    )


def _first_segment_origin(segments: list[dict]) -> str | None:
    return segments[0].get("from") if segments else None


def _last_segment_dest(segments: list[dict]) -> str | None:
    return segments[-1].get("to") if segments else None


def missing_traveler_labels(draft: dict[str, Any], requirements: dict[str, Any]) -> list[str]:
    """Human-readable labels for fields still missing from the draft."""
    missing: list[str] = []
    for field in requirements.get("required_fields") or []:
        key = field["key"]
        if key == "contact_phone_number":
            if not draft.get("contact_phone_number"):
                missing.append(field["label"])
            continue
        if not draft.get(key):
            missing.append(field["label"])
    return missing


def booking_details_prompt(session: SessionContext, missing: list[str] | None = None) -> str:
    """Ask user for all required traveler fields based on route type."""
    req = requirements_from_session(session)
    still_need = missing or missing_traveler_labels(session.traveler_draft, req)
    passengers = req.get("passengers") or {}
    pax_line = (
        f"{passengers.get('adults', 1)} adult(s)"
        + (f", {passengers.get('children')} child(ren)" if passengers.get("children") else "")
        + (f", {passengers.get('infants')} infant(s)" if passengers.get("infants") else "")
    )

    header = [
        f"**{req.get('route_type', 'flight').title()} flight** "
        f"({req.get('origin', '?')} → {req.get('destination', '?')}) · "
        f"{pax_line} · cabin: **{req.get('cabin_class', 'ECONOMY')}**",
        "",
        req.get("route_note", ""),
        "",
    ]

    if still_need:
        lines = "\n".join(f"- **{label}**" for label in still_need)
        return (
            "\n".join(header)
            + "Please share **all remaining details** in one message:\n\n"
            + lines
        )

    all_labels = [f["label"] for f in req.get("required_fields") or []]
    lines = "\n".join(f"- **{label}**" for label in all_labels)
    example = (
        "John Doe, john@email.com, +919876543210, 1990-05-15, M, ABCD1234"
        + (", 2030-12-31" if req.get("document_expiry_required") else "")
    )
    return (
        "\n".join(header)
        + "To proceed with booking, please share **all traveler details** in one message:\n\n"
        + f"{lines}\n\n"
        + f"Example: *{example}*"
    )


def summarize_attachable_services(services_attachable: Any) -> dict[str, Any]:
    """Flatten LiteAPI servicesAttachable for the LLM and UI."""
    if not services_attachable:
        return {"available": False, "groups": [], "message": "No extra services for this offer."}

    if isinstance(services_attachable, bool):
        return {"available": services_attachable, "groups": []}

    groups_raw = services_attachable.get("groups") or []
    groups: list[dict[str, Any]] = []

    for group in groups_raw:
        options = group.get("options") or group.get("services") or []
        priced: list[dict[str, Any]] = []
        for opt in options[:8]:
            pricing = opt.get("pricing") or opt.get("price") or {}
            if isinstance(pricing, (int, float)):
                display = {"total": pricing}
            else:
                display = pricing.get("display") or pricing
            priced.append(
                {
                    "service_id": opt.get("serviceId") or opt.get("id"),
                    "name": opt.get("name") or opt.get("description") or opt.get("code"),
                    "price": display.get("total") if isinstance(display, dict) else display,
                    "currency": display.get("currency") if isinstance(display, dict) else None,
                    "segment_key": group.get("segmentKey") or opt.get("segmentKey"),
                    "passenger_index": opt.get("passengerIndex", 0),
                }
            )

        groups.append(
            {
                "type": group.get("type") or group.get("category") or "OTHER",
                "name": group.get("name") or group.get("title") or group.get("type"),
                "segment_key": group.get("segmentKey"),
                "options": priced,
                "option_count": len(options),
            }
        )

    types = sorted({g["type"] for g in groups if g.get("type")})
    summary = {
        "available": bool(groups),
        "service_types": types,
        "groups": groups,
    }
    summary["user_prompt"] = services_question_prompt(summary)
    summary["llm_instruction"] = (
        "Read user_prompt and reply to the user in simple language. "
        "Do NOT mention LiteAPI, tools, serviceId, or JSON. "
        "If user says skip/none/no extras, proceed to payment confirmation."
    )
    return summary


def services_question_prompt(services: dict[str, Any]) -> str:
    """Plain-language question for the user about optional flight add-ons."""
    if not services.get("available") or not services.get("groups"):
        return (
            "No seat selection or extra baggage is available for this flight.\n\n"
            "Reply **YES** when you're ready to pay and confirm your ticket."
        )

    type_labels = {
        "SEAT": "Seat selection",
        "BAGGAGE": "Extra baggage",
        "MEAL": "Meals",
        "OTHER": "Other add-ons",
    }

    lines = [
        "**Would you like any add-ons for your flight?**",
        "",
    ]
    for group in services.get("groups") or []:
        gtype = str(group.get("type") or "OTHER").upper()
        heading = type_labels.get(gtype, group.get("name") or "Add-ons")
        lines.append(f"**{heading}**")
        options = group.get("options") or []
        if not options:
            lines.append("- Options listed at booking — tell me what you prefer")
        for opt in options[:5]:
            name = opt.get("name") or "Option"
            price = opt.get("price")
            cur = (opt.get("currency") or "INR").upper()
            if price is not None:
                lines.append(f"- {name} — {cur} {price}")
            else:
                lines.append(f"- {name}")
        lines.append("")

    lines.extend(
        [
            "Tell me what you want (e.g. *window seat*, *extra baggage*), or reply **skip** to continue without add-ons.",
        ]
    )
    return "\n".join(lines)
