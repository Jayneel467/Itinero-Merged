"""Hard stops: never invent live airport facts; never fake unauthorized actions."""
from __future__ import annotations

import re
from typing import Optional

_BLINDFOLD = re.compile(
    r"without using|don'?t use (the )?(internet|api|maps|booking)|"
    r"no (internet|api|tools|booking data)|"
    r"without .{0,80}(internet|airline api|maps api|booking data)",
    re.I,
)
_LIVE_STATUS = re.compile(
    r"\b("
    r"current (?:flight )?gate|gate (?:number|now|change)|"
    r"boarding (?:has )?started|has boarding started|"
    r"(?:exact )?security (?:wait|queue|line)(?: time)?|"
    r"queue time|"
    r"(?:checked )?bag(?:gage)? (?:been )?loaded|"
    r"live (?:traffic|status|delay)|"
    r"check[- ]?in cutoff|"
    r"airport security wait"
    r")\b",
    re.I,
)
_CRISIS = re.compile(
    r"\b("
    r"rebook|automatically|notify the hotel|change fee|"
    r"cancelled|canceled|"
    r"can(?:not|'t)? make it|"
    r"\d+\s*(?:hour|hr|minute|min)s?\s*(?:left|away)|"
    r"leaves? in|running late|miss (?:my )?connection"
    r")\b",
    re.I,
)
_LIVE_ASK_SIMPLE = re.compile(
    r"\b("
    r"boarding (?:has )?started|"
    r"security (?:wait|queue)|"
    r"bag(?:gage)? (?:been )?loaded|"
    r"exact security|"
    r"current gate"
    r")\b",
    re.I,
)

BLINDFOLD_REFUSAL = (
    "I don’t have live airport feeds, and you asked me not to use the internet, "
    "airline/maps APIs, or your booking. So I **cannot** tell you: current gate, "
    "whether boarding has started, exact security queue time, or whether a checked "
    "bag is loaded. I won’t invent those. Check the airline app / airport screens "
    "for gate and boarding; bag-loaded status only exists with the airline."
)

LIVE_STATUS_REFUSAL = (
    "**Confirmed on your ticket** I can quote (PNR, ticket terminal, bag kg). "
    "**I do not have:** live gate, boarding-started Y/N, exact security wait, "
    "or whether a bag is loaded. I won’t invent those. Use the airline app / "
    "airport screens for gate and boarding."
)


def is_blindfold_live_ask(text: str) -> bool:
    t = text or ""
    return bool(_BLINDFOLD.search(t) and _LIVE_STATUS.search(t))


def is_crisis_or_long(text: str) -> bool:
    t = (text or "").strip()
    if len(t) > 220:
        return True
    return bool(_CRISIS.search(t) and (_LIVE_STATUS.search(t) or "baggage" in t.lower() or "bag" in t.lower()))


_AGENTIC_PLAN = re.compile(
    r"\b("
    r"compare|eliminate|honeymoon|constraint|schengen|transit visa|"
    r"should i take|stress[- ]?test|pick exactly one|hard constraint|"
    r"plan (?:a |my |our )?(?:full day|one[- ]?day|trip)|"
    r"full day in|day plan|itinerary|"
    r"chest pain|fever|passport|following me|don'?t feel safe|"
    r"allergic|vomit|diarrhea|earthquake|wildfire|evacuat|"
    r"bedbugs|overbook|wallet (?:was )?stolen|lost (?:my )?wallet|"
    r"girlfriend.?s? sick|\bsick\b|prepaid|eiffel|need you right now|audit"
    r")\b",
    re.I,
)


def skip_booking_instant(text: str) -> bool:
    """Don’t dump ticket bag/terminal when the real ask is crisis / live status / blindfold."""
    t = (text or "").strip()
    if not t:
        return False
    if is_blindfold_live_ask(t):
        return True
    if _LIVE_ASK_SIMPLE.search(t):
        return True
    if is_crisis_or_long(t):
        return True
    if _BLINDFOLD.search(t):
        return True
    return False


def skip_all_instant(text: str) -> bool:
    """Planning / compare / long asks must hit the LLM — not a regex chatbot."""
    t = (text or "").strip()
    if not t:
        return False
    if skip_booking_instant(t):
        return True
    if len(t) > 280:
        return True
    if _AGENTIC_PLAN.search(t):
        return True
    return False


def instant_live_guard(text: str) -> Optional[str]:
    """Deterministic reply (no LLM). None = fall through."""
    t = (text or "").strip()
    if not t:
        return None
    if is_blindfold_live_ask(t) or (_BLINDFOLD.search(t) and _LIVE_ASK_SIMPLE.search(t)):
        return BLINDFOLD_REFUSAL
    if _LIVE_ASK_SIMPLE.search(t) and not re.search(
        r"\b(pnr|allowance|how much (?:cabin|check)|which terminal)\b", t, re.I
    ):
        if not re.search(r"\b(rebook|cancelled|make it|hotel|traffic)\b", t, re.I):
            return LIVE_STATUS_REFUSAL
    return None
