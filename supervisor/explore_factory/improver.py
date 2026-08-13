"""Daily Explore improver - lighter polish pass on destinations."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "explore_destinations.json"


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _load() -> list[dict[str, Any]]:
    if not _DATA_PATH.exists():
        return []
    raw = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    return raw if isinstance(raw, list) else []


def _save(rows: list[dict[str, Any]]) -> None:
    _DATA_PATH.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _infer_markets(dest: dict[str, Any]) -> list[str]:
    explicit = dest.get("markets")
    if isinstance(explicit, list) and explicit:
        return [str(m).strip().upper() for m in explicit if str(m).strip()]
    continent = str(dest.get("continent") or "").lower()
    country = str(dest.get("country") or "")
    if continent == "india" or country == "India":
        return ["IN", "*"]
    if country == "USA":
        return ["US", "*"]
    if country == "UK":
        return ["GB", "*"]
    if country == "UAE":
        return ["AE", "*"]
    if country == "Canada":
        return ["CA", "*"]
    if country in ("Australia", "New Zealand", "Fiji"):
        return ["AU", "*"]
    if country == "Singapore":
        return ["SG", "*"]
    if country == "Japan":
        return ["JP", "*"]
    return ["*"]


def improve_live_catalog(*, dry_run: bool = False) -> dict[str, Any]:
    rows = _load()
    improved: list[dict[str, Any]] = []
    next_rows: list[dict[str, Any]] = []

    for dest in rows:
        if not isinstance(dest, dict):
            continue
        row = dict(dest)
        changes: list[str] = []
        markets = _infer_markets(row)
        if markets != list(row.get("markets") or []):
            row["markets"] = markets
            changes.append("markets")
        if not row.get("slug"):
            row["slug"] = str(row.get("id") or "").lower()
            changes.append("slug")
        if not row.get("themes"):
            row["themes"] = ["city"]
            changes.append("themes")
        if row.get("lat") is None or row.get("lng") is None:
            changes.append("missing_coords")  # flagged, not invented
        blurb = str(row.get("blurb") or "").strip()
        if blurb and not blurb.endswith("."):
            row["blurb"] = blurb + "."
            changes.append("blurb_punct")
        if changes and "missing_coords" not in changes:
            pipeline = dict(row.get("pipeline") or {})
            pipeline["lastImprovedAt"] = _now()
            pipeline["improver"] = "explore_factory.improver.daily"
            row["pipeline"] = pipeline
            improved.append({"slug": row.get("slug"), "changes": [c for c in changes if c != "missing_coords"]})
        next_rows.append(row)

    missing_coords = [r.get("slug") for r in next_rows if r.get("lat") is None or r.get("lng") is None]
    if not dry_run and improved:
        _save(next_rows)

    return {
        "ok": len(missing_coords) == 0,
        "agent": "explore_factory.improver",
        "at": _now(),
        "total": len(next_rows),
        "improvedCount": len(improved),
        "improved": improved[:40],
        "missingCoords": missing_coords[:20],
        "dryRun": dry_run,
    }
