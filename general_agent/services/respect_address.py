"""Vero respect & address policy — applied before generation, not repaired after.

Default: friendly + respectful second-person forms. Never invent nicknames.
Name precedence: explicit "call me X" > profile preferred name > account first name > none.
"""
from __future__ import annotations

import re
from typing import Any

ADDRESS_STYLES = ("respectful", "neutral", "casual", "intimate")
DEFAULT_STYLE = "respectful"
DEFAULT_FORMALITY = "friendly_respectful"

_LANG_DEFAULTS: dict[str, dict[str, str]] = {
    "gu": {
        "label": "Gujarati",
        "use": "તમે / તમારું / તમને",
        "avoid": "તું / તારું / તને",
        "hard": "Gujarati default second person: તમે forms. Never use તું unless the user explicitly asks for very casual/familiar Gujarati.",
    },
    "hi": {
        "label": "Hindi",
        "use": "आप / आपका / आपको",
        "avoid": "तू / तेरा / तुझे",
        "hard": "Hindi default: आप. Do not use तू. तुम only if the user’s style and stored preference clearly support it — never by default.",
    },
    "mr": {
        "label": "Marathi",
        "use": "तुम्ही / तुमचा / तुम्हाला",
        "avoid": "तू / तुझा",
        "hard": "Marathi default: तुम्ही forms. Never use तू unless explicitly requested.",
    },
    "bn": {
        "label": "Bengali",
        "use": "আপনি / আপনার",
        "avoid": "তুই / তোর",
        "hard": "Bengali default: আপনি. Never use তুই unless explicitly requested.",
    },
    "pa": {
        "label": "Punjabi",
        "use": "ਤੁਸੀਂ / ਤੁਹਾਡਾ",
        "avoid": "ਤੂੰ / ਤੇਰਾ",
        "hard": "Punjabi default: ਤੁਸੀਂ. Never use ਤੂੰ unless explicitly requested.",
    },
    "ur": {
        "label": "Urdu",
        "use": "آپ / آپ کا",
        "avoid": "تم / تیرا where respect is expected",
        "hard": "Urdu default: آپ. Do not use familiar تم/تیرا unless the user clearly establishes it.",
    },
    "ta": {
        "label": "Tamil",
        "use": "நீங்கள் / உங்கள்",
        "avoid": "நீ / உன் (overly familiar singular)",
        "hard": "Tamil default: நீங்கள். Avoid familiar நீ unless explicitly requested.",
    },
    "te": {
        "label": "Telugu",
        "use": "మీరు / మీ",
        "avoid": "నువ్వు / నీ",
        "hard": "Telugu default: మీరు. Never use నువ్వు unless explicitly requested.",
    },
    "kn": {
        "label": "Kannada",
        "use": "ನೀವು / ನಿಮ್ಮ",
        "avoid": "ನೀನು / ನಿನ್ನ",
        "hard": "Kannada default: ನೀವು. Never use ನೀನು unless explicitly requested.",
    },
    "ml": {
        "label": "Malayalam",
        "use": "നിങ്ങൾ / നിങ്ങളുടെ",
        "avoid": "നീ / നിന്റെ",
        "hard": "Malayalam default: നിങ്ങൾ. Never use നീ unless explicitly requested.",
    },
    "fr": {
        "label": "French",
        "use": "vous / votre",
        "avoid": "tu / ton unless the user establishes tutoiement",
        "hard": "French default: vous. Do not tutoyer unless the user clearly invites tu.",
    },
    "es": {
        "label": "Spanish",
        "use": "usted / ustedes when uncertain; polite register",
        "avoid": "overfamiliar tú where inappropriate",
        "hard": "Spanish: prefer respectful/usted if locale or relationship is uncertain. Do not default to tú.",
    },
    "de": {
        "label": "German",
        "use": "Sie / Ihr",
        "avoid": "du / dein unless the user signals casual tone",
        "hard": "German default in travel context: Sie. Do not duzen unless the user invites it.",
    },
    "en": {
        "label": "English",
        "use": "neutral you",
        "avoid": "no pronoun issue — keep tone warm, not overfamiliar",
        "hard": "English: friendly_respectful tone. No slang nicknames unless the user offered one.",
    },
}

_TRAVEL_BLOCK = {
    "flight", "flights", "hotel", "hotels", "train", "trains", "trip", "package",
    "sir", "madam", "bro", "bhai", "yaar", "dude", "boss", "ji", "vero",
    "mumbai", "delhi", "surat", "goa", "dubai", "london", "paris",
}

_CALL_ME_RE = [
    re.compile(r"\b(?:please\s+)?(?:you can\s+)?call me\s+([A-Za-z\u0900-\u0D7F][\w .'\-]{0,22})\b", re.I),
    re.compile(r"\b(?:please\s+)?(?:address|refer to) me (?:as|by)\s+([A-Za-z\u0900-\u0D7F][\w .'\-]{0,22})\b", re.I),
    re.compile(r"\bmy (?:preferred )?name is\s+([A-Za-z\u0900-\u0D7F][\w .'\-]{0,22})\b", re.I),
    re.compile(r"મને\s+([A-Za-z\u0A80-\u0AFF][\w .'\-]{0,22})\s+(?:કહો|કહેજો|કહેવો|બોલો|બોલજો)", re.I),
    re.compile(r"મને\s+([A-Za-z][\w .'\-]{0,22})\s+(?:kaho|kahejo|bolo|bolje)\b", re.I),
    re.compile(r"\bmane\s+([A-Za-z][\w .'\-]{0,22})\s+(?:kaho|kahejo|bolo|bolje|kahi\s*shako)\b", re.I),
    re.compile(r"मुझे\s+([A-Za-z\u0900-\u097F][\w .'\-]{0,22})\s+(?:कहो|कहिए|बोलो|बुलाओ)", re.I),
    re.compile(r"मुझे\s+([A-Za-z][\w .'\-]{0,22})\s+(?:kaho|bolo|bulao)\b", re.I),
    re.compile(r"\bmujhe\s+([A-Za-z][\w .'\-]{0,22})\s+(?:kaho|bolo|bulao)\b", re.I),
]

_STOP_NAME_RE = [
    re.compile(r"\bdon'?t call me(?:\s+([A-Za-z\u0900-\u0D7F][\w .'\-]{0,22}))?\b", re.I),
    re.compile(r"\bstop calling me(?:\s+([A-Za-z\u0900-\u0D7F][\w .'\-]{0,22}))?\b", re.I),
    re.compile(r"\bdon'?t use my name\b", re.I),
    re.compile(r"\bno names?\b|\bwithout (?:my )?name\b", re.I),
    re.compile(r"મને(?:\s+\S+){0,3}\s+(?:નામથી\s+)?ન(?:હી)?\s*(?:કહેતા|બોલો|બોલતા)", re.I),
    re.compile(r"\bmane(?:\s+\S+){0,3}\s+(?:naam|name)\s+(?:nathi|mat|na)\b", re.I),
    re.compile(r"मुझे(?:\s+\S+){0,3}\s+(?:नाम से\s+)?मत\s+(?:कहो|बुलाओ|बोलो)", re.I),
]

_CASUAL_PRONOUN_RE = [
    re.compile(r"\b(?:you can|please)\s+(?:use\s+)?(?:tu|तू|તું)\b", re.I),
    re.compile(r"\b(?:tutoyer|tutéame|tutearme|duzen|duzen wir|use du)\b", re.I),
    re.compile(r"તું\s+(?:કહી|વાપર|બોલ)", re.I),
    re.compile(r"\btu\s+(?:kahi|vaparo|bolo|theek|ok)\b", re.I),
    re.compile(r"(?:तू|तुम)\s+(?:बोल|कह)\s*(?:सकते|सकती|दो)", re.I),
]

_INTIMATE_RE = re.compile(r"\b(?:be intimate|talk intimate|very close|we're close|we are close)\b", re.I)


def language_key(spoken: str | None) -> str:
    tag = str(spoken or "").strip().lower().replace("_", "-")
    if not tag:
        return "en"
    primary = tag.split("-", 1)[0]
    if primary in _LANG_DEFAULTS:
        return primary
    if tag.startswith("en"):
        return "en"
    return primary if primary else "en"


def language_defaults(spoken: str | None) -> dict[str, str]:
    key = language_key(spoken)
    return _LANG_DEFAULTS.get(key, _LANG_DEFAULTS["en"])


def _clean_name(raw: str | None) -> str:
    text = re.sub(r"[\"“”‘’]+", "", str(raw or "")).strip(" .,-")
    text = re.sub(r"\s+", " ", text)
    if not text or len(text) > 24:
        return ""
    words = text.split()
    if len(words) > 3:
        return ""
    low = text.lower()
    if low in _TRAVEL_BLOCK or any(w.lower() in _TRAVEL_BLOCK for w in words):
        return ""
    if not re.fullmatch(r"[A-Za-z\u0900-\u0D7F][\w .'\-]*", text, re.UNICODE):
        return ""
    return text


def extract_name_directive(message: str) -> dict[str, Any]:
    text = str(message or "").strip()
    if not text:
        return {}
    for rx in _STOP_NAME_RE:
        if rx.search(text):
            m = rx.search(text)
            named = _clean_name(m.group(1) if m and m.lastindex else "")
            return {"clear_name": True, "cleared_name": named or ""}
    for rx in _CALL_ME_RE:
        m = rx.search(text)
        if not m:
            continue
        name = _clean_name(m.group(1))
        if name:
            return {"preferred_name": name, "name_source": "explicit", "nickname_permission": True}
    return {}


def extract_style_directive(message: str, current: str = DEFAULT_STYLE) -> str:
    text = str(message or "").strip()
    if not text:
        return current if current in ADDRESS_STYLES else DEFAULT_STYLE
    if _INTIMATE_RE.search(text) and any(rx.search(text) for rx in _CASUAL_PRONOUN_RE):
        return "intimate"
    if any(rx.search(text) for rx in _CASUAL_PRONOUN_RE):
        return "casual"
    if re.search(r"\b(?:be formal|more formal|respectful please|aap bolo|tame j bolo)\b", text, re.I):
        return "respectful"
    if re.search(r"\b(?:keep it professional|professional tone)\b", text, re.I):
        return "neutral"
    return current if current in ADDRESS_STYLES else DEFAULT_STYLE


def resolve_preferred_name(
    trip_context: dict[str, Any],
    message: str,
    traveler: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Apply name precedence and persist into a small address patch."""
    ctx = trip_context if isinstance(trip_context, dict) else {}
    tv = traveler if isinstance(traveler, dict) else {}
    directive = extract_name_directive(message)

    nickname_ok = ctx.get("nickname_permission")
    if nickname_ok is None:
        nickname_ok = tv.get("nickname_permission")
    if nickname_ok is None:
        nickname_ok = True
    nickname_ok = bool(nickname_ok)

    if directive.get("clear_name"):
        return {
            "preferred_name": "",
            "name_source": "",
            "nickname_permission": False,
        }

    if directive.get("preferred_name"):
        return {
            "preferred_name": directive["preferred_name"],
            "name_source": "explicit",
            "nickname_permission": True,
        }

    existing = _clean_name(ctx.get("preferred_name"))
    existing_source = str(ctx.get("name_source") or "")
    if existing and existing_source == "explicit":
        return {
            "preferred_name": existing,
            "name_source": "explicit",
            "nickname_permission": True,
        }

    profile = _clean_name(tv.get("preferred_name") or tv.get("profile_preferred_name") or ctx.get("profile_preferred_name"))
    if profile:
        return {
            "preferred_name": profile,
            "name_source": "profile",
            "nickname_permission": nickname_ok,
        }

    account = _clean_name(tv.get("account_first_name") or tv.get("first_name") or ctx.get("account_first_name"))
    if account and nickname_ok:
        return {
            "preferred_name": account,
            "name_source": "account",
            "nickname_permission": True,
        }

    if existing and nickname_ok:
        return {
            "preferred_name": existing,
            "name_source": existing_source or "account",
            "nickname_permission": True,
        }

    return {
        "preferred_name": "",
        "name_source": "",
        "nickname_permission": nickname_ok,
    }


def apply_respect_state(
    trip_context: dict[str, Any],
    message: str,
    spoken_language: str | None = None,
    traveler: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ctx = dict(trip_context or {})
    spoken = spoken_language or ctx.get("spoken_language") or ctx.get("user_language") or "en"
    defaults = language_defaults(spoken)
    name_patch = resolve_preferred_name(ctx, message, traveler)
    style = extract_style_directive(message, str(ctx.get("address_style") or DEFAULT_STYLE))
    formality = DEFAULT_FORMALITY if style in ("respectful", "neutral") else (
        "warm_casual" if style == "casual" else "intimate"
    )
    patch = {
        "language": spoken,
        "address_style": style,
        "formality": formality,
        "required_second_person": defaults["use"],
        "avoid_second_person": defaults["avoid"],
        "respect_hard_rule": defaults["hard"],
        "respect_language_label": defaults["label"],
        **name_patch,
    }
    if isinstance(traveler, dict):
        if traveler.get("profile_preferred_name"):
            patch["profile_preferred_name"] = _clean_name(traveler.get("profile_preferred_name"))
        if traveler.get("account_first_name"):
            patch["account_first_name"] = _clean_name(traveler.get("account_first_name"))
    return patch


def respect_prompt_block(trip_context: dict[str, Any] | None) -> str:
    ctx = trip_context if isinstance(trip_context, dict) else {}
    if not ctx.get("address_style") and not ctx.get("required_second_person"):
        return ""
    name = str(ctx.get("preferred_name") or "").strip()
    source = str(ctx.get("name_source") or "").strip()
    style = str(ctx.get("address_style") or DEFAULT_STYLE)
    formality = str(ctx.get("formality") or DEFAULT_FORMALITY)
    lang = str(ctx.get("respect_language_label") or ctx.get("spoken_language") or "English")
    use = str(ctx.get("required_second_person") or "neutral you")
    avoid = str(ctx.get("avoid_second_person") or "")
    hard = str(ctx.get("respect_hard_rule") or "")
    lines = [
        "[RESPECT & ADDRESS — apply before writing any reply]",
        f"Respect mode: {formality}",
        f"Address style: {style}",
        f"Language: {lang}",
        f"Required second-person form: {use}",
    ]
    if avoid:
        lines.append(f"Avoid by default: {avoid}")
    if hard:
        lines.append(f"Hard rule: {hard}")
    if name and ctx.get("nickname_permission", True):
        lines.append(f"Preferred name: {name}" + (f" (source: {source})" if source else ""))
        lines.append(
            "Use that name naturally and sparingly — greetings, important confirmations, supportive moments. "
            "Never repeat it every sentence. Never invent a nickname."
        )
    else:
        lines.append("Preferred name: none. Do not invent a name or nickname.")
    lines.append(
        "Mirror the user’s energy and vocabulary, but do not downgrade to disrespectful pronouns. "
        "Friendly does not mean overfamiliar. Never infer gendered forms of address unless the user made that clear."
    )
    if style == "casual":
        lines.append(
            "User invited a more casual register. Tone may be warmer, but keep second-person respectful "
            "unless the language’s casual pronoun was explicitly requested."
        )
    return "\n".join(lines)


def voice_respect_instruction(trip_context: dict[str, Any] | None) -> str:
    ctx = trip_context if isinstance(trip_context, dict) else {}
    use = str(ctx.get("required_second_person") or "").strip()
    avoid = str(ctx.get("avoid_second_person") or "").strip()
    hard = str(ctx.get("respect_hard_rule") or "").strip()
    name = str(ctx.get("preferred_name") or "").strip()
    bits = ["Warm and friendly, but respectful."]
    if use:
        bits.append(f"Second person MUST be: {use}.")
    if avoid:
        bits.append(f"Do not use: {avoid}.")
    if hard:
        bits.append(hard)
    if name and ctx.get("nickname_permission", True):
        bits.append(f"You may use the name {name} once if natural. Do not repeat it.")
    return " ".join(bits)
