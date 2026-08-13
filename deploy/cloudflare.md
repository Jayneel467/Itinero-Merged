# Cloudflare setup (Itinero)

Short checklist for putting the edge in front of the deploy stack (or any origin that serves `/itinero/` + `/api/`).

## DNS

1. Add an **A/AAAA** (or CNAME) for `app.your-domain.com` → origin IP / load balancer.
2. Keep the cloud **orange** (proxied) so WAF, SSL, and cache rules apply.

## SSL / TLS

1. SSL/TLS mode: **Full** (or Full strict if the origin has a valid cert).
2. Enable **Always Use HTTPS**.
3. Prefer **TLS 1.2+** only.

## WAF

1. Enable Cloudflare WAF managed rules (Core / OWASP).
2. Block known bad bots on `/api/*` if noise is high.
3. Challenge suspicious countries only if product traffic allows it.

## Cache rules

| Path | Action |
|------|--------|
| `/itinero/assets/*` | Cache everything, long TTL (hashed Vite files are immutable) |
| `/itinero/*` (HTML) | Bypass or short TTL — SPA `index.html` must not stick |
| `/api/*` | **Bypass cache** always |

Example Cache Rule: match `http.request.uri.path starts with "/itinero/assets/"` → Eligible for cache, Edge TTL 1 month+.

## Rate limiting

1. Rule on `/api/*` — e.g. 60–120 requests / minute / IP (tune after load test).
2. Stricter limit on auth OTP / login paths if exposed under `/api/auth/*`.
3. Exclude health probes (`/api/health`, `/api/health/live`) from aggressive limits if monitors share an IP.


## Notes

- Orange-cloud means clients see Cloudflare IPs; set `X-Forwarded-For` / trusted proxy headers on nginx if you need real client IPs for rate limits.
- After cutover, confirm `/itinero/` loads, `/api/health` returns JSON, and Stripe / LiteAPI Payment SDK checkout succeeds.

## Gmail / inbox sender logo (BIMI)

The circle next to **Itinero** in Gmail is the *sender avatar*. SMTP HTML cannot set it — Gmail only shows a brand logo there via **BIMI** (after DMARC is enforced).

Assets (committed):

| File | Use |
|------|-----|
| `/itinero/brand/itinero-mark.png` | Square mark (host publicly) |
| `/itinero/brand/itinero-sender-avatar.png` | Circular preview |
| `/itinero/brand/itinero-bimi.svg` | BIMI SVG Tiny PS |

### 1. Auth (required before BIMI)

On `itinero.company`:

1. **SPF** — Zoho (or your SMTP) included in the SPF TXT.
2. **DKIM** — Zoho DKIM selector published and signing mail.
3. **DMARC** — at least `p=quarantine` (Gmail wants this for BIMI), e.g.

```txt
_dmarc.itinero.company  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@itinero.company; adkim=s; aspf=s"
```

### 2. Host the SVG over HTTPS

Serve the BIMI file at a stable URL (Cloudflare orange-cloud is fine), e.g.:

`https://itinero.company/itinero/brand/itinero-bimi.svg`

Cache it long-TTL; do not block bots on that path.

### 3. BIMI DNS record

```txt
default._bimi.itinero.company  TXT  "v=BIMI1; l=https://itinero.company/itinero/brand/itinero-bimi.svg;"
```

Optional: add `a=` with a Verified Mark Certificate URL for the blue checkmark (paid). Without a VMC, many clients still show the logo once DMARC + BIMI pass.

### 4. Verify

1. Send a test from `donotreply@itinero.company` to a Gmail inbox.
2. Confirm Authentication-Results include `dmarc=pass` and `bimi=pass` (Gmail “Show original”).
3. Avatar can take a few hours to refresh; open in an Incognito Gmail if cached.

Transactional emails already embed the circular mark + wordmark in the message body (CID images).
