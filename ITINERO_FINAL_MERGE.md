# Itinero Final Merge — Vero-first architecture

Branch: `itinero-final-merge` (based on `jigar` + Vero UX hardening)

**Do not push this work to `manish`, `amit`, `tanu`, `jigar`, or to `ShvInfotech/itinero`.**
Only publish this branch on `Jayneel467/Itinero-Merged` when ready.

## What the user sees

There is only **Vero** — Itinero’s AI travel buddy.

Users never see: General Agent, Supervisor, Itinerary Agent, Flight Agent, Hotel Agent, route paths, or specialist names.

## What runs under the hood

```
User ↔ Vero Chat UI
         ↓
   general_agent.run (:8001)   ← LLM + orchestration (this is "Vero")
         ↓
   escalate_to_itinerary / tools
         ↓
   itinerary_bridge → ITINERARY_AGENT (flights / hotels / day plan)
         ↓
   Cards (flight / hotel) → select → save into itinerary
         ↓
   Payment / PDF (later)
```

Manual OTA pages (flights/hotels forms) can still use `supervisor` on `:8000` for structured LiteAPI booking. Chat always goes to Vero on `:8001`.

## Branches reviewed

| Branch | Role |
|--------|------|
| `jigar` | Best merged General ↔ Itinerary + card UI (`ui/`) — **base of this branch** |
| `manish` | Deep itinerary backend (hotels rooms, distance, etc.) — already in jigar ancestry |
| `amit` | Live Hotels LiteAPI on product Hotels page (now in `supervisor/hotel_structured.py`) |
| `tanu` | Hotel booking agent cleanup |
| `main` | Supervisor gateway + product `itinero` frontend (older than manish/jigar stack) |

## Run the merged Vero flow

```bash
# Terminal 1 — Vero orchestrator
cd /path/to/Itinero-Merged
uvicorn general_agent.run:app --reload --port 8001

# Terminal 2 — Card chat UI (jigar)
cd ui && npm install && npm run dev   # http://localhost:3000

# Optional — product frontend
cd itinero && npm install && npm run dev   # http://localhost:5173/itinero/
# Set VITE_VERO_API_URL=http://127.0.0.1:8001
```

## Key files

- `general_agent/llm/prompts.py` — Vero identity + “never name agents” guardrail
- `general_agent/services/user_facing.py` — reply sanitizer
- `general_agent/itinerary_bridge.py` — orchestration into itinerary engine
- `general_agent/run.py` — public chat API (always returns `routed_to: vero`)
- `itinero/src/features/vero/services/veroService.js` — product chat → `:8001`
