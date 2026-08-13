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


def test_list_packages_fills_empty_covers():
    from supervisor.packages_structured import list_packages

    rows = list_packages().get("packages") or []
    by_slug = {str(p.get("slug")): p for p in rows}
    for slug in ("paris-long-weekend", "tokyo-neon-nights", "amsterdam-canal-break", "bali-wellness-reset"):
        pkg = by_slug.get(slug)
        assert pkg, slug
        assert str(pkg.get("coverImage") or "").startswith("http"), slug
