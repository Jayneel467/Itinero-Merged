# Vero AI development cycle (production)

Thinking-first agentic product. Rules exist only for money, safety, and grounded UI facts.

## Lifecycle (every AI change)

1. **Spec** — user outcome + failure modes (hallucination, unauthorized book, safety miss).
2. **Prompt / tool** — change `llm/prompts.py` or tools; bump `PROMPT_VERSION` / `VERO_AGENT_BUILD`.
3. **Hard locks** — keep payment sticky, companion safety, live-unknown refusals, client ID stripping.
4. **Offline gates** — `python -m supervisor.tests.test_ai_quality_gates` (CI required).
5. **Live smoke** — `python -m supervisor.tests.test_ai_stack_smoke` with keys.
6. **Eval packs** (pre-release):
   - `general_agent/eval/vero_killshots.py`
   - `general_agent/eval/trip_benchmark/run.py`
   - `general_agent/eval/companion_stress/run.py`
   - `general_agent/eval/voice_conversations/run.py`
7. **Canary** — ship behind `VERO_*` flags; watch `vero_turn` logs + `/api/health` readiness.
8. **Rollback** — pin prior `VERO_PROMPT_VERSION` / `VERO_AGENT_BUILD`; `VERO_LLM_ROUTER=0` / `VERO_LLM_COMBO=0` degrade paths.

## Agentic loop (runtime)

```
user → capability router (LLM + hard locks)
     → Vero ReAct graph (agent ⇄ tools) [recursion_limit]
     → optional itinerary escalation
     → sanitize + claim scrub + cards
     → agent_meta (trace_id, tools, latency, build)
```

Envelope: `general_agent/runtime.py`  
Checkpointer: `general_agent/checkpointing.py` (`VERO_CHECKPOINT=sqlite|memory`)  
Graph: `general_agent/graph/workflow.py`  
Entry: `general_agent/agent.py`

## Hard locks (do not “think away”)

| Lock | Why |
|------|-----|
| Payment / mid-booking sticky | Money integrity |
| Companion medical/safety tags | Harm prevention |
| Live-unknown / PNR invent refuse | Hallucination |
| Strip client offer/prebook IDs | Forged page_context |
| Tool error honesty | No fake confirms |
| On-screen cheapest/fastest | Grounded UI fact |

## Env knobs

| Var | Default | Role |
|-----|---------|------|
| `VERO_LLM_ROUTER` | `1` | LLM capability classify |
| `VERO_LLM_COMBO` | `1` | OpenAI tools + DeepSeek plan/synth |
| `VERO_RECURSION_LIMIT` | `28` | LangGraph step budget |
| `VERO_PROMPT_VERSION` | `2026.08.13.1` | Prompt pin |
| `VERO_AGENT_BUILD` | `2026.08.13.prod1` | Build pin |
| `SENTRY_DSN` | — | Required in prod readiness |

## Definition of done (AI PR)

- [ ] Offline gates green
- [ ] Prompt/build bumped if behavior changed
- [ ] No new stub replies for tool domains
- [ ] Money / safety paths manually sanity-checked
- [ ] Killshot or targeted eval if risk is high
