"""Vero filter — layover city → IATA and fallback parsing."""

from __future__ import annotations

from supervisor.vero_filter import _flight_fallback, _resolve_layover_places


def test_resolve_pattaya_typo():
    codes = _resolve_layover_places("i want stop at pataya")
    assert "UTP" in codes


def test_flight_fallback_stop_at_city():
    out = _flight_fallback("i want stop at pataya", ["flydubai", "IndiGo"])
    f = out["filters"]
    assert "UTP" in f["includeLayoverAirports"]
    assert "1 Stop" in f["stops"]
    assert "stop at" in out["summary"].lower()


def test_flight_fallback_via_iata():
    out = _flight_fallback("via DXB only", [])
    assert "DXB" in out["filters"]["includeLayoverAirports"]
