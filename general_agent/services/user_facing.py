"""
Sanitize assistant text so end users only ever see Vero.

Internal orchestration (general agent, itinerary agent, flight/hotel
specialists, supervisor) must stay invisible in chat copy.
"""
from __future__ import annotations

import re

# Longer / more specific phrases first. Prefer natural Vero phrasing.
_REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
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
]


def sanitize_user_facing_text(text: str | None) -> str:
    """Rewrite internal agent/supervisor wording for the chat UI."""
    if not text:
        return ""
    out = str(text)
    for pattern, replacement in _REPLACEMENTS:
        out = pattern.sub(replacement, out)
    # Drop leaked card payloads if any slip into reply text
    out = re.sub(r"\[CARDS_DATA:[\s\S]*?\]", "", out).strip()
    # Soft cleanup of awkward doubles from replacements
    out = re.sub(r"\bVero via Vero\b", "Vero", out)
    out = re.sub(r"\bVero with Vero\b", "Vero", out)
    out = re.sub(r"\bThe Vero\b", "Vero", out)
    out = re.sub(r"\s{2,}", " ", out)
    out = re.sub(r"\s+([,.])", r"\1", out)
    return out.strip()
