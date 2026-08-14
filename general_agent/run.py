"""
run.py — FastAPI server for Vero (Itinero AI)
=============================================
Exposes Vero as a REST API. Internally Vero is the general LLM orchestrator
and can deepen into itinerary / flight / hotel planning — but the user only
ever talks to Vero.

Run from the project root with:
    uvicorn general_agent.run:app --reload --port 8001

Endpoints:
    POST /api/chat     — send a message, get Vero's reply (+ optional cards)
    GET  /api/health   — basic health check
    GET  /api/health/live
    GET  /api/health/ready
    DELETE /api/chat/{thread_id}  — clear a conversation thread
"""
from __future__ import annotations

import sys
import os
import logging

# ── Path setup ─────────────────────────────────────────────────────────────
_GA_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_GA_DIR)

for _p in [_ROOT, _GA_DIR]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

# ── Imports ────────────────────────────────────────────────────────────────
from typing import Any, Optional
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field


from general_agent.config import validate_config
from general_agent.observability import configure_logging, health_payload, init_sentry
from general_agent.agent import build_agent, ItineroAgent

# config import already loaded .env — now wire observability
configure_logging()
init_sentry()
validate_config()

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Itinero Vero API",
    description="REST API for Vero — Itinero's AI travel buddy (orchestrates trip planning under the hood).",
    version="1.2.0",
)

# Allow Vite / product frontends to call us
_cors_env = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "").split(",")
    if o.strip() and "://" in o.strip()
]
_default_cors = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_cors_origins = list(dict.fromkeys(_default_cors + _cors_env))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Agent singleton (one instance, thread-safe via thread_id scoping) ──────
_agent: ItineroAgent | None = None


def _get_agent() -> ItineroAgent:
    global _agent
    if _agent is None:
        logger.info("Initialising Vero agent…")
        _agent = build_agent()
        logger.info("Vero agent ready.")
    return _agent


# ── Request / Response models ──────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000, description="User message")
    thread_id: str = Field(
        default="default-session",
        description="Unique conversation ID — use a stable ID per browser session "
                    "so Vero remembers context across multiple turns.",
    )
    page_context: Optional[dict[str, Any]] = Field(
        default=None,
        description="Optional left-page browsing context from the Itinero UI "
                    "(flights/hotels search currently on screen).",
    )
    voice_mode: bool = Field(
        default=False,
        description="True when the user is speaking (mic). Replies stay short and in-language.",
    )
    spoken_language: Optional[str] = Field(
        default=None,
        description="BCP-47 tag from STT, e.g. gu-IN, hi-IN, en-IN.",
    )
    traveler: Optional[dict[str, Any]] = Field(
        default=None,
        description="Optional name hints: preferred_name, profile_preferred_name, account_first_name.",
    )


class ChatResponse(BaseModel):
    reply: str
    thread_id: str
    cards: Optional[dict] = None
    places: Optional[list] = None
    # Product UIs historically expected these; keep neutral so nothing
    # leaks specialist names into the client.
    routed_to: str = "vero"
    active_specialist: str = "vero"
    route_path: list[str] = Field(default_factory=lambda: ["vero"])
    preferred_name: Optional[str] = None
    address_style: Optional[str] = None
    agent_meta: Optional[dict[str, Any]] = None
    credits: Optional[dict[str, Any]] = None


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    """Quick health check — use this to verify the server is running."""
    try:
        from general_agent.runtime import agent_identity, production_readiness
    except ImportError:
        from runtime import agent_identity, production_readiness  # type: ignore

    return health_payload(
        extra={
            **agent_identity(),
            "version": "1.3.0",
            "readiness": production_readiness(),
            "checkpoint": _checkpoint_status(),
        },
    )


def _checkpoint_status():
    try:
        from general_agent.checkpointing import checkpoint_status
    except ImportError:
        from checkpointing import checkpoint_status  # type: ignore
    return checkpoint_status()


@app.get("/api/health/live")
def health_live():
    """Liveness — process is up (always 200)."""
    return {"status": "ok", "live": True, "agent": "vero"}


@app.get("/api/health/ready")
def health_ready():
    """Readiness — 503 in production when required AI deps are missing."""
    from fastapi.responses import JSONResponse

    from general_agent.observability import sentry_active

    try:
        from general_agent.runtime import production_readiness
    except ImportError:
        from runtime import production_readiness  # type: ignore

    ready = production_readiness()
    env = ready.get("environment") or ""
    is_prod = bool(ready.get("production"))
    openai = bool((os.getenv("OPENAI_API_KEY") or "").strip())
    sentry_cfg = bool((os.getenv("SENTRY_DSN") or "").strip())
    missing: list[str] = list(ready.get("blocking") or [])
    if not openai and "openai" not in missing:
        missing.append("openai")
    if is_prod and sentry_cfg and not sentry_active() and "sentry" not in missing:
        missing.append("sentry")
    body = {
        "status": "ok" if not missing else "not_ready",
        "ready": not missing,
        "missing": missing,
        "agent": "vero",
        "production": is_prod,
        "environment": env,
        "agent_build": ready.get("agent_build"),
        "prompt_version": ready.get("prompt_version"),
    }
    if is_prod and missing:
        return JSONResponse(status_code=503, content=body)
    return body


def _credit_identity(request: Request, thread_id: str) -> tuple[str, str]:
    """Return (subject, plan) for Claude-style Vero credits."""
    try:
        from supervisor.auth import user_from_token
        from supervisor.credits import plan_for_user, subject_key
        from supervisor.db import normalize_device_id

        auth = (request.headers.get("authorization") or "").strip()
        token = auth[7:].strip() if auth.lower().startswith("bearer ") else None
        user = user_from_token(token) if token else None
        uid = str((user or {}).get("id") or "").strip() or None
        did = normalize_device_id(request.headers.get("x-itinero-device"))
        return subject_key(user_id=uid, device_id=did, thread_id=thread_id), plan_for_user(uid)
    except Exception:
        return f"thread:{thread_id[:80]}", "free"


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest, request: Request):
    """
    Send a user message to Vero and get back the reply + structured cards
    (flights / hotels) when available.
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    logger.info("Chat | thread=%s | msg=%s…", req.thread_id, req.message[:60])

    credit_snap = None
    try:
        from supervisor.credits import begin_turn, exhausted_reply, peek

        subject, plan = _credit_identity(request, req.thread_id)
        credit_snap = peek(subject, plan=plan)
        begin_turn(
            subject,
            plan,
            consume=credit_snap.get("remaining", 0) >= 1,
            remaining=credit_snap.get("remaining"),
        )
        if credit_snap.get("remaining", 0) < 1:
            return ChatResponse(
                reply=exhausted_reply(plan=plan, reset_at=credit_snap.get("resetAt")),
                thread_id=req.thread_id,
                routed_to="vero",
                active_specialist="vero",
                route_path=["vero", "credits"],
                credits=credit_snap,
            )
    except Exception:
        logger.debug("vero credits peek skipped", exc_info=True)

    try:
        agent = _get_agent()
        res = agent.invoke_with_cards(
            req.message,
            thread_id=req.thread_id,
            page_context=req.page_context,
            voice_mode=bool(req.voice_mode),
            spoken_language=req.spoken_language,
            traveler=req.traveler,
            cost_subject=(credit_snap or {}).get("subject") if credit_snap else None,
        )
    except Exception as exc:
        logger.exception("Agent error: %s", exc)
        raw = str(exc or "").strip()
        if not raw or raw in {"__end__", "END"} or "Recursion" in raw:
            detail = "I hit a snag — say that again and I’ll continue."
        else:
            detail = "I ran into a temporary connection issue. Please try your request again."
        try:
            from supervisor.credits import end_turn as _end_credits

            _end_credits()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=detail)

    logger.info(
        "Reply | thread=%s | cards=%s | %s…",
        req.thread_id,
        bool(res.get("cards")),
        res["reply"][:80],
    )
    out_credits = credit_snap
    try:
        from supervisor.credits import consume, current_turn, end_turn

        ctx = current_turn()
        lane = str(res.get("vero_last_lane") or "planner")
        if ctx and ctx.get("consume"):
            out_credits = consume(ctx["subject"], lane=lane, plan=ctx.get("plan"))
        elif ctx:
            from supervisor.credits import snapshot as credit_snapshot

            out_credits = credit_snapshot(ctx["subject"], plan=ctx.get("plan"))
        end_turn()
    except Exception:
        logger.debug("vero credits consume skipped", exc_info=True)

    return ChatResponse(
        reply=res["reply"],
        thread_id=req.thread_id,
        cards=res.get("cards"),
        places=res.get("places"),
        routed_to="vero",
        active_specialist="vero",
        route_path=["vero"],
        preferred_name=res.get("preferred_name"),
        address_style=res.get("address_style"),
        agent_meta=res.get("agent_meta"),
        credits=out_credits,
    )


class VoiceTtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2500)
    language_code: Optional[str] = None


@app.get("/api/voice/status")
def voice_status():
    from general_agent.services import sarvam_voice

    ready = sarvam_voice.has_sarvam_key()
    return {
        "ok": ready,
        "provider": "sarvam" if ready else None,
        "stt": ready,
        "tts": ready,
    }


@app.post("/api/voice/stt")
async def voice_stt(
    file: UploadFile = File(...),
    language_code: Optional[str] = Form(default=None),
):
    from general_agent.services import sarvam_voice

    audio = await file.read()
    try:
        result = sarvam_voice.transcribe_audio(
            audio,
            filename=file.filename or "audio.webm",
            content_type=file.content_type or "audio/webm",
            language_code=language_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not (result.get("text") or "").strip():
        raise HTTPException(status_code=422, detail="Could not hear that — please try again.")
    return result


@app.post("/api/voice/tts")
def voice_tts(req: VoiceTtsRequest):
    from general_agent.services import sarvam_voice
    from general_agent.services.voice_localize import strip_for_speech

    try:
        audio = sarvam_voice.synthesize_speech(
            strip_for_speech(req.text),
            language_code=req.language_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(content=audio, media_type="audio/wav")


@app.delete("/api/chat/{thread_id}")
def clear_thread(thread_id: str):
    """
    Clear all memory for a conversation thread.
    Useful when the user clicks 'New Chat' — pass the old thread_id here
    so the agent's checkpointer forgets that session.

    Note: the checkpointer (MemorySaver) is in-memory only. A server restart
    clears everything, and there's no per-thread delete API on it today — the
    UI simply uses a new thread_id for new chats so old threads are abandoned.
    """
    return {"status": "ok", "cleared": thread_id}


# ── Dev entry point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("general_agent.run:app", host="0.0.0.0", port=8001, reload=True)
