"""Visa & Immigration agent — retrieve official pages, then interpret.

Never hard-code visa-free days or nationality rules. Tavily finds pages;
official page text is the evidence; the LLM only explains that evidence.
"""
from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import requests
from langchain_core.messages import HumanMessage, SystemMessage

from general_agent.config import MODEL_NAME, OPENAI_API_KEY, TAVILY_API_KEY
from services import visa_registry

logger = logging.getLogger(__name__)

_PAGE_CACHE: dict[str, tuple[float, str]] = {}
_PAGE_TTL = 24 * 3600
_UA = (
    "Mozilla/5.0 (compatible; ItineroVisaBot/1.0; +https://itinero.example) "
    "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
)
_INTERPRETER_SYSTEM = """You are Vero's Visa & Immigration interpreter.
You ONLY use the retrieved official documents provided. You have NO authority
to recall visa-free days, ETA lists, or transit exemptions from memory.

Rules:
- Every material claim must cite a source URL from the documents.
- If the documents do not clearly cover this nationality + destination + purpose, confidence=unknown.
- Level 1 (government / border / official eVisa) beats Level 2–4.
- If Level 1 and an airline/IATA source disagree, do NOT quietly pick one. Put it in conflicts.
- Never invent passport-validity months, blank-page rules, or insurance amounts.
- Airside vs landside transit: only if the documents distinguish them.
- Separate tickets / self-transfer: flag uncertainty if docs don't cover it.
- Output STRICT JSON matching the schema. No markdown outside JSON.

JSON schema:
{
  "headline": "one-line answer",
  "claims": [
    {
      "topic": "entry_visa|transit_visa|eta|passport_validity|onward_ticket|funds|insurance|vaccination|minors|length_of_stay|other",
      "statement": "...",
      "conditions": ["..."],
      "confidence": "high|medium|low|unknown",
      "source_urls": ["https://..."]
    }
  ],
  "conflicts": [
    {
      "topic": "...",
      "government": "...",
      "other": "...",
      "recommendation": "Because the airline controls boarding, confirm with the airline."
    }
  ],
  "missing": ["facts still needed from the traveller"],
  "documents_needed": ["..."],
  "disclaimer": "Border and airline authorities make the final determination."
}
"""


def _html_to_text(html: str) -> str:
    text = html or ""
    text = re.sub(r"(?is)<(script|style|noscript|svg|nav|footer|header)[^>]*>.*?</\1>", " ", text)
    text = re.sub(r"(?is)<br\s*/?>", "\n", text)
    text = re.sub(r"(?is)</(p|div|h[1-6]|li|tr)>", "\n", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"&#39;", "'", text)
    text = re.sub(r"&\w+;", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def fetch_page_text(url: str, *, max_chars: int = 9000) -> str:
    cached = _PAGE_CACHE.get(url)
    if cached and time.time() - cached[0] < _PAGE_TTL:
        return cached[1]
    try:
        resp = requests.get(
            url,
            timeout=18,
            headers={"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml"},
            allow_redirects=True,
        )
        resp.raise_for_status()
        ctype = (resp.headers.get("content-type") or "").lower()
        if "pdf" in ctype:
            text = f"[PDF at {url} — open the official link; text not extracted]"
        else:
            text = _html_to_text(resp.text or "")[:max_chars]
    except requests.exceptions.RequestException as exc:
        logger.info("Visa page fetch failed %s: %s", url, exc)
        text = ""
    _PAGE_CACHE[url] = (time.time(), text)
    return text


def _tavily_search(query: str, include_domains: list[str], max_results: int = 5) -> list[dict[str, Any]]:
    if not (TAVILY_API_KEY or "").strip():
        return []
    try:
        from tavily import TavilyClient

        client = TavilyClient(api_key=TAVILY_API_KEY.strip())
        kwargs: dict[str, Any] = {"query": query, "max_results": max_results, "search_depth": "advanced"}
        if include_domains:
            kwargs["include_domains"] = include_domains[:8]
        data = client.search(**kwargs) or {}
    except Exception as exc:
        logger.warning("Tavily visa search failed: %s", exc)
        return []
    hits = []
    for row in data.get("results") or []:
        if not isinstance(row, dict):
            continue
        url = str(row.get("url") or "").strip()
        if not url.startswith("http"):
            continue
        hits.append(
            {
                "url": url,
                "title": str(row.get("title") or "").strip(),
                "snippet": str(row.get("content") or row.get("snippet") or "").strip()[:800],
            }
        )
    return hits


def _split_codes(raw: str) -> list[str]:
    parts = re.split(r"[,;/|+]| and | then ", raw or "", flags=re.I)
    codes = []
    for p in parts:
        cc = visa_registry.resolve_country_code(p.strip())
        if cc and cc not in codes:
            codes.append(cc)
    return codes


def _traveler_block(
    *,
    passport_nationality: str,
    destination: str,
    transit_countries: str,
    residence: str,
    visas_held: str,
    travel_dates: str,
    purpose: str,
    passport_expiry: str,
    tickets: str,
    question: str,
    dest_cc: str,
    transit_ccs: list[str],
    nat_cc: str,
) -> str:
    assumed = ""
    lines = [
        f"Passport nationality: {passport_nationality or nat_cc or 'unknown'}{assumed}",
        f"Destination: {destination} ({dest_cc or 'unresolved'})",
        f"Transit: {transit_countries or 'none stated'} ({', '.join(transit_ccs) or 'n/a'})",
        f"Residence: {residence or 'not stated'}",
        f"Visas already held: {visas_held or 'not stated'}",
        f"Travel dates: {travel_dates or 'not stated'}",
        f"Purpose: {purpose or 'tourism'}",
        f"Passport expiry: {passport_expiry or 'not stated'}",
        f"Tickets / baggage: {tickets or 'not stated'}",
        f"User question: {question or 'visa / entry / transit requirements'}",
    ]
    return "\n".join(lines)


def _interpret(traveler: str, documents: list[dict[str, Any]]) -> dict[str, Any]:
    from langchain_openai import ChatOpenAI

    doc_blocks = []
    for i, d in enumerate(documents, start=1):
        doc_blocks.append(
            f"--- DOC {i} | level={d.get('level')} | {d.get('authority') or d.get('title')} | {d['url']} ---\n"
            f"{(d.get('text') or d.get('snippet') or '')[:8000]}"
        )
    human = (
        f"TRAVELLER + JOURNEY\n{traveler}\n\n"
        f"RETRIEVED DOCUMENTS (use only these)\n" + "\n\n".join(doc_blocks)
    )
    llm = ChatOpenAI(
        model=MODEL_NAME or "gpt-4o-mini",
        temperature=0,
        api_key=OPENAI_API_KEY,
        max_retries=3,
    )
    try:
        resp = llm.invoke(
            [SystemMessage(content=_INTERPRETER_SYSTEM), HumanMessage(content=human)]
        )
        raw = str(getattr(resp, "content", "") or "").strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw).strip()
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("not an object")
        return data
    except Exception as exc:
        logger.warning("Visa interpreter failed: %s", exc)
        return {
            "headline": "Could not interpret the official pages automatically.",
            "claims": [
                {
                    "topic": "other",
                    "statement": "Open the official sources below. Do not treat this as a visa decision.",
                    "conditions": [],
                    "confidence": "unknown",
                    "source_urls": [d["url"] for d in documents if d.get("url")],
                }
            ],
            "conflicts": [],
            "missing": [],
            "documents_needed": [],
            "disclaimer": "Border and airline authorities make the final determination.",
        }


def _format_reply(
    *,
    interpreted: dict[str, Any],
    traveler_lines: str,
    dest_cc: str,
    transit_ccs: list[str],
    nat_cc: str,
    official_links: list[dict[str, Any]],
    retrieved_at: str,
) -> str:
    claims = interpreted.get("claims") if isinstance(interpreted.get("claims"), list) else []
    conflicts = interpreted.get("conflicts") if isinstance(interpreted.get("conflicts"), list) else []
    missing = interpreted.get("missing") if isinstance(interpreted.get("missing"), list) else []
    docs = interpreted.get("documents_needed") if isinstance(interpreted.get("documents_needed"), list) else []
    headline = str(interpreted.get("headline") or "See official sources.").strip()
    disclaimer = str(
        interpreted.get("disclaimer")
        or "Border and airline authorities make the final determination."
    ).strip()

    lines = [
        f"**{headline}**",
        "",
        f"**Passport:** {nat_cc or 'unknown'} · **Destination:** {dest_cc or 'unknown'}"
        + (f" · **Transit:** {', '.join(transit_ccs)}" if transit_ccs else ""),
        f"**Checked:** {retrieved_at}",
        "",
    ]
    if claims:
        lines.append("**What the official sources say**")
        for c in claims[:8]:
            if not isinstance(c, dict):
                continue
            topic = str(c.get("topic") or "note").replace("_", " ").title()
            stmt = str(c.get("statement") or "").strip()
            conf = str(c.get("confidence") or "unknown")
            conds = [str(x) for x in (c.get("conditions") or []) if str(x).strip()]
            urls = [str(u) for u in (c.get("source_urls") or []) if str(u).startswith("http")]
            if not stmt:
                continue
            lines.append(f"- **{topic}** ({conf}): {stmt}")
            for cond in conds[:4]:
                lines.append(f"  - Condition: {cond}")
            if urls:
                lines.append(f"  - Source: {urls[0]}")
        lines.append("")
    if conflicts:
        lines.append("**Conflicting guidance**")
        for c in conflicts[:4]:
            if not isinstance(c, dict):
                continue
            gov = str(c.get("government") or "").strip()
            other = str(c.get("other") or "").strip()
            rec = str(c.get("recommendation") or "").strip()
            lines.append(
                f"- Government/official: {gov or '—'}. Other source: {other or '—'}. "
                + (rec or "Confirm with the airline before travel — they control boarding.")
            )
        lines.append("")
    if docs:
        lines.append("**Documents often mentioned**")
        for d in docs[:8]:
            lines.append(f"- {d}")
        lines.append("")
    if missing:
        lines.append("**Still needed from you:** " + "; ".join(str(m) for m in missing[:6]))
        lines.append("")
    if official_links:
        lines.append("**Official sources**")
        for link in official_links[:8]:
            title = link.get("title") or link.get("authority") or "Official page"
            url = link.get("url") or ""
            lvl = link.get("level")
            lvl_s = f" · L{lvl}" if lvl else ""
            if url:
                lines.append(f"- [{title}]({url}){lvl_s}")
        lines.append("")
    lines.append(f"**Important:** {disclaimer}")
    lines.append("Do not invent a different visa rule. I cannot override immigration or an airline.")
    return "\n".join(lines).strip()


def check_visa(
    *,
    destination: str,
    passport_nationality: str = "",
    transit_countries: str = "",
    residence: str = "",
    visas_held: str = "",
    travel_dates: str = "",
    purpose: str = "tourism",
    passport_expiry: str = "",
    tickets: str = "",
    question: str = "",
) -> dict[str, Any]:
    """Retrieve official sources + interpret. Returns {text, cards, payload}."""
    dest_cc = visa_registry.resolve_country_code(destination)
    transit_ccs = _split_codes(transit_countries)
    nat_cc = visa_registry.resolve_country_code(passport_nationality) or ""

    if not dest_cc:
        return {
            "text": (
                "Need a destination country (or city/airport) to check visas. "
                "E.g. Thailand, UK, Heathrow, US. Do not guess a world visa list."
            ),
            "cards": None,
            "payload": None,
        }
    if not (passport_nationality or "").strip() and not nat_cc:
        return {
            "text": (
                "Need passport nationality (e.g. Indian, US, GB). "
                "I will not assume Indian — and I will not invent visa-free rules from memory."
            ),
            "cards": None,
            "payload": None,
        }

    dest_nat_same = dest_cc == nat_cc and dest_cc not in {"SCHENGEN"} and not transit_ccs
    if dest_nat_same:
        return {
            "text": (
                f"This looks domestic for passport {nat_cc} → {dest_cc}. "
                "No foreign visa. If they meant a different passport or an international "
                "connection, tell me nationality + transit/destination."
            ),
            "cards": None,
            "payload": None,
        }

    codes = [dest_cc, *transit_ccs]
    registry_rows = visa_registry.sources_for_countries(codes)
    official_hosts = visa_registry.official_domains(codes)
    retrieved_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    documents: list[dict[str, Any]] = []
    official_links: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    def _add_doc(url: str, *, title: str, authority: str, level: int, kind: str, text: str = "", snippet: str = ""):
        if not url or url in seen_urls:
            return
        seen_urls.add(url)
        official_links.append(
            {
                "name": title,
                "title": title,
                "authority": authority,
                "url": url,
                "level": level,
                "kind": kind,
                "website_url": url,
                "type": f"Official L{level}",
            }
        )
        documents.append(
            {
                "url": url,
                "title": title,
                "authority": authority,
                "level": level,
                "kind": kind,
                "text": text or snippet,
                "snippet": snippet,
                "retrieved_at": retrieved_at,
            }
        )

    for rec in registry_rows:
        authority = str(rec.get("immigration_authority") or rec.get("name") or rec.get("code"))
        code = rec.get("code") or ""
        level = int(rec.get("level") or 1)
        for kind, url in visa_registry.official_urls(rec):
            title = f"{authority} — {kind.replace('_', ' ')}"
            if code and code not in {"_GLOBAL", "SCHENGEN"}:
                title = f"{rec.get('name') or code}: {title}"
            _add_doc(url, title=title, authority=authority, level=level, kind=kind)

    nat_label = passport_nationality or nat_cc or "passport"
    dest_label = destination or dest_cc
    transit_label = transit_countries or (" ".join(transit_ccs) if transit_ccs else "")
    purpose_l = (purpose or "tourism").strip() or "tourism"

    queries = [
        f"{nat_label} passport {purpose_l} visa requirements {dest_label} official government",
    ]
    if transit_ccs:
        queries.append(
            f"{nat_label} passport transit visa {transit_label} to {dest_label} "
            f"{visas_held or ''} official government".strip()
        )
        if dest_cc == "US" or "US" in transit_ccs:
            queries.append(
                f"{nat_label} passport UK landside airside transit visa exemption "
                f"valid US visa Heathrow official site:gov.uk"
            )
    if visas_held:
        queries.append(
            f"{nat_label} passport holding {visas_held} entry or transit {dest_label} {transit_label} official"
        )

    tavily_hits: list[dict[str, Any]] = []
    for q in queries[:3]:
        tavily_hits.extend(_tavily_search(q, official_hosts or [], max_results=4))

    # If official-domain search is thin, one broader search — still ranked by level.
    if len(tavily_hits) < 2:
        tavily_hits.extend(
            _tavily_search(
                f"{nat_label} passport visa {dest_label} {transit_label} {purpose_l}",
                [],
                max_results=4,
            )
        )

    tavily_hits.sort(key=lambda h: visa_registry.classify_url_level(h["url"], official_hosts))
    for hit in tavily_hits:
        url = hit["url"]
        level = visa_registry.classify_url_level(url, official_hosts)
        if level >= 4 and len(documents) >= 4:
            continue
        host = (urlparse(url).hostname or "").replace("www.", "")
        title = hit.get("title") or host
        _add_doc(
            url,
            title=title,
            authority=host,
            level=level,
            kind="search",
            snippet=hit.get("snippet") or "",
        )
        if len(documents) >= 8:
            break

    qlow = f"{question} {purpose} {transit_countries}".lower()
    wants_transit = bool(transit_ccs) or any(
        w in qlow for w in ("transit", "airside", "landside", "connection", "layover", "heathrow", "lhr")
    )
    fetch_budget = 0
    for doc in documents:
        if fetch_budget >= 5:
            break
        kind = str(doc.get("kind") or "")
        level = int(doc.get("level") or 9)
        if level > 2:
            continue
        if len(str(doc.get("text") or "")) >= 80:
            continue
        if kind in {"visa", "search"} or (wants_transit and kind == "transit") or (
            not wants_transit and kind in {"eta", "entry"}
        ):
            fetched = fetch_page_text(doc["url"])
            if fetched:
                doc["text"] = fetched
                fetch_budget += 1

    l1_with_text = [d for d in documents if d.get("level") == 1 and len(str(d.get("text") or "")) > 80]
    if not l1_with_text and not any(d.get("text") or d.get("snippet") for d in documents):
        links_md = "\n".join(
            f"- [{x.get('title')}]({x.get('url')})" for x in official_links[:6] if x.get("url")
        )
        return {
            "text": (
                "Could not retrieve official immigration pages right now. "
                "Do not guess visa-free / transit rules. Open these government sources:\n"
                f"{links_md}\n\n"
                "Border and airline authorities make the final determination."
            ),
            "cards": {
                "type": "visa_sources",
                "title": "Official sources",
                "subtitle": retrieved_at,
                "items": official_links[:8],
            } if official_links else None,
            "payload": None,
        }

    traveler = _traveler_block(
        passport_nationality=passport_nationality,
        destination=destination,
        transit_countries=transit_countries,
        residence=residence,
        visas_held=visas_held,
        travel_dates=travel_dates,
        purpose=purpose,
        passport_expiry=passport_expiry,
        tickets=tickets,
        question=question,
        dest_cc=dest_cc,
        transit_ccs=transit_ccs,
        nat_cc=nat_cc,
    )
    usable = [d for d in documents if (d.get("text") or d.get("snippet"))][:8]
    interpreted = _interpret(traveler, usable)
    text = _format_reply(
        interpreted=interpreted,
        traveler_lines=traveler,
        dest_cc=dest_cc,
        transit_ccs=transit_ccs,
        nat_cc=nat_cc,
        official_links=official_links,
        retrieved_at=retrieved_at,
    )
    cards = None
    if official_links:
        cards = {
            "type": "visa_sources",
            "title": "Official sources",
            "subtitle": f"Checked {retrieved_at}",
            "items": official_links[:8],
        }
    payload = {
        "traveler": traveler,
        "destination_code": dest_cc,
        "transit_codes": transit_ccs,
        "nationality_code": nat_cc,
        "retrieved_at": retrieved_at,
        "interpreted": interpreted,
        "sources": [
            {
                "url": d["url"],
                "authority": d.get("authority"),
                "level": d.get("level"),
                "retrieved_at": retrieved_at,
            }
            for d in usable
        ],
    }
    return {"text": text, "cards": cards, "payload": payload}


def check_visa_summary(**kwargs: Any) -> str:
    try:
        return check_visa(**kwargs)["text"]
    except Exception as exc:
        return f"Visa lookup failed: {exc}. Do not invent immigration rules."
