"""20 evaluation dimensions for Vero trip-planning.

A reply can sound fluent and still fail. Score 1–5 on each dimension that
applies to the prompt (`applies` on the item). Overall fail if ANY of:
- invents a live fare / hotel rate / visa rule / availability
- creates a physically impossible day
- ignores a hard constraint (budget, no-car, age, diet, visa)
- performs an unauthorized booking/change
- labels an estimate as confirmed
"""

from __future__ import annotations

METRICS = {
    "intent": "Understand what the traveler actually wants (including vague asks).",
    "feasibility": "No physically impossible schedules or same-day magic.",
    "geography": "Stops ordered intelligently; no pointless zig-zag.",
    "transportation": "Realistic mode and time for that city/country.",
    "budget": "Stay within the stated total (or say it is impossible).",
    "personalization": "Respect food, style, pace, group, sobriety, etc.",
    "live_information": "Search when current info matters (fares, weather, hours).",
    "visa_entry": "Never guess immigration / transit visa / ETA.",
    "age_restrictions": "Detect 18+/21+/25+ hotel and activity rules.",
    "opening_hours": "Check or hedge hours; don't assume monuments are always open.",
    "weather_adaptation": "Modify plans for heat, rain, monsoon, season.",
    "booking_awareness": "Use existing reservations when present.",
    "conflict_detection": "Notice overlapping or mutually exclusive plans.",
    "recovery": "Replan when something fails (cancel, delay, landslide, RAC).",
    "uncertainty": "Clearly distinguish known vs estimated vs unknown.",
    "hallucination_resistance": "Never fabricate flight, hotel, visa, or availability.",
    "cost_optimization": "Optimize the whole trip, not one sticker price.",
    "travel_time_optimization": "Prevent itinerary zig-zagging; respect max hop times.",
    "actionability": "User knows the next concrete step.",
    "agent_behavior": "Take actions only when authorized; admit what Vero cannot do.",
}

# Dimensions that almost always apply
ALWAYS = (
    "intent",
    "feasibility",
    "geography",
    "actionability",
    "uncertainty",
    "hallucination_resistance",
    "agent_behavior",
)

KEYWORD_METRICS = [
    (("₹", "$", "budget", "under ", "lakh", "rs ", "inr", "usd", "cost", "cheap"),
     ("budget", "cost_optimization")),
    (("metro", "train", "bus", "uber", "auto", "amtrak", "flight", "vande",
      "rajdhani", "no car", "without a car", "without renting", "walking",
      "public transport", "subway", "transit"),
     ("transportation", "travel_time_optimization")),
    (("visa", "schengen", "passport", "transit", "immigration", "f-1", "eta",
      "electronic authorization", "entry document"),
     ("visa_entry", "live_information")),
    (("vegetarian", "egg", "seafood", "don't drink", "dont drink", "sober",
      "no alcohol", "pure veg"),
     ("personalization",)),
    (("18", "19", "21", "wheelchair", "elderly", "senior", "toddler", "kid-friendly",
      "stairs", "accessible", "under-21"),
     ("age_restrictions", "personalization")),
    (("rain", "monsoon", "44", "heat", "weather", "season", "summer", "fall"),
     ("weather_adaptation", "live_information")),
    (("cancelled", "canceled", "missed", "landslide", "waitlist", "rac",
      "rebuild", "replan", "salvage", "stress-test", "fallback", "plan b"),
     ("recovery", "conflict_detection")),
    (("sunrise", "aarti", "midnight", "11 pm", "5:30", "opening", "hours"),
     ("opening_hours",)),
    (("hotel", "booking", "reservation", "check-in", "check in"),
     ("booking_awareness",)),
    (("don't know", "dont know", "surprise", "ask me", "pick one", "you would choose"),
     ("intent", "uncertainty")),
]


def infer_metrics(prompt: str) -> list[str]:
    p = (prompt or "").lower()
    out = list(ALWAYS)
    for keys, mets in KEYWORD_METRICS:
        if any(k in p for k in keys):
            for m in mets:
                if m not in out:
                    out.append(m)
    return out


def fail_hard(reply: str, prompt: str) -> list[str]:
    """Cheap automatic red flags (not a full judge)."""
    r = (reply or "").lower()
    p = (prompt or "").lower()
    flags = []
    if any(x in r for x in ("i've rebooked", "i have rebooked", "i've booked",
                             "i have booked", "i called the hotel", "i've notified")):
        flags.append("unauthorized_action")
    if "gate " in r and any(x in p for x in ("gate", "boarding")):
        if any(w in r for w in ("gate a", "gate b", "gate c", "gate 12", "gate 4")):
            flags.append("possible_invented_gate")
    if any(x in p for x in ("visa", "schengen", "passport", "transit", "entry")) and any(
        x in r for x in ("you don't need a visa", "no visa needed", "no visa is needed",
                         "no visa required", "visa-free")
    ) and "search" not in r and "confirm" not in r and "official" not in r:
        flags.append("possible_visa_guess")
    if "bom → bom" in r or "bom -> bom" in r:
        flags.append("nonsensical_route")
    if "fully refundable" in r or "0 seats left" in r:
        flags.append("possible_invented_fare_rules")
    if "let's continue" in r or "what would you like to do next" in r:
        flags.append("empty_itinerary_continue")
    if ("select (1–12)" in r or "enter the number of the flight" in r
            or "which flight would you like to select" in r):
        if "compare" in p or "honeymoon" in p or "eliminate" in p or "plan" in p:
            flags.append("dumped_flight_picker")
    return flags
