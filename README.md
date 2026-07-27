# Itinero + Vero

Workspace combines the **booking API / agents** and the **product frontend**.

| Layer | Location | Notes |
|-------|----------|--------|
| **API + agents** | `supervisor/`, `Travel_Agent/`, `general_agent/`, `ITINERARY_AGENT/` | FastAPI gateway: manual flight search + Vero chat |
| **Frontend (primary)** | `itinero/` | Vite app — **product = Itinero** |
| **Frontend (legacy)** | `itinero-web/` | Next.js prototype; prefer `itinero/` |

## Manual booking vs Vero AI (important)

These are **separate product surfaces**:

| Mode | When | What runs |
|------|------|-----------|
| **Manual site** | Homepage search, `/flights`, hotels, filters, Book Now | Normal UI → `POST /api/flights/search` (LiteAPI). **No chat agent.** Errors say “flight search service”, not Vero. |
| **Vero AI** | Only when the user opens **Ask Vero** (`/itinero/vero` or the floating chat entry) and talks | `POST /api/chat` → supervisor command router + specialists |

Vero is **not** required for search. The floating “Ask For Vero” button is an optional shortcut into chat only.

**Itinero** = product brand. **Vero** = AI identity (chat only).

## Vero architecture (chat agent only)

```
START → Supervisor (command router)
  ├─ general_chat → General Agent (+ WebSearch tools)
  ├─ trip_detail_collection → missing_field_checker → ask user
  └─ travel_search → research_dispatch (parallel, 12s/branch)
        Travel Agent (LiteAPI flights) | Hotel (stub) | Visa (V1.1) | WebSearch
        → research_join → present_options → booking / itinerary
```

Manual OTA search uses the same FastAPI process but the **structured** routes (`/api/flights/search`, etc.), not the chat graph.

Details: `supervisor/architecture.py`, `GET /api/capabilities`.

## Run everything

### 1. Env (once)

Copy each package’s `.env.example`. Never commit secrets.

- `supervisor/.env`, `Travel_Agent/.env`, `general_agent/.env`, `ITINERARY_AGENT/.env`
- `itinero/.env` → `VITE_API_URL=http://127.0.0.1:8000`

### 2. API gateway (port 8000)

```powershell
cd "C:\Users\Jayneel\Itinero Final"
uvicorn supervisor.main:app --reload --port 8000
```

- Health: http://127.0.0.1:8000/api/health
- Manual flights: `POST /api/flights/search`
- Vero chat: `POST /api/chat`
- Docs: http://127.0.0.1:8000/docs

### 3. Primary UI — Vite (port 5173)

```powershell
cd "C:\Users\Jayneel\Itinero Final\itinero"
npm install
npm run dev
```

- Home (manual search): http://localhost:5173/itinero/
- Flights (manual results): http://localhost:5173/itinero/flights?from=BOM&to=DEL&depart=2026-08-09&adults=1&cabin=Economy&trip=One%20way
- Ask Vero (AI only): http://localhost:5173/itinero/vero

Live fares only via `POST /api/flights/search` — no mock prices.

## Status snapshot

| Area | Status |
|------|--------|
| Flights (LiteAPI, manual) | Live if keys set |
| Vero chat | Live if OpenAI (+ tools) |
| Research / weather / food | Live if OpenAI (+ tools) |
| Itinerary | Best-effort |
| Hotels / train / bus | Stub (honest, no fake data) |
| Visa / PDF / Tracking / Calling | Future V1.1 (named stubs) |
| Clerk auth | Disabled for now |
