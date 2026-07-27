# Primary frontend (ShvInfotech Vite)

Cloned from https://github.com/ShvInfotech/itinero.git (`main` @ fbb5b01+ local wiring).

## Setup

```powershell
cd itinero
copy .env.example .env
npm install
npm run dev
```

App: http://localhost:5173/itinero/

Requires the booking API at http://127.0.0.1:8000 (`VITE_API_URL`).

### Manual vs Vero

- **Manual:** homepage / flights search bar → `POST /api/flights/search` → results. No AI.
- **Vero:** only `/itinero/vero` (or floating Ask Vero) → `POST /api/chat`.

## Relation to `itinero-web/`

| Folder | Stack | Role |
|--------|-------|------|
| **`itinero/`** | Vite + React Router | **Primary** — Figma UI, live flights |
| `itinero-web/` | Next.js | Legacy bridge (AI chat / early OTA); keep for reference |

Do not run both as “the” product UI without a clear choice — prefer this folder.
