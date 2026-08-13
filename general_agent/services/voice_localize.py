"""Rewrite English agent dumps into short spoken replies in the user's language."""
from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

_LANG_NAMES = {
    "gu-IN": "Gujarati",
    "hi-IN": "Hindi",
    "bn-IN": "Bengali",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "mr-IN": "Marathi",
    "pa-IN": "Punjabi",
    "od-IN": "Odia",
    "en-IN": "English (India)",
    "ar": "Arabic",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "pt-BR": "Portuguese",
    "ru": "Russian",
    "it": "Italian",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
    "zh-CN": "Chinese",
    "th-TH": "Thai",
    "vi": "Vietnamese",
    "ms": "Malay",
    "id": "Indonesian",
    "pl": "Polish",
    "tr": "Turkish",
    "nl": "Dutch",
}

_MD_RE = re.compile(r"[#*_`>|]+")
_ACTION_RE = re.compile(r"```itinero-action[\s\S]*?```", re.IGNORECASE)


def strip_for_speech(text: str) -> str:
    if not text:
        return ""
    out = _ACTION_RE.sub(" ", text)
    out = re.sub(r"\[CARDS_DATA:[\s\S]*?\]", " ", out)
    out = _MD_RE.sub(" ", out)
    out = re.sub(r"\s+", " ", out).strip()
    if len(out) <= 380:
        return out
    parts = re.findall(r"[^.!?]+[.!?]+", out)
    if parts:
        acc = ""
        spoken_n = 0
        for s in parts:
            if acc and len(acc) + len(s) > 380:
                break
            acc += s
            spoken_n += 1
            if spoken_n >= 2:
                break
        if acc.strip():
            return acc.strip()
    return out[:380].rsplit(" ", 1)[0].strip()


def _mostly_english(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 8:
        return False
    ascii_n = sum(1 for c in letters if ord(c) < 128)
    return ascii_n / len(letters) > 0.82


def maybe_localize_voice_reply(
    text: str,
    voice_mode: bool,
    spoken_language: str | None,
    reply_script: str | None = None,
    respect_instruction: str | None = None,
) -> str:
    """If the reply is English while the user isn't, rewrite it into their language."""
    spoken = (spoken_language or "").strip()
    if voice_mode:
        cleaned = strip_for_speech(text)
    else:
        cleaned = (text or "").strip()
    if not cleaned:
        return text or ""
    if not spoken or spoken.lower().startswith("en"):
        return cleaned if voice_mode else (text or cleaned)
    if not _mostly_english(cleaned):
        return cleaned if voice_mode else (text or cleaned)

    lang_name = _LANG_NAMES.get(spoken, spoken)
    roman = str(reply_script or "").lower() == "latin"
    style = (
        f"{lang_name} in Roman letters (Gujlish/Hinglish). Do NOT use native script."
        if roman
        else f"{lang_name} in native script."
    )
    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage, SystemMessage
        from general_agent.config import MODEL_NAME, OPENAI_API_KEY

        llm = ChatOpenAI(model=MODEL_NAME or "gpt-4o-mini", temperature=0.3, api_key=OPENAI_API_KEY)
        respect = (respect_instruction or "").strip()
        if voice_mode:
            instruction = (
                "Rewrite the travel-agent message for SPEAKING out loud to a family member. "
                f"Use {style} "
                "1–2 short sentences. One question at the end if something is still needed "
                "(city, dates, travellers). No markdown, no bullets. "
                "Keep real prices, airports, and dates exactly. Never invent a trip Vero is taking."
            )
        else:
            instruction = (
                f"Rewrite the travel-agent reply in {style} "
                "Match the user's typing style exactly. Keep the same facts, prices, airports, and dates. "
                "Do not switch to English unless the user mixed English in. No extra filler. "
                "Never invent that Vero herself is travelling."
            )
        if respect:
            instruction += " " + respect
        res = llm.invoke(
            [
                SystemMessage(content=instruction),
                HumanMessage(content=cleaned[:2500]),
            ]
        )
        out = str(getattr(res, "content", "") or "").strip()
        if voice_mode:
            out = strip_for_speech(out)
        return out or cleaned
    except Exception as exc:
        logger.warning("voice localize failed: %s", exc)
        return cleaned if voice_mode else (text or cleaned)
