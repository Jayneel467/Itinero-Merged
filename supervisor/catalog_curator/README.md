# Catalog curator (final agent)

One agent that **keeps catalogs updated every day** and **checks Explore + Packages pages are fine**.

## Cheap catalog LLM (not core OpenAI)

Package + Explore factories call **Gemini** (or Groq) via `supervisor/catalog_llm.py`.
They do **not** use `OPENAI_API_KEY` (Vero / core AI stays untouched).

```bash
# supervisor/.env
CATALOG_LLM_PROVIDER=gemini
GEMINI_API_KEY=your_google_ai_studio_key
CATALOG_LLM_MODEL=gemini-2.5-flash

# optional cheaper/fast alt:
# CATALOG_LLM_PROVIDER=groq
# GROQ_API_KEY=...
```

Without a catalog LLM key, the daily job still runs on the deterministic seed bank.

```
Gemini/Groq (catalog only) ──► package/explore author
seed bank (fallback)       ──► same pipelines
core OPENAI                ──► Vero / flights / itinerary ONLY
```

## Everyday loop

```bash
python -m supervisor.catalog_curator daily --publish
```

What runs each day:

1. **Improve packages** - backfill markets/highlights/inclusions, seasonal months, featured rotation, quality scores
2. **Fill thin markets** - if US/IN/GB lack domestic packages, author → check → reverify → publish
3. **Polish Explore** - markets tags, blurbs
4. **Refresh factories** - upsert any new seeds
5. **Health-check** - SPA routes + catalog contracts for Explore + Packages pages
6. **Save report** - `supervisor/data/catalog_curator_reports/YYYY-MM-DD.json`

## Schedule (pick one)

### GitHub Actions (already wired)

`.github/workflows/daily-catalog-curator.yml` runs at **06:15 UTC** daily. Manual run: Actions → Daily catalog curator → Run workflow.

### Server cron

```cron
15 6 * * * /path/to/Itinero-Merged/scripts/daily_catalog_curator.sh >> /var/log/itinero-curator.log 2>&1
```

### Live supervisor endpoint

Set `CATALOG_CURATOR_TOKEN` in supervisor env, then:

```bash
CURATOR_BASE_URL=https://your-api CATALOG_CURATOR_TOKEN=secret \
  ./scripts/trigger_catalog_daily.sh
```

`POST /api/catalog/daily` (header `X-Curator-Token`)

## Other commands

```bash
python -m supervisor.catalog_curator health
python -m supervisor.catalog_curator daily --dry-run
python -m supervisor.catalog_curator run --publish
```

Exit `0` = ok; `1` = failed.
