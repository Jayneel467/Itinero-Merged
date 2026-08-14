"""Static campaign landing pages + seed offers for Itinero Marketing OS."""

from __future__ import annotations

from typing import Any

SITE = "https://itinero.company"

# /go/:slug campaign configs (acquisition LPs)
GO_CAMPAIGNS: dict[str, dict[str, Any]] = {
    "weekend-himalaya": {
        "slug": "weekend-himalaya",
        "headline": "Weekend in the Himalaya",
        "sub": "Hiking trails, cool air, and mountain towns - planned in minutes with Itinero.",
        "image": "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=1600&q=80",
        "cta_label": "Explore hiking trips",
        "cta_path": "/explore?theme=hiking",
        "secondary_label": "Create free account",
        "secondary_path": "/login",
        "lead_label": "Get hill-station ideas by email",
        "vibes": ["hiking", "hills", "trekking"],
        "offer_code": "HIKE15",
        "utm_campaign": "weekend-himalaya",
        "market": "IN",
    },
    "goa-sun": {
        "slug": "goa-sun",
        "headline": "Goa, without the guesswork",
        "sub": "Beaches, stays, and a weekend fare - Vero helps you pick the stretch that fits.",
        "image": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1600&q=80",
        "cta_label": "See Goa packages",
        "cta_path": "/packages?q=goa",
        "secondary_label": "Browse beaches",
        "secondary_path": "/explore?theme=beach",
        "lead_label": "Get Goa weekend ideas by email",
        "vibes": ["beach", "islands"],
        "offer_code": "WELCOME10",
        "utm_campaign": "goa-sun",
        "market": "IN",
    },
    "kerala-backwaters": {
        "slug": "kerala-backwaters",
        "headline": "Kerala backwaters, unhurried",
        "sub": "Houseboats, spice hills, and slow South - a ready trip, not a 40-tab search.",
        "image": "https://images.unsplash.com/photo-1602216056096-3b40aa0c5e11?auto=format&fit=crop&w=1600&q=80",
        "cta_label": "Open Kerala trips",
        "cta_path": "/packages?q=kerala",
        "secondary_label": "Explore South India",
        "secondary_path": "/explore?theme=nature",
        "lead_label": "Get Kerala trip ideas by email",
        "vibes": ["nature", "relax", "hills"],
        "offer_code": "WELCOME10",
        "utm_campaign": "kerala-backwaters",
        "market": "IN",
    },
    "rajasthan-forts": {
        "slug": "rajasthan-forts",
        "headline": "Forts, desert, and a proper Rajasthan loop",
        "sub": "Jaipur, Jodhpur, Udaipur - stays and flights matched to how you like to travel.",
        "image": "https://images.unsplash.com/photo-1477587458883-47145f673a24?auto=format&fit=crop&w=1600&q=80",
        "cta_label": "See Rajasthan packages",
        "cta_path": "/packages?q=rajasthan",
        "secondary_label": "Explore palaces",
        "secondary_path": "/explore?theme=heritage",
        "lead_label": "Get palace-and-desert ideas by email",
        "vibes": ["heritage", "city", "adventure"],
        "offer_code": "WELCOME10",
        "utm_campaign": "rajasthan-forts",
        "market": "IN",
    },
    "kashmir-lakes": {
        "slug": "kashmir-lakes",
        "headline": "Dal, pines, and a Kashmir weekend",
        "sub": "Srinagar stays and hill air - planned as a trip, not a pile of tabs.",
        "image": "https://images.unsplash.com/photo-1566836610593-62a6485c72f8?auto=format&fit=crop&w=1600&q=80",
        "cta_label": "Open Kashmir trips",
        "cta_path": "/packages?q=kashmir",
        "secondary_label": "Hill destinations",
        "secondary_path": "/explore?theme=hills",
        "lead_label": "Get Kashmir trip ideas by email",
        "vibes": ["hills", "nature", "relax"],
        "offer_code": "HIKE15",
        "utm_campaign": "kashmir-lakes",
        "market": "IN",
    },
    "golden-triangle": {
        "slug": "golden-triangle",
        "headline": "Delhi, Agra, Jaipur - the classic, done properly",
        "sub": "A first-India loop with live stays and flights, not a generic brochure.",
        "image": "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1600&q=80",
        "cta_label": "See Golden Triangle trips",
        "cta_path": "/packages?q=agra",
        "secondary_label": "Start in Delhi",
        "secondary_path": "/explore/delhi",
        "lead_label": "Get Golden Triangle ideas by email",
        "vibes": ["heritage", "city"],
        "offer_code": "WELCOME10",
        "utm_campaign": "golden-triangle",
        "market": "IN",
    },
    "beach-escape": {
        "slug": "beach-escape",
        "headline": "Your next beach escape",
        "sub": "Sand, salt, and slow days - destinations matched to your vibe.",
        "image": "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1600&q=80",
        "cta_label": "Browse beaches",
        "cta_path": "/explore?theme=beach",
        "secondary_label": "Get deal alerts",
        "secondary_path": "/login",
        "lead_label": "Get beach-escape ideas by email",
        "vibes": ["beach", "islands"],
        "offer_code": "WELCOME10",
        "utm_campaign": "beach-escape",
        "market": "IN",
    },
    "bike-europe": {
        "slug": "bike-europe",
        "headline": "Cycle your way through Europe",
        "sub": "Biking cities, riverside paths, and open-road weekends.",
        "image": "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1600&q=80",
        "cta_label": "See biking destinations",
        "cta_path": "/explore?theme=biking",
        "secondary_label": "Join Itinero",
        "secondary_path": "/login",
        "lead_label": "Get cycling-weekend ideas by email",
        "vibes": ["biking", "city", "adventure"],
        "offer_code": "WELCOME10",
        "utm_campaign": "bike-europe",
        "market": "INTL",
    },
    "welcome": {
        "slug": "welcome",
        "headline": "Discover more, everywhere",
        "sub": "Flights, stays, and ready trips - with Vero as your travel buddy.",
        "image": "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1600&q=80",
        "cta_label": "Start exploring",
        "cta_path": "/explore",
        "secondary_label": "Sign up free",
        "secondary_path": "/login",
        "lead_label": "Get weekend trip ideas by email",
        "vibes": ["adventure", "beach", "city"],
        "offer_code": "WELCOME10",
        "utm_campaign": "welcome",
        "market": "ALL",
    },
}

SEED_OFFERS: list[dict[str, Any]] = [
    {
        "id": "offer_welcome10",
        "code": "WELCOME10",
        "title": "Welcome - 10% off packages",
        "copy": "New here? Save 10% on Itinero packages (our planning fee). Airline and hotel fares stay as quoted.",
        "image_url": "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80",
        "targets": {"vibes": [], "markets": []},
        "discount_type": "percent",
        "discount_value": 10,
        "currency": "INR",
        "active": True,
    },
    {
        "id": "offer_hike15",
        "code": "HIKE15",
        "title": "Hiking season - 15% off hills packages",
        "copy": "Save 15% on Itinero package fees for hiking and trekking vibes (our planning fee only).",
        "image_url": "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=900&q=80",
        "targets": {"vibes": ["hiking", "trekking", "hills"], "markets": []},
        "discount_type": "percent",
        "discount_value": 15,
        "currency": "INR",
        "active": True,
    },
    {
        "id": "offer_goa10",
        "code": "GOA10",
        "title": "Goa weekends - 10% off packages",
        "copy": "Save 10% on Itinero Goa packages (planning fee). Live hotel and flight prices stay as quoted.",
        "image_url": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=900&q=80",
        "targets": {"vibes": ["beach", "islands"], "markets": ["IN"]},
        "discount_type": "percent",
        "discount_value": 10,
        "currency": "INR",
        "active": True,
    },
]

# Mail journeys the cron + admin can run. Triggers are code paths, not ESP.
JOURNEYS: list[dict[str, Any]] = [
    {
        "id": "signup_onboarding",
        "name": "Signup onboarding",
        "trigger": "New account (OTP / Google) with newsletter on",
        "steps": [
            "Day 0 - welcome spark",
            "Day 1 - trip ideas",
            "Day 3 - welcome offer",
            "Day 7 - first digest",
        ],
        "templates": ["signup_spark", "signup_trip_idea", "signup_offer", "daily_digest"],
    },
    {
        "id": "lead_welcome",
        "name": "Newsletter lead",
        "trigger": "Footer or /go landing subscribe (no account yet)",
        "steps": ["Immediate welcome spark"],
        "templates": ["signup_spark"],
    },
    {
        "id": "daily_digest",
        "name": "Trip digest",
        "trigger": "Daily cron 08:00 UTC (weekly prefs = Mondays)",
        "steps": ["Personalized explore cards + active offer"],
        "templates": ["daily_digest"],
    },
    {
        "id": "search_curate",
        "name": "Search place idea",
        "trigger": "Explore / package / hotel search for a city",
        "steps": ["Author package if missing", "Mail trip idea after delay"],
        "templates": ["booking_more_like"],
    },
    {
        "id": "booking_followup",
        "name": "After a booking",
        "trigger": "Confirmed hotel / flight / package + 2 days",
        "steps": ["More-like destinations"],
        "templates": ["booking_more_like"],
    },
    {
        "id": "price_watch",
        "name": "Fare drop alert",
        "trigger": "Watched route drops ~3% or ₹500 (checked every 6h)",
        "steps": ["Transactional watch email (consent not required)"],
        "templates": ["price_watch"],
    },
]


def get_go_campaign(slug: str) -> dict[str, Any] | None:
    key = (slug or "").strip().lower()
    return GO_CAMPAIGNS.get(key)


def list_go_campaigns() -> list[dict[str, Any]]:
    return list(GO_CAMPAIGNS.values())


def marketing_catalog() -> dict[str, Any]:
    return {
        "ok": True,
        "journeys": JOURNEYS,
        "landings": list_go_campaigns(),
        "offers": SEED_OFFERS,
        "previewTemplates": [
            "signup_spark",
            "signup_trip_idea",
            "signup_offer",
            "daily_digest",
            "booking_more_like",
        ],
    }
