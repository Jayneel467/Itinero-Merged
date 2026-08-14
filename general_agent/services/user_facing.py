"""
Sanitize assistant text so end users only ever see Vero.

Internal orchestration (general agent, itinerary agent, flight/hotel
specialists, supervisor) must stay invisible in chat copy.
"""
from __future__ import annotations

import re
from typing import Any

# Longer / more specific phrases first. Prefer natural Vero phrasing.
_REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"(?is)Error invoking tool\b[\s\S]{0,4000}?(?:Please fix the error and try again\.?)?"
        ),
        "Got it — I've saved that. Say proceed when you want passenger details.",
    ),
    (
        re.compile(
            r"\b(?:I'm |I am )?handing (?:this|you) off to (?:the )?(?:Itinerary|General|Flight|Hotel|Travel) Agent\b[^.!]*[.!]?",
            re.I,
        ),
        "I'm putting your trip plan together now.",
    ),
    (re.compile(r"\bhand[- ]?off to (?:the )?(?:Itinerary|General) Agent\b", re.I), "continue with"),
    (re.compile(r"\bITINERARY[_\s-]?AGENT\b", re.I), "Vero"),
    (re.compile(r"\bthe Itinerary Agent\b", re.I), "Vero"),
    (re.compile(r"\bItinerary Agent\b", re.I), "Vero"),
    (re.compile(r"\bGENERAL[_\s-]?AGENT\b", re.I), "Vero"),
    (re.compile(r"\bthe General Agent\b", re.I), "Vero"),
    (re.compile(r"\bGeneral Agent\b", re.I), "Vero"),
    (re.compile(r"\bFlight Agent\b", re.I), "Vero"),
    (re.compile(r"\bHotel Agent\b", re.I), "Vero"),
    (re.compile(r"\bTravel Agent\b", re.I), "Vero"),
    (re.compile(r"\bvia specialist agents\b", re.I), ""),
    (re.compile(r"\bspecialist agents?\b", re.I), "Vero"),
    (re.compile(r"\bspecialist team\b", re.I), "my planning tools"),
    (re.compile(r"\bSupervisor plans with you\b", re.I), "Vero plans with you"),
    (re.compile(r"\bsupervisor gateway\b", re.I), "Itinero"),
    (re.compile(r"\bthe supervisor\b", re.I), "Vero"),
    (re.compile(r"\bSupervisor\b"), "Vero"),
    (re.compile(r"\bitinerary pipeline\b", re.I), "trip plan"),
    (re.compile(r"\bmulti-agent system\b", re.I), "planning tools"),
    (re.compile(r"\bLiteAPIError:\s*", re.I), ""),
    (re.compile(r"\bLiteAPI\s*Payment\s*SDK\b", re.I), "secure card checkout"),
    (re.compile(r"\b(?:searching|checking|calling|querying|hitting)\s+Lite\s*API\b", re.I), "searching live fares"),
    (re.compile(r"\bvia Lite\s*API\b", re.I), ""),
    (re.compile(r"\bfrom Lite\s*API\b", re.I), ""),
    (re.compile(r"\bon Lite\s*API\b", re.I), ""),
    (re.compile(r"\bLite\s*API\b", re.I), ""),
    (re.compile(r"\beSimply\b", re.I), "eSIM"),
    (re.compile(r"\bNuitee(?:\s+Connect)?\b", re.I), ""),
    (re.compile(r"\bNuitée\b", re.I), ""),
    (re.compile(r"\bDeepSeek\b"), ""),
    (re.compile(r"\bOpenAI\b"), ""),
    (re.compile(r"\bRailYatri\b", re.I), "partner checkout"),
    (re.compile(r"\beRail\b", re.I), "train timetable"),
    (re.compile(r"\bredBus\b", re.I), "partner checkout"),
    (re.compile(r"\bAbhiBus\b", re.I), "partner checkout"),
    (re.compile(r"\bIntrCity\b", re.I), "partner checkout"),
    (re.compile(r"\bWanderu\b", re.I), "partner checkout"),
    (re.compile(r"\bFlixBus\b", re.I), "partner checkout"),
    (re.compile(r"\bGreyhound\b", re.I), "the coach operator"),
    (re.compile(r"\bConfirmTkt\b", re.I), ""),
    (re.compile(r"\bTicketmaster\b", re.I), "ticketing partner"),
    (re.compile(r"\bFrankfurter\b", re.I), "mid-market"),
    (re.compile(r"\bNTES\b", re.I), "railway status"),
    (re.compile(r"\bGoogle Routes\b", re.I), "live routing"),
]

# LLM often re-lists flight/hotel cards as a huge numbered menu — strip it.
_NUMBERED_OPTION_DUMP = re.compile(
    r"(?is)"
    r"(?:here are the best[^.!\n]*[.!]?\s*)?"
    r"(?:(?:\d{1,2}\.\s+|\*\*\s*\d{1,2}\.?\s*|option\s+\d+\b)[^\n]*(?:\n(?!\d{1,2}\.|\*\*\s*\d|option\s+\d)[^\n]*)*){2,}"
)
_RECOMMENDATION_TRAIL = re.compile(
    r"(?is)\bmy recommendation\b[:\s].*?(?:which (?:flight|hotel|option|one)\b.*)?$"
)
_OPTION_BLOCK = re.compile(
    r"(?im)^(?:option\s+\d+\b.*(?:\n(?!option\s+\d+\b)[^\n]*)*)+"
)

# Output policy: Vero must not claim money/booking actions it cannot perform in-chat.
_UNAUTHORIZED_CLAIMS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"(?is)\bI(?:'ve| have) (?:just )?(?:re)?booked\b[^.!\n]*[.!]?",
            re.I,
        ),
        "I can't complete a booking from chat alone — use Continue on the left, or say which option to hold.",
    ),
    (
        re.compile(
            r"(?is)\bI(?:'ve| have) (?:just )?(?:paid|charged|completed payment)\b[^.!\n]*[.!]?",
            re.I,
        ),
        "I can't take payment in chat — confirm on the payment screen when you're ready.",
    ),
    (
        re.compile(
            r"(?is)\b(?:payment (?:is |was )?confirmed|you're all booked|booking (?:is |was )?confirmed)\b[^.!\n]*[.!]?",
            re.I,
        ),
        "I won't mark a booking confirmed until the payment screen finishes — check the left panel.",
    ),
    (
        re.compile(
            r"(?is)\bI(?:'ve| have) (?:just )?(?:cancelled|canceled) (?:your |the )?(?:flight|hotel|booking|trip)\b[^.!\n]*[.!]?",
            re.I,
        ),
        "I can't cancel tickets from chat — use Manage booking or ask me what you're allowed to change.",
    ),
]


def sanitize_user_facing_text(text: str | None) -> str:
    """Rewrite internal agent/supervisor wording for the chat UI."""
    if not text:
        return ""
    out = str(text)
    for pattern, replacement in _REPLACEMENTS:
        out = pattern.sub(replacement, out)
    for pattern, replacement in _UNAUTHORIZED_CLAIMS:
        out = pattern.sub(replacement, out)
    # Drop leaked card payloads if any slip into reply text
    out = re.sub(r"\[CARDS_DATA:[\s\S]*?\]", "", out).strip()
    # Soft cleanup of awkward doubles from replacements
    out = re.sub(r"\bVero via Vero\b", "Vero", out)
    out = re.sub(r"\bVero with Vero\b", "Vero", out)
    out = re.sub(r"\bThe Vero\b", "Vero", out)
    out = re.sub(r"[^\S\n]{2,}", " ", out)
    out = re.sub(r"\s+([,.])", r"\1", out)
    return out.strip()


def strip_duplicate_card_lists(text: str | None, cards: dict[str, Any] | None) -> str:
    """When UI cards are attached, kill numbered option dumps the model re-typed."""
    out = sanitize_user_facing_text(text)
    if not out:
        return ""
    if not isinstance(cards, dict) or not cards.get("items"):
        return out

    ctype = str(cards.get("type") or "")
    if ctype not in ("flights", "hotels", "trains", "buses", "places", "events"):
        return out

    n = len(cards.get("items") or [])
    label = {
        "flights": "flights",
        "hotels": "stays",
        "trains": "trains",
        "buses": "buses",
        "places": "places",
        "events": "events",
    }.get(ctype, "options")
    short = f"Found {n} {label} — pick one from the cards (or say more options)."

    numbered = len(re.findall(r"(?m)^\s*\d{1,2}\.\s+\S+", out))
    options = len(re.findall(r"(?i)\boption\s+\d+\b", out))
    looks_like_dump = (
        bool(re.search(r"(?i)here are the best available\b", out))
        or numbered >= 2
        or options >= 2
        or bool(re.search(r"(?i)which (?:flight|hotel|option).*(?:select|enter|number)", out))
        or out.count("₹") >= 3
        or out.count("\n") >= 10
    )
    if looks_like_dump:
        return short

    cleaned = _NUMBERED_OPTION_DUMP.sub(" ", out)
    cleaned = _OPTION_BLOCK.sub(" ", cleaned)
    cleaned = _RECOMMENDATION_TRAIL.sub(" ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[^\S\n]{2,}", " ", cleaned).strip()
    if len(cleaned) < 24 or cleaned.count("\n") > 8:
        return short
    return cleaned
