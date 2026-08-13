"""Reverifier agent - second pass after checker; optional live hotel probe."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from . import STATUS_NEEDS_REVIEW, STATUS_REJECTED, STATUS_REVERIFIED


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _sample_window(template: dict[str, Any]) -> tuple[str, str]:
    days = int(template.get("durationDays") or template.get("minDurationDays") or 4)
    days = max(2, min(days, 10))
    start = date.today() + timedelta(days=28)
    end = start + timedelta(days=max(1, days - 1))
    return start.isoformat(), end.isoformat()


def _stay_city(pkg: dict[str, Any]) -> str:
    stay = pkg.get("stay") or {}
    city = str(stay.get("city") or "").strip()
    if city:
        return city
    dests = pkg.get("destinations") or []
    if dests:
        return str(dests[0]).strip()
    flight = pkg.get("flight") or {}
    return str(flight.get("gatewayCity") or "").strip()


async def reverify_template(
    pkg: dict[str, Any],
    *,
    probe_live: bool = False,
) -> dict[str, Any]:
    """Re-check structure; optionally probe LiteAPI for at least one stay city."""
    issues: list[dict[str, Any]] = []
    package = dict(pkg or {})
    pipeline = dict(package.get("pipeline") or {})
    prior = str(pipeline.get("status") or "")
    if prior == STATUS_REJECTED:
        issues.append(
            {
                "severity": "error",
                "code": "not_checked",
                "message": "Rejected drafts cannot be reverified - fix checker errors first",
            }
        )

    city = _stay_city(package)
    if not city:
        issues.append(
            {
                "severity": "error",
                "code": "missing_stay_city",
                "message": "No stay city / destination for inventory probe",
            }
        )

    live: dict[str, Any] = {"skipped": True}
    if probe_live and city and not any(i.get("severity") == "error" for i in issues):
        live = {"skipped": False, "city": city, "ok": False}
        try:
            from supervisor.hotel_structured import structured_hotel_search

            check_in, check_out = _sample_window(package)
            currency = str(package.get("currency") or "USD")
            search = await structured_hotel_search(
                city=city,
                check_in=check_in,
                check_out=check_out,
                guests=2,
                rooms=1,
                currency=currency,
                page=1,
                page_size=5,
            )
            hotels = search.get("hotels") or []
            live.update(
                {
                    "ok": bool(hotels),
                    "hotelCount": len(hotels),
                    "mode": search.get("mode"),
                    "message": search.get("message") or "",
                    "checkIn": check_in,
                    "checkOut": check_out,
                }
            )
            if not hotels:
                issues.append(
                    {
                        "severity": "error",
                        "code": "no_live_hotels",
                        "message": f"No live hotels for {city} on sample dates",
                    }
                )
        except Exception as exc:  # noqa: BLE001
            live["error"] = str(exc)
            issues.append(
                {
                    "severity": "warning",
                    "code": "live_probe_failed",
                    "message": f"Live probe failed: {exc}",
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
            "reverifier": "package_factory.reverify",
            "reverifyIssues": issues,
            "liveProbe": live,
        }
    )
    package["pipeline"] = pipeline
    return {
        "ok": status == STATUS_REVERIFIED,
        "status": status,
        "package": package,
        "issues": issues,
        "live": live,
    }


def reverify_template_sync(pkg: dict[str, Any], *, probe_live: bool = False) -> dict[str, Any]:
    """Sync wrapper for CLI (runs async reverify)."""
    import asyncio

    return asyncio.run(reverify_template(pkg, probe_live=probe_live))
