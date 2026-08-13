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
        "vibes": ["hiking", "hills", "trekking"],
        "offer_code": "WELCOME10",
        "utm_campaign": "weekend-himalaya",
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
        "vibes": ["beach", "islands"],
        "offer_code": "WELCOME10",
        "utm_campaign": "beach-escape",
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
        "vibes": ["biking", "city", "adventure"],
        "offer_code": "WELCOME10",
        "utm_campaign": "bike-europe",
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
        "vibes": ["adventure", "beach", "city"],
        "offer_code": "WELCOME10",
        "utm_campaign": "welcome",
    },
}

SEED_OFFERS: list[dict[str, Any]] = [
    {
        "id": "offer_welcome10",
        "code": "WELCOME10",
        "title": "Welcome - 10% off packages",
        "copy": "New here? Save 10% on Itinero packages (our margin). Flights & hotel supplier fares unchanged.",
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
        "copy": "Save 15% on Itinero package fees for hiking & trekking vibes (our margin only).",
        "image_url": "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=900&q=80",
        "targets": {"vibes": ["hiking", "trekking", "hills"], "markets": []},
        "discount_type": "percent",
        "discount_value": 15,
        "currency": "INR",
        "active": True,
    },
]


def get_go_campaign(slug: str) -> dict[str, Any] | None:
    key = (slug or "").strip().lower()
    return GO_CAMPAIGNS.get(key)


def list_go_campaigns() -> list[dict[str, Any]]:
    return list(GO_CAMPAIGNS.values())
