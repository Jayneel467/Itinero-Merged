# Itinero General Agent — Internal Architecture

## Execution Flow

```
User message
     │
     ▼
 agent_node  ──────────────────────────────────────────────────────────────────
 (GPT-4o)    Prepends fresh system prompt (with live datetime) to message history.
     │        LLM decides: plain reply OR call tool(s).
     │
     ├── No tool call needed ──────────────────────────────────────────► END
     │
     └── Tool call(s) requested
               │
               ▼
          tools_node  (LangGraph ToolNode — executes whichever tools LLM asked for)
               │
               ├── Tool result is normal ──────────────────► back to agent_node
               │                                             (loop until done)
               │
               └── Tool result contains "ESCALATE_TO_SUPERVISOR"
                         │
                         ▼
                   supervisor_node ────────────────────────────────────────► END
                   (shows handoff message; real supervisor invocation is TODO)
```

---

## Nodes

| Node                | File               | Runs when                                      | Does                                                                                  |
| ------------------- | ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `agent_node`      | `graph/nodes.py` | Every turn, always first                       | Builds system prompt + message history → calls LLM → returns reply or tool requests |
| `tools_node`      | LangGraph built-in | LLM returned ≥1 tool call                     | Executes all requested tools, appends`ToolMessage` results                          |
| `supervisor_node` | `graph/nodes.py` | Any tool result contains the escalation signal | Shows "connecting to specialist team" message → terminates turn                      |

---

## Tools — When Each Gets Called

| Tool                       | Called when user…                                                                                                    | Underlying API            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `destination_search`     | Asks about safety, visa, fuel price, local costs, destination facts, or anything that could be stale in training data | Tavily                    |
| `get_weather`            | Asks about current weather, climate, or what to pack                                                                  | OpenWeather               |
| `search_hotels`          | Asks to see hotel options — even without dates (agent assumes a window)                                              | LiteAPI`/hotels/rates`  |
| `search_flights`         | Asks to see flight options — even without dates (agent assumes a window)                                             | LiteAPI`/flights/rates` |
| `get_route`              | Asks for distance, drive time, or road-trip duration between two places                                               | Google Routes API         |
| `search_places`          | Asks "what's near X", wants attractions / restaurants / landmarks                                                     | Google Places API         |
| `geocode_location`       | Place name is ambiguous or coordinates are needed                                                                     | Google Geocoding API      |
| `escalate_to_supervisor` | User wants to book, wants a full multi-day itinerary, wants tracking/PDF                                              | Signal-only (no API)      |

---

## Tool → Service → Provider Chain

Every tool is a thin wrapper. The real work is one layer down:

```
llm/tools.py          (thin @tool — validates args, calls service)
      │
      ▼
services/travel_service.py   (builds payload, parses JSON, formats string)
      │
      ▼
providers/*.py               (raw HTTP call, raises ProviderRequestError on failure)
      │
      ▼
External API                 (Tavily / OpenWeather / LiteAPI / Google)
```

If the provider call fails → `ProviderRequestError` is caught in `travel_service.py` → returns a plain error string to the LLM → LLM tells the user something went wrong.

---

## State

```python
AgentState = {
    "messages":     list   # full conversation history — add_messages keeps appending
    "trip_context": dict   # reserved scratchpad (destination, dates, budget) — not yet written
}
```

`MemorySaver` checkpoints state by `thread_id` → conversation memory persists across turns within a session.

---

## Escalation Signal Flow

```
LLM calls escalate_to_supervisor("book hotel in Goa", "user wants to book")
    │
    ▼  tools.py returns:
"ESCALATE_TO_SUPERVISOR|task=book hotel in Goa|reason=user wants to book"
    │
    ▼  _route_after_tools() in workflow.py scans last ToolMessage
finds signal → returns "supervisor"
    │
    ▼  supervisor_node runs → END
```

The signal string is **never shown to the user** — `supervisor_node` generates the actual reply.
