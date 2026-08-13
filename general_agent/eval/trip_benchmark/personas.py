"""Persona + left-page hints injected with each bucket."""

PERSONAS = {
    "A": {
        "id": "in_within_city",
        "label": "Indian user — within-city",
        "home_country": "IN",
        "currency": "INR",
        "passport": "IN",
        "hint": (
            "Indian traveller, INR. Within ONE city unless they name another. "
            "Pure veg = no egg/meat/fish. Prefer metro/local/walk over assuming a car. "
            "Do not invent prices; label estimates. No visa needed inside India."
        ),
    },
    "B": {
        "id": "in_intercity",
        "label": "Indian user — intercity/interstate",
        "home_country": "IN",
        "currency": "INR",
        "passport": "IN",
        "hint": (
            "Indian traveller, INR, moving between Indian cities. "
            "Compare train/bus/flight honestly. India domestic: Aadhaar/DL is enough to fly. "
            "Do not invent IRCTC waitlist confirmation. Label estimates vs live fares."
        ),
    },
    "C": {
        "id": "in_domestic_complex",
        "label": "Indian user — difficult domestic planning",
        "home_country": "IN",
        "currency": "INR",
        "passport": "IN",
        "hint": (
            "Indian traveller planning a multi-city India trip with hard constraints "
            "(budget, group mix, no-flight, accessibility). Call out impossible routes. "
            "Do not invent fares. Escalate to itinerary only if they want a full bookable plan "
            "and slots are known."
        ),
    },
    "D": {
        "id": "in_international",
        "label": "Indian user — international",
        "home_country": "IN",
        "currency": "INR",
        "passport": "IN",
        "hint": (
            "Indian passport. NEVER guess visa/transit/ETA — search or say unknown. "
            "US F-1 / B1/B2 does not automatically unlock Schengen. "
            "Self-transfer + short Heathrow/FRA connections are high risk. Prices in ₹."
        ),
    },
    "E": {
        "id": "us_domestic",
        "label": "US user — domestic",
        "home_country": "US",
        "currency": "USD",
        "passport": "US",
        "hint": (
            "US traveller, USD, inside the US. 18 vs 21 hotel/alcohol rules matter. "
            "LA/Orlando/Yellowstone without a car is often infeasible — say so. "
            "Amtrak vs fly: use realistic times. Do not invent fares."
        ),
    },
    "F": {
        "id": "us_international",
        "label": "US user — international",
        "home_country": "US",
        "currency": "USD",
        "passport": "US",
        "hint": (
            "US passport. NEVER guess visa/ESTA/eTA/passport validity rules — search or unknown. "
            "Many countries need 6 months passport validity. Separate tickets = no protected connection. "
            "Do not invent live fares or hotel age policies."
        ),
    },
}


def page_context(bucket: str) -> dict:
    p = PERSONAS[bucket]
    return {
        "screen": "explore",
        "path": "/explore",
        "persona": {
            "home_country": p["home_country"],
            "currency": p["currency"],
            "passport": p["passport"],
        },
        "help_hint": p["hint"],
    }
