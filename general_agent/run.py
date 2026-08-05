"""
run.py — FastAPI server for the Itinero UI
============================================
Exposes the general_agent (Vero) — now merged with the real ITINERARY_AGENT
multi-agent hand-off — as a REST API so the React UI at d:/Algobrain/37).Itinero/ui/
can communicate with it. Both agents run inside this single process on one port.

Run from the project root with:
    uvicorn general_agent.run:app --reload --port 8001

Endpoints:
    POST /api/chat     — send a message, get Vero's (or the itinerary agent's) reply
    GET  /api/health   — basic health check
    DELETE /api/chat/{thread_id}  — clear a conversation thread
"""
from __future__ import annotations

import sys
import os
import logging

# ── Path setup ─────────────────────────────────────────────────────────────
# run.py lives at:  d:/Algobrain/37).Itinero/general_agent/run.py
# general_agent is:  d:/Algobrain/37).Itinero/general_agent/  (this file's own dir)
# We need the project root on sys.path for `from general_agent.xxx import`,
# and general_agent's own dir on sys.path for the bare `from graph.workflow
# import` / `import itinerary_bridge` style imports used inside the package.
_GA_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_GA_DIR)

for _p in [_ROOT, _GA_DIR]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

# ── Imports ────────────────────────────────────────────────────────────────
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


from general_agent.config import validate_config
from general_agent.logging_config import configure_logging
from general_agent.agent import build_agent, ItineroAgent

# ── Setup ──────────────────────────────────────────────────────────────────
configure_logging()
validate_config()

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Itinero API",
    description="REST API wrapper for the Vero AI travel agent (general_agent), merged with the ITINERARY_AGENT hand-off.",
    version="1.1.0",
)

# Allow the Vite dev server (localhost:3000) to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",  # fallback if port changes
    ],
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


class ChatResponse(BaseModel):
    reply: str
    thread_id: str
    cards: Optional[dict] = None


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    """Quick health check — use this to verify the server is running."""
    return {"status": "ok", "agent": "vero", "version": "1.1.0"}


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """
    Send a user message to Vero (or, mid-handoff, straight to the ITINERARY_AGENT
    session) and get back the reply + structured cards if available.

    - thread_id scopes conversation memory — send the same thread_id
      across turns so context is remembered, including which engine
      (general chat vs. itinerary hand-off) currently owns the conversation.
    - Stateless on the HTTP level; state lives in the LangGraph checkpointer
      inside the agent, keyed by thread_id (see general_agent/agent.py).
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    logger.info("Chat | thread=%s | msg=%s…", req.thread_id, req.message[:60])

    try:
        agent = _get_agent()
        res = agent.invoke_with_cards(req.message, thread_id=req.thread_id)
    except Exception as exc:
        logger.exception("Agent error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Vero encountered an error: {exc}",
        )

    logger.info("Reply | thread=%s | cards=%s | %s…", req.thread_id, bool(res.get("cards")), res["reply"][:80])
    return ChatResponse(
        reply=res["reply"],
        thread_id=req.thread_id,
        cards=res.get("cards"),
    )



@app.delete("/api/chat/{thread_id}")
def clear_thread(thread_id: str):
    """
    Clear all memory for a conversation thread.
    Useful when the user clicks 'New Chat' — pass the old thread_id here
    so the agent's checkpointer forgets that session.

    Note: the checkpointer (MemorySaver) is in-memory only. A server restart
    clears everything, and there's no per-thread delete API on it today — the
    UI simply uses a new thread_id for new chats so old threads (including any
    mid-flight itinerary hand-off state) are silently abandoned.
    """
    return {"status": "ok", "cleared": thread_id}


# ── Dev entry point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("general_agent.run:app", host="0.0.0.0", port=8001, reload=True)
