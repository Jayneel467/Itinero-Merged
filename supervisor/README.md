# Itinero Supervisor Gateway

Single FastAPI HTTP API for `itinero-web`. Fronts existing Python agents without modifying their packages.

## Install

From repo root:

```bash
pip install -r supervisor/requirements.txt
# Also install agent deps as needed:
pip install -r general_agent/requirements.txt
pip install -r Travel_Agent/requirements.txt
```

Copy env:

```bash
copy supervisor\.env.example supervisor\.env
# fill OPENAI_API_KEY, API_KEY (LiteAPI), etc.
```

## Run

```bash
cd "C:\Users\Jayneel\Itinero Final"
uvicorn supervisor.main:app --reload --port 8000
```

Docs: http://127.0.0.1:8000/docs  
Health: http://127.0.0.1:8000/api/health

Missing keys return clear **degraded/stub** responses — the process should not crash on `/api/chat`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/chat` | AI supervisor turn (`OrchestratorInput`-like) |
| POST | `/api/flights/search` | Manual structured flight search |
| POST | `/api/flights/price-calendar` | Min live LiteAPI fare per date (date strip / calendar) |
| GET | `/api/hotels/search` | Live hotel search (honest error when unavailable — no sample data) |
| GET | `/api/capabilities` | Live vs stub map |
| GET | `/api/health` | Liveness + key presence |

## Routing (live vs stub)

| Intent | Backend | Status |
|--------|---------|--------|
| Research / weather / places | `general_agent.ItineroAgent` | **Live** if OpenAI (+ tool keys) set |
| Flights / booking / payment | `Travel_Agent` `GeneralAgent` | **Live** if OpenAI + LiteAPI `API_KEY` set |
| Multi-day itinerary | `ITINERARY_AGENT` (live LLM, no fake day plans) | **Best-effort** |
| Hotels (chat) | Stub message | **Stub** (no sample data) |
| Train / bus / visa / sports | Clear stub copy | **Stub** |

Session: `session_id` + `session_context` round-trip so flight booking state persists.
