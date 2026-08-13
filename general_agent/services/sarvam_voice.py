"""Sarvam AI speech — STT (Saaras) + TTS (Bulbul) for Vero voice mode.

Key stays on the server. Indian languages (Gujarati, Hindi, Tamil, …) are
first-class; unknown / non-Indic audio still transcribes when Saaras can,
and TTS falls back to en-IN if the tag isn't supported.
"""
from __future__ import annotations

import base64
import logging
import re
from typing import Any, Optional

import requests

from general_agent.config import SARVAM_API_KEY

logger = logging.getLogger(__name__)

SARVAM_BASE = "https://api.sarvam.ai"

TTS_LANGS = {
    "en-IN",
    "hi-IN",
    "bn-IN",
    "ta-IN",
    "te-IN",
    "kn-IN",
    "ml-IN",
    "mr-IN",
    "pa-IN",
    "od-IN",
    "gu-IN",
}

_LANG_ALIASES = {
    "en": "en-IN",
    "en-us": "en-IN",
    "en-gb": "en-IN",
    "hi": "hi-IN",
    "gu": "gu-IN",
    "bn": "bn-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "kn": "kn-IN",
    "ml": "ml-IN",
    "mr": "mr-IN",
    "pa": "pa-IN",
    "or": "od-IN",
    "od": "od-IN",
    "ar": "ar",
    "es": "es",
    "fr": "fr",
    "de": "de",
    "pt": "pt-BR",
    "ru": "ru",
    "it": "it",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "zh": "zh-CN",
    "th": "th-TH",
    "vi": "vi",
    "ms": "ms",
    "id": "id",
    "pl": "pl",
    "tr": "tr",
    "nl": "nl",
}

_GUJ_ROMAN_RE = re.compile(
    r"\b(kem|chho|chhe|cho|shu\s+che|su\s+che|baro|barabar|kyare|aavu|avu|maja|maza)\b",
    re.IGNORECASE,
)
_HI_ROMAN_RE = re.compile(
    r"\b(kya|hai|hain|mujhe|chahiye|kitna|kahan|theek|accha|acha|namaste|bhai)\b",
    re.IGNORECASE,
)


def has_sarvam_key() -> bool:
    return bool((SARVAM_API_KEY or "").strip())


def normalize_lang(tag: str | None, fallback: str = "en-IN") -> str:
    raw = (tag or "").strip()
    if not raw:
        return fallback
    if raw in TTS_LANGS:
        return raw
    lower = raw.lower().replace("_", "-")
    if lower in _LANG_ALIASES:
        return _LANG_ALIASES[lower]
    base = lower.split("-", 1)[0]
    if base in _LANG_ALIASES:
        return _LANG_ALIASES[base]
    for full in TTS_LANGS:
        if full.lower() == lower or full.lower().startswith(base + "-"):
            return full
    return fallback


def is_latin_majority(text: str) -> bool:
    letters = [c for c in (text or "") if c.isalpha()]
    if len(letters) < 2:
        return True
    latin = sum(1 for c in letters if ord(c) < 128)
    return latin / len(letters) > 0.7


_SLOT_FILL_RE = re.compile(
    r"^\s*("
    r"\d{1,2}\s*(?:st|nd|rd|th)?\s+\w+"
    r"|\w+\s+\d{1,2}(?:st|nd|rd|th)?"
    r"|20\d{2}-\d{2}-\d{2}"
    r"|yes|yeah|yep|ok|okay|haan|haa|sure|no|nope"
    r"|one\s*way|round\s*trip|return|oneway"
    r"|વન\s*વે|એક\s*તરફ|રાઉન્ડ|રિટર્ન"
    r"|वन\s*वे|एक\s*तरफा"
    r"|two|2|બે(?:\s*લોક(?:ો)?)?|दो(?:\s*लोग)?"
    r"|બરાબર|ठीक|theek"
    r")\s*[.!]?\s*$",
    re.IGNORECASE,
)


def detect_script_lang(text: str) -> str | None:
    """Language from native script only — never roman-word heuristics."""
    sample = text or ""
    if any("\u0A80" <= ch <= "\u0AFF" for ch in sample):
        return "gu-IN"
    if any("\u0A00" <= ch <= "\u0A7F" for ch in sample):
        return "pa-IN"
    if any("\u0980" <= ch <= "\u09FF" for ch in sample):
        return "bn-IN"
    if any("\u0B80" <= ch <= "\u0BFF" for ch in sample):
        return "ta-IN"
    if any("\u0C00" <= ch <= "\u0C7F" for ch in sample):
        return "te-IN"
    if any("\u0C80" <= ch <= "\u0CFF" for ch in sample):
        return "kn-IN"
    if any("\u0D00" <= ch <= "\u0D7F" for ch in sample):
        return "ml-IN"
    if any("\u0B00" <= ch <= "\u0B7F" for ch in sample):
        return "od-IN"
    if any("\u0900" <= ch <= "\u097F" for ch in sample):
        return "hi-IN"
    if any("\u0600" <= ch <= "\u06FF" for ch in sample):
        return "ar"
    if any("\u0E00" <= ch <= "\u0E7F" for ch in sample):
        return "th-TH"
    if any("\u3040" <= ch <= "\u30FF" for ch in sample):
        return "ja-JP"
    if any("\uAC00" <= ch <= "\uD7AF" for ch in sample):
        return "ko-KR"
    if any("\u4E00" <= ch <= "\u9FFF" for ch in sample):
        return "zh-CN"
    if any("\u0400" <= ch <= "\u04FF" for ch in sample):
        return "ru"
    if any("\u0100" <= ch <= "\u024F" for ch in sample) or any(
        "\u1EA0" <= ch <= "\u1EF9" for ch in sample
    ):
        return "vi"
    return None


def resolve_thread_language(
    message: str,
    incoming_spoken: str | None = None,
    prev_spoken: str | None = None,
    prev_script: str | None = None,
) -> tuple[str, str]:
    """Sticky thread language so dates / yes / one-way don't flip English→Gujarati.

    Returns (bcp47, reply_script) where reply_script is 'latin' or 'native'.
    """
    text = (message or "").strip()
    prev = (prev_spoken or "").strip() or None
    prev_sc = (prev_script or "").strip().lower() or None
    incoming = (incoming_spoken or "").strip() or None

    incoming_en = bool(incoming and incoming.lower().startswith("en"))
    prev_en = bool(prev and prev.lower().startswith("en"))
    script_lang = detect_script_lang(text)
    # Sticky English: don't flip to Gujarati because Saaras dumped Indic script
    # for an English utterance ("State College bus options").
    if script_lang and (incoming_en or prev_en):
        return (incoming or prev or "en-IN"), "latin"
    if script_lang:
        return script_lang, "native"

    words = text.split()
    short_or_slot = len(words) <= 6 or bool(_SLOT_FILL_RE.match(text))
    if prev and short_or_slot:
        script = prev_sc or ("latin" if is_latin_majority(text) else "native")
        return prev, script

    detected = incoming or detect_lang_from_text(text, fallback=None)
    if prev and prev.lower().startswith("en") and is_latin_majority(text):
        # English thread + latin typing stays English unless they clearly
        # switched into Gujlish/Hinglish (roman Indic), not a date like "28 August".
        if not (_GUJ_ROMAN_RE.search(text) or _HI_ROMAN_RE.search(text)):
            return prev, "latin"
        if len(words) >= 5:
            return prev, "latin"

    if not detected:
        detected = prev or "en-IN"
    script = "latin" if is_latin_majority(text) else "native"
    if prev_sc and short_or_slot:
        script = prev_sc
    return detected, script


def detect_lang_from_text(text: str, fallback: str | None = "en-IN") -> str | None:
    """Guess BCP-47 from script / roman Indic. Returns fallback (or None) if unsure."""
    sample = text or ""
    script = detect_script_lang(sample)
    if script:
        return script
    if _GUJ_ROMAN_RE.search(sample):
        return "gu-IN"
    if _HI_ROMAN_RE.search(sample):
        return "hi-IN"
    return fallback


def _headers() -> dict[str, str]:
    return {"api-subscription-key": (SARVAM_API_KEY or "").strip()}


def normalize_audio_content_type(content_type: str | None, filename: str | None = None) -> str:
    """Sarvam rejects `audio/webm;codecs=opus` — strip codecs / guess from name."""
    ct = (content_type or "").split(";", 1)[0].strip().lower()
    name = (filename or "").lower()
    if ct in ("video/webm", "audio/webm"):
        return "audio/webm"
    if ct in ("audio/wav", "audio/x-wav", "audio/wave", "audio/pcm_s16le", "audio/l16"):
        return "audio/wav"
    if ct in ("audio/mpeg", "audio/mp3", "audio/mpeg3", "audio/x-mpeg-3", "audio/x-mp3"):
        return "audio/mpeg"
    if ct in ("audio/mp4", "audio/x-m4a", "video/mp4"):
        return "audio/mp4"
    if ct in ("audio/ogg", "audio/opus"):
        return "audio/ogg"
    if ct and ct not in ("application/octet-stream", "binary/octet-stream"):
        return ct
    if name.endswith(".wav"):
        return "audio/wav"
    if name.endswith(".mp3"):
        return "audio/mpeg"
    if name.endswith(".m4a") or name.endswith(".mp4"):
        return "audio/mp4"
    if name.endswith(".ogg") or name.endswith(".opus"):
        return "audio/ogg"
    return "audio/webm"


def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "audio.webm",
    content_type: str = "audio/webm",
    language_code: str | None = None,
) -> dict[str, Any]:
    """Return {text, language_code}. Raises ValueError on failure."""
    if not has_sarvam_key():
        raise ValueError("Sarvam API key is not configured.")
    if not audio_bytes:
        raise ValueError("Empty audio.")

    safe_type = normalize_audio_content_type(content_type, filename)
    safe_name = filename or ("speech.wav" if "wav" in safe_type else "speech.webm")
    files = {"file": (safe_name, audio_bytes, safe_type)}
    data: dict[str, str] = {"model": "saaras:v3", "mode": "transcribe"}
    # language_code is ignored — always auto-detect so sticky gu-IN doesn't
    # force English speech into Gujarati text.

    try:
        response = requests.post(
            f"{SARVAM_BASE}/speech-to-text",
            headers=_headers(),
            files=files,
            data=data,
            timeout=60,
        )
    except requests.RequestException as exc:
        logger.warning("Sarvam STT network error: %s", exc)
        raise ValueError(f"Sarvam STT failed: {exc}") from exc

    body: Any
    try:
        body = response.json()
    except Exception:
        body = {"raw": (response.text or "")[:400]}

    if response.status_code >= 400:
        logger.warning("Sarvam STT HTTP %s: %s", response.status_code, body)
        raise ValueError(_err_message(body, f"Sarvam STT HTTP {response.status_code}"))

    text = (
        (body or {}).get("transcript")
        or (body or {}).get("text")
        or ""
    )
    text = str(text).strip()
    detected = (
        (body or {}).get("language_code")
        or (body or {}).get("language")
        or language_code
        or detect_lang_from_text(text)
    )
    return {"text": text, "language_code": normalize_lang(str(detected), fallback=detect_lang_from_text(text))}


def synthesize_speech(text: str, language_code: str | None = None, speaker: str = "ritu") -> bytes:
    """Return WAV/MP3 bytes from Bulbul v3. Raises ValueError on failure."""
    if not has_sarvam_key():
        raise ValueError("Sarvam API key is not configured.")
    clean = (text or "").strip()
    if not clean:
        raise ValueError("Empty text.")
    lang = normalize_lang(language_code or detect_lang_from_text(clean), fallback="en-IN")
    payload = {
        "text": clean[:2400],
        "target_language_code": lang,
        "language_code": lang,
        "model": "bulbul:v3",
        "speaker": speaker or "ritu",
    }
    try:
        response = requests.post(
            f"{SARVAM_BASE}/text-to-speech",
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
            timeout=45,
        )
    except requests.RequestException as exc:
        logger.warning("Sarvam TTS network error: %s", exc)
        raise ValueError(f"Sarvam TTS failed: {exc}") from exc

    ctype = (response.headers.get("content-type") or "").lower()
    if response.status_code >= 400:
        try:
            body = response.json()
        except Exception:
            body = {"raw": (response.text or "")[:400]}
        logger.warning("Sarvam TTS HTTP %s: %s", response.status_code, body)
        raise ValueError(_err_message(body, f"Sarvam TTS HTTP {response.status_code}"))

    if "audio/" in ctype or "octet-stream" in ctype:
        return response.content

    try:
        body = response.json()
    except Exception as exc:
        raise ValueError("Sarvam TTS returned unreadable audio.") from exc

    chunks = body.get("audios") or body.get("audio") or []
    if isinstance(chunks, str):
        chunks = [chunks]
    if not chunks:
        raise ValueError(_err_message(body, "Sarvam TTS returned no audio."))
    try:
        return base64.b64decode("".join(str(c) for c in chunks))
    except Exception as exc:
        raise ValueError("Sarvam TTS audio decode failed.") from exc


def _err_message(body: Any, fallback: str) -> str:
    if isinstance(body, dict):
        for key in ("message", "error", "detail"):
            val = body.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
            if isinstance(val, dict):
                msg = val.get("message") or val.get("msg")
                if msg:
                    return str(msg)
    return fallback
