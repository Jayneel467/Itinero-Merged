# Launch checklist (Itinero production)

Use before client demo / public go-live. Keep secrets out of git.

**Code landed (Aug 2026):** hotel/flight GET + cancel ownership (device/email/admin; prod denies unknown), marketing admin never default-open when `APP_ENV=production`, `/ready` requires marketing token + Stripe if packages on, SPA ErrorBoundary, capabilities no longer stub hotels/trains/visa. Remaining boxes below are **ops / live smoke**.

**How-to:** step-by-step for Sentry, Cloudflare, vault, uptime, Neon PITR, Redis → [`SETUP.md`](./SETUP.md).

## Secrets store

- [ ] All production secrets live in a vault / host secret manager (not committed `.env` files).
- [ ] Rotate `AUTH_SECRET`, `ITINERO_ADMIN_SECRET`, LiteAPI / Stripe keys for prod.
- [ ] Confirm `APP_ENV=production` on supervisor + vero.
- [ ] `ITINERO_ALLOW_MOCK_PAYMENT=false` and `ITINERO_AUTH_DEV=false`.

## Neon Postgres

- [ ] `DATABASE_URL` points at the **pooled** Neon endpoint (`…-pooler…`).
- [ ] Point-in-time recovery (PITR) / history retention enabled on the Neon project.
- [ ] Schema migrate succeeds on boot (`supervisor.db`).
- [ ] Backup restore drill documented once.

## Uptime monitors

- [ ] External monitor on `GET /api/health` (and/or `/api/health/live`).
- [ ] Optional deep check on `/api/health/ready` (expect 200 only when critical deps are up).
- [ ] Alert channel (PagerDuty / Slack / email) tested.

## SMTP

- [ ] `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` set (Zoho or equivalent).
- [ ] Send a test OTP + flight/hotel booking confirmation in staging.
- [ ] Package checkout: one Itinero Stripe charge for full total; hotel/flights fulfilled via LiteAPI after payment.
- [ ] SPF / DKIM / DMARC aligned for the From domain.

## Sentry

- [ ] `SENTRY_DSN` on supervisor and vero.
- [ ] `VITE_SENTRY_DSN` baked into the production frontend build.
- [ ] `SENTRY_TRACES_SAMPLE_RATE` set (default `0.05`).
- [ ] Smoke: trigger a test error and confirm it lands in the project.

## Redis

- [ ] `REDIS_URL` or `UPSTASH_REDIS_URL` set for multi-instance sessions.
- [ ] Ping succeeds; `/api/health` shows redis configured / sessions backed.
- [ ] Optional: compose profile `redis` for self-hosted; prefer managed Redis in prod.

## Object storage (optional)

- [ ] R2 bucket + API tokens (`R2_ACCOUNT_ID`, access/secret keys, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`).
- [ ] Public CDN URL serves a test object.

## Frontend / edge

- [ ] Production build uses prod `VITE_API_URL` / `VITE_VERO_API_URL` (no `127.0.0.1` in bundle).
- [ ] Cloudflare SSL Full, WAF, cache for `/itinero/assets/*`, rate limit `/api/*`.

## Launch pillars (money · email/webhook · loyalty)

Hard requirements before public traffic — treat as a release gate.

### 1) Money-path certainty

- [ ] `APP_ENV=production`, live LiteAPI key (**not** `sand_*`), `ITINERO_ALLOW_MOCK_PAYMENT=false`.
- [ ] `GET /api/health` → `money_path.warnings` empty (no sandbox key / mock / missing webhook secret).
- [ ] `GET /api/health/ready` returns **200** in prod (blocks on smtp, sentry, postgres, live LiteAPI, webhook secret, mock off).
- [ ] Sandbox then live: hotel pay → confirm; flight pay → ticket; package **one** Stripe charge → LiteAPI credit fulfill.
- [ ] `python scripts/money_smoke.py --live-book` (sandbox) then one Plus Checkout with **4242** while signed in.
- [ ] Prod Stripe: `STRIPE_WEBHOOK_SECRET` set; `/ready` fails without it. Plus must activate from webhook, not only redirect.
- [ ] Confirm mock book APIs return 400 in production.

### 2) Email + webhook hygiene

- [ ] SMTP OTP + booking confirmation tested (hotel, flight, package).
- [ ] **Disable** LiteAPI PBO Booking Confirmation / Cancellation emails (Itinero SMTP is source of truth).
- [ ] Register `POST /api/webhooks/liteapi` with `LITEAPI_WEBHOOK_SECRET` (required in prod — open webhooks rejected).
- [ ] Subscribe: `booking.book`, `booking.cancel`, `booking.book.hotelConfirmationNumber` (+ flight book/cancel if available).
- [ ] Flight confirmation email only fires when `/api/flights/complete` returns `ok` (not on payment id alone).

### 3) Loyalty correctness on cancel

- [ ] Cancel hotel/flight via Trips → pending/available earn for that `booking_id` marked `reversed`.
- [ ] LiteAPI `booking.cancel` webhook also reverses (idempotent with API cancel) and sends Itinero cancel email.
- [ ] Signed-in trips: login claims device trips/loyalty/watches onto `user_id` (new phone still sees tickets).
- [ ] Earn is idempotent (book API + webhook do not double-credit).
- [ ] Cron: `POST /api/loyalty/confirm-due` with `x-itinero-admin-secret` after check-out dates (daily).

## LiteAPI / Nuitee Connect (full surface)

Live status JSON: `GET /api/integrations/liteapi` (wired / partial / pbo_only / unused).

### Wired in Itinero (must work in prod)

- [ ] Hotel search → rates → prebook → book (Payment SDK / Stripe path).
- [ ] Flight search → prebook → complete.
- [ ] Packages: one Itinero Stripe charge → hotel + flights fulfilled on **LiteAPI credit** (credit line configured in PBO).
- [ ] eSimply + Uber add-ons on hotel guest-details → show on confirmation.
- [ ] Reviews (`/data/reviews`), cancel (hotel + flight), promo `voucherCode` at prebook.
- [ ] Itinero Rewards earn + package redeem (`/api/loyalty/*`, `/rewards`).

### PBO setup (connect.nuitee.com)

- [ ] **API keys:** Sandbox vs live mapped to `API_KEY` / `LITEAPI_KEY` (never commit).
- [ ] **Emails:** Disable LiteAPI Booking Confirmation / Cancellation if Itinero SMTP is on (avoid duplicate guest mail).
- [ ] **Webhooks:** `POST https://YOUR_API/api/webhooks/liteapi` — `booking.book`, `booking.cancel`, `booking.book.hotelConfirmationNumber` (+ flight events when ready). Same token as `LITEAPI_WEBHOOK_SECRET`.
- [ ] **Automations (optional):** Ops only (Slack high-value alert, internal pre-arrival) — do **not** duplicate guest emails or loyalty earn.
- [ ] **Integrations → eSimply / Uber:** Enabled in PBO (app already wires addons[]).
- [ ] **Integrations → Google Hotel Center:** PBO install ≠ live on Google. Needs GHC partner feed + pricing XML bridge (see Lite docs). Travelers then see *your* rates under *your* merchant name → land on Itinero.
- [ ] **Loyalty (LiteAPI):** Cashback rate drives earn estimates; ledger/redeem is Itinero Postgres (by design).
- [ ] **Analytics / Signals / API Performance / Playground / Workbench:** PBO dashboards only — no app wiring.

### Available from Lite — not required for launch (optional later)

| Capability | Notes |
|------------|--------|
| Flight webhooks + cancel→points reverse | LiteAPI webhook + SMTP confirm/cancel + Rewards reverse |
| Flight seats/bags in main checkout | BookingPopup + main FlightPaymentPage |
| Hotel booking amendments | POST `/api/hotels/bookings/amend` + Trips UI |
| Semantic / visual room search (Beta) | Natural-language / style hotel search |
| `roomMapping: true` on main rates | Better rooms + GHC deep links |
| LiteAPI Vouchers API | Create promos in dashboard/API |
| External Checkout | Alternate to Payment SDK — skip |
| Whitelabel site / UI widgets / AI chatbot | Replaced by Itinero + Vero |
| MCP Server (`mcp.liteapi.travel`) | Optional for agents; Vero uses REST |
| THIRD_PARTY payment JWT | Needs `LITEAPI_WL_PAYMENT_PRIVATE_KEY` + PBO bypass |

## Marketing OS

- [ ] GH secrets: `DATABASE_URL`, `SMTP_*`, `PUBLIC_SITE_URL`, `GEMINI_API_KEY` (author steps).
- [ ] Cron: `.github/workflows/daily-marketing-digest.yml` uses `--drain --watches` (journeys + fare-drop mail same tick).
- [ ] Offline proof: `.venv/bin/python -m supervisor.marketing_smoke` exits 0.
- [ ] Staging (no real mail): `MARKETING_SEARCH_MAIL_DELAY_HOURS=0 .venv/bin/python -m supervisor.marketing_smoke --live`.
- [ ] Live SMTP: same + `--send` to `MARKETING_SMOKE_EMAIL` (opt-in test user). Expect 1 search mail, Agra capped, digest skip, unsub → `no_consent`.

## UI trust (ship-killers — walk before public traffic)

Wrong destination photos, torn chrome, or a broken credit meter will bounce bookers. Treat these as hard no-go.

- [ ] `.venv/bin/pytest supervisor/tests/test_destination_covers.py supervisor/tests/test_places_photos.py -q` exits 0 (no Rome-from-Romantic / Leh-from-Leisure / wrong-city stock).
- [ ] Explore city page → **Matching packages** only shows that city (or the section is empty — never random Goa on Udaipur).
- [ ] Package card photo matches the destination on the card (not origin/gateway, not theme-word drift).
- [ ] Navbar: flag / theme / profile fully visible on desktop + with Vero drawer open (no clip / tear).
- [ ] Vero drawer header: credit pill is one line (`Free 40/40` + bar), not wrapped onto the bar.
- [ ] Suggestion chips: text centered, no ghosting under the label.
- [ ] Hard-refresh `/packages`, `/explore/udaipur`, `/explore/goa`, `/vero` on a 390px phone and 1280 desktop before go-live.

## Final smoke

- [ ] Google sign-in works against prod OAuth client.
- [ ] Flight + hotel search returns live inventory.
- [ ] Package book → confirmation page shows full itinerary + PDF download + resend email.
- [ ] Checkout path (LiteAPI SDK / Stripe) completes in sandbox then live.
- [ ] CORS_ORIGINS matches the real SPA origin(s).
