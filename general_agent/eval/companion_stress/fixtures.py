"""Left-page fixtures so companion prompts have something to repair."""

from datetime import date, timedelta

TODAY = date.today().isoformat()
TOMORROW = (date.today() + timedelta(days=1)).isoformat()
D3 = (date.today() + timedelta(days=3)).isoformat()
D5 = (date.today() + timedelta(days=5)).isoformat()


def _trip(*, title, origin, dest, city, hotel, loc, extra_legs=None, hint=""):
    legs = [
        {
            "type": "flight",
            "status": "confirmed",
            "airline": "IndiGo",
            "airline_code": "6E",
            "flight_number": "6E531",
            "origin": origin,
            "destination": dest,
            "origin_label": origin,
            "destination_label": dest,
            "depart_date": TOMORROW,
            "depart_time": "09:40",
            "arrive_time": "12:10",
            "duration": "2h 30m",
            "pnr": "ITN-STRESS",
            "booking_id": "ITN-STRESS",
            "dep_terminal": "T2",
            "arr_terminal": "T1",
            "baggage_cabin": "7 kg cabin",
            "baggage_checked": "15 kg check-in",
        },
        {
            "type": "hotel",
            "status": "confirmed",
            "hotel_name": hotel,
            "location": loc,
            "check_in": TODAY,
            "check_out": D5,
            "booking_id": "HTL-STRESS",
            "confirmation": "HTL-STRESS-1",
        },
    ]
    if extra_legs:
        legs.extend(extra_legs)
    return {
        "screen": "trips",
        "path": "/trips/itn-stress",
        "help_hint": hint or (
            "User is ON this trip. Vague 'today/tonight/hotel/flight' means THIS booking. "
            "Do not invent PNR/gates. Cannot rebook/pay/call hotel for them."
        ),
        "detail": {
            "id": "itn-stress",
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
        "help_hint": (
            "Indian traveller planning. INR. No-drive means no rental car. "
            "Do not invent fares. Label estimates. Pick one dest when asked."
        ),
    },
    "trip": _trip(
        title="Mumbai stay + Delhi flight",
        origin="BOM",
        dest="DEL",
        city="Mumbai",
        hotel="Trident Nariman Point",
        loc="Nariman Point, Mumbai",
    ),
    "airport": {
        "screen": "passenger_info",
        "path": "/flights/passenger-info",
        "help_hint": (
            "User is at the airport / checkout. Boarding soon. "
            "Left page is THIS flight. Do not invent gates. Cannot rebook for them."
        ),
        "booking": {
            "airline": "IndiGo",
            "airline_code": "6E",
            "flight_number": "6E211",
            "origin": "BOM",
            "destination": "DEL",
            "origin_label": "Mumbai (BOM)",
            "destination_label": "Delhi (DEL)",
            "depart_date": TODAY,
            "depart_time": "11:05",
            "pnr": "ITN-AIR",
            "booking_id": "ITN-AIR",
            "dep_terminal": "T2",
        },
        "persona": {"home_country": "IN", "currency": "INR", "passport": "IN"},
    },
    "intl_trip": _trip(
        title="India → New York",
        origin="BOM",
        dest="JFK",
        city="New York",
        hotel="Pod Times Square",
        loc="Times Square, New York",
        hint=(
            "Indian passport, currently abroad. Visa/consulate: search or unknown. "
            "Never invent embassy hours or visa rules."
        ),
    ),
    "bkk": _trip(
        title="Bangkok trip",
        origin="BOM",
        dest="BKK",
        city="Bangkok",
        hotel="Ibis Styles Bangkok Silom",
        loc="Silom, Bangkok",
        hint="On foot in Bangkok. Safety first. Search hospitals; don't invent names.",
    ),
    "leh": _trip(
        title="Leh Ladakh",
        origin="DEL",
        dest="IXL",
        city="Leh",
        hotel="The Grand Dragon Ladakh",
        loc="Leh, Ladakh",
        hint="High altitude. Do not diagnose AMS. Medical first, then itinerary.",
    ),
    "paris": _trip(
        title="Paris",
        origin="DEL",
        dest="CDG",
        city="Paris",
        hotel="Hotel des Arts Montmartre",
        loc="Montmartre, Paris",
        hint="Walking-limit / accessibility. Don't invent elevator access.",
    ),
}
