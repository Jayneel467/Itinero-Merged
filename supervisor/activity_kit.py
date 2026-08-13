"""Activity kits for packages: gear to bring + how to hire on the ground.

Computed at read time from themes + destination hints + itinerary copy.
Stay-on-Itinero first: hotel desk + neighbourhood how-to + Vero prompt.
Do not invent named shops — they go stale. Partner search is optional last resort.
"""

from __future__ import annotations

import re
from typing import Any

ACTIVE = frozenset(
    {
        "hiking",
        "trekking",
        "biking",
        "scuba",
        "rafting",
        "ski",
        "safari",
        "camping",
        "climbing",
        "surfing",
        "roadtrip",
    }
)

# Destination → outdoor activities (mirrors Explore EXTRA_THEMES, outdoor only).
_DEST_ACTIVITIES: dict[str, tuple[str, ...]] = {
    "manali": ("hiking", "trekking", "rafting", "camping", "climbing", "roadtrip"),
    "leh": ("hiking", "trekking", "camping", "biking", "roadtrip"),
    "ladakh": ("hiking", "trekking", "camping", "biking", "roadtrip"),
    "darjeeling": ("hiking", "trekking"),
    "rishikesh": ("hiking", "trekking", "rafting", "camping"),
    "srinagar": ("hiking", "roadtrip", "ski"),
    "kashmir": ("hiking", "roadtrip", "ski"),
    "kathmandu": ("hiking", "trekking", "climbing"),
    "queenstown": ("hiking", "trekking", "ski", "biking", "rafting"),
    "zurich": ("hiking", "ski", "biking"),
    "cape town": ("hiking", "safari", "biking"),
    "cape-town": ("hiking", "safari", "biking"),
    "nairobi": ("safari",),
    "zanzibar": ("scuba",),
    "maldives": ("scuba",),
    "bali": ("scuba", "surfing"),
    "ubud": ("hiking", "surfing"),
    "andaman": ("scuba",),
    "port blair": ("scuba",),
    "phuket": ("scuba",),
    "cancun": ("scuba",),
    "cancún": ("scuba",),
    "fiji": ("scuba",),
    "honolulu": ("hiking", "scuba"),
    "amsterdam": ("biking",),
    "paris": ("biking",),
    "london": ("biking",),
    "barcelona": ("biking",),
    "vienna": ("biking",),
    "berlin": ("biking",),
    "lisbon": ("biking",),
    "melbourne": ("biking",),
    "sydney": ("biking",),
    "auckland": ("biking",),
    "denver": ("hiking", "biking", "camping"),
    "reykjavik": ("hiking",),
    "iceland": ("hiking",),
    "tbilisi": ("hiking",),
    "rio": ("hiking",),
    "rio de janeiro": ("hiking",),
    "seoul": ("hiking",),
    "lonavala": ("hiking",),
    "goa": (),
}

_PLAYBOOKS: dict[str, dict[str, Any]] = {
    "hiking": {
        "label": "Hiking",
        "headline": "Broken-in shoes beat a new pair. Poles are easy to rent.",
        "bring": [
            "Broken-in hiking shoes or trail runners",
            "Light layers + rain shell",
            "2L water + electrolytes",
            "Sun protection and blister kit",
        ],
        "rent": ["Trekking poles", "Daypack if you did not pack one"],
        "skip_if_renting": [],
        "klook_kind": "activities",
        "klook_query": "{city} hiking",
        "how_to": [
            "Ask the hotel desk or a neighbourhood sports shop — day-hike poles and packs are usually same-day hire.",
            "Start with a short walk on day one; new boots on a long trail is how blisters happen.",
        ],
        "check": ["Poles height-adjustable?", "Pack hip belt fits?", "Guide licensed if going remote?"],
        "vero_prompt": "Where can I rent hiking poles or a daypack near my hotel in {city}? What should I check before I pay?",
        "notes": ["Do not debut brand-new boots on a long day."],
    },
    "trekking": {
        "label": "Trekking",
        "headline": "Multi-day trails: layers, altitude sense, and a pack that already fits.",
        "bring": [
            "Broken-in boots",
            "Warm mid-layer + down or fleece",
            "Headlamp",
            "Personal meds + diamox only if your doctor advised it",
        ],
        "rent": ["Trekking poles", "Sleeping bag on supported treks"],
        "skip_if_renting": [],
        "klook_kind": "activities",
        "klook_query": "{city} trek",
        "how_to": [
            "Confirm with the operator what is included (tent, bag, porter) before you fly heavy kit.",
            "Hotel / guesthouse desks in trek towns book trusted local agencies — stay on Itinero and ask Vero with your dates.",
        ],
        "check": ["Sleeping bag temp rating?", "Porter vs self-carry?", "Altitude rest day in the plan?"],
        "vero_prompt": "For a trek around {city}, what should I rent vs bring, and which operators are practical for my dates?",
        "notes": ["Above ~3,000m, plan a rest day. Operators often include tents — confirm before you fly with a full camp kit."],
    },
    "biking": {
        "label": "Cycling",
        "headline": "Do not check a bicycle unless this is a dedicated tour. Rent locally.",
        "bring": [
            "Padded shorts if you will ride more than a couple of hours",
            "A compact helmet if you already own one",
            "Gloves for longer rides",
        ],
        "rent": ["City bike or e-bike", "Helmet", "Lock", "Child seat if needed"],
        "skip_if_renting": ["Full-size bicycle", "Panniers", "Bike tools", "Spare tubes"],
        "klook_kind": "bikes",
        "klook_query": "{city} bike rental",
        "how_to": [
            "Do not fly a bicycle — same-day hire is normal in cycling cities.",
            "Ask the hotel desk first; look near the station / old town, not the airport.",
            "Lock + helmet: ask before you pay. Deposit and ID are common.",
        ],
        "check": ["Lock included?", "Helmet included?", "Deposit / ID?", "24h vs calendar-day return?", "Damage policy?"],
        "vero_prompt": "I am staying in {city} on an Itinero package. Where should I rent a bike near my hotel, and what should I check before I pay?",
        "notes": [
            "Hotel desks almost always know a trusted rental. Same-day hire is normal in cycling cities.",
        ],
    },
    "scuba": {
        "label": "Scuba / snorkel",
        "headline": "Bring certification. Rent BCD, regulator, and wetsuit on site.",
        "bring": [
            "Certification card (and logbook if you have it)",
            "Swimwear + rashguard",
            "Reef-safe sunscreen",
        ],
        "rent": ["BCD and regulator", "Wetsuit", "Fins / mask (or bring your own mask)"],
        "skip_if_renting": ["Full scuba kit", "Weights"],
        "klook_kind": "scuba",
        "klook_query": "{city} scuba diving",
        "how_to": [
            "Bring your cert card. Rent BCD / reg / wetsuit at the dive shop — do not check a full kit.",
            "Ask Vero or the hotel for a PADI/SSI shop near your stay. Discover dives if you are uncertified.",
        ],
        "check": ["Cert level accepted?", "Max depth / ratio?", "Nitrox extra?", "Insurance?"],
        "vero_prompt": "Find a reputable dive shop near my hotel in {city}. I can / cannot show a scuba cert.",
        "notes": ["No cert? Book a discover dive or snorkel instead — do not fake experience."],
    },
    "rafting": {
        "label": "Rafting",
        "headline": "The operator supplies the boat, PFD, and helmet. You bring water shoes.",
        "bring": [
            "Closed-toe water shoes or sandals with a heel strap",
            "Quick-dry clothes + change",
            "Strap for glasses",
        ],
        "rent": ["Helmet and PFD (included with reputable operators)", "Dry bag"],
        "skip_if_renting": [],
        "klook_kind": "rafting",
        "klook_query": "{city} rafting",
        "how_to": [
            "Operators supply boat, PFD, and helmet. You bring water shoes.",
            "Book via the hotel desk or a licensed river desk in town — grade changes with season.",
        ],
        "check": ["Licensed operator?", "River grade today?", "Pickup from hotel?", "Age / swim requirement?"],
        "vero_prompt": "I am in {city}. Which rafting operators are licensed for my dates and what grade is the river?",
        "notes": ["Use a licensed operator. River grade changes with season."],
    },
    "ski": {
        "label": "Ski / snowboard",
        "headline": "Fly with layers, rent skis/boots/helmet at the hill.",
        "bring": [
            "Insulated jacket + waterproof pants",
            "Warm gloves, goggles, and a neck gaiter",
            "Base layers",
        ],
        "rent": ["Skis or snowboard + boots", "Helmet", "Poles"],
        "skip_if_renting": ["Skis", "Snowboard", "Ski boots"],
        "klook_kind": "ski",
        "klook_query": "{city} ski rental",
        "how_to": [
            "Fly with layers. Rent skis/boots/helmet at the resort, not the airport, if you can.",
            "Hotel / slope desk can hold a rental. Boot fit matters more than the ski model.",
        ],
        "check": ["Boot size in stock?", "Helmet included?", "Demo vs standard?", "Overnight storage?"],
        "vero_prompt": "Where should I rent skis and boots near {city} for my dates? Resort desk vs town?",
        "notes": ["Boot fit matters more than the ski model. Rent at the resort, not the airport, if you can."],
    },
    "safari": {
        "label": "Safari",
        "headline": "Muted clothes and binoculars. Vehicles and guides are hired, not packed.",
        "bring": [
            "Neutral layers (no bright white / neon)",
            "Binoculars if you own them",
            "Sun hat + insect protection",
        ],
        "rent": ["Guided game drive vehicle", "Binoculars from some lodges"],
        "skip_if_renting": [],
        "klook_kind": "safari",
        "klook_query": "{city} safari",
        "how_to": [
            "Vehicles and guides are hired with the lodge or a city operator — not packed.",
            "Ask Vero with your stay dates; lodge desks in {city} usually run or partner game drives.",
        ],
        "check": ["Park fees included?", "Open vehicle vs closed?", "Binoculars on board?", "Malaria advice for this park?"],
        "vero_prompt": "Safari from {city} on my Itinero dates: who runs game drives from my hotel area and what is included?",
        "notes": ["Malaria and park rules vary — check official advice for your dates."],
    },
    "camping": {
        "label": "Camping",
        "headline": "Supported trips often include tent and cook kit. Confirm before you overpack.",
        "bring": [
            "Sleep layer you trust (or confirm rental)",
            "Headlamp",
            "Warm night layer",
        ],
        "rent": ["Tent", "Sleeping bag", "Stove (on self-guided trips)"],
        "skip_if_renting": ["Full tent + kitchen kit"],
        "klook_kind": "activities",
        "klook_query": "{city} camping",
        "how_to": [
            "Confirm with the operator what is included (tent, bag, stove) before you fly heavy kit.",
            "Town sports shops and trek desks rent overnight kits; hotel can point you there.",
        ],
        "check": ["Sleeping bag temp rating?", "Tent included?", "Fuel type for stove?"],
        "vero_prompt": "Camping around {city}: what should I rent vs bring, and who hires tents near my stay?",
        "notes": ["If a trek operator includes camp, leave the 4-season tent at home."],
    },
    "climbing": {
        "label": "Climbing",
        "headline": "Rent shoes and harness at the crag unless you climb often.",
        "bring": ["Chalk if you use it", "Tape", "Approach shoes"],
        "rent": ["Climbing shoes", "Harness", "Helmet"],
        "skip_if_renting": ["Full rack"],
        "klook_kind": "activities",
        "klook_query": "{city} climbing",
        "how_to": [
            "Indoor gyms and via ferrata desks rent shoes + harness by the day.",
            "Ask the hotel or Vero for the nearest gym / crag operator — do not fly a full rack.",
        ],
        "check": ["Shoe size in stock?", "Harness included?", "Guide if outdoors?"],
        "vero_prompt": "Where can I rent climbing shoes and a harness near my hotel in {city}?",
        "notes": ["Indoor gyms and via ferrata operators rent day kits."],
    },
    "surfing": {
        "label": "Surfing",
        "headline": "Board and wetsuit hire is standard. Bring a rashguard.",
        "bring": ["Swimwear + rashguard", "Reef-safe sunscreen"],
        "rent": ["Surfboard", "Wetsuit", "Soft-top if you are new"],
        "skip_if_renting": ["Travel board bag"],
        "klook_kind": "activities",
        "klook_query": "{city} surf rental",
        "how_to": [
            "Beach shacks and surf schools rent board + wetsuit. Lessons almost always include the board.",
            "Ask the hotel which break is safe for your level today — swell changes fast.",
        ],
        "check": ["Soft-top for beginners?", "Wetsuit thickness?", "Lesson vs board-only?"],
        "vero_prompt": "Surf rental near my stay in {city}: board + wetsuit, and which break is right for a beginner vs intermediate?",
        "notes": ["Beginner lessons almost always include the board."],
    },
    "roadtrip": {
        "label": "Self-drive",
        "headline": "IDP + licence. Rent the car on the ground — do not assume a one-way is cheap.",
        "bring": [
            "Driving licence + International Driving Permit if required",
            "Offline maps download",
        ],
        "rent": ["Car or SUV", "Child seat", "Additional driver"],
        "skip_if_renting": [],
        "klook_kind": "cars",
        "klook_query": "{city} car rental",
        "how_to": [
            "Book the car on Itinero or via the hotel desk. Confirm IDP + licence before you fly.",
            "Photograph the car at pickup. Mountain one-ways need daylight buffers.",
        ],
        "check": ["IDP required?", "One-way fee?", "Child seat?", "Insurance excess?"],
        "vero_prompt": "Self-drive from {city} on my dates: IDP, one-way fees, and where to pick up near my hotel?",
        "notes": ["Photograph the car at pickup. Mountain roads need daylight buffers."],
    },
}

# City overlays: neighbourhood / hotel-desk how-to. No shop names (they go stale).
_DEST_HOWTO: dict[str, dict[str, list[str]]] = {
    "amsterdam": {
        "biking": [
            "Rentals cluster around Centraal, Jordaan, and De Pijp — not Schiphol.",
            "Watch tram tracks. You need a lock.",
        ],
    },
    "paris": {
        "biking": [
            "Vélib stations and shop hire are citywide. Hotel desk is the fastest path.",
            "Use cycle lanes; treat big junctions like a car.",
        ],
    },
    "london": {
        "biking": [
            "Santander Cycles + shop hire. Ask the hotel; skip the Inner Ring at rush hour if you are new.",
        ],
    },
    "barcelona": {
        "biking": [
            "Beachfront and Gothic Quarter shops do same-day hire. Hotel desk first.",
            "Bike lanes are good along the sea; old town is slower.",
        ],
    },
    "manali": {
        "hiking": [
            "Day-hike poles and packs from Old Manali / Mall Road sports shops. Hotel can send you.",
            "Solang and village walks are doable without a guide; remote valleys are not.",
        ],
        "rafting": [
            "Beas rafting is seasonal. Licensed river desks only; water shoes from town.",
        ],
    },
    "leh": {
        "hiking": [
            "Acclimatise 48h before long walks. Daypacks and poles from Leh market.",
        ],
        "biking": [
            "Pangong / Khardung-la bike days are operator-run. Rent in Leh market, not at the airport.",
        ],
        "trekking": [
            "Confirm tent / bag / porter with the operator before you fly kit in.",
        ],
    },
    "ladakh": {
        "hiking": [
            "Acclimatise first. Hire poles and a local guide via the guesthouse, not at the airport.",
        ],
        "biking": [
            "Rent in Leh. High passes are operator days, not casual hire.",
        ],
    },
    "rishikesh": {
        "rafting": [
            "Rafting desks sit along the Ganges in Tapovan / Lakshman Jhula. Check river grade for the season.",
        ],
        "hiking": [
            "Short hill walks from town; longer trails via ashram / hotel desks.",
        ],
    },
    "bali": {
        "scuba": [
            "PADI shops on the south coast and Nusa islands. Bring cert; rent BCD/reg/wetsuit.",
        ],
        "surfing": [
            "Canggu / Kuta / Uluwatu shacks rent boards. Soft-top if you are new. Hotel knows today's break.",
        ],
    },
    "ubud": {
        "hiking": [
            "Rice-terrace walks from town. Hotel can arrange a morning guide; poles rarely needed.",
        ],
        "surfing": [
            "Ubud is inland — surf hire is a coastal day trip. Ask Vero for Canggu / Echo Beach timing.",
        ],
    },
    "nairobi": {
        "safari": [
            "Game drives are lodge- or operator-run from Nairobi or Wilson. Do not self-drive parks.",
            "Ask Vero with your stay dates; hotel desks partner with licensed safari desks.",
        ],
    },
    "zanzibar": {
        "scuba": [
            "Nungwi / Kendwa / Stone Town dive shops. Cert card + reef-safe sunscreen. Rent the kit.",
        ],
    },
    "maldives": {
        "scuba": [
            "House reef / dive centre is usually on the island. Confirm with the stay before you fly kit.",
        ],
    },
    "andaman": {
        "scuba": [
            "Havelock / Port Blair dive shops. Cert required for fun dives; discover dives if not certified.",
        ],
    },
    "kathmandu": {
        "trekking": [
            "Thamel trek desks and your hotel can confirm TIMS / permits. Rent bag and poles in town.",
        ],
        "hiking": [
            "Day hikes from the valley. Poles from Thamel; start easy — dust and stairs, not altitude yet.",
        ],
    },
    "queenstown": {
        "biking": [
            "Queenstown Gardens / town hire shops. Hotel desk first; trails range from easy to black.",
        ],
        "ski": [
            "Rent at the Remarkables / Coronet Peak base, not the airport, if you can.",
        ],
        "rafting": [
            "Shotover / Kawarau operators pick up from town. Licensed only; water shoes from your stay.",
        ],
    },
    "cape town": {
        "hiking": [
            "Table Mountain / Lion's Head: go early, take wind seriously. Poles optional; water is not.",
        ],
        "biking": [
            "Sea Point / Waterfront hire. Ask the hotel; do not leave a bike unlocked.",
        ],
        "safari": [
            "Day safaris leave from the city or nearby reserves. Lodge vehicle — not a self-drive park.",
        ],
    },
    "cape-town": {
        "hiking": [
            "Table Mountain / Lion's Head: go early, take wind seriously. Poles optional; water is not.",
        ],
        "biking": [
            "Sea Point / Waterfront hire. Ask the hotel; do not leave a bike unlocked.",
        ],
        "safari": [
            "Day safaris leave from the city or nearby reserves. Lodge vehicle — not a self-drive park.",
        ],
    },
}

_KEYWORD_TO_ACTIVITY: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(e-?bike|bicycle|cycling|bike hire|bike rental|cycle)\b", re.I), "biking"),
    (re.compile(r"\b(trek|trekking|teahouse)\b", re.I), "trekking"),
    (re.compile(r"\b(hike|hiking|trail|summit)\b", re.I), "hiking"),
    (re.compile(r"\b(scuba|dive|snorkel)\b", re.I), "scuba"),
    (re.compile(r"\b(raft|rafting|white[\s-]?water)\b", re.I), "rafting"),
    (re.compile(r"\b(ski|snowboard|piste)\b", re.I), "ski"),
    (re.compile(r"\b(safari|game drive)\b", re.I), "safari"),
    (re.compile(r"\b(camp|camping)\b", re.I), "camping"),
    (re.compile(r"\b(climb|climbing|via ferrata)\b", re.I), "climbing"),
    (re.compile(r"\b(surf|surfing)\b", re.I), "surfing"),
    (re.compile(r"\b(self[\s-]?drive|road[\s-]?trip|roadtrip)\b", re.I), "roadtrip"),
]

_CORE_THEMES = frozenset({"hills", "adventure", "trekking", "safari", "ski", "pilgrimage"})


def _norm_city(raw: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(raw or "").lower()).strip()


def _package_cities(pkg: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for row in pkg.get("destinations") or []:
        if row:
            out.append(str(row))
    stay = pkg.get("stay") if isinstance(pkg.get("stay"), dict) else {}
    if stay.get("city"):
        out.append(str(stay["city"]))
    flight = pkg.get("flight") if isinstance(pkg.get("flight"), dict) else {}
    if flight.get("gatewayCity"):
        out.append(str(flight["gatewayCity"]))
    gw = pkg.get("flightGateway") if isinstance(pkg.get("flightGateway"), dict) else {}
    if gw.get("city"):
        out.append(str(gw["city"]))
    return out


def _dest_activity_ids(cities: list[str]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for city in cities:
        key = _norm_city(city)
        if not key:
            continue
        slug = key.replace(" ", "-")
        hits = _DEST_ACTIVITIES.get(key) or _DEST_ACTIVITIES.get(slug) or ()
        if not hits:
            for dest_key, acts in _DEST_ACTIVITIES.items():
                if dest_key in key or key in dest_key:
                    hits = acts
                    break
        for act in hits:
            if act in ACTIVE and act not in seen:
                seen.add(act)
                found.append(act)
    return found


def _blob(pkg: dict[str, Any]) -> str:
    parts = [
        str(pkg.get("title") or ""),
        str(pkg.get("tagline") or ""),
        str(pkg.get("overview") or ""),
        str(pkg.get("theme") or ""),
        " ".join(str(t) for t in (pkg.get("themes") or [])),
        " ".join(str(d) for d in (pkg.get("destinations") or [])),
        " ".join(str(h) for h in (pkg.get("highlights") or [])),
        " ".join(str(x) for x in (pkg.get("inclusions") or [])),
        " ".join(str(x) for x in (pkg.get("exclusions") or [])),
        " ".join(str(x) for x in (pkg.get("packing") or [])),
        " ".join(str(x) for x in (pkg.get("goodToKnow") or [])),
    ]
    for day in pkg.get("itinerary") or pkg.get("dayBlueprints") or []:
        if not isinstance(day, dict):
            continue
        parts.append(str(day.get("title") or ""))
        parts.append(str(day.get("description") or day.get("narrative") or ""))
        parts.extend(str(a) for a in (day.get("activities") or []))
        parts.extend(str(a) for a in (day.get("optionalActivities") or []))
    return " ".join(parts)


def _explicit_themes(pkg: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for t in [pkg.get("theme"), pkg.get("travelStyle"), *(pkg.get("themes") or [])]:
        s = str(t or "").strip().lower().replace(" ", "_")
        if s == "cycle":
            s = "biking"
        if s in ACTIVE and s not in out:
            out.append(s)
    return out


def inferred_activity_ids(pkg: dict[str, Any], *, include_local: bool = True) -> list[str]:
    """Outdoor activity ids. Core (themes/copy) first, then destination hints."""
    cities = _package_cities(pkg)
    core: list[str] = []
    seen: set[str] = set()

    def add(act: str) -> None:
        if act in ACTIVE and act not in seen:
            seen.add(act)
            core.append(act)

    for act in _explicit_themes(pkg):
        add(act)

    blob = _blob(pkg)
    for rx, act in _KEYWORD_TO_ACTIVITY:
        if rx.search(blob):
            add(act)

    dest_acts = _dest_activity_ids(cities)
    primary = str(pkg.get("theme") or pkg.get("travelStyle") or "").strip().lower()
    if primary in _CORE_THEMES:
        for act in dest_acts:
            if act in {"hiking", "trekking", "safari", "ski", "rafting", "camping"}:
                add(act)

    local = [a for a in dest_acts if a not in seen] if include_local else []
    return core + local


def _city_label(pkg: dict[str, Any]) -> str:
    cities = _package_cities(pkg)
    return (cities[0] if cities else "").strip() or str(pkg.get("title") or "this trip")


def _dest_howto(city: str, act: str) -> list[str]:
    key = _norm_city(city)
    if not key:
        return []
    slug = key.replace(" ", "-")
    by_city = _DEST_HOWTO.get(key) or _DEST_HOWTO.get(slug) or {}
    if not by_city:
        for dest_key, acts in _DEST_HOWTO.items():
            if dest_key in key or key in dest_key:
                by_city = acts
                break
    return [str(x).strip() for x in (by_city.get(act) or []) if str(x).strip()]


def _dedupe_lines(lines: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    blob = ""
    for line in lines:
        raw = str(line or "").strip()
        k = re.sub(r"\s+", " ", raw.lower())
        if not k or k in seen:
            continue
        words = [w for w in re.findall(r"[a-z]{4,}", k) if w not in {"your", "this", "that", "with", "from", "have", "most", "near"}]
        if blob and words:
            hits = sum(1 for w in words if w in blob)
            if hits / len(words) >= 0.55:
                continue
        seen.add(k)
        out.append(raw)
        blob += " " + k
    return out


def _kit_row(act: str, pkg: dict[str, Any], *, mode: str) -> dict[str, Any] | None:
    book = _PLAYBOOKS.get(act)
    if not book:
        return None
    city = _city_label(pkg)
    query = str(book.get("klook_query") or "{city}").replace("{city}", city)
    where = []
    if city and book.get("klook_kind"):
        where.append(
            {
                "label": f"Optional: pre-book {book['label'].lower()} in {city}",
                "kind": book["klook_kind"],
                "query": query,
                "city": city,
            }
        )
    how_to = _dedupe_lines(_dest_howto(city, act) + list(book.get("how_to") or []))
    vero = str(book.get("vero_prompt") or "").replace("{city}", city)
    return {
        "id": act,
        "label": book["label"],
        "mode": mode,  # core | local
        "headline": book["headline"],
        "bring": list(book["bring"]),
        "rent": list(book["rent"]),
        "skip_if_renting": list(book.get("skip_if_renting") or []),
        "how_to": how_to,
        "check": list(book.get("check") or []),
        "vero_prompt": vero,
        "where": where,
        "notes": list(book.get("notes") or []),
    }


def build_activity_kit(pkg: dict[str, Any] | None) -> dict[str, Any]:
    """Full kit for package detail. Empty activities → no UI section."""
    if not isinstance(pkg, dict):
        return {"ok": True, "activities": [], "kits": [], "packing": [], "documents": []}

    cities = _package_cities(pkg)
    dest_acts = set(_dest_activity_ids(cities))
    all_ids = inferred_activity_ids(pkg, include_local=True)
    explicit = set(_explicit_themes(pkg))
    blob = _blob(pkg)
    keyword_hits = {act for rx, act in _KEYWORD_TO_ACTIVITY if rx.search(blob)}
    primary = str(pkg.get("theme") or "").strip().lower()
    promoted = set()
    if primary in _CORE_THEMES:
        promoted = dest_acts & {"hiking", "trekking", "safari", "ski", "rafting", "camping"}

    kits: list[dict[str, Any]] = []
    for act in all_ids:
        mode = "core" if act in explicit or act in keyword_hits or act in promoted else "local"
        row = _kit_row(act, pkg, mode=mode)
        if row:
            kits.append(row)

    packing = [str(x).strip() for x in (pkg.get("packing") or []) if str(x).strip()]
    documents = [str(x).strip() for x in (pkg.get("documents") or []) if str(x).strip()]
    return {
        "ok": True,
        "activities": all_ids,
        "kits": kits,
        "packing": packing,
        "documents": documents,
        "city": _city_label(pkg),
    }
