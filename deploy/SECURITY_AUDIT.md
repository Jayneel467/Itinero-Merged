# Itinero security audit (2026-08)

Launch-focused findings and remediations applied in-repo. Re-run before each production cut.

## Fixed in this pass

| Severity | Issue | Remediation |
|----------|--------|-------------|
| Medium | Flight prebook trusted unbound `offer_id` | Session bind via `allowed_offer_ids` + quick_flight_search cache match in bridge/update_trip_context |
| Medium | Non-prod agency CREDIT hotel holds | Block unless Payment SDK, or `sand_*` + `ITINERO_ALLOW_AGENCY_CREDIT=1` |
| Medium | Soft confirm (`flexible`/`ready`/`proceed`) triggered LiteAPI search | Explicit yes/search phrases only (word-bounded) |
| Medium | Vero loaded sibling `.env` files (sandbox bleed) | `general_agent/config.py` — sibling envs only when not production; reject `sand_*` LiteAPI keys in prod |
| Medium | Client `page_context.booking` could inject offer/prebook IDs | Strip hold/payment IDs; search fields allowlisted |
| Medium | Flight mock pay via `ITINERO_ALLOW_MOCK_PAYMENT` outside sandbox | Mock only when `_is_sandbox_app()` |
| Medium | Itinerary hotel prebook forced `usePaymentSdk: false` | Prefer SDK; force SDK when `APP_ENV=production` |
| Medium | Tool errors said “Trip details saved” | Fail-honest `TOOL_ERROR` copy |
| Medium | Package booking GET by short id (IDOR/PII) | Require matching guest `email` query |
| Medium | Prod CORS included localhost | Production origins = `CORS_ORIGINS` only |
| Low | `itinero-action` nav types unbounded | Server allowlist + require selected flight for passenger step |

## Still open (ops / follow-up)

1. **Rotate** any OpenAI key that was ever committed as hardcoded `sk-proj-…` (history scrub if pushed).
2. Set **`APP_ENV=production`**, live LiteAPI keys, **`LITEAPI_USE_PAYMENT_SDK=true`**, **`ITINERO_ALLOW_MOCK_PAYMENT=false`**, **`CORS_ORIGINS=https://your.domain`**.
3. **Auth on Vero chat** for booking actions (device/session binding) — page_context is hardened but chat remains public.
4. **Flight cancel / booking GET** ownership checks on supervisor (broader than packages).
5. Rate-limit LiteAPI prebook/complete per IP/device.
6. Do not commit `.env`, `supervisor/.vendor/`, or `package_bookings.json`.

## Hygiene

Deleted: `itinero/_vero_curl.html`, `itinero/extract_searchbar.cjs`, `supervisor/.vendor/`.  
Deduped root `.gitignore`. Keep legacy trees (`itinero-web/`, `ui/`) until an explicit archive decision.
