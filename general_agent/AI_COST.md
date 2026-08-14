# Vero AI cost — CFO + CTO

**Product rule:** Vero is free every day (small UTC credit pool). Extra usage is **prepaid credit packs** — no monthly Plus.  
**Finance rule:** pack list prices target **20–30% gross margin** after DeepSeek + OpenAI + fees.

## Unit economics (conservative 2026 list prices)

| Lane | Model | Est. tokens in/out | Est. USD / turn | Credits |
|------|--------|--------------------|-----------------|---------|
| Chat / plan / culture | DeepSeek `deepseek-chat` | ~3.5k / 450 | **~$0.0006** | 1 |
| Post-tool writeup | DeepSeek synth | ~5k / 500 | **~$0.0008** | 1 |
| Live search / book / pay | OpenAI `gpt-4o-mini` + tools | ~16k / 700 | **~$0.004–0.008** | 4 |
| Capability router | mini, `max_tokens=80` | ~0.5k / 80 | **~$0.0001** | (bundled) |

**Blended turn (80% DeepSeek / 20% tools):** ~$0.0019 → ~1.6 credits → **~$0.0012 LLM / credit**.  
**Loaded cost floor:** `$0.0015 / credit` (`VERO_COST_PER_CREDIT_USD`) — LLM + Stripe ~3% + infra buffer.  
**Sell target @ 25% margin:** `$0.0015 / 0.75 ≈ $0.0020 / credit` (~₹0.17 at 83 INR/USD).

### Packs (INR list)

| Pack | Credits | Price | ≈ ₹/credit | Est. margin @ $0.0015 |
|------|---------|-------|------------|------------------------|
| Starter | 200 | ₹49 | 0.25 | ~45–50% (Stripe $0.50 INR floor) |
| Traveler | 500 | ₹99 | 0.20 | ~25–30% |
| Explorer | 2000 | ₹349 | 0.17 | ~20–27% |
| Pro | 6000 | ₹999 | 0.17 | ~20–27% |

\*Starter is priced at ₹49 so INR Checkout clears Stripe’s **$0.50** converted minimum (₹29 ≈ $0.30 was rejected). Credits were raised to 200 so ₹/credit stays near the small-pack band.

## How we afford free Vero

1. **Default lane = DeepSeek** for chat / plan / culture.  
2. **OpenAI only for live inventory / money.**  
3. **Fair use** — OpenAI tool turns / device / day capped (`VERO_OPENAI_TURNS_PER_DEVICE_DAY`).  
4. **Company daily budget** — `VERO_DAILY_BUDGET_USD` (default 80) with conserve/protect modes.  
5. **Credits** — Free **25 / UTC day** + **prepaid wallet** (never expires). Chat=1, tools=4. Daily free spends first.  
6. **Never paywall Vero itself** — empty pool waits for reset or a pack; search/book still work. No “better model” SKU.

## Env

```bash
VERO_LLM_COMBO=1
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-chat
ITINERO_MODEL=gpt-4o-mini
VERO_DAILY_BUDGET_USD=80
VERO_OPENAI_TURNS_PER_DEVICE_DAY=12
VERO_FREE_DAILY_CREDITS=25
VERO_COST_PER_CREDIT_USD=0.0015
VERO_INR_PER_USD=83
STRIPE_SECRET_KEY=sk_test_…
```

## CTO watchouts

- DeepSeek key **must** be set in prod or every turn falls back to OpenAI and the budget dies.  
- Wallet tables: `vero_credit_wallet`, `vero_credit_purchases` (see `schema.sql`).  
- Checkout mode is **`payment`** (one-time), not `subscription`.  
- Webhook + `/api/billing/checkout/complete` both credit the wallet (idempotent on `stripe_session_id`).

## What we do **not** sell

- Monthly / annual Plus subscriptions  
- GPT-4 / longer context as a paid tier  

Credits are runway. Models stay the same.
