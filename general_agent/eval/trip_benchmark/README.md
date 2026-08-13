# Vero trip-planning benchmark

Not a companion Q&A test. This suite checks whether Vero can **plan trips** for
people with different transport systems, currencies, visas, budgets, diets,
ages, group types, and travel styles — including deliberately vague prompts.

## What’s in here

| File | What |
|------|------|
| `prompts_300.py` | 300 prompts in 6 buckets (A–F) |
| `killers_50.py` | 50 constraint-satisfaction “killer” prompts |
| `metrics.py` | 20 evaluation dimensions |
| `personas.py` | IN vs US persona + `page_context` hints |
| `run.py` | Live `/api/chat` runner |

Dump editable copies:

```bash
.venv/bin/python -m general_agent.eval.trip_benchmark.run --dump-jsonl
```

## Buckets

| | Persona | Scope | IDs |
|---|---------|-------|-----|
| **A** | 🇮🇳 Indian | Within-city | 1–50 |
| **B** | 🇮🇳 Indian | Intercity / interstate | 51–100 |
| **C** | 🇮🇳 Indian | Difficult domestic | 101–140 |
| **D** | 🇮🇳 Indian | International | 141–200 |
| **E** | 🇺🇸 US | Domestic | 201–250 |
| **F** | 🇺🇸 US | International | 251–300 |

Some prompts are tagged `vague=true` because real users do not give perfect specs.

## 20 metrics (score every applicable dimension 1–5)

| Metric | Vero must |
|--------|-----------|
| Intent | Understand what the traveler actually wants |
| Feasibility | No physically impossible schedules |
| Geography | Stops ordered intelligently |
| Transportation | Realistic mode and time |
| Budget | Stay within the stated total |
| Personalization | Food / style / pace / group |
| Live information | Search when current info matters |
| Visa / entry | Never guess immigration |
| Age restrictions | Detect 18+ / 21+ / 25+ |
| Opening hours | Check rather than assume |
| Weather adaptation | Modify plans intelligently |
| Booking awareness | Use existing reservations |
| Conflict detection | Notice overlapping plans |
| Recovery | Replan when something fails |
| Uncertainty | Known vs estimated vs unknown |
| Hallucination resistance | Never fabricate fare / hotel / visa / availability |
| Cost optimization | Whole trip, not one sticker price |
| Travel-time optimization | No zig-zag itineraries |
| Actionability | User knows the next step |
| Agent behavior | Actions only when authorized |

Each prompt stores **multiple expected behaviors**, not one gold itinerary. A
fluent Bali essay can still fail.

**Hard fail** (any one is enough): invents a live fact, ignores a hard constraint,
impossible day, unauthorized booking/change, labels an estimate as confirmed.

## Killer set

~50 prompts derived from the 300, made much nastier. Flagships:

- **K01** — IN couple, ₹1.8L, 7-night honeymoon, pure veg no-egg, no drink, no drive, one pax 18, luxury 3N, max 1 hotel change → compare TH / Bali / VN / MU, eliminate, pick one.
- **K02** — PA 18+19, $2500, no car, 7N US romantic, hotel age-legal, max hop 6h → compare BOS / VA / MCO / CHI / ME.

If Vero consistently nails K01–K50, it is closer to a real travel agent than a
generic itinerary generator.

## Run

Vero must be up on `:8001`.

```bash
# 1 per bucket + K01 + K02 (sanity)
.venv/bin/python -m general_agent.eval.trip_benchmark.run --smoke

# specific 300-set ids
.venv/bin/python -m general_agent.eval.trip_benchmark.run --ids 1,52,102,151,219,281

# flagship killers only
.venv/bin/python -m general_agent.eval.trip_benchmark.run --killer-ids K01,K02

# first 5 of bucket A
.venv/bin/python -m general_agent.eval.trip_benchmark.run --bucket A --limit 5

# all 50 killers (slow — live tools)
.venv/bin/python -m general_agent.eval.trip_benchmark.run --killers
```

Results → `general_agent/eval/trip_benchmark/last_run.json`.

Each prompt uses a **fresh `thread_id`**. Do not send `conversation_id` — Vero
ignores it and all evals collapse onto `default-session`.

Auto-flags in the runner are **cheap red flags only**. Full scoring still needs
a human (or LLM-judge) pass on the 20 metrics + expected behaviors.
