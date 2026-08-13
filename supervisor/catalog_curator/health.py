"""Page + catalog health checks for Explore and Packages."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from . import STATUS_DEGRADED, STATUS_FAILED, STATUS_HEALTHY

_ROOT = Path(__file__).resolve().parents[2]
_ROUTER = _ROOT / "itinero" / "src" / "app" / "router.jsx"
_PACKAGES_PAGE = _ROOT / "itinero" / "src" / "features" / "packages" / "PackagesPage.jsx"
_EXPLORE_PAGE = _ROOT / "itinero" / "src" / "features" / "explore" / "ExplorePage.jsx"


def _issue(severity: str, code: str, message: str, **extra: Any) -> dict[str, Any]:
    row = {"severity": severity, "code": code, "message": message}
    row.update(extra)
    return row


def check_spa_routes() -> dict[str, Any]:
    """Ensure SPA still mounts /explore and /packages."""
    issues: list[dict[str, Any]] = []
    if not _ROUTER.exists():
        return {
            "ok": False,
            "status": STATUS_FAILED,
            "issues": [_issue("error", "missing_router", f"Missing {_ROUTER}")],
        }

    text = _ROUTER.read_text(encoding="utf-8")
    for route in ("/packages", "/packages/:slug", "/explore", "/explore/:slug"):
        # JSX: path="/packages" or path='/packages'
        if not re.search(rf'path=["\']{re.escape(route)}["\']', text):
            issues.append(_issue("error", "missing_route", f"Router missing {route}"))

    for path, label in (
        (_PACKAGES_PAGE, "PackagesPage"),
        (_EXPLORE_PAGE, "ExplorePage"),
    ):
        if not path.exists():
            issues.append(_issue("error", "missing_page", f"Missing {label} at {path}"))

    # Hydration / market wiring still present
    if _PACKAGES_PAGE.exists():
        pkg = _PACKAGES_PAGE.read_text(encoding="utf-8")
        if "market" not in pkg or "packageService" not in pkg:
            issues.append(
                _issue(
                    "warning",
                    "packages_market_wiring",
                    "PackagesPage may not pass market to packageService.list",
                )
            )
    if _EXPLORE_PAGE.exists():
        exp = _EXPLORE_PAGE.read_text(encoding="utf-8")
        if "hydrateCatalog" not in exp and "exploreService" not in exp:
            issues.append(
                _issue(
                    "warning",
                    "explore_hydrate_wiring",
                    "ExplorePage may not hydrate remote catalog",
                )
            )

    errors = [i for i in issues if i["severity"] == "error"]
    status = STATUS_FAILED if errors else (STATUS_DEGRADED if issues else STATUS_HEALTHY)
    return {"ok": not errors, "status": status, "issues": issues}


def check_packages_catalog(*, markets: list[str] | None = None) -> dict[str, Any]:
    from supervisor.packages_structured import list_packages

    issues: list[dict[str, Any]] = []
    markets = [m.upper() for m in (markets or ["US", "IN"])]
    per_market: dict[str, Any] = {}

    for market in markets:
        res = list_packages(market=market)
        pkgs = res.get("packages") or []
        per_market[market] = {"total": len(pkgs)}
        if len(pkgs) < 3:
            issues.append(
                _issue(
                    "error",
                    "packages_too_few",
                    f"Packages for market={market} only has {len(pkgs)} rows",
                    market=market,
                )
            )

        for pkg in pkgs:
            for field in ("id", "slug", "title", "region", "markets"):
                if not pkg.get(field) and pkg.get(field) != 0:
                    issues.append(
                        _issue(
                            "error",
                            "package_missing_field",
                            f"{pkg.get('slug') or '?'} missing {field}",
                            market=market,
                        )
                    )
                    break

        domestic = [p for p in pkgs if str(p.get("region") or "").lower() == "domestic"]
        if market == "US":
            us_dom = [
                p
                for p in domestic
                if "US" in [str(m).upper() for m in (p.get("markets") or [])]
            ]
            india_leak = [
                p
                for p in domestic
                if package_looks_india_only(p)
            ]
            per_market[market]["domestic"] = len(domestic)
            per_market[market]["usDomestic"] = len(us_dom)
            if len(us_dom) < 1:
                issues.append(
                    _issue(
                        "error",
                        "us_packages_no_domestic",
                        "US market has no US domestic packages - Packages page will feel India-empty",
                        market=market,
                    )
                )
            if india_leak:
                issues.append(
                    _issue(
                        "error",
                        "us_packages_india_leak",
                        f"US market still surfaces India domestic: {[p.get('slug') for p in india_leak[:5]]}",
                        market=market,
                    )
                )
        elif market == "IN":
            if len(domestic) < 1:
                issues.append(
                    _issue(
                        "error",
                        "in_packages_no_domestic",
                        "IN market has no domestic packages",
                        market=market,
                    )
                )

    # Worldwide international floor (visible via markets=["*"])
    world = list_packages()
    intl = [
        p
        for p in (world.get("packages") or [])
        if str(p.get("region") or "").lower() == "international"
    ]
    per_market["WORLD"] = {"international": len(intl), "total": world.get("total")}
    if len(intl) < 8:
        issues.append(
            _issue(
                "error",
                "world_packages_thin",
                f"Only {len(intl)} international packages - worldwide catalog too thin",
            )
        )

    errors = [i for i in issues if i["severity"] == "error"]
    status = STATUS_FAILED if errors else (STATUS_DEGRADED if issues else STATUS_HEALTHY)
    return {
        "ok": not errors,
        "status": status,
        "issues": issues,
        "markets": per_market,
    }


def package_looks_india_only(pkg: dict[str, Any]) -> bool:
    markets = [str(m).upper() for m in (pkg.get("markets") or [])]
    if "US" in markets or "*" in markets or "GLOBAL" in markets:
        return False
    if markets == ["IN"] and str(pkg.get("region") or "").lower() == "domestic":
        return True
    region = str(pkg.get("region") or "").lower()
    if region != "domestic":
        return False
    blob = " ".join(
        [
            str(pkg.get("title") or ""),
            " ".join(pkg.get("destinations") or []),
        ]
    ).lower()
    return bool(
        re.search(
            r"\b(india|chardham|goa|manali|kashmir|varanasi|udaipur|jaipur|leh)\b",
            blob,
        )
    )


def check_explore_catalog(*, markets: list[str] | None = None) -> dict[str, Any]:
    from supervisor.explore_structured import list_destinations

    issues: list[dict[str, Any]] = []
    markets = [m.upper() for m in (markets or ["US", "IN"])]
    per_market: dict[str, Any] = {}

    for market in markets:
        res = list_destinations(market=market)
        dests = res.get("destinations") or []
        per_market[market] = {"total": len(dests)}
        if len(dests) < 10:
            issues.append(
                _issue(
                    "error",
                    "explore_too_few",
                    f"Explore for market={market} only has {len(dests)} destinations",
                    market=market,
                )
            )

        missing_geo = [
            d.get("slug")
            for d in dests
            if d.get("lat") is None or d.get("lng") is None
        ]
        if missing_geo:
            issues.append(
                _issue(
                    "error",
                    "explore_missing_coords",
                    f"{len(missing_geo)} destinations missing lat/lng (map breaks)",
                    market=market,
                    samples=missing_geo[:8],
                )
            )

        for dest in dests[:50]:
            for field in ("id", "slug", "city", "country", "continent", "blurb", "markets"):
                if not dest.get(field) and dest.get(field) != 0:
                    issues.append(
                        _issue(
                            "error",
                            "explore_missing_field",
                            f"{dest.get('slug') or '?'} missing {field}",
                            market=market,
                        )
                    )
                    break

        if market == "US":
            usa = [d for d in dests if str(d.get("country") or "") in ("USA", "United States")]
            per_market[market]["usa"] = len(usa)
            if len(usa) < 5:
                issues.append(
                    _issue(
                        "error",
                        "us_explore_thin",
                        f"US Explore only has {len(usa)} USA destinations",
                        market=market,
                    )
                )
        elif market == "IN":
            india = [
                d
                for d in dests
                if str(d.get("continent") or "") == "india" or str(d.get("country") or "") == "India"
            ]
            per_market[market]["india"] = len(india)
            if len(india) < 5:
                issues.append(
                    _issue(
                        "error",
                        "in_explore_thin",
                        f"IN Explore only has {len(india)} India destinations",
                        market=market,
                    )
                )

    errors = [i for i in issues if i["severity"] == "error"]
    status = STATUS_FAILED if errors else (STATUS_DEGRADED if issues else STATUS_HEALTHY)
    return {
        "ok": not errors,
        "status": status,
        "issues": issues,
        "markets": per_market,
    }


def probe_http_pages(
    base_url: str,
    *,
    markets: list[str] | None = None,
    timeout: float = 8.0,
) -> dict[str, Any]:
    """Hit live supervisor endpoints the SPA uses for Explore + Packages."""
    issues: list[dict[str, Any]] = []
    base = base_url.rstrip("/")
    markets = [m.upper() for m in (markets or ["US", "IN"])]
    results: dict[str, Any] = {}

    for market in markets:
        for path, key in (
            ("/api/packages", "packages"),
            ("/api/explore/destinations", "explore"),
        ):
            url = f"{base}{path}?{urlencode({'market': market})}"
            label = f"{key}:{market}"
            try:
                req = Request(url, headers={"Accept": "application/json"})
                with urlopen(req, timeout=timeout) as resp:
                    body = resp.read().decode("utf-8", errors="replace")
                    data = json.loads(body) if body else {}
                    status = getattr(resp, "status", 200)
            except HTTPError as exc:
                issues.append(
                    _issue("error", "http_error", f"{label} → HTTP {exc.code}", url=url)
                )
                results[label] = {"ok": False, "status": exc.code}
                continue
            except (URLError, TimeoutError, json.JSONDecodeError) as exc:
                issues.append(
                    _issue("error", "http_unreachable", f"{label} failed: {exc}", url=url)
                )
                results[label] = {"ok": False, "error": str(exc)}
                continue

            if key == "packages":
                total = int((data or {}).get("total") or len((data or {}).get("packages") or []))
            else:
                total = int((data or {}).get("total") or len((data or {}).get("destinations") or []))
            results[label] = {"ok": True, "status": status, "total": total}
            if total < 1:
                issues.append(
                    _issue("error", "http_empty", f"{label} returned empty catalog", url=url)
                )

    errors = [i for i in issues if i["severity"] == "error"]
    status = STATUS_FAILED if errors else (STATUS_DEGRADED if issues else STATUS_HEALTHY)
    return {
        "ok": not errors,
        "status": status,
        "issues": issues,
        "results": results,
        "baseUrl": base,
    }


def run_health(
    *,
    markets: list[str] | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    """Full health report for curator."""
    spa = check_spa_routes()
    packages = check_packages_catalog(markets=markets)
    explore = check_explore_catalog(markets=markets)
    http = (
        probe_http_pages(base_url, markets=markets)
        if base_url
        else {"ok": True, "status": STATUS_HEALTHY, "issues": [], "skipped": True}
    )

    try:
        from supervisor.catalog_llm import catalog_llm_status

        llm = catalog_llm_status()
    except Exception as exc:  # noqa: BLE001
        llm = {"provider": "none", "configured": False, "error": str(exc)}

    if not llm.get("configured"):
        # Warning only — seed bank still works offline.
        packages = dict(packages)
        packages["issues"] = list(packages.get("issues") or []) + [
            _issue(
                "warning",
                "catalog_llm_missing",
                "GEMINI_API_KEY (or GROQ_API_KEY) not set — factories use seed bank only, not core OpenAI",
            )
        ]

    parts = [spa, packages, explore, http]
    all_issues = []
    for part in parts:
        all_issues.extend(part.get("issues") or [])

    errors = [i for i in all_issues if i.get("severity") == "error"]
    warnings = [i for i in all_issues if i.get("severity") == "warning"]
    if errors:
        status = STATUS_FAILED
    elif warnings:
        status = STATUS_DEGRADED
    else:
        status = STATUS_HEALTHY

    return {
        "ok": status != STATUS_FAILED,
        "status": status,
        "issueCount": len(all_issues),
        "errorCount": len(errors),
        "warningCount": len(warnings),
        "catalogLlm": llm,
        "spa": spa,
        "packages": packages,
        "explore": explore,
        "http": http,
        "issues": all_issues,
    }
