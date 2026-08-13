"""Publisher agent - promotes reverified drafts into the live catalog."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import STATUS_PUBLISHED, STATUS_REVERIFIED

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_LIVE_PATH = _DATA_DIR / "packages.json"
_DRAFTS_DIR = _DATA_DIR / "package_drafts"


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def drafts_dir() -> Path:
    _DRAFTS_DIR.mkdir(parents=True, exist_ok=True)
    return _DRAFTS_DIR


def save_draft(pkg: dict[str, Any]) -> Path:
    """Write a draft JSON under data/package_drafts/<slug>.json."""
    slug = str(pkg.get("slug") or pkg.get("id") or "draft").strip()
    path = drafts_dir() / f"{slug}.json"
    path.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def load_drafts(*, market: str | None = None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not _DRAFTS_DIR.exists():
        return out
    market_s = (market or "").strip().upper()
    for path in sorted(_DRAFTS_DIR.glob("*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(raw, dict):
            continue
        if market_s:
            markets = [str(m).upper() for m in (raw.get("markets") or [])]
            pipe_m = str((raw.get("pipeline") or {}).get("market") or "").upper()
            if market_s not in markets and pipe_m != market_s and "*" not in markets:
                continue
        out.append(raw)
    return out


def _strip_pipeline_for_live(pkg: dict[str, Any]) -> dict[str, Any]:
    """Live catalog keeps markets + light provenance; drops noisy check payloads."""
    live = dict(pkg)
    pipeline = dict(live.get("pipeline") or {})
    live["pipeline"] = {
        "status": STATUS_PUBLISHED,
        "publishedAt": _now(),
        "publisher": "package_factory.publisher",
        "market": pipeline.get("market"),
        "authoredAt": pipeline.get("authoredAt"),
        "checkedAt": pipeline.get("checkedAt"),
        "reverifiedAt": pipeline.get("reverifiedAt"),
    }
    return live


def publish_to_live(
    pkg: dict[str, Any],
    *,
    require_reverified: bool = True,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Upsert package into supervisor/data/packages.json."""
    status = str((pkg.get("pipeline") or {}).get("status") or "")
    if require_reverified and status not in (STATUS_REVERIFIED, STATUS_PUBLISHED):
        return {
            "ok": False,
            "message": f"Package status is {status or 'unknown'}; need {STATUS_REVERIFIED}",
        }

    from supervisor.destination_covers import fill_package_cover

    live_pkg = fill_package_cover(_strip_pipeline_for_live(pkg))
    slug = str(live_pkg.get("slug") or "").strip()
    pkg_id = str(live_pkg.get("id") or "").strip()
    if not slug or not pkg_id:
        return {"ok": False, "message": "Missing id/slug"}

    existing: list[dict[str, Any]] = []
    if _LIVE_PATH.exists():
        try:
            raw = json.loads(_LIVE_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                existing = raw
        except Exception:
            existing = []

    replaced = False
    next_rows: list[dict[str, Any]] = []
    for row in existing:
        if str(row.get("slug") or "") == slug or str(row.get("id") or "") == pkg_id:
            next_rows.append(live_pkg)
            replaced = True
        else:
            next_rows.append(row)
    if not replaced:
        next_rows.append(live_pkg)

    if not dry_run:
        _LIVE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _LIVE_PATH.write_text(
            json.dumps(next_rows, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        # Archive draft if present.
        draft_path = drafts_dir() / f"{slug}.json"
        if draft_path.exists():
            archive = drafts_dir() / "published"
            archive.mkdir(parents=True, exist_ok=True)
            draft_path.rename(archive / f"{slug}.json")

    return {
        "ok": True,
        "slug": slug,
        "replaced": replaced,
        "total": len(next_rows),
        "dryRun": dry_run,
        "path": str(_LIVE_PATH),
    }
