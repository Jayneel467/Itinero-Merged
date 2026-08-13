# Package factory pipeline

Continuous catalog loop so regional bias is fixed at **source**, not only with frontend filters.

```
Author  →  Checker  →  Reverifier  →  Publisher
 (draft)   (engine)    (structure     (packages.json)
                        + optional
                        LiteAPI)
```

## Why

`supervisor/data/packages.json` was hand-authored and India-heavy. `region: "domestic"` meant India. US (and other) homes then relied on client ranking/hiding. That is a stopgap.

This factory:

1. **Author** proposes market-tagged drafts (`markets: ["US"]`, etc.)
2. **Checker** runs `package_engine` normalize/instantiate/validate
3. **Reverifier** second-pass; optional live hotel probe
4. **Publisher** upserts into the live catalog only when gates pass

## Commands

From repo root:

```bash
# Worldwide packages (Paris, Tokyo, Dubai, …) + home domestics
python -m supervisor.package_factory.pipeline run --market WORLDWIDE --publish

# Daily curator (improves + fills + worldwide)
python -m supervisor.catalog_curator daily --publish
```

Drafts live in `supervisor/data/package_drafts/`. Published copies archive under `package_drafts/published/`.

## Markets

Every package should declare `markets` (ISO country codes, or `"*"` for all).

| Example | Meaning |
|---------|---------|
| `["IN"]` | India-home feeds (India domestic circuits) |
| `["US"]` | US-home domestic / affinity packages |
| `["*"]` | Visible in every market (typical internationals) |

API: `GET /api/packages?market=US` filters by `markets`. The SPA passes the traveler home country.

## Extending Author

MVP author is a deterministic seed bank in `author.py` (`SEED_BANK`). Swap in an LLM author later without changing checker/reverify/publish contracts - return the same template shape with `pipeline.status = "draft"`.

## Keep updated

Run the final curator (packages + explore + page health):

```bash
python -m supervisor.catalog_curator run --publish
```
