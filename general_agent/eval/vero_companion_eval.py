#!/usr/bin/env python3
"""Vero companion eval — 100 travel-agent prompts + live /api/chat runner.

Usage:
  .venv/bin/python general_agent/eval/vero_companion_eval.py --critical
  .venv/bin/python general_agent/eval/vero_companion_eval.py --ids 4,13,20,93
  .venv/bin/python general_agent/eval/vero_companion_eval.py --sample
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

BASE = "http://127.0.0.1:8001"
OUT = Path(__file__).resolve().parent / "last_run.json"

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
TODAY = date.today().isoformat()

# Realistic left-page: paid Akasa BOM→DEL, boarding pass T2, PNR present.
TRIP_FLIGHT = {
    "screen": "trips",
    "path": "/trips/itn-eval-1",
    "help_hint": (
        "User is viewing trip BOM→DEL Akasa. Vague follow-ups (terminal, gate, PNR, baggage) "
        "mean THIS booking. Do not invent PNR/gates."
    ),
    "detail": {
        "id": "itn-eval-1",
        "title": "Mumbai → Delhi",
        "status": "confirmed",
        "origin": "BOM",
        "destination": "DEL",
        "departDate": TOMORROW,
        "travelers": 2,
        "legs": [
            {
                "type": "flight",
                "status": "confirmed",
                "airline": "Akasa Air",
                "airline_code": "QP",
                "flight_number": "QP1412",
                "origin": "BOM",
                "destination": "DEL",
                "origin_label": "Mumbai (BOM)",
                "destination_label": "Delhi (DEL)",
                "depart_date": TOMORROW,
                "depart_time": "07:50",
                "arrive_time": "10:15",
                "duration": "2h 25m",
                "pnr": "ITN8K2P1",
                "booking_id": "ITN8K2P1",
                "dep_terminal": "T2",
                "arr_terminal": "T1",
                "baggage_cabin": "7 kg cabin + 3 kg personal item",
                "baggage_checked": "15 kg check-in",
            },
            {
                "type": "hotel",
                "status": "confirmed",
                "hotel_name": "The LaLiT New Delhi",
                "location": "Barakhamba Road, Connaught Place",
                "check_in": TOMORROW,
                "check_out": (date.today() + timedelta(days=3)).isoformat(),
                "booking_id": "HTL-4419",
                "confirmation": "LALIT-9921",
            },
        ],
    },
}

CONNECTING = {
    "screen": "trips",
    "path": "/trips/itn-eval-cx",
    "help_hint": "User has a same-day connection BOM→BLR→SIN. Help with missed-connection risk.",
    "detail": {
        "id": "itn-eval-cx",
        "title": "Mumbai → Singapore via Bengaluru",
        "status": "confirmed",
        "origin": "BOM",
        "destination": "SIN",
        "departDate": TOMORROW,
        "legs": [
            {
                "type": "flight",
                "status": "confirmed",
                "airline": "IndiGo",
                "airline_code": "6E",
                "flight_number": "6E531",
                "origin": "BOM",
                "destination": "BLR",
                "origin_label": "Mumbai (BOM)",
                "destination_label": "Bengaluru (BLR)",
                "depart_time": "08:10",
                "arrive_time": "09:55",
                "pnr": "6ECONN01",
                "dep_terminal": "T2",
                "arr_terminal": "T1",
                "baggage_checked": "15 kg",
            },
            {
                "type": "flight",
                "status": "confirmed",
                "airline": "IndiGo",
                "airline_code": "6E",
                "flight_number": "6E1011",
                "origin": "BLR",
                "destination": "SIN",
                "origin_label": "Bengaluru (BLR)",
                "destination_label": "Singapore (SIN)",
                "depart_time": "10:50",
                "arrive_time": "16:40",
                "pnr": "6ECONN01",
                "dep_terminal": "T2",
            },
        ],
    },
}

HOTEL_ONLY = {
    "screen": "trips",
    "path": "/trips/itn-eval-htl",
    "help_hint": "User is on a confirmed hotel booking. Help with reservation issues.",
    "detail": {
        "id": "itn-eval-htl",
        "title": "The LaLiT New Delhi",
        "status": "confirmed",
        "legs": [
            {
                "type": "hotel",
                "status": "confirmed",
                "hotel_name": "The LaLiT New Delhi",
                "location": "Barakhamba Road, Connaught Place, New Delhi",
                "check_in": TOMORROW,
                "check_out": (date.today() + timedelta(days=3)).isoformat(),
                "booking_id": "HTL-4419",
                "confirmation": "LALIT-9921",
            }
        ],
    },
}

PACKAGE_ITIN = {
    "screen": "package_detail",
    "path": "/packages/kenya-safari-classic",
    "help_hint": "User has this package itinerary open. Rebuild/reorder days from this plan.",
    "package": {
        "id": "kenya-safari-classic",
        "slug": "kenya-safari-classic",
        "title": "Kenya Safari Classic",
        "destinations": ["Nairobi", "Maasai Mara"],
        "duration_nights": 5,
        "itinerary": [
            {
                "day": 1,
                "title": "Arrive Nairobi",
                "stay_city": "Nairobi",
                "activities": ["Hotel check-in", "Giraffe Centre"],
                "description": "Land morning, city intro.",
            },
            {
                "day": 2,
                "title": "Drive to Maasai Mara",
                "stay_city": "Maasai Mara",
                "activities": ["Road transfer", "Afternoon game drive"],
                "description": "Long road day + first safari.",
            },
            {
                "day": 3,
                "title": "Full day Mara",
                "stay_city": "Maasai Mara",
                "activities": ["Dawn game drive", "Picnic", "Sunset drive"],
                "description": "The must-do safari day.",
            },
            {
                "day": 4,
                "title": "Mara + village",
                "stay_city": "Maasai Mara",
                "activities": ["Morning drive", "Maasai village visit"],
                "description": "Softer day.",
            },
            {
                "day": 5,
                "title": "Return Nairobi",
                "stay_city": "Nairobi",
                "activities": ["Depart Mara", "Nairobi hotel / fly out"],
                "description": "Travel day.",
            },
        ],
    },
    "quote": {
        "check_in": TOMORROW,
        "check_out": (date.today() + timedelta(days=6)).isoformat(),
        "guests": 2,
        "stay_total": 89000,
        "package_total": 89000,
        "currency": "INR",
    },
}

CHRONO = {
    "screen": "trips",
    "path": "/trips/itn-eval-chrono",
    "help_hint": (
        "Flight lands 06:05, hotel check-in 14:00, Taj Mahal tour voucher says 10:00. "
        "User asked to reconcile conflicting times."
    ),
    "detail": {
        "id": "itn-eval-chrono",
        "title": "Delhi weekend",
        "status": "confirmed",
        "origin": "BOM",
        "destination": "DEL",
        "departDate": TOMORROW,
        "legs": [
            {
                "type": "flight",
                "airline": "IndiGo",
                "airline_code": "6E",
                "flight_number": "6E201",
                "origin": "BOM",
                "destination": "DEL",
                "depart_time": "04:00",
                "arrive_time": "06:05",
                "pnr": "6E9X21",
                "dep_terminal": "T2",
                "arr_terminal": "T1",
            },
            {
                "type": "hotel",
                "hotel_name": "The LaLiT New Delhi",
                "location": "Connaught Place",
                "check_in": TOMORROW,
                "check_out": (date.today() + timedelta(days=2)).isoformat(),
                "confirmation": "LALIT-9921",
            },
        ],
    },
    "attractions": [
        {
            "name": "Taj Mahal sunrise tour (Agra day trip)",
            "voucher_time": "10:00",
            "note": "Pickup from Delhi hotel — vendor voucher says 10:00 AM",
        }
    ],
}

PROMPTS = [
    # id, category, critical, context_key, text
    (1, "flight", False, "trip", "Vero, what time should I leave my hotel if my flight departs at 7:50 AM?"),
    (2, "flight", False, "trip", "Which terminal am I flying from?"),
    (3, "flight", False, "trip", "Where did you get my terminal information from?"),
    (4, "flight", True, "trip", "My boarding pass says T2 but Google says T1. Which one should I trust?"),
    (5, "flight", False, "trip", "How much cabin baggage can I take?"),
    (6, "flight", False, "trip", "Can I take a laptop bag in addition to my 7 kg cabin bag?"),
    (7, "flight", False, "trip", "My checked bag is 18 kg but my allowance is 15 kg. What should I do?"),
    (8, "flight", False, "none", "Can I take a power bank in checked luggage?"),
    (9, "flight", False, "trip", "How early should I reach the airport?"),
    (10, "flight", False, "trip", "I'm already running 40 minutes late. Do I still have enough time?"),
    (11, "flight", False, "trip", "Find the fastest way from my hotel to the airport right now."),
    (12, "flight", False, "trip", "My flight is delayed by three hours. What can I do nearby?"),
    (13, "flight", True, "trip", "My flight got cancelled. Find me the best alternative."),
    (14, "flight", False, "trip", "Rebook me on the cheapest flight available today."),
    (15, "flight", False, "trip", "Don't give me the cheapest one. Find the earliest flight that still has checked baggage."),
    (16, "flight", False, "trip", "Can I change this flight to tomorrow morning?"),
    (17, "flight", False, "trip", "How much will cancellation cost me?"),
    (18, "flight", False, "trip", "Do I get a refund if the airline cancels my flight?"),
    (19, "flight", False, "connecting", "My connecting flight leaves in 55 minutes. Can I make it?"),
    (20, "flight", True, "connecting", "My first flight is delayed and I might miss my connection. What should I do right now?"),
    (21, "hotel", False, "none", "Find me a hotel near my destination under ₹6,000 tonight."),
    (22, "hotel", False, "none", "I want something romantic, not just the cheapest hotel."),
    (23, "hotel", False, "package", "Find me a hotel within walking distance of the places on tomorrow's itinerary."),
    (24, "hotel", False, "hotel", "Does my hotel allow check-in if I'm 18?"),
    (25, "hotel", False, "hotel", "Can my girlfriend and I stay in the same room?"),
    (26, "hotel", False, "hotel", "What time is hotel check-in?"),
    (27, "hotel", False, "hotel", "Ask the hotel whether they can give me early check-in."),
    (28, "hotel", False, "chrono", "My flight lands at 6 AM. What should I do with my luggage before check-in?"),
    (29, "hotel", False, "hotel", "Can I leave my bags at the hotel after checkout?"),
    (30, "hotel", False, "none", "Find me a hotel with a bathtub, city view, and vegetarian breakfast."),
    (31, "hotel", False, "hotel", "Change my hotel to something better but keep the total trip budget almost the same."),
    (32, "hotel", False, "hotel", "My hotel room looks nothing like the photos. What are my options?"),
    (33, "hotel", False, "hotel", "There's no hot water in my room. Help me handle this."),
    (34, "hotel", True, "hotel", "The hotel says they can't find my reservation."),
    (35, "hotel", False, "hotel", "Show me exactly what I booked and what was included."),
    (36, "food", False, "none", "Find me a good vegetarian restaurant near me."),
    (37, "food", False, "none", "I'm pure vegetarian. Make sure there is no egg, meat, fish, or seafood."),
    (38, "food", False, "none", "Don't show me places with just one vegetarian salad."),
    (39, "food", False, "none", "Find me a romantic vegetarian-friendly restaurant for tonight."),
    (40, "food", False, "none", "I'm wearing a nice outfit tonight. Give me somewhere with a proper date-night ambience."),
    (41, "food", False, "none", "Find somewhere casual for lunch because I only need food for energy."),
    (42, "food", False, "none", "Can you check whether this restaurant uses egg in its desserts?"),
    (43, "food", False, "none", "Does this restaurant have vegetarian protein options?"),
    (44, "food", False, "none", "Find dinner under $60 for two, including tax and tip."),
    (45, "food", False, "none", "I'm at Hersheypark. What vegetarian food can I eat without leaving the park?"),
    (46, "food", False, "none", "The restaurant you suggested is fully booked. Give me three alternatives nearby."),
    (47, "food", False, "none", "I don't want Indian food tonight. Find something vegetarian-friendly."),
    (48, "food", False, "none", "Find a place open after 10:30 PM."),
    (49, "food", False, "none", "Which one is better for a first-date vibe: Restaurant A or Restaurant B?"),
    (50, "food", False, "none", "Book a table for two at 8 PM."),
    (51, "itin", False, "package", "What's my plan for today?"),
    (52, "itin", False, "package", "Give me my itinerary, but only show the next three things I need to do."),
    (53, "itin", True, "package", "I woke up two hours late. Rebuild today without removing the most important activity."),
    (54, "itin", False, "package", "It's raining. Replace all outdoor activities."),
    (55, "itin", False, "package", "We're tired. Make today slower and more romantic."),
    (56, "itin", False, "package", "We finished this attraction early. What should we do for the next two hours?"),
    (57, "itin", False, "package", "Move tomorrow's dinner to tonight and reorganize both days."),
    (58, "itin", False, "package", "I don't want to visit this place anymore. Replace it with something better."),
    (59, "itin", False, "package", "Which activity on my itinerary can I safely skip?"),
    (60, "itin", False, "package", "Make tomorrow more adventurous."),
    (61, "itin", False, "package", "Make tonight more romantic but don't increase my budget by more than $40."),
    (62, "itin", False, "package", "We want three hours alone at the hotel this afternoon. Rearrange the itinerary around that."),
    (63, "itin", False, "package", "Which activities require advance reservations?"),
    (64, "itin", False, "package", "What should I book right now so I don't miss out later?"),
    (65, "itin", False, "package", "Are any places on tomorrow's itinerary closed?"),
    (66, "itin", True, "package", "Optimize tomorrow so we spend less money on Uber."),
    (67, "itin", False, "package", "We don't have a car. Fix the itinerary."),
    (68, "itin", False, "package", "Show me today's activities in the best geographical order."),
    (69, "itin", False, "none", "I have only four hours in this city. What should I prioritize?"),
    (70, "itin", False, "package", "Build me a backup plan if tomorrow's weather is bad."),
    (71, "ground", False, "trip", "How do I get from the airport to my hotel?"),
    (72, "ground", False, "trip", "What's cheaper right now: Uber, taxi, train, or bus?"),
    (73, "ground", False, "trip", "Is public transport still running when I land?"),
    (74, "ground", False, "trip", "How much should this taxi ride roughly cost?"),
    (75, "ground", False, "none", "The driver is asking for much more than the expected fare. What should I do?"),
    (76, "ground", False, "trip", "Find the closest train station."),
    (77, "ground", False, "trip", "What's the last train tonight?"),
    (78, "ground", False, "trip", "I missed the last bus. What are my options?"),
    (79, "ground", False, "package", "Plan the cheapest route from my hotel to tomorrow's attraction."),
    (80, "ground", False, "trip", "We have two suitcases. Is taking public transport practical?"),
    (81, "safety", True, "none", "I'm in an unfamiliar area and don't feel safe. What should I do?"),
    (82, "safety", False, "hotel", "Find me a safer route back to my hotel."),
    (83, "safety", False, "none", "I lost my passport."),
    (84, "safety", False, "none", "I lost my phone."),
    (85, "safety", False, "none", "My wallet was stolen. What should I do first?"),
    (86, "safety", False, "trip", "My luggage didn't arrive."),
    (87, "safety", False, "trip", "The airline damaged my suitcase."),
    (88, "safety", False, "connecting", "My girlfriend and I got separated at the airport. Help us choose a meeting point."),
    (89, "safety", False, "package", "There's severe weather where I'm traveling tomorrow. How does it affect my trip?"),
    (90, "safety", False, "package", "There's a strike affecting trains tomorrow. Replan my route."),
    (91, "memory", False, "none", "Vero, you already know my dietary preferences. Pick dinner for me."),
    (92, "memory", False, "trip", "What was the hotel I booked again?"),
    (93, "memory", True, "trip", "What is my PNR?"),
    (94, "memory", False, "trip", "Which booking has free cancellation?"),
    (95, "memory", False, "trip", "How much have I spent on this trip so far?"),
    (96, "memory", False, "package", "I have ₹20,000 left. Can I afford everything remaining in my itinerary?"),
    (97, "memory", False, "package", "Reduce the rest of my trip spending by 20% without ruining the experience."),
    (98, "memory", True, "chrono", "My flight, hotel, and attraction booking all show different times. Tell me exactly what happens next in chronological order."),
    (99, "memory", False, "trip", "Don't just recommend something—tell me why this is the best option based on my bookings, location, budget, preferences, and time."),
    (100, "memory", True, "chrono", "Vero, review my entire trip and tell me the three things most likely to go wrong, what you can prevent automatically, and what I should personally handle."),
]

CTX = {
    "none": None,
    "trip": TRIP_FLIGHT,
    "connecting": CONNECTING,
    "hotel": HOTEL_ONLY,
    "package": PACKAGE_ITIN,
    "chrono": CHRONO,
}

SAMPLE_IDS = {1, 5, 6, 8, 11, 21, 22, 35, 36, 37, 50, 51, 54, 71, 81, 83, 91, 92, 95}


def chat(message: str, page_context: dict | None, thread_id: str, timeout: int = 90) -> dict:
    body = {
        "message": message,
        "thread_id": thread_id,
        "spoken_language": "en-IN",
    }
    if page_context:
        body["page_context"] = page_context
    req = urllib.request.Request(
        f"{BASE}/api/chat",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode())
            data["_ms"] = int((time.time() - t0) * 1000)
            data["_ok"] = True
            return data
    except Exception as exc:
        return {"_ok": False, "error": str(exc), "_ms": int((time.time() - t0) * 1000), "reply": ""}


def run_ids(ids: list[int]) -> list[dict]:
    by_id = {p[0]: p for p in PROMPTS}
    rows = []
    for i, pid in enumerate(ids):
        meta = by_id[pid]
        _id, cat, crit, ctx_key, text = meta
        thread = f"eval-{_id}-{int(time.time())}-{i}"
        print(f"\n=== #{_id} [{cat}{' CRITICAL' if crit else ''}] ctx={ctx_key}")
        print(f"Q: {text}")
        res = chat(text, CTX[ctx_key], thread)
        reply = (res.get("reply") or res.get("error") or "")[:2000]
        print(f"({res.get('_ms')}ms ok={res.get('_ok')})")
        print(reply[:800])
        rows.append(
            {
                "id": _id,
                "category": cat,
                "critical": crit,
                "context": ctx_key,
                "prompt": text,
                "ok": res.get("_ok"),
                "ms": res.get("_ms"),
                "reply": res.get("reply") or "",
                "error": res.get("error"),
                "cards": bool(res.get("cards")),
                "places": bool(res.get("places")),
            }
        )
    OUT.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT}")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--critical", action="store_true")
    ap.add_argument("--sample", action="store_true")
    ap.add_argument("--ids", default="")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.ids:
        ids = [int(x) for x in args.ids.split(",") if x.strip()]
    elif args.all:
        ids = [p[0] for p in PROMPTS]
    elif args.sample:
        ids = sorted(SAMPLE_IDS | {p[0] for p in PROMPTS if p[2]})
    else:
        ids = [p[0] for p in PROMPTS if p[2]]
    run_ids(ids)


if __name__ == "__main__":
    main()
