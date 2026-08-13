"""Cheap catalog LLM for package/explore factories.

Uses Gemini (default) or Groq — NEVER the core OpenAI key used by Vero,
unless CATALOG_LLM_ALLOW_CORE=1 is explicitly set.

Env:
  CATALOG_LLM_PROVIDER=gemini|groq|none   (default: gemini if key present)
  GEMINI_API_KEY=...
  CATALOG_LLM_MODEL=gemini-2.5-flash      (or gemini-3.5-flash-lite, etc.)
  GROQ_API_KEY=...
  GROQ_MODEL=llama-3.3-70b-versatile
  CATALOG_LLM_ALLOW_CORE=0                # do not fall back to OPENAI_API_KEY
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_GEMINI_MODELS = (
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-flash-latest",
)


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def catalog_llm_status() -> dict[str, Any]:
    provider = resolve_provider()
    return {
        "provider": provider,
        "model": resolve_model(provider),
        "configured": provider != "none",
        "usesCoreOpenAI": provider == "openai",
        "role": "catalog_factory_only",
        "geminiKey": bool(_env("GEMINI_API_KEY") or _env("GOOGLE_API_KEY")),
        "groqKey": bool(_env("GROQ_API_KEY")),
        "fallbacks": list(_GEMINI_MODELS) if provider == "gemini" else [],
        "jsonMode": True,
    }


def resolve_provider() -> str:
    forced = _env("CATALOG_LLM_PROVIDER").lower()
    if forced in ("none", "off", "disabled"):
        return "none"
    if forced in ("gemini", "google"):
        return "gemini" if (_env("GEMINI_API_KEY") or _env("GOOGLE_API_KEY")) else "none"
    if forced == "groq":
        return "groq" if _env("GROQ_API_KEY") else "none"
    # Auto: prefer Gemini, then Groq. Never OpenAI.
    if _env("GEMINI_API_KEY") or _env("GOOGLE_API_KEY"):
        return "gemini"
    if _env("GROQ_API_KEY"):
        return "groq"
    if _env("CATALOG_LLM_ALLOW_CORE") in ("1", "true", "yes") and _env("OPENAI_API_KEY"):
        logger.warning("catalog_llm: CATALOG_LLM_ALLOW_CORE enabled — using OPENAI_API_KEY")
        return "openai"
    return "none"


def resolve_model(provider: str | None = None) -> str:
    provider = provider or resolve_provider()
    if provider == "gemini":
        return _env("CATALOG_LLM_MODEL") or _env("GEMINI_MODEL") or _GEMINI_MODELS[0]
    if provider == "groq":
        return _env("GROQ_MODEL") or "llama-3.3-70b-versatile"
    if provider == "openai":
        return _env("CATALOG_LLM_MODEL") or "gpt-4o-mini"
    return ""


def available() -> bool:
    return resolve_provider() != "none"


def _extract_json(text: str) -> Any:
    raw = (text or "").strip()
    if not raw:
        raise ValueError("empty LLM response")
    # Strip markdown fences
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if fence:
        raw = fence.group(1).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Find first array/object
        for opener, closer in (("[", "]"), ("{", "}")):
            start = raw.find(opener)
            end = raw.rfind(closer)
            if start >= 0 and end > start:
                try:
                    return json.loads(raw[start : end + 1])
                except json.JSONDecodeError:
                    continue
        raise


_GEMINI_SYSTEM = (
    "You are Itinero's catalog factory writer. "
    "Return valid JSON only matching the user schema. "
    "Prefer real world cities, seasons, and traveler markets. "
    "Never invent live prices or booking IDs. Keep blurbs vivid and concise."
)


def _gemini_generate(prompt: str, *, model: str, temperature: float = 0.4) -> str:
    key = _env("GEMINI_API_KEY") or _env("GOOGLE_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY not set")

    models = [model] + [m for m in _GEMINI_MODELS if m != model]
    last_err: Exception | None = None
    for mid in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{mid}:generateContent"
        payload = {
            "systemInstruction": {"parts": [{"text": _GEMINI_SYSTEM}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": "application/json",
                "maxOutputTokens": int(_env("CATALOG_LLM_MAX_TOKENS") or "4096"),
            },
        }
        try:
            with httpx.Client(timeout=90.0) as client:
                resp = client.post(url, params={"key": key}, json=payload)
            if resp.status_code >= 400:
                # Retry without systemInstruction for older model variants.
                if resp.status_code in (400, 404) and "systemInstruction" in payload:
                    payload.pop("systemInstruction", None)
                    with httpx.Client(timeout=90.0) as client:
                        resp = client.post(url, params={"key": key}, json=payload)
                if resp.status_code >= 400:
                    last_err = RuntimeError(f"Gemini {mid} HTTP {resp.status_code}: {resp.text[:300]}")
                    logger.warning("catalog_llm gemini model %s failed: %s", mid, last_err)
                    continue
            data = resp.json()
            parts = (
                ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
            )
            text = "".join(str(p.get("text") or "") for p in parts)
            if text.strip():
                logger.info("catalog_llm gemini ok model=%s chars=%s", mid, len(text))
                return text
            last_err = RuntimeError(f"Gemini {mid} empty candidates")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning("catalog_llm gemini error on %s: %s", mid, exc)
    raise RuntimeError(str(last_err or "Gemini generate failed"))


def _groq_generate(prompt: str, *, model: str, temperature: float = 0.4) -> str:
    key = _env("GROQ_API_KEY")
    if not key:
        raise RuntimeError("GROQ_API_KEY not set")
    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": model,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "You are a travel catalog writer. Reply with valid JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
    }
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            url,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"Groq HTTP {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    return str(((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "")


def _openai_generate(prompt: str, *, model: str, temperature: float = 0.4) -> str:
    """Opt-in only — not used for catalog by default."""
    key = _env("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set")
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": model,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "You are a travel catalog writer. Reply with valid JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
    }
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            url,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"OpenAI HTTP {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    return str(((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "")


def generate_json(prompt: str, *, temperature: float = 0.4) -> Any:
    """Call the cheap catalog LLM and parse JSON. Raises if unconfigured/failed."""
    provider = resolve_provider()
    if provider == "none":
        raise RuntimeError(
            "No catalog LLM configured. Set GEMINI_API_KEY (preferred) or GROQ_API_KEY. "
            "Core OPENAI_API_KEY is not used for catalog factories."
        )
    model = resolve_model(provider)
    if provider == "gemini":
        text = _gemini_generate(prompt, model=model, temperature=temperature)
    elif provider == "groq":
        text = _groq_generate(prompt, model=model, temperature=temperature)
    elif provider == "openai":
        text = _openai_generate(prompt, model=model, temperature=temperature)
    else:
        raise RuntimeError(f"Unknown catalog LLM provider: {provider}")
    return _extract_json(text)
