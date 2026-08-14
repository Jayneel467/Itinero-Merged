"""Destination cover photos for packages (real place images, not generic travel stock).

Mirrors itinero explore catalog Unsplash IDs so LLM-authored packages with empty
coverImage still show the city, not a flat-lay suitcase photo.

Matching is exact / word-boundary only. Substring match used to map
"Romantic Udaipur" → Rome and "Leisure trek" → Leh.
"""

from __future__ import annotations

import re
from typing import Any


def _u(photo_id: str) -> str:
    return (
        f"https://images.unsplash.com/{photo_id}"
        "?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80"
    )


# canonical city → unsplash photo id (same set as itinero explore catalog)
_COVERS: dict[str, str] = {
    "goa": _u("photo-1559827260-dc66d52bef19"),
    "jaipur": _u("photo-1477587458883-47145ed94245"),
    "manali": _u("photo-1626621341517-bbf3d9990a23"),
    "kochi": _u("photo-1593693411515-c20261bcad6e"),
    "udaipur": _u("photo-1696861524777-978d87c7cff2"),
    "leh": _u("photo-1589182373726-e4f658ab50f0"),
    "darjeeling": _u("photo-1501785888041-af3ef285b470"),
    "varanasi": _u("photo-1561361513-2d000a50f0dc"),
    "rishikesh": _u("photo-1582510003544-4d00b7f74220"),
    "andaman": _u("photo-1589308078059-be1415eab4c3"),
    "srinagar": _u("photo-1469474968028-56623f02e42e"),
    "mumbai": _u("photo-1566552881560-0be862a7c445"),
    "lonavala": _u("photo-1506905925346-21bda4d32df4"),
    "nashik": _u("photo-1474979266404-7eaacbcd87c5"),
    "alibaug": _u("photo-1507525428034-b723cf961d3e"),
    "tokyo": _u("photo-1540959733332-eab4deabeeaf"),
    "kyoto": _u("photo-1493976040374-85c8e12f0c0e"),
    "bangkok": _u("photo-1508009603885-50cf7c579365"),
    "singapore": _u("photo-1525625293386-3f8f99389edd"),
    "bali": _u("photo-1555400038-63f5ba517a47"),
    "maldives": _u("photo-1514282401047-d79a71a590e8"),
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
    "tbilisi": _u("photo-1523906834658-6e24ef2386f9"),
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
    "reykjavik": _u("photo-1504893524553-b855bce32c67"),
    "lisbon": _u("photo-1558642452-9d2a7deb7f62"),
    "milan": _u("photo-1513581166391-887a96ddeafd"),
    "berlin": _u("photo-1560969184-10fe8719e047"),
    "new york": _u("photo-1496442226666-8d4d0e62e6e9"),
    "los angeles": _u("photo-1534190760961-74e8c1c5c3da"),
    "san francisco": _u("photo-1501594907352-04cda38ebc29"),
    "toronto": _u("photo-1480714378408-67cf0d13bc1b"),
    "mexico city": _u("photo-1578662996442-48f60103fc96"),
    "miami": _u("photo-1514214246283-d427a95c5d2f"),
    "chicago": _u("photo-1494522855154-9297ac14b55f"),
    "denver": _u("photo-1546156929-a4c0ac41164c"),
    "seattle": _u("photo-1502175353174-a7a70eaa6b4c"),
    "las vegas": _u("photo-1605833556294-ea5c7a74f57d"),
    "nashville": _u("photo-1546146830-2cca7862f0f0"),
    "honolulu": _u("photo-1505852679233-d9fd70aff56d"),
    "boston": _u("photo-1501594907352-04cda38ebc29"),
    "austin": _u("photo-1531219572328-a0171b4448a3"),
    "new orleans": _u("photo-1569949381669-ecf31ae8e613"),
    "washington dc": _u("photo-1501466044931-62695aada8ed"),
    "savannah": _u("photo-1546156929-a4c0ac41164c"),
    "cancun": _u("photo-1552074284-5e88ef1aef18"),
    "rio": _u("photo-1483729558449-99ef09a8c325"),
    "cape town": _u("photo-1580060839134-75a5edca2e99"),
    "cairo": _u("photo-1572252009286-268acec5ca0a"),
    "marrakech": _u("photo-1544644181-1484b3fdfc62"),
    "nairobi": _u("photo-1516426122078-c23e76319801"),
    "zanzibar": _u("photo-1571896349842-33c89424de2d"),
    "sydney": _u("photo-1506973035872-a4ec16b8e8d9"),
    "melbourne": _u("photo-1514395462725-fb4566210144"),
    "auckland": _u("photo-1507699622108-4be3abd695ad"),
    "queenstown": _u("photo-1469854523086-cc02fe5d8800"),
    "nadi": _u("photo-1507525428034-b723cf961d3e"),
}

_ALIASES: dict[str, str] = {
    "ladakh": "leh",
    "ubud": "bali",
    "malé": "maldives",
    "male": "maldives",
    "port blair": "andaman",
    "havelock": "andaman",
    "nyc": "new york",
    "new york city": "new york",
    "rio de janeiro": "rio",
    "cancún": "cancun",
    "hongkong": "hong kong",
    "kuala-lumpur": "kuala lumpur",
    "abu-dhabi": "abu dhabi",
    "cape-town": "cape town",
    "las-vegas": "las vegas",
    "mexico-city": "mexico city",
    "san-francisco": "san francisco",
    "los-angeles": "los angeles",
    "new-orleans": "new orleans",
    "washington d.c.": "washington dc",
    "washington, d.c.": "washington dc",
    "d.c.": "washington dc",
    "iceland": "reykjavik",
    "fiji": "nadi",
    "kashmir": "srinagar",
}


def _norm(city: str) -> str:
    return " ".join(str(city or "").strip().lower().replace("-", " ").replace(",", " ").split())


def _photo_id(url: str) -> str:
    m = re.search(r"photo-[a-z0-9-]+", str(url or ""), re.I)
    return (m.group(0) if m else "").lower()


_KNOWN_PHOTO_IDS = {_photo_id(url) for url in _COVERS.values() if _photo_id(url)}
_CITY_KEYS_LONGEST = sorted(_COVERS.keys(), key=len, reverse=True)


def cover_for_city(city: str) -> str:
    key = _norm(city)
    if not key:
        return ""
    canon = _ALIASES.get(key, key)
    if canon in _COVERS:
        return _COVERS[canon]
    # Word-boundary only — never "rome" inside "romantic" or "leh" inside "leisure".
    for token in _CITY_KEYS_LONGEST:
        if re.search(rf"(?<![a-z]){re.escape(token)}(?![a-z])", key):
            return _COVERS[token]
    for alias, canon in _ALIASES.items():
        if re.search(rf"(?<![a-z]){re.escape(alias)}(?![a-z])", key) and canon in _COVERS:
            return _COVERS[canon]
    return ""


def cover_for_package(pkg: dict[str, Any] | None) -> str:
    if not isinstance(pkg, dict):
        return ""
    cities: list[str] = []
    for row in pkg.get("destinations") or []:
        if row:
            cities.append(str(row))
    for row in pkg.get("requiredAnchors") or []:
        if row:
            cities.append(str(row))
    stay = pkg.get("stay") if isinstance(pkg.get("stay"), dict) else {}
    if stay.get("city"):
        cities.append(str(stay["city"]))
    # Do not use flight.gatewayCity — that is usually the origin, not the trip.
    for city in cities:
        url = cover_for_city(city)
        if url:
            return url
    title = str(pkg.get("title") or "")
    if title:
        return cover_for_city(title)
    return ""


def fill_package_cover(pkg: dict[str, Any]) -> dict[str, Any]:
    """Return a copy with coverImage set (or corrected) for the destination city."""
    if not isinstance(pkg, dict):
        return pkg
    wanted = cover_for_package(pkg)
    existing = str(pkg.get("coverImage") or "").strip()
    if existing:
        if not wanted:
            return pkg
        existing_id = _photo_id(existing)
        wanted_id = _photo_id(wanted)
        # Keep custom / hotel / Places covers. Replace our own stock if it is the wrong city.
        if existing_id and existing_id in _KNOWN_PHOTO_IDS and wanted_id and existing_id != wanted_id:
            out = dict(pkg)
            out["coverImage"] = wanted
            gallery = [g for g in (out.get("gallery") or []) if str(g or "").strip()]
            if not gallery or all(_photo_id(g) in _KNOWN_PHOTO_IDS for g in gallery):
                out["gallery"] = [wanted]
            return out
        return pkg
    if not wanted:
        return pkg
    out = dict(pkg)
    out["coverImage"] = wanted
    gallery = [g for g in (out.get("gallery") or []) if str(g or "").strip()]
    if not gallery:
        out["gallery"] = [wanted]
    return out
