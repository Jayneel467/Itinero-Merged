"""Checker agent - schema + geo sanity for Explore destinations."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import KNOWN_CONTINENTS, REQUIRED_DEST_FIELDS, STATUS_CHECKED, STATUS_REJECTED


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def check_destination(raw: dict[str, Any]) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    dest = dict(raw or {})

    for field in REQUIRED_DEST_FIELDS:
        if field == "themes":
            themes = dest.get("themes")
            if not isinstance(themes, list) or not themes:
                issues.append(
                    {"severity": "error", "code": "missing_themes", "message": "themes[] required"}
                )
            continue
        if field == "markets":
            markets = dest.get("markets")
            if not isinstance(markets, list) or not markets:
                issues.append(
                    {"severity": "error", "code": "missing_markets", "message": "markets[] required"}
                )
            continue
        if not dest.get(field) and dest.get(field) != 0:
            issues.append(
                {"severity": "error", "code": "missing_field", "message": f"Missing {field}"}
            )

    continent = str(dest.get("continent") or "").strip().lower()
    if continent and continent not in KNOWN_CONTINENTS:
        issues.append(
            {
                "severity": "error",
                "code": "bad_continent",
                "message": f"continent must be one of {KNOWN_CONTINENTS}",
            }
        )

    iata = str(dest.get("iata") or "").strip().upper()
    if iata and (len(iata) < 3 or len(iata) > 4 or not iata.isalpha()):
        issues.append(
            {
                "severity": "warning",
                "code": "odd_iata",
                "message": f"Unusual IATA code: {iata}",
            }
        )
    dest["iata"] = iata

    try:
        lat = float(dest.get("lat")) if dest.get("lat") is not None else None
        lng = float(dest.get("lng")) if dest.get("lng") is not None else None
    except (TypeError, ValueError):
        lat, lng = None, None
        issues.append(
            {"severity": "error", "code": "bad_coords", "message": "lat/lng must be numbers"}
        )
    if lat is not None and (lat < -90 or lat > 90):
        issues.append({"severity": "error", "code": "bad_lat", "message": "lat out of range"})
    if lng is not None and (lng < -180 or lng > 180):
        issues.append({"severity": "error", "code": "bad_lng", "message": "lng out of range"})
    if lat is None or lng is None:
        issues.append(
            {
                "severity": "error",
                "code": "missing_coords",
                "message": "lat and lng required for Explore map",
            }
        )

    blurb = str(dest.get("blurb") or "").strip()
    if blurb and len(blurb) < 20:
        issues.append(
            {
                "severity": "warning",
                "code": "short_blurb",
                "message": "Blurb is very short for Explore cards",
            }
        )

    # Domestic continent vs markets consistency
    markets = [str(m).upper() for m in (dest.get("markets") or [])]
    if continent == "india" and "IN" not in markets and "*" not in markets:
        issues.append(
            {
                "severity": "warning",
                "code": "india_market",
                "message": "India destinations should include IN in markets[]",
            }
        )
    if dest.get("country") == "USA" and "US" not in markets and "*" not in markets:
        issues.append(
            {
                "severity": "warning",
                "code": "us_market",
                "message": "USA destinations should include US in markets[]",
            }
        )

    errors = [i for i in issues if i.get("severity") == "error"]
    status = STATUS_CHECKED if not errors else STATUS_REJECTED
    pipeline = dict(dest.get("pipeline") or {})
    pipeline.update(
        {
            "status": status,
            "checkedAt": _now(),
            "checker": "explore_factory.checker",
            "checkIssues": issues,
        }
    )
    dest["pipeline"] = pipeline
    dest["slug"] = str(dest.get("slug") or dest.get("id") or "").strip().lower()
    dest["id"] = str(dest.get("id") or dest.get("slug") or "").strip().lower()
    return {
        "ok": status == STATUS_CHECKED,
        "status": status,
        "destination": dest,
        "issues": issues,
    }
