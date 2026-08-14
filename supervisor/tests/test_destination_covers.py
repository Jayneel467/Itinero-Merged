"""Package cards must get a real city photo, not empty / generic stock."""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def test_cover_for_paris_tokyo_amsterdam():
    from supervisor.destination_covers import cover_for_city, fill_package_cover

    assert "photo-1502602898657" in cover_for_city("Paris")
    assert "photo-1540959733332" in cover_for_city("Tokyo")
    assert "photo-1534351590666" in cover_for_city("Amsterdam")
    assert "photo-1555400038" in cover_for_city("Ubud")

    filled = fill_package_cover(
        {"title": "Paris Long Weekend", "destinations": ["Paris"], "coverImage": ""}
    )
    assert filled["coverImage"]
    assert "unsplash.com" in filled["coverImage"]


def test_fill_keeps_existing_cover():
    from supervisor.destination_covers import fill_package_cover

    existing = "https://example.com/real-bali.jpg"
    out = fill_package_cover({"destinations": ["Paris"], "coverImage": existing})
    assert out["coverImage"] == existing


def test_cover_does_not_confuse_romantic_or_leisure():
    from supervisor.destination_covers import cover_for_city, cover_for_package, fill_package_cover

    udaipur = cover_for_city("Udaipur")
    rome = cover_for_city("Rome")
    leh = cover_for_city("Leh")
    goa = cover_for_city("Goa")
    bali = cover_for_city("Bali")
    mumbai = cover_for_city("Mumbai")

    assert udaipur
    assert rome and rome != udaipur
    assert cover_for_city("Romantic Udaipur lakeside") == udaipur
    assert cover_for_city("Romantic getaway") == ""
    assert cover_for_city("Leisure Himalayan trek") == ""
    assert cover_for_city("Leh monastery circuit") == leh

    assert (
        cover_for_package(
            {
                "destinations": ["Bali"],
                "flight": {"gatewayCity": "Mumbai"},
                "title": "Romantic Bali honeymoon",
            }
        )
        == bali
    )
    assert cover_for_package({"flight": {"gatewayCity": "Mumbai"}, "title": "City break"}) != mumbai

    wrong = fill_package_cover({"destinations": ["Udaipur"], "coverImage": goa})
    assert wrong["coverImage"] == udaipur


def test_list_packages_fills_empty_covers():
    from supervisor.packages_structured import list_packages

    rows = list_packages().get("packages") or []
    by_slug = {str(p.get("slug")): p for p in rows}
    for slug in ("paris-long-weekend", "tokyo-neon-nights", "amsterdam-canal-break", "bali-wellness-reset"):
        pkg = by_slug.get(slug)
        assert pkg, slug
        assert str(pkg.get("coverImage") or "").startswith("http"), slug


def test_live_catalog_stock_covers_match_destination():
    """Launch gate: never serve Goa beach on an Udaipur card (wrong-city stock)."""
    from supervisor.destination_covers import (
        _KNOWN_PHOTO_IDS,
        _photo_id,
        cover_for_package,
        fill_package_cover,
    )
    from supervisor.packages_structured import list_packages

    bad = []
    for pkg in list_packages().get("packages") or []:
        filled = fill_package_cover(dict(pkg))
        wanted = cover_for_package(filled)
        got = str(filled.get("coverImage") or "")
        if not wanted or not got:
            continue
        got_id = _photo_id(got)
        if not got_id or got_id not in _KNOWN_PHOTO_IDS:
            continue
        if got_id != _photo_id(wanted):
            bad.append(
                {
                    "slug": pkg.get("slug") or pkg.get("id"),
                    "title": pkg.get("title"),
                    "destinations": pkg.get("destinations"),
                    "got": got_id,
                    "wanted": _photo_id(wanted),
                }
            )
    assert not bad, bad[:12]
