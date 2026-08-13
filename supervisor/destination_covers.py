"""Destination cover photos for packages (real place images, not generic travel stock).

Mirrors itinero explore catalog Unsplash IDs so LLM-authored packages with empty
coverImage still show the city, not a flat-lay suitcase photo.
"""

from __future__ import annotations

from typing import Any


def _u(photo_id: str) -> str:
    return (
        f"https://images.unsplash.com/{photo_id}"
        "?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80"
    )


# city / alias → unsplash photo id (same set as itinero/src/features/explore/data/catalog.js)
_COVERS: dict[str, str] = {
    "goa": _u("photo-1559827260-dc66d52bef19"),
    "jaipur": _u("photo-1477587458883-47145ed94245"),
    "manali": _u("photo-1626621341517-bbf3d9990a23"),
    "kochi": _u("photo-1593693411515-c20261bcad6e"),
    "udaipur": _u("photo-1696861524777-978d87c7cff2"),
    "leh": _u("photo-1589182373726-e4f658ab50f0"),
    "ladakh": _u("photo-1589182373726-e4f658ab50f0"),
    "darjeeling": _u("photo-1501785888041-af3ef285b470"),
    "varanasi": _u("photo-1561361513-2d000a50f0dc"),
    "rishikesh": _u("photo-1582510003544-4d00b7f74220"),
    "andaman": _u("photo-1589308078059-be1415eab4c3"),
    "port blair": _u("photo-1589308078059-be1415eab4c3"),
    "srinagar": _u("photo-1469474968028-56623f02e42e"),
    "mumbai": _u("photo-1566552881560-0be862a7c445"),
    "tokyo": _u("photo-1540959733332-eab4deabeeaf"),
    "kyoto": _u("photo-1493976040374-85c8e12f0c0e"),
    "bangkok": _u("photo-1508009603885-50cf7c579365"),
    "singapore": _u("photo-1525625293386-3f8f99389edd"),
    "bali": _u("photo-1555400038-63f5ba517a47"),
    "ubud": _u("photo-1555400038-63f5ba517a47"),
    "maldives": _u("photo-1514282401047-d79a71a590e8"),
    "malé": _u("photo-1514282401047-d79a71a590e8"),
    "male": _u("photo-1514282401047-d79a71a590e8"),
    "kathmandu": _u("photo-1544735716-392fe2489ffa"),
    "colombo": _u("photo-1552465011-b4e21bf6e79a"),
    "seoul": _u("photo-1517154421773-0529f29ea451"),
    "hong kong": _u("photo-1536599018102-9f803c140fc1"),
    "phuket": _u("photo-1589394815804-964ed0be2eb5"),
    "hanoi": _u("photo-1528127269322-539801943592"),
    "kuala lumpur": _u("photo-1518548419970-58e3b4079ab2"),
    "dubai": _u("photo-1512453979798-5ea266f8880c"),
    "abu dhabi": _u("photo-1609137144813-7d9921338f24"),
    "doha": _u("photo-1555881400-74d7acaacd8b"),
    "istanbul": _u("photo-1524231757912-21f4fe3a7200"),
    "paris": _u("photo-1502602898657-3e91760cbb34"),
    "rome": _u("photo-1552832230-c0197dd311b5"),
    "london": _u("photo-1513635269975-59663e0ac1ad"),
    "edinburgh": _u("photo-1506377247377-2a5b3b417ebb"),
    "barcelona": _u("photo-1583422409516-2895a77efded"),
    "amsterdam": _u("photo-1534351590666-13e3e96b5017"),
    "santorini": _u("photo-1570077188670-e3a8d69ac5ff"),
    "prague": _u("photo-1541849546-216549ae216d"),
    "vienna": _u("photo-1516550893923-42d28e5677af"),
    "zurich": _u("photo-1515488764276-beab7607c1e6"),
    "lisbon": _u("photo-1558642452-9d2a7deb7f62"),
    "milan": _u("photo-1513581166391-887a96ddeafd"),
    "berlin": _u("photo-1560969184-10fe8719e047"),
    "new york": _u("photo-1496442226666-8d4d0e62e6e9"),
    "nyc": _u("photo-1496442226666-8d4d0e62e6e9"),
    "los angeles": _u("photo-1534190760961-74e8c1c5c3da"),
    "san francisco": _u("photo-1501594907352-04cda38ebc29"),
    "toronto": _u("photo-1480714378408-67cf0d13bc1b"),
    "mexico city": _u("photo-1578662996442-48f60103fc96"),
    "miami": _u("photo-1514214246283-d427a95c5d2f"),
    "chicago": _u("photo-1494522855154-9297ac14b55f"),
    "sydney": _u("photo-1506973035872-a4ec16b8e8d9"),
    "melbourne": _u("photo-1514395462725-fb4566210144"),
    "cape town": _u("photo-1580060839134-75a5edca2e99"),
    "cairo": _u("photo-1572252009286-268acec5ca0a"),
    "marrakech": _u("photo-1544644181-1484b3fdfc62"),
    "nairobi": _u("photo-1516426122078-c23e76319801"),
    "zanzibar": _u("photo-1571896349842-33c89424de2d"),
    "honolulu": _u("photo-1505852679233-d9fd70aff56d"),
    "cancun": _u("photo-1552074284-5e88ef1aef18"),
    "cancún": _u("photo-1552074284-5e88ef1aef18"),
    "rio": _u("photo-1483729558449-99ef09a8c325"),
    "rio de janeiro": _u("photo-1483729558449-99ef09a8c325"),
}


def cover_for_city(city: str) -> str:
    key = " ".join(str(city or "").strip().lower().replace("-", " ").split())
    if not key:
        return ""
    if key in _COVERS:
        return _COVERS[key]
    for token, url in _COVERS.items():
        if token in key or key in token:
            return url
    return ""


def cover_for_package(pkg: dict[str, Any] | None) -> str:
    if not isinstance(pkg, dict):
        return ""
    cities: list[str] = []
    for row in pkg.get("destinations") or []:
        if row:
            cities.append(str(row))
    stay = pkg.get("stay") if isinstance(pkg.get("stay"), dict) else {}
    if stay.get("city"):
        cities.append(str(stay["city"]))
    flight = pkg.get("flight") if isinstance(pkg.get("flight"), dict) else {}
    if flight.get("gatewayCity"):
        cities.append(str(flight["gatewayCity"]))
    title = str(pkg.get("title") or "")
    if title:
        cities.append(title)
    for city in cities:
        url = cover_for_city(city)
        if url:
            return url
    return ""


def fill_package_cover(pkg: dict[str, Any]) -> dict[str, Any]:
    """Return a copy with coverImage set when the catalog row left it blank."""
    if not isinstance(pkg, dict):
        return pkg
    existing = str(pkg.get("coverImage") or "").strip()
    if existing:
        return pkg
    url = cover_for_package(pkg)
    if not url:
        return pkg
    out = dict(pkg)
    out["coverImage"] = url
    gallery = [g for g in (out.get("gallery") or []) if str(g or "").strip()]
    if not gallery:
        out["gallery"] = [url]
    return out
