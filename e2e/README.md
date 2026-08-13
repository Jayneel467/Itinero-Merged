# End-to-end smoke tests

Cross-frontend Playwright suite plus orchestration via `scripts/run-site-audit.sh`.

## Layout

```
e2e/
  fixtures/          # Route state seeds (hotel/flight confirmation)
  tests/
    itinero/         # Main Vite app (:5173/itinero/)
    itinero-web/     # Next.js marketing app (:3001)
    ui/              # Legacy Vero chat shell (:3000)
  utils/console.ts   # Console guard + sessionStorage helpers
  playwright.config.ts
```

Generated output (gitignored): `e2e/reports/` (Playwright HTML/JSON), root `reports/` (audit summary logs).

## Run everything

```bash
./scripts/run-site-audit.sh
```

Force-restart supervisor in sandbox first:

```bash
ITINERO_AUDIT_RESTART=1 ./scripts/run-site-audit.sh
```

## Backend only

```bash
./scripts/dev-supervisor.sh
.venv/bin/python -m pytest supervisor/tests -q
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `ITINERO_API_BASE` | `http://127.0.0.1:8000` | Supervisor URL |
| `ITINERO_RUN_LIVE_BOOKING` | `1` | Set `0` to skip LiteAPI calls |

Contract tests (search → prebook) must pass. Book/complete steps skip when LiteAPI requires Stripe capture.

## Frontend only

```bash
cd e2e
npm install
npx playwright install chromium
npm test
```

| Variable | Default |
|----------|---------|
| `ITINERO_URL` | `http://127.0.0.1:5173/itinero/` |
| `ITINERO_WEB_URL` | `http://127.0.0.1:3001/` |
| `UI_URL` | `http://127.0.0.1:3000/` |

## Coverage

**Backend** (`supervisor/tests/`): health, capabilities, hotel/flight search+prebook, optional book/complete in sandbox.

**Frontend**: public route loads, hotel confirmation actions, flight success actions, itinero-web CTAs, ui chat with stubbed `/api/chat`.

Console/page errors fail tests except known benign patterns (favicon 404, React devtools warnings).
