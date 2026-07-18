# AI Travel Planner

A production-quality **multi-agent AI travel planning system** built with
[LangGraph](https://github.com/langchain-ai/langgraph) and
[LangChain](https://github.com/langchain-ai/langchain).

The system behaves like a professional travel consultant — collecting your
requirements through natural conversation, searching flights and hotels,
generating a day-by-day itinerary, and always asking for your confirmation
before any booking action.

---

## Architecture

```
                        User
                          │
                          ▼
                Itinerary Agent (Main)
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
Conversation        AppState           Workflow Manager
 Manager            (Centralized)      (LangGraph)
        │                 │
        └──────────┬───────┘
                   ▼
         Requirement Collector
                   │
          Missing Info Check
                   │
        ┌──────────┴────────────────────┐
        ▼                               ▼
 Ask User Questions             User Confirmation
                                        │
                                 Flight Agent
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
             Search Flights      Filter Flights       Rank Flights
                                        │
                                 Show Options
                                        │
                                 User Selects
                                        │
                             Confirm → Pre-book
                                        │
                              Store Flight Prebook ID
                                        │
                            Draft Itinerary Generator
                                        │
                           User Reviews / Approves
                                        │
                                  Hotel Agent
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
             Search Hotels       Filter Hotels       Rank Hotels
                    │
             Day-by-day search
                    │
             User Selects Hotels
                    │
             Confirm → Bulk Pre-book
                    │
              Store Hotel Prebook IDs
                    │
             Final Itinerary Generator
                    │
          Complete Day-wise Itinerary → User
```

Open `architecture.drawio` in [diagrams.net](https://app.diagrams.net) for
the full colour-coded visual diagram.

---

## Agents

### 1. Itinerary Agent (Main Orchestrator)
- Drives the entire conversation with the user.
- Collects trip requirements through natural dialogue — never asks for
  information the user already provided.
- Builds detailed natural-language instructions for the worker agents.
- Generates the draft and final itinerary using an LLM.
- Enforces the "confirm before every major action" rule.
- Model: `gpt-4o-mini` (configurable)

### 2. Flight Agent (LLM Worker)
- Receives instructions from the Itinerary Agent — never from the user.
- Searches, filters, ranks, and recommends flights.
- Generates realistic dummy flight data via LLM.
- Pre-books the selected flight and returns a `FlightPrebook` record.
- Model: `gpt-4o-mini` (configurable)
- **Swap to real API:** Replace `_call_llm()` in `agents/flight_agent.py` with
  a [LiteAPI API] call — all method signatures stay the same.

### 3. Hotel Agent (LLM Worker)
- Receives instructions from the Itinerary Agent — never from the user.
- Searches hotels day-by-day, filters by budget/rating/amenities, ranks options.
- Generates realistic dummy hotel data via LLM.
- Pre-books each selected hotel and returns `HotelPrebook` records.
- Model: `gpt-4o-mini` (configurable)
- **Swap to real API:** Replace `_call_llm()` in `agents/hotel_agent.py` with a
  [LiteAPI](https://www.liteapi.travel) call — all method signatures stay the same.

---

## Project Structure

```
ai_travel_planner/
├── run.py                          # Top-level entry point
├── requirements.txt
├── pyproject.toml
├── .env.example
├── architecture.drawio             # Draw.io architecture diagram
└── ai_travel_planner/
    ├── main.py                     # Conversation loop
    ├── agents/
    │   ├── itinerary_agent.py      # Main orchestrator agent
    │   ├── flight_agent.py         # Flight worker agent
    │   └── hotel_agent.py          # Hotel worker agent
    ├── graph/
    │   ├── nodes.py                # All LangGraph node functions
    │   └── workflow.py             # StateGraph assembly + router
    ├── state/
    │   └── models.py               # All Pydantic state models
    └── utils/
        ├── config.py               # Settings (pydantic-settings)
        ├── logger.py               # Structured logging
        └── display.py              # Rich console helpers
```

---

## Setup

### Prerequisites
- Python 3.11+
- An OpenAI API key

### Installation

```bash
# Clone / download the project
cd ai_travel_planner

# Create and activate a virtual environment
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Or install as a package
pip install -e .
```

### Configuration

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your OpenAI API key
OPENAI_API_KEY=sk-...
```

Optional overrides in `.env`:

| Variable | Default | Description |
|---|---|---|
| `ITINERARY_AGENT_MODEL` | `gpt-4o-mini` | Main orchestrator model |
| `FLIGHT_AGENT_MODEL` | `gpt-4o-mini` | Flight worker model |
| `HOTEL_AGENT_MODEL` | `gpt-4o-mini` | Hotel worker model |
| `ITINERARY_AGENT_TEMPERATURE` | `0.3` | Creativity for conversation |
| `FLIGHT_AGENT_TEMPERATURE` | `0.2` | Consistency for data generation |
| `HOTEL_AGENT_TEMPERATURE` | `0.2` | Consistency for data generation |
| `LOG_LEVEL` | `INFO` | `DEBUG` for verbose LLM I/O |

---

## Running

```bash
python run.py
```

Or if installed as a package:

```bash
travel-planner
```

---

## Workflow Walk-through

The planner works through 6 stages. It asks for confirmation before every
major action — it will never search or book without your explicit approval.

| Stage | What happens | User action |
|---|---|---|
| **1. Requirement Collection** | Aria asks natural questions to learn your trip details | Answer conversationally |
| **2. Flight Search** | After you confirm, the Flight Agent searches, filters, and ranks flights | Type `yes` to search |
| **3. Flight Selection & Pre-book** | Review options, pick a number, confirm pre-booking | Type `2` then `yes` |
| **4. Draft Itinerary** | A day-by-day draft is generated — no hotels yet | Approve or suggest changes |
| **5. Hotel Search & Selection** | Hotels are searched day-by-day; you pick one per group | Type a hotel number |
| **6. Final Itinerary** | After confirming bulk pre-booking, the complete plan is presented | Enjoy! |

### Example session

```
👤 You: I want to go to Goa from Delhi for 5 days in August

🤖 Aria: Great! When in August would you like to travel, and will you be
   returning to Delhi?

👤 You: Departing August 10, returning August 15, just me

🤖 Aria: Perfect! I have everything I need.
   📍 Delhi → Goa
   📅 2026-08-10 → 2026-08-15
   👤 1 adult | Economy
   Would you like me to search for the best available flights now?

👤 You: yes

🤖 Aria: [searches flights...]
   Here are the best available flights I found:
   1. IndiGo 6E 716  DEL → GOI | 10 Aug, 06:10 → 08:45 | 2h 35m | Nonstop ...
   2. Air India AI 204 ...
   ...
   💡 My recommendation: Option 1 — IndiGo 6E 716 (best value)
   Which flight would you like to select?

👤 You: 1
...
```

---

## State Management

All session data lives in a single `AppState` object that is persisted across
every LangGraph node:

```python
AppState
 ├── trip:         TripState          # Origin, destination, dates, passengers
 ├── conversation: ConversationState  # Message history, turn count
 ├── flights:      FlightState        # Search results, selected, prebook record
 ├── hotels:       HotelState         # Per-day search results, selections, prebooks
 ├── itinerary:    ItineraryState     # Draft + final itinerary
 ├── preferences:  UserPreferences    # Hotel area, meal plan, amenities, interests
 ├── current_stage: WorkflowStage     # Drives the LangGraph router
 └── pending_action: PendingAction    # Confirmation gate tracker
```

---

## Replacing Dummy Agents with Real APIs

The dummy data layer is fully isolated inside the LLM calls in each agent.
To connect to real APIs:

**Flight Agent → Lite API**
```python
# In agents/flight_agent.py, replace _call_llm() calls in search_flights() with:
import lite_api
offers = lite_api.OfferRequests.create(...)
# Map lite offer objects to FlightOption Pydantic models
```

**Hotel Agent → LiteAPI**
```python
# In agents/hotel_agent.py, replace _call_llm() calls in search_hotels() with:
import requests
response = requests.get("https://api.liteapi.travel/v2.0/data/hotels", ...)
# Map LiteAPI response to HotelOption Pydantic models
```

All public method signatures, return types, and the Itinerary Agent's
instruction-building logic remain unchanged.

---

## Key Design Decisions

- **Supervisor → Worker architecture** — the Itinerary Agent never performs
  flight or hotel logic itself; it only delegates via natural-language instructions.
- **Structured output contract** — agents always return Pydantic models, never
  free-form text, so the orchestrator gets type-safe, validated data.
- **Data-driven routing** — workflow transitions are determined entirely by
  `state.current_stage`; there are no hardcoded step-to-step edges.
- **Confirmation before every action** — `PendingAction` enum tracks what is
  awaiting user approval; nodes will not advance until `user_confirmed=True`.
- **Lazy agent singletons** — LLM clients are created once and reused, so the
  graph can be imported cheaply without hitting the OpenAI API.

---

## Dependencies

| Package | Purpose |
|---|---|
| `langgraph` | Multi-node stateful workflow graph |
| `langchain` | LLM abstraction and message types |
| `langchain-openai` | ChatOpenAI integration |
| `pydantic` | Data validation and serialisation |
| `pydantic-settings` | Environment variable configuration |
| `python-dotenv` | `.env` file loading |
| `rich` | Beautiful terminal output |

