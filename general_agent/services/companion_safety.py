"""On-trip companion classifiers — medical / safety / disaster.

Does NOT diagnose and does NOT replace the LLM. It only tags the turn so
the system prompt can force: emergency care first, then travel logistics.
"""
from __future__ import annotations

import re
from typing import Optional

# Life-threatening / don't board / get help NOW
_MEDICAL_EMERGENCY = re.compile(
    r"\b("
    r"chest pain|heart attack|can'?t breathe|cannot breathe|trouble breathing|"
    r"not breathing|anaphylax|allergic reaction|throat (?:is )?closing|"
    r"hit my head|head injur|unconscious|seizure|stroke|"
    r"might faint|about to faint|passed out|bleeding heavily|"
    r"broken (?:leg|arm|bone)|can barely (?:walk|put weight)"
    r")\b",
    re.I,
)

# Urgent but usually not "call ambulance in the next 30 seconds"
_MEDICAL_URGENT = re.compile(
    r"\b("
    r"fever|102|vomiting|diarrhea|dizzy|sunburn|altitude|ladakh|leh|"
    r"prescription|insulin|dialysis|diabetic|nut allergy|pregnant|"
    r"wheelchair|not fit to fly|heart medication|high fever|"
    r"motion sickness|medical device|"
    r"(?:girlfriend|boyfriend|wife|husband|partner|she|he|mom|dad).{0,24}\bsick\b|"
    r"\bsick\b.{0,24}(?:vomit|fever|nause|weak)"
    r")\b",
    re.I,
)

_STACK_HEALTH = re.compile(
    r"\b(sick|vomit|vomiting|dizzy|fever|faint|weakness|chest pain|nause)\b", re.I
)
_STACK_MONEY = re.compile(
    r"\b(wallet|lost (?:my )?cards?|cards? (?:are|were) (?:in|gone|lost|stolen))\b", re.I
)
_STACK_TRANSPORT = re.compile(
    r"\b(flight|boarding|checkout|check-out|hotel checkout|train|9\s*am|tomorrow(?:'s)? flight)\b",
    re.I,
)
_STACK_ACTIVITY = re.compile(
    r"\b(eiffel|prepaid|reservation|tower thing|activity booking)\b", re.I
)

_SAFETY_EMERGENCY = re.compile(
    r"\b("
    r"don'?t feel safe|do not feel safe|someone (?:has been )?following|"
    r"being followed|taxi driver.{0,40}different direction|"
    r"demanding cash|friend disappeared|nightclub|"
    r"overcharged.{0,20}taxi"
    r")\b",
    re.I,
)

_DISASTER = re.compile(
    r"\b("
    r"earthquake|wildfire|evacuat|civil unrest|protest blocking|"
    r"riot|tsunami|flood warning"
    r")\b",
    re.I,
)

_DESTRUCTIVE_CANCEL = re.compile(
    r"^\s*cancel\s+(everything|all(?:\s+of\s+it)?|the\s+whole\s+trip|all\s+bookings)\b",
    re.I,
)
_SEARCH_NOT_BOOK = re.compile(
    r"\bbook\b.{0,40}\b(i mean|look(?:ing)? for|search|just (?:see|show|find))\b",
    re.I,
)
_CANCEL_TODAY_ONLY = re.compile(
    r"^\s*(just|only)\s+today\b",
    re.I,
)

VOICE_CAUTION_BLOCKS = {
    "destructive_cancel": (
        "[THIS TURN — DESTRUCTIVE VOICE COMMAND]\n"
        "They said cancel everything / cancel all. Do NOT cancel flights or hotels. "
        "Ask once: today's activities only, or the whole trip including bookings? "
        "Wait for the answer. If they already said 'just today', only clear today's plan."
    ),
    "cancel_today_only": (
        "[THIS TURN — CANCEL TODAY ONLY]\n"
        "They confirmed just today. Do NOT cancel flights or hotels. "
        "Clear today's sightseeing/activities only. Say out loud that the flight and hotel stay. "
        "You cannot cancel bookings for them."
    ),
    "search_not_book": (
        "[THIS TURN — SEARCH NOT BOOK]\n"
        "ASR correction: they said book then look/search. Search only. "
        "Do not escalate, prebook, or claim you booked anything."
    ),
}


def classify_voice_caution(text: str) -> Optional[str]:
    t = (text or "").strip()
    if not t:
        return None
    if _DESTRUCTIVE_CANCEL.search(t) and not re.search(r"\bjust today\b|\bonly today\b", t, re.I):
        return "destructive_cancel"
    if _CANCEL_TODAY_ONLY.search(t):
        return "cancel_today_only"
    if _SEARCH_NOT_BOOK.search(t):
        return "search_not_book"
    return None


def is_stacked_crisis(text: str) -> bool:
    t = text or ""
    n = sum(
        1
        for pat in (_STACK_HEALTH, _STACK_MONEY, _STACK_TRANSPORT, _STACK_ACTIVITY)
        if pat.search(t)
    )
    return n >= 2


PROMPT_BLOCKS = {
    "medical_emergency": (
        "[THIS TURN — MEDICAL EMERGENCY]\n"
        "Do NOT diagnose. Do NOT guess a condition. Do NOT tell them to board, "
        "keep walking, or 'wait and see'.\n"
        "Sentence 1–2: get emergency medical help NOW (local emergency number / "
        "airport medical / hotel desk to call an ambulance). You CANNOT summon "
        "emergency services for them.\n"
        "Chest pain / trouble breathing / anaphylaxis / head injury / collapse: "
        "the flight and itinerary are SECONDARY. Say do not board if they asked.\n"
        "Then ONLY travel consequences: miss/rebook flight (search or unknown), "
        "hotel extension, companion, insurance paperwork. Label estimate vs unknown. "
        "No invented hospital names unless destination_search/get_route this turn."
    ),
    "medical_urgent": (
        "[THIS TURN — MEDICAL / HEALTH + TRAVEL]\n"
        "Do NOT diagnose. Suggest seeing a doctor/clinic/pharmacist where appropriate. "
        "You are not their physician. Then help TRAVEL logistics: cancel/retime "
        "activities, hotel extend, flight change, prescription/baggage, food breaks, "
        "accessibility, not-fit-to-fly. Search live hours/hospitals when location is known. "
        "Never invent a drug equivalent, visa, or airline medical policy."
    ),
    "stacked_crisis": (
        "[THIS TURN — STACKED TRIP CRISIS]\n"
        "Several problems at once. Do NOT treat them equally. Do NOT dump baggage/PNR/terminal.\n"
        "Spoken order, 1–2 sentences, ONE question max:\n"
        "1) Health first — no diagnosis. Sit/rest. Seek medical care if vomiting, weakness, or faintness.\n"
        "2) Cards/wallet — tell THEM to lock or freeze cards with the issuer. You cannot freeze cards.\n"
        "3) Tomorrow's flight / checkout — only after health; fit-to-fly is unknown until assessed.\n"
        "4) Prepaid activities (Eiffel etc.) — lowest priority; move, cancel, or write off later.\n"
        "Do not list three hospitals. One next physical step. "
        "If they say okay/got it, recap that same order out loud (health, cards, flight, then activity)."
    ),
    "safety_emergency": (
        "[THIS TURN — PERSONAL SAFETY]\n"
        "First: get them somewhere public/lit/staffed (hotel lobby, airport, police, "
        "trusted ride). You cannot track the follower or call the police for them.\n"
        "Give 2–4 concrete physical steps. Then travel: new hotel, cancel unsafe area, "
        "notify companion. Do not invent live crime maps."
    ),
    "disaster": (
        "[THIS TURN — DISASTER / UNREST]\n"
        "Immediate physical safety first (shelter, official evacuation, hotel staff). "
        "Do not invent epicentre, fire lines, or protest routes — destination_search "
        "or say unknown. Then replan away: transport out, hotel, flights. "
        "You cannot book evacuations; tell them what to do."
    ),
}


def classify_companion(text: str) -> Optional[str]:
    t = text or ""
    if _MEDICAL_EMERGENCY.search(t):
        return "medical_emergency"
    if _DISASTER.search(t):
        return "disaster"
    if _SAFETY_EMERGENCY.search(t):
        return "safety_emergency"
    if is_stacked_crisis(t):
        return "stacked_crisis"
    if _MEDICAL_URGENT.search(t):
        return "medical_urgent"
    return None


def companion_prompt_block(mode: str | None) -> str:
    if not mode:
        return ""
    return PROMPT_BLOCKS.get(mode, "")


def voice_caution_block(mode: str | None) -> str:
    if not mode:
        return ""
    return VOICE_CAUTION_BLOCKS.get(mode, "")
