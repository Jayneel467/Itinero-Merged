# Vero + Catalog AI stack

## Principle: thinking-first

See **[AI_DEVELOPMENT.md](./AI_DEVELOPMENT.md)** for the full production AI lifecycle
(spec → prompt → gates → eval → canary → rollback).

Vero routes and answers with **model judgment** by default. Regex / stubs / instant replies are **hard locks only** where money, safety, or grounded UI facts must not drift.

| Layer | Thinking | Hard lock (keep rules) |
|-------|----------|------------------------|
| Capability router (`supervisor/intent_router.py`) | LLM JSON classify (`VERO_LLM_ROUTER=1`) | Mid-booking / payment sticky; narrow pending trip slots |
| Chat dispatch (`supervisor/main.py`) | visa / hotels / trains / sports → live `research` | Flight payment path; companion safety |
| LLM lane (`general_agent/llm/model.py`) | Chat/plan → DeepSeek (cheap default) | Inventory / money → OpenAI tools; post-tool → DeepSeek synth; daily budget degrade |
| Page-aware | Explore / soft Q → LLM + page brief | Live-unknown refusals; PNR/baggage; on-screen cheapest/fastest |
| Catalog | Gemini authors packages | Ops rate limits / admin auth |

`VERO_LLM_ROUTER=0` falls back to slim heuristics (degraded, not primary).

## Lanes

| Surface | Model | Role |
|---------|--------|------|
| **Vero chat / plan / culture** | DeepSeek (`DEEPSEEK_API_KEY`) | Default free lane (CFO) |
| **Vero tools / booking** | OpenAI (`ITINERO_MODEL`) | Flights, hotels, pay, live search only |
| **Vero post-tool synth** | DeepSeek | Writeups after tools |
| **Capability router** | OpenAI mini (`VERO_ROUTER_MODEL`) | Tiny classify (`max_tokens=80`) |
| **Catalog factory** | Gemini (`GEMINI_API_KEY`) | Packages + Explore author (not Vero) |

Cost planner: [AI_COST.md](./AI_COST.md) — daily budget, fair-use, Vero never paywalled.

## Env

```bash
# general_agent/.env + supervisor/.env
OPENAI_API_KEY=...
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-chat
VERO_LLM_COMBO=1
VERO_LLM_ROUTER=1
# VERO_ROUTER_MODEL=gpt-4o-mini

GEMINI_API_KEY=...
CATALOG_LLM_PROVIDER=gemini
CATALOG_LLM_MODEL=gemini-2.5-flash
```

`VERO_LLM_COMBO=0` forces OpenAI-only for Vero.
`VERO_LLM_ROUTER=0` uses heuristic capability routing only.

## Lane rules

- After tool results → DeepSeek **synth** (no tools bound)
- Chat / culture / packing / explicit plans → DeepSeek **planner** (default)
- Live inventory words (flights, hotels, restaurants search, pay) → OpenAI **tools**
- Negations like “no flights” do **not** force OpenAI tools
- Budget **protect** / device OpenAI quota → DeepSeek unless pay/book/cancel

## QA

```bash
# CI-mandatory (no API keys)
.venv/bin/python -m supervisor.tests.test_ai_quality_gates

# Live stack (skips missing keys)
.venv/bin/python -m supervisor.tests.test_ai_stack_smoke
```

Lifecycle: [AI_DEVELOPMENT.md](./AI_DEVELOPMENT.md)
