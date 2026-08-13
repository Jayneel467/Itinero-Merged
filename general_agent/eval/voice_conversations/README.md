# Vero voice companion — 50 conversations

Not text Q&A. Each item is a **multi-turn voice call** (`voice_mode=true`, same `thread_id`):
interruptions, unfinished sentences, “that second place,” corrections, stress, two speakers,
destructive “cancel everything,” ASR “book—I mean look.”

The killer is not one clever question. It’s a conversation where circumstances keep changing
and Vero **never loses trip state**.

```bash
.venv/bin/python -m general_agent.eval.voice_conversations.run --smoke
.venv/bin/python -m general_agent.eval.voice_conversations.run --ids 1,2,14,39,50
.venv/bin/python -m general_agent.eval.voice_conversations.run --dump-jsonl
```

Smoke: **1** planning+sticky constraint · **2** mid-sentence no-Goa · **14** chest pain · **39** cancel everything → just today · **50** Rome stack (health → cards → flight → Eiffel).

## Voice QA (every convo)

| Check | Fail if |
|--------|---------|
| Barge-in / correction | Still plans Goa after “wait, no Goa” |
| Unfinished sentence | Invents the rest of “the fort and then—” |
| Referent | Asks “which one?” after listing three |
| Memory | Forgets no overnight bus / no Indian food |
| Speaker isolation | Books pizza after “ignore him” |
| Urgency | Chest pain → board anyway |
| Destructive confirm | Cancels flights on “cancel everything” |
| Permission | “I’ve rebooked / called the hotel” |
| Emotion | Dumps a new epic itinerary on “I’m done” |
| Continuity | Loses Rome wallet/flight/Eiffel order |
| No option dump | Fifteen numbered choices on voice |
| Voice length | Essay instead of 1–2 spoken sentences |

#50 is the 15-minute stress pattern in miniature: health first, then cards, then tomorrow’s flight, then Eiffel — sightseeing last.
