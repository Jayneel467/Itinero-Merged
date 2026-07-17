# AI Travel Planner (v2)

A production-quality **multi-agent AI travel booking system** built with
[LangGraph](https://github.com/langchain-ai/langgraph) and
[LangChain](https://github.com/langchain-ai/langchain).

The system behaves like a professional travel consultant — one question at a
time, strict validation, round-trip flight support, passenger detail
collection, payment simulation, unique booking IDs, and a complete
day-by-day itinerary.

> Open `architecture.drawio` in [diagrams.net](https://app.diagrams.net)
> for the full colour-coded visual diagram. Nodes marked ✨ are new in v2.

---

## What's New in v2

| # | Improvement | Details |
|---|---|---|
| 1 | **Strict requirement collection** | Asks exactly ONE missing field per turn. Never assumes cabin class, trip type, or budget. Validates dates before advancing. |
| 2 | **Round-trip flight support** | Searches both outbound and return legs in one call. User selects each flight separately. Both appear in summary, prebook, and final itinerary. |
| 3 | **Passenger details** | Collects first name, last name, email, and phone for every passenger. Validates email format and phone number before advancing. |
| 4 | **Payment step** | Shows total cost before confirming. Simulates payment processing. Ready to swap with a real payment gateway. |
| 5 | **Unique booking IDs** | `FBK-XXXXXXXXXX` for flight bookings, `HBK-XXXXXXXXXX` for hotel bookings — separate from pre-booking `FPB-`/`HPB-` IDs. |
| 6 | **Date validation** | Departure date must be in the future. Return date must be after departure date. Errors shown immediately. |
| 7 | **Hotel segmentation** | Hotels searched by actual itinerary location zones from the draft, not fixed day splits. |
| 8 | **Full booking flow** | Pre-book → Passenger Details → Payment → Final Booking. Never stops at pre-book. |

---

## Architecture

```
                        User
                          │
                          ▼
                Itinerary Agent (Main)
                          │
      ┌───────────────────┼───────────────────┐
      │                   │                   │
      ▼                   ▼                   ▼
Conversation         AppState            Workflow Manager
Manager              (Centralized)       (LangGraph nodes)

── FLIGHT WORKFLOW ──────────────────────────────────
  Requirement Collection (1 question / turn)
        │
  Confirm: Search Flights?  ← confirmation gate
        │
  Flight Search (outbound + return)
        │
  Select Outbound Flight
        │
  Select Return Flight  ← NEW (round-trip only)
        │
  Confirm: Pre-book?  ← confirmation gate
        │
  Flight Pre-book  →  FPB-ID stored
        │
  Passenger Details  ← NEW (name · email · phone)
        │
  Flight Payment  →  FBK-ID generated  ← NEW
        │
── ITINERARY WORKFLOW ───────────────────────────────
  Draft Itinerary Generation
        │
  User Reviews / Modifies
        │
── HOTEL WORKFLOW ───────────────────────────────────
  Hotel Search (per itinerary zone, day-by-day)
        │
  User Selects Hotel (per zone)
        │
  Confirm: Pre-book all hotels?  ← confirmation gate
        │
  Hotel Pre-book  →  HPB-IDs stored
        │
  Hotel Payment  →  HBK-IDs generated  ← NEW
        │
  Final Itinerary  →  All booking IDs included
        │
  User  ✅
```

---

## Agents

### 1. Itinerary Agent (Main Orchestrator) — `gpt-4o`
- Converses with the user; asks ONE missing field at a time.
- Validates dates, passenger counts, email, and phone.
- Builds natural-language instructions for worker agents.
- Orchestrates the full booking flow including passenger details and payment.
- Generates draft and final itineraries via LLM.
- Enforces "confirm before every major action" throughout.

### 2. Flight Agent (LLM Worker) — `gpt-4o-mini`
- Receives instructions from the Itinerary Agent only.
- Generates realistic dummy flights for both outbound and return legs.
- Searches, filters, ranks, and recommends.
- Pre-books and returns `FPB-` prebook IDs.
- **Swap to real API:** Replace `_call_llm()` with a [Duffel API](https://duffel.com) call.

### 3. Hotel Agent (LLM Worker) — `gpt-4o-mini`
- Receives instructions from the Itinerary Agent only.
- Searches hotels per itinerary location zone with full filter support.
- Pre-books and returns `HPB-` prebook IDs.
- **Swap to real API:** Replace `_call_llm()` with a [LiteAPI](https://www.liteapi.travel) call.

---

## Project Structure

```
ai_travel_planner/
├── run.py                          ← entry point
├── requirements.txt
├── pyproject.toml
├── .env.example
├── architecture.drawio             ← draw.io diagram (v2 — open in diagrams.net)
├── README.md
└── ai_travel_planner/
    ├── main.py                     ← conversation loop + _NODE_MAP (19 stages)
    ├── agents/
    │   ├── itinerary_agent.py      ← orchestrator: collection, validation, payment
    │   ├── flight_agent.py         ← flight search (outbound + return)
    │   └── hotel_agent.py          ← hotel search per zone
    ├── graph/
    │   ├── nodes.py                ← 19 LangGraph node functions
    │   └── workflow.py             ← StateGraph + master router
    ├── state/
    │   └── models.py               ← all Pydantic models (incl. v2 models)
    └── utils/
        ├── config.py               ← Settings
        ├── logger.py               ← structured logging
        └── display.py              ← Rich console helpers
```

---

## State Models

```
AppState
 ├── trip:           TripState             # origin, dest, dates, passengers, cabin
 ├── conversation:   ConversationState     # message history, turn count
 ├── flights:        FlightState
 │     ├── search_results[]               # outbound options
 │     ├── return_search_results[]  ✨    # return options (round-trip)
 │     ├── selected_flight                # chosen outbound
 │     ├── selected_return_flight   ✨    # chosen return
 │     ├── prebook (FPB-ID)
 │     ├── return_prebook (FPB-ID)  ✨
 │     ├── booking (FBK-ID)         ✨    # final confirmed booking
 │     └── return_booking (FBK-ID)  ✨
 ├── hotels:         HotelState
 │     ├── search_results_by_day{}        # per zone
 │     ├── selected_hotels{}
 │     ├── prebooks{} (HPB-IDs)
 │     └── bookings{} (HBK-IDs)    ✨    # final confirmed bookings
 ├── itinerary:      ItineraryState       # draft + final
 ├── preferences:    UserPreferences      # hotel area, meal, amenities
 ├── passengers:     PassengerDetail[]  ✨ # name, email, phone per pax
 ├── flight_payment: PaymentRecord      ✨ # PAY-ID, amount, status
 └── hotel_payment:  PaymentRecord      ✨ # PAY-ID, amount, status
```

---

## Workflow Stages (19 total)

| Stage | Type | Description |
|---|---|---|
| `greeting` | Auto | Welcome message |
| `requirement_collection` | Await input | One question at a time |
| `flight_search_confirmation` | Await input | Confirm before searching |
| `flight_search` | Auto | Searches outbound + return |
| `flight_selection` | Await input | Pick outbound flight |
| `return_flight_selection` ✨ | Await input | Pick return flight (round-trip) |
| `flight_prebook_confirmation` | Await input | Confirm pre-booking |
| `flight_prebook` | Auto | Pre-books both legs |
| `passenger_details` ✨ | Await input | Collect name/email/phone |
| `flight_payment` ✨ | Await input | Confirm payment → FBK-ID |
| `draft_itinerary` | Auto | Generate day-wise draft |
| `draft_itinerary_review` | Await input | Approve or modify |
| `hotel_search` | Await input | Per zone, day-by-day |
| `hotel_selection` | Await input | Pick hotel per zone |
| `hotel_prebook_confirmation` | Await input | Confirm bulk pre-book |
| `hotel_prebook` | Auto | Pre-books all hotels |
| `hotel_payment` ✨ | Await input | Confirm payment → HBK-IDs |
| `final_itinerary` | Auto | Merge everything |
| `completed` | — | Session done |

---

## Setup

```bash
cd ai_travel_planner
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
copy .env.example .env          # then add OPENAI_API_KEY
python run.py
```

### .env variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Required |
| `ITINERARY_AGENT_MODEL` | `gpt-4o` | Main orchestrator |
| `FLIGHT_AGENT_MODEL` | `gpt-4o-mini` | Flight worker |
| `HOTEL_AGENT_MODEL` | `gpt-4o-mini` | Hotel worker |
| `LOG_LEVEL` | `INFO` | Set `DEBUG` for verbose LLM I/O |

---

## Sample Conversation

```
🤖 Aria: Hello! Where would you like to travel?

👤 You: I want to go to Goa

🤖 Aria: Which city will you be departing from?

👤 You: Delhi

🤖 Aria: When would you like to depart?

👤 You: August 10, 2026

🤖 Aria: Will this be a one-way or round-trip?

👤 You: round trip

🤖 Aria: When would you like to return?

👤 You: August 15

🤖 Aria: How many adults will be travelling?

👤 You: 2

🤖 Aria: Any children travelling with you?

👤 You: none

🤖 Aria: Which cabin class — Economy, Business, or First?

👤 You: economy

🤖 Aria: ✅ Here's your trip summary:
  Delhi → Goa | 10 Aug – 15 Aug | 2 adults | Economy
  Would you like me to search flights?

👤 You: yes

🤖 Aria: [searches...] OUTBOUND FLIGHTS:
  1. IndiGo 6E 716 ⭐ ...
  2. Air India AI 204 ...
  Which OUTBOUND flight?

👤 You: 1

🤖 Aria: RETURN FLIGHTS:
  1. IndiGo 6E 719 ⭐ ...
  Which RETURN flight?

👤 You: 1

🤖 Aria: Outbound + Return summary. Pre-book? (yes/no)

👤 You: yes

🤖 Aria: Pre-booked! Please provide Passenger 1 first name.

👤 You: Raj

🤖 Aria: Last name?
...
🤖 Aria: ✅ All details collected. Total: ₹12,400. Confirm payment?

👤 You: yes

🤖 Aria: 🎉 Flight Booking ID: FBK-A3F2E1B4C9
        Return Booking ID: FBK-D7E8A1F2B3
        Payment ID: PAY-C1D2E3F4A5
```

---

## Replacing Dummy Data with Real APIs

**Flight Agent → Duffel API**
```python
# agents/flight_agent.py — replace _call_llm() in search_flights() with:
from duffel_api import Duffel
client = Duffel(access_token="...")
offers = client.offer_requests.create(...)
# Map Duffel offers → FlightOption Pydantic models
```

**Hotel Agent → LiteAPI**
```python
# agents/hotel_agent.py — replace _call_llm() in search_hotels() with:
import requests
resp = requests.get("https://api.liteapi.travel/v2.0/data/hotels", ...)
# Map response → HotelOption Pydantic models
```

All method signatures, return types, and Itinerary Agent logic stay identical.

---

## Key Design Decisions

- **One question per turn** — `_REQUIREMENT_COLLECTION_PROMPT` enforces a strict priority queue for missing fields; the LLM cannot ask two things at once.
- **Round-trip as two independent lists** — outbound and return flights are stored separately in `FlightState` so each can be selected and pre-booked independently.
- **Pre-book ≠ Final booking** — `FPB-`/`HPB-` IDs are temporary holds; `FBK-`/`HBK-` IDs are generated only after payment confirmation.
- **Passenger validation** — `PassengerDetail.is_complete()` checks regex for email and phone before the workflow can advance.
- **Stage-driven routing** — `_NODE_MAP` in `main.py` maps every `WorkflowStage` value to a node function; adding a new step requires only adding one enum value and one function.

---

## Dependencies

| Package | Purpose |
|---|---|
| `langgraph` | Stateful workflow graph |
| `langchain` + `langchain-openai` | LLM abstraction |
| `pydantic` + `pydantic-settings` | Models and config |
| `python-dotenv` | `.env` loading |
| `rich` | Terminal formatting |
