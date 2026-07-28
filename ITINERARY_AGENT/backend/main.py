"""
FastAPI application entry point.

Run with:
    uvicorn backend.main:app --reload --port 8000
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.api.routes import router
from backend.config import settings

# ---------------------------------------------------------------------------
# Set OpenAI key before any langchain import resolves it
# ---------------------------------------------------------------------------
if settings.openai_api_key:
    os.environ.setdefault("OPENAI_API_KEY", settings.openai_api_key)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="AI Travel Itinerary Planner",
    description=(
        "Intelligent trip planning powered by GPT-4o-mini + LangGraph. "
        "Collects requirements, searches flights & hotels (dummy data), "
        "and generates a professional day-by-day travel itinerary."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — allow the frontend (same origin in prod, any origin in dev)
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API routes — all prefixed with /api
# ---------------------------------------------------------------------------
app.include_router(router, prefix="/api")

# ---------------------------------------------------------------------------
# Serve the frontend static files
# ---------------------------------------------------------------------------
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

# No-cache headers so browsers always fetch the latest JS/CSS during development
_NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma":        "no-cache",
    "Expires":       "0",
}

if FRONTEND_DIR.exists():
    # Serve static assets (CSS, JS) from the frontend directory
    app.mount(
        "/static",
        StaticFiles(directory=str(FRONTEND_DIR), html=True),
        name="static",
    )

    @app.get("/", include_in_schema=False)
    async def serve_index() -> FileResponse:
        """Serve the SPA entry point with no-cache headers."""
        return FileResponse(
            str(FRONTEND_DIR / "index.html"),
            headers=_NO_CACHE_HEADERS,
        )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str, request: Request) -> FileResponse:
        """Fall-through route — serve index.html for client-side navigation."""
        index = FRONTEND_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index), headers=_NO_CACHE_HEADERS)
        return JSONResponse({"error": "Frontend not found"}, status_code=404)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    return {"status": "ok", "service": "AI Travel Itinerary Planner"}


# ---------------------------------------------------------------------------
# Dev server entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
