# Itinero Web

Next.js (App Router) front-end for Itinero — homepage matched to [pixano.in/itinero](https://pixano.in/itinero/), with **two separate product flows**:

| Flow | Entry | What it is |
|------|--------|------------|
| **Manual booking** | `/book` (and `/book/hotels`) | Form/wizard: search → results → traveler → checkout |
| **AI end-to-end** | `/ai` | Supervisor chat routing to Research / Flights / Hotels / Itinerary specialists |

Homepage CTAs clearly choose between the two; each screen can switch to the other without merging UIs.

## Run (web only)

```bash
cd itinero-web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

This app is **live-only**: there is no mock/demo data. If the Python gateway is
down, chat and search show an honest error instead of inventing flights or plans.
Start the supervisor on port **8000** first (see below).

## Run with live agents

1. Start the supervisor gateway (see `../supervisor/README.md`) on port **8000**.
2. Optionally set in `itinero-web/.env.local`:

```env
NEXT_PUBLIC_SUPERVISOR_URL=http://127.0.0.1:8000
```

3. `npm run dev` — the client calls the gateway first, then falls back to mocks if unreachable.

## Scripts

- `npm run dev` — development
- `npm run build` — production build
- `npm run start` — serve production build

## Key paths

- `src/app/page.tsx` — Pixano-style marketing homepage
- `src/app/ai/page.tsx` — AI supervisor chat
- `src/app/book/` — manual flight wizard
- `src/app/book/hotels/` — manual hotel stub search
- `src/lib/api.ts` — gateway + mock client
- `src/lib/types.ts` — OrchestratorInput/Output-shaped types
- `public/images/` — assets downloaded from the Pixano CDN for visual parity
- `public/fonts/TTHovesPro.ttf` — brand font from Pixano

## Design notes / gaps vs pixano.in/itinero

- Colors, tokens, typography, section copy, destinations, deals, and reviews mirror the live site (extracted from its JS/CSS).
- Full interactive calendar / airport typeahead / auth modal from Pixano are **not** fully recreated; search teaser on the hero links into our `/book` and `/ai` flows instead.
- Some Pixano images expire (GCS `expires_30_days`); local copies are in `public/images/`.
