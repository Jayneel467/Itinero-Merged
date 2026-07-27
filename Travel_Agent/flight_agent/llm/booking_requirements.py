"""Dynamic traveler requirements and LiteAPI ancillary services for booking."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from flight_agent.models.agent import SessionContext

_EMAIL_RE = re.compile(r"^[\w.+-]+@[\w.-]+\.\w{2,}$", re.I)

# Indian domestic airport codes (same as flight_service CITY_IATA values)
INDIAN_AIRPORTS = frozenset(
    {
        "BOM", "DEL", "BLR", "MAA", "CCU", "HYD", "PNQ", "GOI", "AMD", "COK",
        "JAI", "LKO", "GAU", "IXC", "BBI", "TRV", "VNS", "PAT", "IDR", "NAG",
    }
)

# LiteAPI accepts passport or id — not id_card (API rejects id_card explicitly).
_LITEAPI_DOCUMENT_TYPES = frozenset({"passport", "id"})
_DOCUMENT_TYPE_ALIASES = {
    "id_card": "id",
    "national_id": "id",
    "aadhaar": "id",
    "govt_id": "id",
}

# Common fake / sequential numbers LiteAPI rejects as placeholders.
_PLACEHOLDER_PHONES = frozenset(
    {
        "0000000000",
        "1111111111",
        "1234567890",
        "0123456789",
        "9876543210",
        "9999999999",
        "8888888888",
        "7777777777",
        "6666666666",
        "5555555555",
        "4444444444",
        "3333333333",
        "2222222222",
        "1010101010",
        "1212121212",
    }
)


def is_valid_email(email: str | None) -> bool:
    """Basic email format check (LiteAPI contact.email must be a valid address)."""
    if not email or not str(email).strip():
        return False
    return bool(_EMAIL_RE.match(str(email).strip()))


def normalize_phone_digits(phone: str | None) -> str:
    """Strip non-digits from a phone (or phone+country) string."""
    return re.sub(r"\D", "", str(phone or ""))


def is_placeholder_phone(phone: str | None) -> bool:
    """
    True when LiteAPI is likely to reject the number as a placeholder.

    LiteAPI returns HTTP 500 message "unable to process prebook request" with
    description mentioning sequential / placeholder digits.
    """
    digits = normalize_phone_digits(phone)
    if not digits:
        return True
    # Compare national number (last 10) and full digit string.
    candidates = {digits, digits[-10:] if len(digits) >= 10 else digits}
    if candidates & _PLACEHOLDER_PHONES:
        return True
    national = digits[-10:] if len(digits) >= 10 else digits
    if len(national) >= 8 and len(set(national)) == 1:
        return True
    # Strictly ascending / descending runs (e.g. 1234567890, 9876543210).
    if len(national) >= 8:
        asc = all(int(national[i]) == (int(national[i - 1]) + 1) % 10 for i in range(1, len(national)))
        desc = all(int(national[i]) == (int(national[i - 1]) - 1) % 10 for i in range(1, len(national)))
        if asc or desc:
            return True
    return False


def friendly_liteapi_prebook_error(exc: BaseException) -> str:
    """Map LiteAPI / prebook exceptions to short user-facing copy (no stack / type names)."""
    details = getattr(exc, "details", None)
    description = ""
    if isinstance(details, dict):
        description = str(details.get("description") or "").strip()
        body = details.get("body")
        if not description and isinstance(body, dict):
            err = body.get("error") if isinstance(body.get("error"), dict) else {}
            description = str(err.get("description") or err.get("message") or "").strip()
    message = str(getattr(exc, "message", None) or exc).strip()
    raw = f"{description} {message}".lower()

    if "placeholder" in raw or "sequential" in raw or ("phone" in raw and "valid" in raw):
        return (
            "That phone number looks invalid or like a test placeholder "
            "(e.g. 9876543210). Enter a real mobile number and try again."
        )
    if "documenttype" in raw or "document type" in raw or "must be one of: passport, id" in raw:
        return "Travel document type was invalid. Use a government ID (domestic) or passport."
    if "birthday" in raw or "date of birth" in raw or "dob" in raw or "age" in raw:
        return (
            "Date of birth does not match this traveller type. "
            "Adults must be 12+ on the travel date — update DOB and try again."
        )
    if "offer" in raw and ("expir" in raw or "not found" in raw or "unavailable" in raw):
        return "This fare expired. Go back, search again, and pick another flight."
    if "email" in raw:
        return "Please enter a valid email address for the booking contact."
    if description and "unable to process" not in description.lower():
        # Prefer LiteAPI's concrete description over the generic message.
        cleaned = description
        if cleaned.lower().startswith("contact phone:"):
            cleaned = cleaned.split(":", 1)[-1].strip()
        return cleaned[:280]
    if message and "unable to process" not in message.lower() and "liteapi" not in message.lower():
        return message[:280]
    return (
        "We couldn't hold this fare. Check name, phone, email, date of birth, "
        "and ID — then try again. If it keeps failing, pick another flight."
    )


def passenger_saved_summary(draft: dict[str, Any], slot: dict[str, Any]) -> dict[str, str]:
    """Fields verified and saved for one passenger — shown after user submission."""
    name = f"{draft.get('passenger_first_name', '')} {draft.get('passenger_last_name', '')}".strip()
    phone_cc = draft.get("contact_phone_country_code", "")
    phone_num = draft.get("contact_phone_number", "")
    phone = f"+{phone_cc} {phone_num}".strip() if phone_num else ""
    summary = {
        "passenger": slot.get("label", "Passenger"),
        "name": name or "—",
        "email": str(draft.get("contact_email") or "—"),
        "phone": phone or "—",
        "date_of_birth": str(draft.get("passenger_birthday") or "—"),
        "gender": str(draft.get("passenger_gender") or "—"),
        "document": str(draft.get("passenger_document_number") or "—"),
    }
    return summary


def passenger_saved_message(draft: dict[str, Any], slot: dict[str, Any]) -> str:
    """User-facing confirmation that this passenger's details (incl. email) were saved."""
    s = passenger_saved_summary(draft, slot)
    lines = [
        f"Got it — **{s['passenger']}** saved:",
        f"- **Name:** {s['name']}",
        f"- **Email:** {s['email']}",
        f"- **Phone:** {s['phone']}",
        f"- **DOB:** {s['date_of_birth']} · **Gender:** {s['gender']}",
        f"- **ID:** {s['document']}",
    ]
    if slot.get("needs_contact") and not is_valid_email(draft.get("contact_email")):
        lines.append("\n**Email is still missing or invalid** — please send a valid email for this adult.")
    return "\n".join(lines)


def validate_travelers_for_liteapi_prebook(
    session: SessionContext,
    default_country: str = "IN",
) -> tuple[bool, list[str]]:
    """
    Verify collected travelers match LiteAPI prebook rules before calling the API.

    LiteAPI POST /flights/prebooks requires:
    - contact: one email + phone (we use Adult 1)
    - passengers[]: length = adults + children + infants; each needs name, DOB, gender, document
    - We also require every adult to submit their own email + phone in chat before prebook.
    - documentNumber max length is 15 characters.
    """
    plan = passenger_slot_plan(session)
    search = session.search_context or {}
    expected = int(search.get("adults") or 1) + int(search.get("children") or 0) + int(search.get("infants") or 0)
    errors: list[str] = []

    if len(plan) != expected:
        errors.append(f"Passenger count mismatch: expected {expected}, have {len(plan)} slots.")

    ensure_travelers_draft(session)
    req = requirements_from_session(session, default_country)

    for i, slot in enumerate(plan):
        draft = session.travelers_draft[i] if i < len(session.travelers_draft) else {}
        label = slot.get("label", f"Passenger {i + 1}")
        missing = missing_traveler_labels_for_draft(draft, req, slot)
        if missing:
            errors.append(f"{label}: missing {', '.join(missing)}")
        email = draft.get("contact_email")
        if slot.get("needs_contact"):
            if not is_valid_email(email):
                errors.append(f"{label}: valid email is required (LiteAPI booking contact rule).")
        elif email and not is_valid_email(email):
            errors.append(f"{label}: email format is invalid.")
        doc = str(draft.get("passenger_document_number") or "").strip().replace(" ", "")
        if doc:
            draft["passenger_document_number"] = doc
            if len(doc) > 15:
                errors.append(
                    f"{label}: ID/document number is too long ({len(doc)} chars). "
                    "LiteAPI allows max **15 characters** (use Aadhaar 12 digits, or a short ID — no spaces)."
                )

    lead = session.travelers_draft[0] if session.travelers_draft else {}
    if not is_valid_email(lead.get("contact_email")):
        errors.append("Adult 1 email is required for LiteAPI booking contact.")

    return (len(errors) == 0, errors)


def liteapi_document_type(document_type: str | None) -> str:
    """Map user-facing document labels to LiteAPI documentType values."""
    normalized = (document_type or "passport").strip().lower()
    if normalized in _LITEAPI_DOCUMENT_TYPES:
        return normalized
    return _DOCUMENT_TYPE_ALIASES.get(normalized, "passport")


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
    document_type = "id" if is_domestic and default_country == "IN" else "passport"

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


def passenger_slot_plan(session: SessionContext) -> list[dict[str, Any]]:
    """Ordered passenger slots: adults, then children, then infants."""
    search = session.search_context or {}
    adults = int(search.get("adults") or 1)
    children = int(search.get("children") or 0)
    infants = int(search.get("infants") or 0)
    slots: list[dict[str, Any]] = []
    idx = 0
    for i in range(adults):
        slots.append(
            {
                "index": idx,
                "label": f"Adult {i + 1}",
                "passenger_type": 0,
                "needs_contact": True,
                "category": "adult",
            }
        )
        idx += 1
    for i in range(children):
        slots.append(
            {
                "index": idx,
                "label": f"Child {i + 1}",
                "passenger_type": 1,
                "needs_contact": False,
                "category": "child",
            }
        )
        idx += 1
    for i in range(infants):
        slots.append(
            {
                "index": idx,
                "label": f"Infant {i + 1}",
                "passenger_type": 2,
                "needs_contact": False,
                "category": "infant",
            }
        )
        idx += 1
    return slots


def ensure_travelers_draft(session: SessionContext) -> list[dict[str, Any]]:
    """Initialize per-passenger draft list to match booked passenger counts."""
    plan = passenger_slot_plan(session)
    if not plan:
        return []
    if len(session.travelers_draft) != len(plan):
        session.travelers_draft = [{} for _ in plan]
        session.current_traveler_index = 0
    elif session.traveler_draft and not any(session.travelers_draft):
        session.travelers_draft[0] = dict(session.traveler_draft)
    return session.travelers_draft


def sync_traveler_draft(session: SessionContext) -> None:
    """Mirror the active passenger slot into traveler_draft for legacy code paths."""
    ensure_travelers_draft(session)
    idx = min(session.current_traveler_index, len(session.travelers_draft) - 1)
    if session.travelers_draft:
        session.traveler_draft = dict(session.travelers_draft[idx])


def _parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value.strip()[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def passenger_age_years(birthday: str | None, on_date: str | None) -> float | None:
    """Age in whole years on a travel date."""
    b = _parse_iso_date(birthday)
    t = _parse_iso_date(on_date) or date.today()
    if not b:
        return None
    years = t.year - b.year - ((t.month, t.day) < (b.month, b.day))
    return float(years)


def validate_passenger_dob_for_slot(
    draft: dict[str, Any],
    slot: dict[str, Any],
    travel_date: str | None,
) -> str | None:
    """Return user-facing error if DOB does not match LiteAPI passenger type (IATA ages)."""
    birthday = draft.get("passenger_birthday")
    if not birthday:
        return None
    age = passenger_age_years(birthday, travel_date)
    if age is None:
        return "Date of birth must be YYYY-MM-DD."
    ptype = int(slot.get("passenger_type", 0))
    label = slot.get("label", "Passenger")
    if ptype == 0 and age < 12:
        return f"{label} is booked as an **adult** — age must be **12+** on travel date."
    if ptype == 1 and not (2 <= age <= 11):
        return f"{label} must be **2–11 years** old on travel date (LiteAPI child)."
    if ptype == 2 and age >= 2:
        return f"{label} must be **under 2 years** on travel date (LiteAPI infant)."
    return None


def _document_label_for_slot(requirements: dict[str, Any], slot: dict[str, Any]) -> str:
    ptype = int(slot.get("passenger_type", 0))
    is_domestic = requirements.get("route_type") == "domestic"
    if ptype == 2:
        if is_domestic:
            return "birth certificate / ID number (infant under 2)"
        return "passport number (infant)"
    if ptype == 1:
        if is_domestic:
            return "ID / birth certificate / Aadhaar (child 2–11)"
        return "passport number (child)"
    if is_domestic:
        return "government ID / Aadhaar number"
    return "passport number"


def _dob_label_for_slot(slot: dict[str, Any]) -> str:
    ptype = int(slot.get("passenger_type", 0))
    if ptype == 1:
        return "date of birth (YYYY-MM-DD) — child age 2–11 on travel date"
    if ptype == 2:
        return "date of birth (YYYY-MM-DD) — infant under 2 on travel date"
    return "date of birth (YYYY-MM-DD)"


def _required_fields_for_slot(requirements: dict[str, Any], slot: dict[str, Any]) -> list[dict[str, Any]]:
    """Fields to collect per passenger type — aligned with LiteAPI prebook passengers[]."""
    ptype = int(slot.get("passenger_type", 0))
    doc_label = _document_label_for_slot(requirements, slot)
    dob_label = _dob_label_for_slot(slot)
    fields: list[dict[str, Any]] = [
        {"key": "passenger_first_name", "label": "first name", "group": "traveler"},
        {"key": "passenger_last_name", "label": "last name", "group": "traveler"},
    ]
    if ptype == 0:
        fields.extend(
            [
                {"key": "contact_email", "label": "email", "group": "contact"},
                {
                    "key": "contact_phone_number",
                    "label": "phone with country code (e.g. +91…)",
                    "group": "contact",
                },
            ]
        )
    fields.extend(
        [
            {"key": "passenger_birthday", "label": dob_label, "group": "traveler"},
            {"key": "passenger_gender", "label": "gender (M/F)", "group": "traveler"},
            {"key": "passenger_document_number", "label": doc_label, "group": "document"},
        ]
    )
    if requirements.get("document_expiry_required"):
        expiry = (
            "passport expiry (YYYY-MM-DD)"
            if ptype in {0, 1, 2}
            else "ID expiry (YYYY-MM-DD)"
        )
        fields.append(
            {"key": "passenger_document_expiry", "label": expiry, "group": "document"}
        )
    return fields


def missing_traveler_labels_for_draft(
    draft: dict[str, Any],
    requirements: dict[str, Any],
    slot: dict[str, Any],
) -> list[str]:
    """Human-readable labels still missing for one passenger slot."""
    missing: list[str] = []
    for field in _required_fields_for_slot(requirements, slot):
        key = field["key"]
        if key == "contact_email":
            if not is_valid_email(draft.get("contact_email")):
                missing.append(field["label"])
            continue
        if key == "contact_phone_number":
            if not draft.get("contact_phone_number"):
                missing.append(field["label"])
            continue
        if not draft.get(key):
            missing.append(field["label"])
    return missing


def missing_traveler_labels(draft: dict[str, Any], requirements: dict[str, Any]) -> list[str]:
    """Human-readable labels for fields still missing from the draft (first adult / legacy)."""
    slot = {"needs_contact": True, "label": "Adult 1", "passenger_type": 0}
    return missing_traveler_labels_for_draft(draft, requirements, slot)


def current_traveler_slot(session: SessionContext) -> dict[str, Any]:
    plan = passenger_slot_plan(session)
    ensure_travelers_draft(session)
    idx = min(session.current_traveler_index, len(plan) - 1) if plan else 0
    return plan[idx] if plan else {"label": "Adult 1", "needs_contact": True, "passenger_type": 0}


def all_travelers_complete(session: SessionContext, default_country: str = "IN") -> bool:
    plan = passenger_slot_plan(session)
    if not plan:
        return False
    ensure_travelers_draft(session)
    req = requirements_from_session(session, default_country)
    for i, slot in enumerate(plan):
        draft = session.travelers_draft[i] if i < len(session.travelers_draft) else {}
        if missing_traveler_labels_for_draft(draft, req, slot):
            return False
    return True


def traveler_collection_summary(session: SessionContext, default_country: str = "IN") -> str:
    """Plain summary of what each passenger still needs — for LLM and UI."""
    plan = passenger_slot_plan(session)
    if not plan:
        return ""
    ensure_travelers_draft(session)
    req = requirements_from_session(session, default_country)
    lines = [f"**{len(plan)} passenger(s)** — collect one at a time:"]
    for i, slot in enumerate(plan):
        draft = session.travelers_draft[i] if i < len(session.travelers_draft) else {}
        missing = missing_traveler_labels_for_draft(draft, req, slot)
        if missing:
            lines.append(f"- **{slot['label']}**: still need {', '.join(missing)}")
        else:
            name = f"{draft.get('passenger_first_name', '')} {draft.get('passenger_last_name', '')}".strip()
            lines.append(f"- **{slot['label']}**: saved ({name})")
    lines.append(
        "**Adults (12+):** name, email, phone, DOB, gender, ID. "
        "**Children (2–11):** name, DOB, gender, ID — no email/phone. "
        "**Infants (under 2):** name, DOB, gender, birth certificate/ID — no email/phone."
    )
    return "\n".join(lines)


def first_incomplete_traveler_index(session: SessionContext, default_country: str = "IN") -> int:
    plan = passenger_slot_plan(session)
    ensure_travelers_draft(session)
    req = requirements_from_session(session, default_country)
    for i, slot in enumerate(plan):
        draft = session.travelers_draft[i] if i < len(session.travelers_draft) else {}
        if missing_traveler_labels_for_draft(draft, req, slot):
            return i
    return len(plan)


def traveler_progress(session: SessionContext, default_country: str = "IN") -> tuple[int, int]:
    plan = passenger_slot_plan(session)
    total = len(plan)
    if total == 0:
        return 0, 0
    ensure_travelers_draft(session)
    req = requirements_from_session(session, default_country)
    done = sum(
        1
        for i, slot in enumerate(plan)
        if not missing_traveler_labels_for_draft(session.travelers_draft[i], req, slot)
    )
    return done, total


def _traveler_field_lines(requirements: dict[str, Any], slot: dict[str, Any]) -> list[str]:
    return [f["label"] for f in _required_fields_for_slot(requirements, slot)]


def next_traveler_details_prompt(session: SessionContext, default_country: str = "IN") -> str:
    """Ask for the current passenger's details (multi-passenger booking)."""
    req = requirements_from_session(session, default_country)
    plan = passenger_slot_plan(session)
    ensure_travelers_draft(session)
    idx = first_incomplete_traveler_index(session, default_country)
    session.current_traveler_index = idx
    sync_traveler_draft(session)

    if idx >= len(plan):
        return booking_details_prompt(session, default_country=default_country)

    slot = plan[idx]
    done, total = traveler_progress(session, default_country)
    labels = _traveler_field_lines(req, slot)
    lines = "\n".join(f"- **{label}**" for label in labels)

    contact_note = ""
    ptype = int(slot.get("passenger_type", 0))
    if ptype == 1:
        contact_note = "\n\n*Children (2–11): no email or phone needed — name, DOB, gender, and ID only.*"
    elif ptype == 2:
        contact_note = (
            "\n\n*Infants (under 2): no email or phone needed — name, DOB, gender, "
            "and birth certificate/ID only.*"
        )
    elif len(plan) > 1:
        contact_note = (
            "\n\n*Each adult must submit their own name, email, phone, DOB, gender, and ID.*"
        )

    example = "John Doe, 1990-05-15, M, ABCD1234"
    if ptype == 1:
        example = "Riya Sharma, 2018-05-10, F, 123456789012"
    elif ptype == 2:
        example = "Baby Kumar, 2024-08-15, M, 987654321098"
    elif slot.get("needs_contact"):
        example = (
            "John Doe, john@email.com, +919876543210, 1990-05-15, M, ABCD1234"
            + (", 2030-12-31" if req.get("document_expiry_required") else "")
        )

    header = [
        f"**Passenger {idx + 1} of {total}** — **{slot['label']}**",
        "",
    ]
    if done:
        header.append(f"({done} of {total} passenger(s) already saved)")
        header.append("")

    if idx > 0:
        header.extend([f"**{plan[idx - 1]['label']}** is saved.", ""])

    return (
        "\n".join(header)
        + f"Send **{slot['label']}** details in one message:\n\n"
        + f"{lines}\n\n"
        + f"Example: *{example}*"
        + contact_note
    )


def booking_details_prompt(
    session: SessionContext,
    missing: list[str] | None = None,
    default_country: str = "IN",
) -> str:
    """Ask user for all required traveler fields based on route type."""
    plan = passenger_slot_plan(session)
    if len(plan) > 1:
        if missing:
            slot = current_traveler_slot(session)
            req = requirements_from_session(session, default_country)
            lines = "\n".join(f"- **{label}**" for label in missing)
            return (
                f"**{slot['label']}** — please share the remaining details:\n\n"
                + lines
            )
        return next_traveler_details_prompt(session, default_country)

    req = requirements_from_session(session, default_country)
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
            + "I still need a few details — send them in one message:\n\n"
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
        + "To book this, send **traveler details** in one message:\n\n"
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
    summary["choices"] = flatten_service_choices(summary)
    summary["user_prompt"] = services_question_prompt(summary)
    summary["llm_instruction"] = (
        "Read user_prompt and reply to the user in simple language. "
        "Do NOT mention LiteAPI, tools, serviceId, or JSON. "
        "If user replies with a number (e.g. 3) or seat code (e.g. 4C), call attach_flight_services. "
        "If user says skip/none/no extras, proceed to booking confirmation."
    )
    return summary


def flatten_service_choices(services: dict[str, Any], *, limit: int = 20) -> list[dict[str, Any]]:
    """Numbered flat list of attachable options for user selection (1, 2, 3…)."""
    choices: list[dict[str, Any]] = []
    for group in services.get("groups") or []:
        gtype = str(group.get("type") or "OTHER").upper()
        for opt in group.get("options") or []:
            if not opt.get("service_id"):
                continue
            choices.append(
                {
                    "index": len(choices) + 1,
                    "service_id": opt.get("service_id"),
                    "name": opt.get("name") or "Option",
                    "price": opt.get("price"),
                    "currency": opt.get("currency"),
                    "segment_key": opt.get("segment_key") or group.get("segment_key"),
                    "passenger_index": opt.get("passenger_index", 0),
                    "type": gtype,
                }
            )
            if len(choices) >= limit:
                return choices
    return choices


def services_question_prompt(services: dict[str, Any]) -> str:
    """Plain-language question for the user about optional flight add-ons."""
    if not services.get("available") or not services.get("groups"):
        return (
            "No seat selection or extra baggage is available for this flight.\n\n"
            "Reply **YES** when you're ready to confirm your ticket."
        )

    type_labels = {
        "SEAT": "Seat selection",
        "BAGGAGE": "Extra baggage",
        "MEAL": "Meals",
        "OTHER": "Other add-ons",
    }

    choices = services.get("choices") or flatten_service_choices(services)
    lines = [
        "**Pick an add-on by number**, or reply **skip** to continue without extras:",
        "",
    ]
    if choices:
        current_type = None
        for choice in choices:
            gtype = str(choice.get("type") or "OTHER").upper()
            if gtype != current_type:
                current_type = gtype
                lines.append(f"**{type_labels.get(gtype, gtype)}**")
            name = choice.get("name") or "Option"
            price = choice.get("price")
            cur = (choice.get("currency") or "INR").upper()
            idx = choice.get("index")
            if price is not None:
                lines.append(f"{idx}. {name} — {cur} {price}")
            else:
                lines.append(f"{idx}. {name}")
        lines.extend(
            [
                "",
                "Reply with the **number** (e.g. **3**), a seat code (e.g. **4C**), or **skip**.",
            ]
        )
        return "\n".join(lines)

    return (
        "Add-ons may be available at booking.\n\n"
        "Reply with a **number**, seat code, or **skip**."
    )
