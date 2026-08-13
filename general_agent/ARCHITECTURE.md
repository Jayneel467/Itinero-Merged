# Itinero General Agent (Vero) — Architecture

Canonical product docs: [AI_STACK.md](./AI_STACK.md) · [AI_DEVELOPMENT.md](./AI_DEVELOPMENT.md) · `general_agent/runtime.py`

## Execution flow

```
User message
     │
     ▼
 hard locks (companion safety / live-unknowns / page-aware ranks)
     │
     ▼
 agent_node  (OpenAI tools lane OR DeepSeek planner/synth)
     │        Fresh system prompt each turn (PROMPT_VERSION pinned).
     │
     ├── No tool call ──────────────────────────────────────────► END
     │
     └── Tool call(s)
               │
               ▼
          tools_node  (ToolNode + honest TOOL_ERROR handler)
               │
               ├── ESCALATE_TO_ITINERARY in tool results ──► itinerary_node ──► END
               │
               ├── update_trip_context loop guard (>2) ──────────► END
               │
               └── else ──────────────────────────────────► agent_node (ReAct)
```

After tools, the **synth** lane (DeepSeek) may write the user-facing answer with tools unbound.

Supervisor chat (`supervisor/intent_router.py`) chooses capability first:
`payment` / `flights` / `itinerary` / `research` / `supervisor` — LLM-first with money sticky locks.

## Nodes

| Node | File | Role |
|------|------|------|
| `agent_node` | `graph/nodes.py` | LLM reason + tool requests; lane via `choose_lane` |
| `tools` | LangGraph `ToolNode` | Execute tools; never invent success on failure |
| `itinerary` | `graph/nodes.py` | First-turn handoff to `ITINERARY_AGENT` via `itinerary_bridge` |

Subsequent itinerary turns are owned by `agent.py` while `trip_context["engine"] == "itinerary"` (bypass graph until exit).

## Escalation

Signal: `ESCALATE_TO_ITINERARY` from `escalate_to_itinerary` tool → `_route_after_tools` → `itinerary_node`.

(There is **no** `supervisor_node` / `ESCALATE_TO_SUPERVISOR` in live code.)

## Memory / checkpointer

| Backend | Env | Notes |
|---------|-----|-------|
| SQLite (default) | `VERO_CHECKPOINT=sqlite` | Durable across process restarts (single node) |
| Memory | `VERO_CHECKPOINT=memory` | Process-local only — demos / tests |
| Path | `VERO_CHECKPOINT_PATH` | Default `general_agent/data/vero_checkpoints.sqlite` |

Multi-replica production still needs Redis/Postgres saver (P1) so all Vero workers share `thread_id` state. Supervisor Redis sessions (`supervisor/session_store.py`) are separate from this checkpointer — keep `session_id` ≡ `thread_id`.

## Runtime envelope

Every turn returns `agent_meta`: `trace_id`, tools, latency, `agent_build`, `prompt_version`, path.
Recursion bound: `VERO_RECURSION_LIMIT` (default 28).

## State

```python
AgentState = {
    "messages": list,      # add_messages reducer
    "trip_context": dict,  # origin/dates/engine/ui_page/companion flags/…
}
```

## Tool → service → provider

```
llm/tools.py  →  services/*  →  providers/*  →  external APIs
```

Booking money path is sticky in supervisor; Vero tools are search/select/escalate — forged `page_context` hold IDs are stripped in `agent.py`.
