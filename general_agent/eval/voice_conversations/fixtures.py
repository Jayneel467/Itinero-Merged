"""Left-page + trip seeds for voice conversations."""

from datetime import date, timedelta

TODAY = date.today().isoformat()
TOMORROW = (date.today() + timedelta(days=1)).isoformat()
D3 = (date.today() + timedelta(days=3)).isoformat()


def _hint(text: str) -> dict:
    return {"help_hint": text}


def _trip(title, origin, dest, hotel, loc, extra=None, hint=""):
    legs = [
        {
            "type": "flight",
            "status": "confirmed",
            "airline": "IndiGo",
            "airline_code": "6E",
            "flight_number": "6E211",
            "origin": origin,
            "destination": dest,
            "depart_date": TOMORROW,
            "depart_time": "08:10",
            "arrive_time": "10:35",
            "pnr": "ITN-VOICE",
            "booking_id": "ITN-VOICE",
            "dep_terminal": "T2",
            "baggage_cabin": "7 kg cabin",
            "baggage_checked": "15 kg check-in",
        },
        {
            "type": "hotel",
            "status": "confirmed",
            "hotel_name": hotel,
            "location": loc,
            "check_in": TODAY,
            "check_out": D3,
            "booking_id": "HTL-VOICE",
            "confirmation": "HTL-VOICE-1",
        },
    ]
    if extra:
        legs.extend(extra)
    return {
        "screen": "trips",
        "path": "/trips/itn-voice",
        "help_hint": hint or (
            "User is ON this trip. Voice call. 'My hotel' / 'you have it' means THIS hotel. "
            "Cannot rebook/pay/call hotel. Dinner tonight 19:30 if mentioned."
        ),
        "detail": {
            "id": "itn-voice",
            "title": title,
            "status": "confirmed",
            "origin": origin,
            "destination": dest,
            "departDate": TOMORROW,
            "travelers": 2,
            "legs": legs,
        },
        "persona": {"home_country": "IN", "currency": "INR", "passport": "IN"},
    }


FIXTURES = {
    "plan": {
        "screen": "explore",
        "path": "/explore",
        "persona": {"home_country": "IN", "currency": "INR", "passport": "IN"},
        **_hint(
            "Voice call. Indian traveller INR. Sticky constraints until undone. "
            "One question. No 15-option dumps. Search not book unless they say book."
        ),
    },
    "trip": _trip(
        "Mumbai stay",
        "BOM", "DEL",
        "Trident Nariman Point",
        "Nariman Point, Mumbai",
    ),
    "hotel_flight": _trip(
        "Hotel + 08:10 flight",
        "BOM", "DEL",
        "Trident Nariman Point",
        "Nariman Point, Mumbai",
        hint="Hotel is Trident Nariman Point, Mumbai. Flight 6E211 BOM→DEL 08:10 T2. Voice.",
    ),
    "connecting": {
        "screen": "trips",
        "path": "/trips/itn-cx",
        **_hint("Same-day connection. Do not say 'fine' from schedule alone. Voice."),
        "detail": {
            "id": "itn-cx",
            "title": "BOM → BLR → SIN",
            "status": "confirmed",
            "origin": "BOM",
            "destination": "SIN",
            "legs": [
                {
                    "type": "flight", "status": "confirmed", "airline": "IndiGo",
                    "flight_number": "6E531", "origin": "BOM", "destination": "BLR",
                    "depart_time": "08:10", "arrive_time": "10:00", "pnr": "ITN-CX1",
                    "dep_terminal": "T2", "arr_terminal": "T1",
                },
                {
                    "type": "flight", "status": "confirmed", "airline": "IndiGo",
                    "flight_number": "6E1012", "origin": "BLR", "destination": "SIN",
                    "depart_time": "12:05", "arrive_time": "19:20", "pnr": "ITN-CX2",
                    "dep_terminal": "T2",
                },
            ],
        },
    },
    "airport": {
        "screen": "passenger_info",
        "path": "/flights/passenger-info",
        **_hint("At airport. Boarding soon. Voice. Chest pain → do not board."),
        "booking": {
            "airline": "IndiGo", "flight_number": "6E211", "origin": "BOM",
            "destination": "DEL", "depart_time": "11:05", "pnr": "ITN-AIR",
            "dep_terminal": "T2",
        },
    },
    "bkk": _trip(
        "Bangkok", "BOM", "BKK",
        "Ibis Styles Bangkok Silom", "Silom, Bangkok",
        hint="On foot in Bangkok. Voice. Safety first.",
    ),
    "intl": _trip(
        "India → NYC", "BOM", "JFK",
        "Pod Times Square", "Times Square, New York",
        hint="Indian passport abroad. Voice. Consulate/visa: search or unknown.",
    ),
    "leh": _trip(
        "Leh", "DEL", "IXL",
        "The Grand Dragon Ladakh", "Leh, Ladakh",
        hint="High altitude. Do not diagnose AMS. Voice.",
    ),
    "paris": _trip(
        "Paris", "DEL", "CDG",
        "Hotel des Arts Montmartre", "Montmartre, Paris",
        hint="In Paris, three nights left. Voice. Documents before country hop.",
    ),
    "philly": _trip(
        "Philadelphia", "EWR", "PHL",
        "The Independent Hotel", "Center City, Philadelphia",
        hint="In Philly. Voice. NYC tonight vs tomorrow — check trains.",
    ),
    "florida": _trip(
        "Orlando / beach", "PHL", "MCO",
        "Universal's Cabana Bay", "Orlando, Florida",
        hint="Couple disagree Universal vs beach. Latest explicit constraint wins. Voice.",
    ),
    "dinner_hold": _trip(
        "Mumbai + dinner 19:30",
        "BOM", "DEL",
        "Trident Nariman Point",
        "Nariman Point, Mumbai",
        extra=[{
            "type": "activity",
            "status": "confirmed",
            "title": "Dinner reservation",
            "location": "South Mumbai",
            "time": "19:30",
        }],
        hint="Next fixed item: dinner 19:30. Now ~16:30. Voice. 'What now?' → that dinner.",
    ),
    "train_hotel": {
        "screen": "trips",
        "path": "/trips/itn-train",
        **_hint("Morning train + hotel checkout. Voice. Leave time must include checkout + luggage."),
        "detail": {
            "id": "itn-train",
            "title": "Jaipur hotel + train to Delhi",
            "status": "confirmed",
            "legs": [
                {
                    "type": "hotel", "status": "confirmed",
                    "hotel_name": "Hotel Pearl Palace", "location": "Jaipur",
                    "check_in": TODAY, "check_out": TOMORROW,
                    "confirmation": "PP-VOICE",
                },
                {
                    "type": "train", "status": "confirmed",
                    "title": "Vande Bharat JP → NDLS",
                    "origin": "JP", "destination": "NDLS",
                    "depart_date": TOMORROW, "depart_time": "06:00",
                    "pnr": "TRN-VOICE",
                },
            ],
        },
    },
    "cascade": {
        "screen": "trips",
        "path": "/trips/itn-cascade",
        **_hint(
            "Flight cancelled. Hotel tonight NON-refundable. Train tomorrow 07:00. "
            "$250 extra is a hard ceiling. Voice. One connected problem."
        ),
        "detail": {
            "id": "itn-cascade",
            "title": "Disrupted overnight",
            "status": "confirmed",
            "legs": [
                {
                    "type": "flight", "status": "cancelled",
                    "airline": "IndiGo", "flight_number": "6E900",
                    "origin": "BOM", "destination": "PNQ", "depart_time": "19:00",
                    "pnr": "CXL-VOICE",
                },
                {
                    "type": "hotel", "status": "confirmed",
                    "hotel_name": "Hotel Sahara Star", "location": "Vile Parle, Mumbai",
                    "check_in": TODAY, "check_out": TOMORROW,
                    "confirmation": "SAHARA-NR", "refundable": False,
                },
                {
                    "type": "train", "status": "confirmed",
                    "title": "Pune train 07:00",
                    "origin": "CSMT", "destination": "PUNE",
                    "depart_date": TOMORROW, "depart_time": "07:00",
                    "pnr": "TRN-7AM",
                },
            ],
        },
    },
    "rome": _trip(
        "Rome → Paris",
        "FCO", "CDG",
        "Hotel Artemide", "Via Nazionale, Rome",
        extra=[{
            "type": "activity",
            "status": "confirmed",
            "title": "Eiffel Tower prepaid",
            "location": "Paris",
            "time": "19:00",
            "date": TOMORROW,
        }],
        hint=(
            "Rome now. Girlfriend sick. Flight FCO→CDG tomorrow 09:00. Checkout 10:00. "
            "Wallet maybe lost. Eiffel prepaid tomorrow night. Voice. Priority: health → cards → flight → Eiffel."
        ),
    ),
}
