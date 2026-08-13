# Production setup runbook (Itinero)

Concrete steps for the launch items in `LAUNCH_CHECKLIST.md`. Replace
`app.your-domain.com` with your real hostname.

---

## 1. Sentry projects → `SENTRY_DSN` / `VITE_SENTRY_DSN`

Create **three** Sentry projects (same org, separate DSNs):

| Project name | Platform | Env var | Where |
|--------------|----------|---------|--------|
| `itinero-web` | JavaScript / React | `VITE_SENTRY_DSN` | Frontend **build** (Vite inlines it) |
| `itinero-supervisor` | Python | `SENTRY_DSN` | Runtime for `supervisor` |
| `itinero-vero` | Python | `SENTRY_DSN` | Runtime for `general_agent` |

### Create

1. [sentry.io](https://sentry.io) → Create Organization (if needed) → **Create Project**.
2. For each project, copy **Client Keys (DSN)** → Client Key URL
   (`https://…@….ingest.sentry.io/…`).
3. Optional: set `SENTRY_TRACES_SAMPLE_RATE=0.05` (already the code default).

### Wire values

**Supervisor / Vero (runtime secrets):**

```bash
# supervisor vault / host env
SENTRY_DSN=https://…@….ingest.sentry.io/PROJECT_ID_SUPERVISOR
SENTRY_TRACES_SAMPLE_RATE=0.05
SERVICE_NAME=itinero-supervisor

# vero vault / host env
SENTRY_DSN=https://…@….ingest.sentry.io/PROJECT_ID_VERO
SENTRY_TRACES_SAMPLE_RATE=0.05
SERVICE_NAME=itinero-vero
```

**Frontend (must be present at `npm run build` / Docker build):**

```bash
# CI / Docker build-args — NOT only a runtime .env on nginx
VITE_SENTRY_DSN=https://…@….ingest.sentry.io/PROJECT_ID_WEB
VITE_SENTRY_TRACES_SAMPLE_RATE=0.05
```

Docker example:

```bash
docker compose -f deploy/docker-compose.yml build web \
  --build-arg VITE_SENTRY_DSN="$VITE_SENTRY_DSN" \
  --build-arg VITE_API_URL=/api \
  --build-arg VITE_VERO_API_URL=
```

Or local SPA build:

```bash
cd itinero
# put VITE_SENTRY_DSN in a CI secret / ephemeral env — do not commit
npm ci && npm run build
```

### Verify

1. Hit a page that loads Sentry (`itinero/src/observability/sentry.js`).
2. In Sentry → Issues, use **Send a test event** or throw once in staging.
3. Confirm events appear under the matching project (web vs supervisor vs vero).

---

## 2. Cloudflare → host

Follow `deploy/cloudflare.md`. Short version:

1. **DNS:** A/AAAA or CNAME for `app.your-domain.com` → origin (VPS / LB). Proxied (orange cloud).
2. **SSL/TLS:** Full (or Full strict). Always HTTPS. TLS 1.2+.
3. **Cache:**
   - `/itinero/assets/*` → long cache (hashed Vite assets)
   - `/itinero/*` HTML → bypass / short TTL
   - `/api/*` → **never cache**
4. **Rate limit:** `/api/*` ~60–120 req/min/IP; exclude `/api/health` and `/api/health/live`.
5. **WAF:** managed rules on; Stripe / LiteAPI Payment SDK paths not blocked by Bot Fight.
6. Smoke: `https://app.your-domain.com/itinero/` loads, `https://app.your-domain.com/api/health` returns JSON.

Also set prod CORS on supervisor:

```bash
CORS_ORIGINS=https://app.your-domain.com
APP_ENV=production
```

---

## 3. Prod secrets in a vault (not a shared `.env`)

Do **not** scp one shared `.env` around the team or into git.

### What goes in the vault

At minimum (see `supervisor/.env.example` / `general_agent/.env.example`):

- `DATABASE_URL`, `AUTH_SECRET`, `ITINERO_ADMIN_SECRET`
- LiteAPI / OpenAI / Maps / Tavily / weather keys
- `SENTRY_DSN` (per service)
- SMTP password, Google OAuth client (server), any R2 keys

Frontend build secrets (`VITE_*`) live in **CI secrets**, not on the nginx container after build.

### Recommended pattern

| Environment | Store |
|-------------|--------|
| Local | Per-service `.env` (gitignored) copied from `*.env.example` |
| Staging / prod | Host secret manager: **Doppler**, **1Password Secrets**, **AWS Secrets Manager**, **GCP Secret Manager**, **Railway/Fly/Vercel env**, or Docker/K8s secrets |

Example with Doppler (any vault with CLI injection works the same idea):

```bash
# one project, configs: supervisor_prod, vero_prod, web_build
doppler setup
doppler run --config supervisor_prod -- uvicorn supervisor.main:app …
doppler run --config web_build -- npm run build
```

Docker: mount secrets as env at runtime (`env_file` from a **host-only** path, or `--env-file` generated from the vault in CI). Never commit that file.

Hard rules:

- `APP_ENV=production`
- `ITINERO_ALLOW_MOCK_PAYMENT=false`
- `ITINERO_AUTH_DEV=false`
- Live LiteAPI keys (not `sand_*`)
- Rotate anything that was ever in a shared chat / old committed key

---

## 4. Uptime monitors

Public endpoints (via Cloudflare / nginx):

| URL | Expect | Use |
|-----|--------|-----|
| `GET /api/health/live` | **200** always if process up | Primary uptime / liveness |
| `GET /api/health/ready` | **200** when deps OK; **503** in prod if LiteAPI missing or Postgres down | Deeper readiness |
| `GET /api/health` | 200 + JSON flags | Optional richer dashboard |

### Setup (any vendor: Better Stack, UptimeRobot, Pingdom, Checkly, Cloudflare Health Checks)

1. **Monitor A — Liveness**
   - URL: `https://app.your-domain.com/api/health/live`
   - Interval: 1 min
   - Alert if status ≠ 200 for 2–3 checks
2. **Monitor B — Readiness (prod)**
   - URL: `https://app.your-domain.com/api/health/ready`
   - Interval: 1–5 min
   - Alert on 503 / timeout (means LiteAPI key or Neon is unhealthy)
3. Alert channel: Slack / email / PagerDuty — send a test alert once.
4. Cloudflare: exclude these paths from aggressive rate limits (see `cloudflare.md`).

Quick local check:

```bash
curl -sS https://app.your-domain.com/api/health/live
curl -sS -o /dev/null -w "%{http_code}\n" https://app.your-domain.com/api/health/ready
```

---

## 5. Confirm Neon PITR

1. Open [Neon Console](https://console.neon.tech) → your project.
2. **Settings → Storage / History retention** (wording varies by plan).
3. Confirm **point-in-time restore / history retention** is enabled (Free tier has limited retention; Launch/Scale for longer PITR).
4. Connection string for the app: use the **pooled** host (`…-pooler…`) in `DATABASE_URL`.
5. Optional drill: create a branch / restore to a timestamp in staging once and document who owns restores.

```bash
# App env (pooled)
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
```

Verify readiness sees Postgres:

```bash
curl -sS https://app.your-domain.com/api/health/ready
# "missing" should not include "postgres" when DATABASE_URL is set
```

---

## 6. Optional Redis (`REDIS_URL` + compose profile)

Used for multi-instance / durable supervisor sessions (`supervisor/session_store.py`).
Prefer **managed** Redis in real prod (Upstash, Redis Cloud, ElastiCache). Compose Redis is fine for staging / single-host.

### A) Local / single VPS with Docker Compose

```bash
# From repo root
export REDIS_URL=redis://redis:6379/0
export APP_ENV=production   # or sandbox for staging

docker compose -f deploy/docker-compose.yml --profile redis up --build
```

`deploy/docker-compose.yml` already:

- defines `redis` under `profiles: ["redis"]`
- passes `REDIS_URL` into `supervisor` and `vero`

If supervisor runs on the host (not in compose), use:

```bash
REDIS_URL=redis://127.0.0.1:6379/0
```

and only start Redis:

```bash
docker compose -f deploy/docker-compose.yml --profile redis up -d redis
```

### B) Managed (recommended for prod)

1. Create Upstash / Redis Cloud database (TLS).
2. Set either:

```bash
REDIS_URL=rediss://default:TOKEN@HOST:6379
# or
UPSTASH_REDIS_URL=rediss://default:TOKEN@HOST:6379
```

3. Restart supervisor (and vero if you use Redis there).
4. Confirm `/api/health` shows Redis configured / sessions backed (see health JSON fields).

---

## Order of operations (recommended)

1. Neon + `DATABASE_URL` + confirm PITR  
2. Vault secrets → supervisor / vero / CI build  
3. Sentry DSNs (3 projects)  
4. Deploy stack + Cloudflare DNS/SSL/cache  
5. Uptime on `/api/health/live` + `/api/health/ready`  
6. Optional Redis for multi-instance  
7. Smoke: search, auth, checkout webhook, Sentry test event  

See also: `deploy/LAUNCH_CHECKLIST.md`, `deploy/cloudflare.md`, `deploy/SECURITY_AUDIT.md`.
