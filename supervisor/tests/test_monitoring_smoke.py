"""Dependency probe smoke tests — Postgres, Redis, SMTP, Sentry."""

from __future__ import annotations

import httpx
import pytest

from helpers import assert_json


def test_health_includes_dependencies(api_client: httpx.Client):
    resp = api_client.get("/api/health")
    data = assert_json(resp, "health")
    assert resp.status_code == 200
    deps = data.get("dependencies") or {}
    assert deps, "expected dependencies block from /api/health"
    for key in ("postgres", "redis", "smtp", "sentry"):
        assert key in deps, f"missing dependency probe: {key}"
        probe = deps[key]
        assert probe.get("status") in {"unset", "ready", "error"}
        assert "ok" in probe
        assert "configured" in probe


def test_readiness_includes_dependencies(api_client: httpx.Client):
    resp = api_client.get("/api/health/ready")
    data = assert_json(resp, "health_ready")
    assert resp.status_code in {200, 503}
    assert "dependencies" in data
    assert "missing" in data
    assert isinstance(data["missing"], list)


def test_monitoring_module_probes():
    from supervisor.monitoring import (
        check_postgres,
        check_redis,
        check_sentry,
        check_smtp,
        dependency_report,
    )

    report = dependency_report()
    assert "ok" in report
    for key in ("postgres", "redis", "smtp", "sentry"):
        assert key in report
        assert report[key]["status"] in {"unset", "ready", "error"}

    # Individual probes should return consistent shape.
    for probe in (check_postgres(), check_redis(), check_smtp(), check_sentry()):
        assert "status" in probe
        assert "ok" in probe
        assert "configured" in probe
