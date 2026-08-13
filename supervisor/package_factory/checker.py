"""Checker agent - structural + engine validation before inventory reverify."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

try:
    from supervisor.package_engine import instantiate, normalize_template
except ImportError:  # pragma: no cover - flat path when cwd=supervisor
    from package_engine import instantiate, normalize_template

from . import REQUIRED_TEMPLATE_FIELDS, STATUS_CHECKED, STATUS_REJECTED


def _sample_window(template: dict[str, Any]) -> tuple[str, str]:
    days = int(template.get("durationDays") or template.get("minDurationDays") or 4)
    days = max(2, min(days, 14))
    start = date.today() + timedelta(days=21)
    end = start + timedelta(days=days - 1)
    return start.isoformat(), end.isoformat()


def check_template(raw: dict[str, Any]) -> dict[str, Any]:
    """Run schema + package_engine instantiate/validate. Does not call LiteAPI."""
    issues: list[dict[str, Any]] = []
    pkg = dict(raw or {})

    for field in REQUIRED_TEMPLATE_FIELDS:
        if field == "markets":
            markets = pkg.get("markets")
            if not isinstance(markets, list) or not markets:
                issues.append({"severity": "error", "code": "missing_markets", "message": "markets[] is required"})
            continue
        if not pkg.get(field) and pkg.get(field) != 0:
            issues.append({"severity": "error", "code": "missing_field", "message": f"Missing {field}"})

    if not pkg.get("dayBlueprints") and not pkg.get("itinerary") and not pkg.get("requiredAnchors"):
        issues.append(
            {
                "severity": "error",
                "code": "missing_plan",
                "message": "Need dayBlueprints, itinerary, or requiredAnchors",
            }
        )

    region = str(pkg.get("region") or "").lower()
    markets = [str(m).upper() for m in (pkg.get("markets") or [])]
    if region == "domestic" and markets == ["IN"]:
        pass
    elif region == "domestic" and "IN" in markets and len(markets) == 1:
        pass
    elif region == "domestic" and not any(m in markets for m in ("IN", "US", "GB", "CA", "AU", "JP", "AE", "SG")):
        issues.append(
            {
                "severity": "warning",
                "code": "domestic_market_unclear",
                "message": "domestic region should declare a concrete home market in markets[]",
            }
        )

    engine_ok = False
    validation: dict[str, Any] = {}
    try:
        tpl = normalize_template(pkg)
        check_in, check_out = _sample_window(tpl)
        inst = instantiate(tpl, check_in=check_in, check_out=check_out, guests=2)
        validation = inst.get("validation") or {}
        engine_ok = bool(validation.get("ok"))
        for issue in validation.get("issues") or []:
            if issue.get("severity") == "error":
                issues.append(issue)
    except Exception as exc:  # noqa: BLE001 - surface to pipeline
        issues.append({"severity": "error", "code": "engine_crash", "message": str(exc)})

    errors = [i for i in issues if i.get("severity") == "error"]
    status = STATUS_CHECKED if not errors and engine_ok else STATUS_REJECTED
    if errors and not engine_ok:
        status = STATUS_REJECTED
    elif errors:
        status = STATUS_REJECTED
    elif not engine_ok:
        status = STATUS_REJECTED
    else:
        status = STATUS_CHECKED

    pipeline = dict(pkg.get("pipeline") or {})
    pipeline.update(
        {
            "status": status,
            "checkedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
            "checker": "package_factory.checker",
            "checkIssues": issues,
            "engineValidation": {
                "ok": engine_ok,
                "status": validation.get("status"),
                "issueCount": len(validation.get("issues") or []),
            },
        }
    )
    pkg["pipeline"] = pipeline
    return {
        "ok": status == STATUS_CHECKED,
        "status": status,
        "package": pkg,
        "issues": issues,
    }
