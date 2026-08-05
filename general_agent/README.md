# General Agent (Vero) — Itinero

Vero is the conversational entry point for Itinero. She gathers trip details, answers
travel questions, runs quick flight/hotel lookups, and — once a trip is ready to book —
hands the conversation off to the real **Itinerary Agent** (`../ITINERARY_AGENT/`), a
separate multi-agent system that owns the actual staged booking flow. This folder is the
FastAPI backend that serves both, plus everything Vero needs on her own.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env    # fill in your API keys (OpenAI, Tavily, OpenWeather, LiteAPI, Google Maps)
```

Run from the **project root** (not from inside this folder) — `run.py` needs both this
folder and `ITINERARY_AGENT/` on the Python path as siblings:

```bash
uvicorn general_agent.run:app --reload --port 8001
```

The React UI (`../ui/`) proxies `/api/*` to this server — see its own README for
`npm run dev`.

## Folder structure

```
general_agent/
├── run.py                    # FastAPI app — the actual entry point (was backend.py)
├── agent.py                  # ItineroAgent — routes each turn to Vero or the itinerary hand-off
├── itinerary_bridge.py       # Drives ITINERARY_AGENT's own graph one turn at a time —
│                              # the ONLY file that knows about both packages
├── config.py / exceptions.py / logging_config.py
├── main.py                   # CLI entrypoint (independent of run.py)
├── models/state.py           # AgentState — Vero's own LangGraph state schema
├── graph/
│   ├── nodes.py               # agent_node (Vero's reasoning step), itinerary_node (hand-off)
│   ├── workflow.py            # StateGraph wiring + escalation routing
│   └── utils.py
├── llm/
│   ├── prompts.py             # Vero's system prompt — the highest-leverage file here
│   ├── tools.py                # all of Vero's @tool definitions
│   └── model.py
├── services/
│   ├── travel_service.py      # weather/route/places/geocode formatting (+ _parse_journey,
│   │                          # kept because ITINERARY_AGENT imports it directly)
│   ├── quick_search_service.py # real flight/hotel search for Vero's OWN quick-search tools
│   ├── location_resolver.py   # resolves city names -> IATA/country codes LiteAPI needs
│   └── card_mapping.py        # shared FlightOption/HotelOption -> UI card JSON mapping
├── providers/                 # raw HTTP clients (LiteAPI, Google Maps, OpenWeather)
└── outputs/                   # graph.png lands here on first run (auto-generated, gitignore-able)
```

## How a conversation actually flows

Every message goes through `ItineroAgent.invoke_with_cards()` (`agent.py`), which checks
one flag — `trip_context["engine"]` — to decide who owns the turn:

- **`"general"` (default):** Vero's own LangGraph runs (`graph/nodes.py::agent_node`), with a
  fresh system prompt rebuilt every turn from `llm/prompts.py::build_system_prompt()`. She
  picks from her tool set (below) each turn.
- **`"itinerary"`:** the message is driven straight into `itinerary_bridge.continue_itinerary_session()`,
  which runs ITINERARY_AGENT's own staged node graph one stage at a time. Vero's system
  prompt has **no influence at all** during this stretch — ITINERARY_AGENT has its own three
  separate system prompts (`ItineraryAgent`, `FlightAgent`, `HotelAgent`), independent of
  Vero's.

**Hand-off trigger:** Vero calls `escalate_to_itinerary` once destination/origin/dates/
travelers/budget are confirmed, or the user explicitly asks to book/plan the full trip.
`itinerary_bridge.build_app_state_from_handoff` builds a real ITINERARY_AGENT `AppState`
from Vero's `trip_context` + conversation history, and the flow starts at
`FLIGHT_SEARCH_CONFIRMATION` (skipping ITINERARY_AGENT's own greeting/requirement stages,
since Vero already did that part) — or straight at `FLIGHT_PREBOOK_CONFIRMATION` if the
user already picked a specific flight via Vero's own quick search.

**Hand-back trigger:** either the itinerary session reaches `COMPLETED` (a real itinerary
was generated), or the user says one of a handful of exit phrases (see
`itinerary_bridge.py::_EXIT_PHRASES`), checked before anything else on every turn.

**No code in `ITINERARY_AGENT/` is ever modified** — `itinerary_bridge.py` only imports
and drives its existing node functions and models.

## Vero's tools

| Tool | Purpose |
|---|---|
| `validate_date` | Deterministic date parsing/validation — called before any other date use |
| `destination_search` | Tavily web search — safety, visa, local info |
| `get_weather` / `get_route` / `search_places` / `geocode_location` | Google/OpenWeather lookups |
| `search_flights` / `search_hotels` | Real, search-only quick lookups (reuses ITINERARY_AGENT's own `FlightAgent`/`HotelAgent` search code via `quick_search_service.py`) |
| `select_searched_flight` / `select_searched_hotel` | Deterministic id-based selection from a prior search — never LLM-guessed |
| `update_trip_context` | Persists confirmed trip details across turns |
| `escalate_to_itinerary` | Triggers the hand-off described above |

## Known gaps

Hotel search during the *full* Itinerary Agent booking flow (as opposed to Vero's quick
search) still isn't fully reliable — the fix requires a small change inside
`ITINERARY_AGENT/`. See `../ITINERARY_RECOMMENDATIONS.md` at the project root for the full,
current list of what's fixed, what's outstanding, and what needs Itinerary Agent-side
changes.
