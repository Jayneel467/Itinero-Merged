# Itinero - MVP orchestrator agent

Single LangGraph agent with tools bound directly to it. No sub-agents yet -
this is the baseline everything else builds on top of. Same flow and
behavior as before; this version is reorganized into a layered structure
(config / exceptions / logging at the root, then models / providers /
services / llm / graph) to match team convention.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env   # fill in your API keys
python main.py
```

## Structure

```
itinero_agent/
├── agent.py              # Public API - the ItineroAgent class, import from here
├── config.py              # env vars, API keys, model settings
├── exceptions.py          # domain errors (ConfigurationError, ProviderRequestError)
├── logging_config.py      # lightweight stdlib logging setup
├── models/
│   └── state.py           # AgentState - shared LangGraph state schema
├── providers/              # raw external API clients, no formatting
│   ├── liteapi_provider.py       # LiteAPI hotel/flight rate search
│   ├── google_maps_provider.py   # Routes, Places (New), Geocoding
│   └── weather_provider.py       # OpenWeather
├── services/
│   └── travel_service.py   # business logic + response formatting, calls providers/
├── llm/
│   ├── model.py             # chat model setup, tools bound
│   ├── prompts.py           # SYSTEM_PROMPT - the highest-leverage file here
│   └── tools.py              # thin @tool wrappers, calls services/
├── graph/
│   ├── nodes.py               # agent_node (the reasoning node)
│   ├── workflow.py            # build_graph() - StateGraph wiring
│   └── utils.py                 # saves outputs/graph.png on first run
├── main.py                # CLI entrypoint
├── requirements.txt
├── .env.example
└── outputs/                # graph.png lands here on first run
```

## Flow

```
START -> agent -> [tool call?] -> tools -> agent -> ... -> END
```

One node does the reasoning, one node executes whichever tool(s) it asked
for, and they loop until the agent has enough to answer. `MemorySaver` keeps
conversation history per `thread_id` so the agent remembers earlier turns.
This is unchanged from before - only the file layout moved.

## Using the agent programmatically

```python
from agent import build_agent

itinero = build_agent()
reply = itinero.invoke("What's the weather in Goa?", thread_id="user-123")
print(reply)
```

`agent.py` is the one module anything outside this project should import
from - CLI, a future API layer, a supervisor agent, or an MCP server can all
sit on top of `ItineroAgent` without knowing about the internal layout.

## Tracing / observability

Set `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, and `LANGSMITH_PROJECT` in
`.env` (get a free key at smith.langchain.com) to get full run traces - which
node ran, which tool was called with what arguments, latency, and token
usage - with no code changes. LangChain reads these env vars automatically.
The project doesn't need to exist beforehand - it's auto-created on the
first trace. Leave `LANGSMITH_TRACING` unset to run with no tracing at all.

`logging_config.py` gives you a local, always-available complement to this -
plain console logs (which tool got called, which provider request failed)
that work even without network access to LangSmith.

## Adding tools

1. Add the raw API call in `providers/` (or reuse an existing provider file).
2. Add the parsing/formatting logic in `services/travel_service.py`.
3. Add a thin `@tool`-decorated wrapper in `llm/tools.py` that calls the
   service function, and append it to `ALL_TOOLS`.

Nothing else needs to change - it's automatically bound to the model and
routed by the existing `tools` node in the graph.

## Growing into multi-agent later

When you're ready to split into a supervisor + specialist agents, add new
node functions in `graph/nodes.py` and route to them conditionally in
`graph/workflow.py` instead of calling tools directly from `agent_node`.
`models/state.py` and the message-passing convention don't need to change
for this - it's additive, not a rewrite.

## What changed from the flat layout

If you have the earlier flat `agent/` package version, here's the mapping:

| Old path | New path |
|---|---|
| `agent/config.py` | `config.py` |
| `agent/state.py` | `models/state.py` |
| `agent/llm.py` | `llm/model.py` |
| `agent/graph.py` (SYSTEM_PROMPT) | `llm/prompts.py` |
| `agent/graph.py` (`_agent_node`) | `graph/nodes.py` |
| `agent/graph.py` (`build_graph`) | `graph/workflow.py` |
| `agent/graph_utils.py` | `graph/utils.py` |
| `agent/tools.py` | split into `providers/`, `services/travel_service.py`, `llm/tools.py` |
| *(new)* | `agent.py`, `exceptions.py`, `logging_config.py` |

Tool behavior, prompt content, and graph shape are all unchanged - only the
file organization moved.
