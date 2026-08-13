"""Indian Rail station catalog — city / name → IRCTC code.

Used by train search + the left-page typeahead. Prefer local aliases for
major cities (Baroda→BRC, Mumbai→MMCT), then this catalog for everywhere
else (Barmer→BME). Never invent a code.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

_DATA = Path(__file__).resolve().parent.parent / "data" / "ir_stations.json"
_CODE_RE = re.compile(r"^[A-Z]{2,5}$")
_STRIP = re.compile(
    r"\b(jn\.?|junction|railway station|rail station|station|rs|cantt\.?|cantonment|city|halt|h)\b",
    re.I,
)


def _fold(text: str) -> str:
    s = re.sub(r"[^a-z0-9\u0a80-\u0aff]+", " ", str(text or "").lower())
    s = _STRIP.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


@lru_cache(maxsize=1)
def _catalog() -> tuple[list[dict[str, str]], dict[str, dict[str, str]], dict[str, list[dict[str, str]]]]:
    try:
        rows = json.loads(_DATA.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        rows = []
    stations: list[dict[str, str]] = []
    by_code: dict[str, dict[str, str]] = {}
    by_name: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        code = str(row.get("code") or "").strip().upper()
        name = str(row.get("name") or "").strip()
        state = str(row.get("state") or "").strip()
        if not code or not name or not _CODE_RE.fullmatch(code):
            continue
        rec = {"code": code, "name": name, "state": state}
        stations.append(rec)
        by_code[code] = rec
        key = _fold(name)
        if key:
            by_name.setdefault(key, []).append(rec)
        short = _fold(re.sub(r"\b(jn|junction|cantt|city|halt)\b", " ", name, flags=re.I))
        if short and short != key:
            by_name.setdefault(short, []).append(rec)
    return stations, by_code, by_name


def catalog_station(code: str) -> dict[str, str] | None:
    c = str(code or "").strip().upper()
    if not c:
        return None
    return _catalog()[1].get(c)


def _score(query: str, rec: dict[str, str]) -> tuple[int, int, str]:
    q = _fold(query)
    code = rec["code"]
    name_f = _fold(rec["name"])
    name_l = rec["name"].lower()
    q_raw = str(query or "").strip().lower()
    if code.lower() == q_raw:
        rank = 0
    elif name_f == q:
        rank = 1
    elif name_f.startswith(q) or name_l.startswith(q_raw):
        rank = 2
    elif any(part.startswith(q) for part in name_f.split()):
        rank = 3
    elif q in name_f or q_raw in name_l:
        rank = 4
    else:
        rank = 9
    halt = 1 if re.search(r"\bhalt\b", rec["name"], re.I) else 0
    return (rank, halt, rec["name"])


def suggest_stations(query: str, limit: int = 8) -> list[dict[str, Any]]:
    """Typeahead: city or code → ranked IR stations."""
    raw = str(query or "").strip()
    if len(raw) < 2:
        return []
    stations, by_code, by_name = _catalog()
    q_fold = _fold(raw)
    q_up = raw.upper()
    hits: list[dict[str, str]] = []
    seen: set[str] = set()

    if _CODE_RE.fullmatch(q_up) and q_up in by_code:
        hits.append(by_code[q_up])
        seen.add(q_up)

    if q_fold and q_fold in by_name:
        for rec in by_name[q_fold]:
            if rec["code"] not in seen:
                hits.append(rec)
                seen.add(rec["code"])

    q_low = raw.lower()
    for rec in stations:
        if rec["code"] in seen:
            continue
        name_l = rec["name"].lower()
        if (
            rec["code"].lower().startswith(q_low)
            or name_l.startswith(q_low)
            or q_low in name_l
            or _fold(rec["name"]).startswith(q_fold)
        ):
            hits.append(rec)
            seen.add(rec["code"])
        if len(hits) >= 80:
            break

    ranked = sorted(hits, key=lambda r: _score(raw, r))[: max(1, min(int(limit or 8), 12))]
    out = []
    for rec in ranked:
        label = f"{rec['name']} ({rec['code']})"
        out.append(
            {
                "code": rec["code"],
                "name": rec["name"],
                "state": rec.get("state") or "",
                "label": label,
            }
        )
    return out


def resolve_from_catalog(place: str) -> tuple[str, str] | None:
    """Strict city→code. Exact / strong prefix only — no random first hit."""
    raw = str(place or "").strip()
    if not raw:
        return None
    _, by_code, by_name = _catalog()
    if _CODE_RE.fullmatch(raw.upper()):
        rec = by_code.get(raw.upper())
        if rec:
            return rec["code"], rec["name"]
        return raw.upper(), raw.upper()
    key = _fold(raw)
    if not key or len(key) < 3:
        return None
    exact = by_name.get(key) or []
    if len(exact) == 1:
        rec = exact[0]
        return rec["code"], rec["name"]
    if len(exact) > 1:
        exact_sorted = sorted(exact, key=lambda r: (1 if re.search(r"\bhalt\b", r["name"], re.I) else 0, len(r["name"]), r["code"]))
        rec = exact_sorted[0]
        return rec["code"], rec["name"]
    prefix = [
        rec
        for recs in by_name.values()
        for rec in recs
        if _fold(rec["name"]).startswith(key)
    ]
    # unique by code
    uniq: dict[str, dict[str, str]] = {}
    for rec in prefix:
        uniq[rec["code"]] = rec
    prefix = list(uniq.values())
    if len(prefix) == 1 and len(key) >= 4:
        rec = prefix[0]
        return rec["code"], rec["name"]
    return None
