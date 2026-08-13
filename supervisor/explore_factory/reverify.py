"""Reverifier - second pass; optional airport/IATA sanity."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import STATUS_NEEDS_REVIEW, STATUS_REJECTED, STATUS_REVERIFIED


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def reverify_destination(raw: dict[str, Any], *, probe_live: bool = False) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    dest = dict(raw or {})
    pipeline = dict(dest.get("pipeline") or {})
    if str(pipeline.get("status") or "") == STATUS_REJECTED:
        issues.append(
            {
                "severity": "error",
                "code": "not_checked",
                "message": "Rejected drafts cannot be reverified",
            }
        )

    # Duplicate id against live catalog
    try:
        from supervisor.explore_structured import find_destination

        existing = find_destination(str(dest.get("id") or dest.get("slug") or ""))
        if existing and str(existing.get("id")) == str(dest.get("id")):
            # Upsert is allowed - flag only if city/country wildly differ
            if (
                existing.get("country")
                and dest.get("country")
                and str(existing.get("country")).lower() != str(dest.get("country")).lower()
            ):
                issues.append(
                    {
                        "severity": "warning",
                        "code": "id_country_mismatch",
                        "message": "Same id exists with a different country - confirm overwrite",
                    }
                )
    except Exception:
        pass

    live: dict[str, Any] = {"skipped": True}
    iata = str(dest.get("iata") or "").strip().upper()
    if probe_live and iata:
        live = {"skipped": False, "iata": iata, "ok": bool(iata) and len(iata) == 3}
        # Soft check only - full airport DB probe can plug in later.
        if not live["ok"]:
            issues.append(
                {
                    "severity": "warning",
                    "code": "iata_unverified",
                    "message": f"IATA {iata} looks incomplete",
                }
            )

    errors = [i for i in issues if i.get("severity") == "error"]
    warnings = [i for i in issues if i.get("severity") == "warning"]
    if errors:
        status = STATUS_REJECTED
    elif warnings and probe_live:
        status = STATUS_NEEDS_REVIEW
    else:
        status = STATUS_REVERIFIED

    pipeline.update(
        {
            "status": status,
            "reverifiedAt": _now(),
            "reverifier": "explore_factory.reverify",
            "reverifyIssues": issues,
            "liveProbe": live,
        }
    )
    dest["pipeline"] = pipeline
    return {
        "ok": status == STATUS_REVERIFIED,
        "status": status,
        "destination": dest,
        "issues": issues,
        "live": live,
    }
