"""Outdoor packages must tell travelers what to bring and where to rent."""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def test_amsterdam_gets_bike_rental_kit():
    from supervisor.activity_kit import build_activity_kit

    kit = build_activity_kit(
        {
            "title": "Amsterdam Canal Break",
            "theme": "city",
            "themes": ["city", "culture"],
            "destinations": ["Amsterdam"],
            "highlights": ["Canal houses", "Local food"],
        }
    )
    assert "biking" in kit["activities"]
    bikes = next(k for k in kit["kits"] if k["id"] == "biking")
    assert bikes["mode"] == "local"
    assert any("bike" in x.lower() for x in bikes["rent"])
    assert bikes["where"]
    assert bikes["where"][0]["kind"] == "bikes"
    assert "Amsterdam" in bikes["where"][0]["query"]
    assert bikes["how_to"]
    assert any("hotel" in x.lower() or "centraal" in x.lower() for x in bikes["how_to"])
    assert bikes["check"]
    assert "Amsterdam" in (bikes.get("vero_prompt") or "")


def test_manali_hiking_is_core():
    from supervisor.activity_kit import build_activity_kit

    kit = build_activity_kit(
        {
            "title": "Manali Hills",
            "theme": "hills",
            "themes": ["hills", "hiking", "adventure"],
            "destinations": ["Manali"],
            "highlights": ["Solang valley hike"],
        }
    )
    assert "hiking" in kit["activities"]
    hike = next(k for k in kit["kits"] if k["id"] == "hiking")
    assert hike["mode"] == "core"
    assert any("shoe" in x.lower() or "boot" in x.lower() for x in hike["bring"])
    assert hike["how_to"]
    assert any("manali" in x.lower() or "hotel" in x.lower() or "mall" in x.lower() for x in hike["how_to"])


def test_keyword_rafting_without_theme():
    from supervisor.activity_kit import build_activity_kit

    kit = build_activity_kit(
        {
            "title": "Ganges weekend",
            "theme": "wellness",
            "themes": ["wellness"],
            "destinations": ["Rishikesh"],
            "exclusions": ["Rafting tickets"],
            "packing": ["Water shoes if rafting"],
        }
    )
    assert "rafting" in kit["activities"]
    raft = next(k for k in kit["kits"] if k["id"] == "rafting")
    assert raft["mode"] == "core"
    assert raft["where"][0]["kind"] == "rafting"


def test_get_package_includes_activity_kit():
    from supervisor.packages_structured import get_package, list_packages

    listed = list_packages(q="amsterdam")
    row = (listed.get("packages") or [{}])[0]
    assert "biking" in (row.get("activityTags") or row.get("themes") or [])

    out = get_package("amsterdam-canal-break")
    pkg = out.get("package") or {}
    kit = pkg.get("activityKit") or {}
    assert kit.get("kits")
    assert any(k.get("id") == "biking" for k in kit["kits"])
