# Explore destination factory

Continuous catalog loop so Explore is not a frozen hand-edited JS list.

```
Author  →  Checker  →  Reverifier  →  Publisher
 (draft)   (schema)    (duplicate /     (explore_destinations.json)
                        optional IATA)
```

## Commands

```bash
python -m supervisor.explore_factory.pipeline run --market US --publish
python -m supervisor.explore_factory.pipeline run --market GB --publish
```

Drafts: `supervisor/data/explore_drafts/`  
Live: `supervisor/data/explore_destinations.json`  
API: `GET /api/explore/destinations?market=US`

## Markets

| Example | Meaning |
|---------|---------|
| `["IN"]` | Strong India-home affinity (still visible internationally via `*`) |
| `["US", "*"]` | US domestic + visible worldwide |
| `["*"]` | Global |

SPA merges this API over the bundled catalog so new destinations appear without a frontend redeploy once supervisor is updated.

Explore keeps the world browsable: home-market destinations carry that market **and** `"*"` so they still appear for other homes (ranked lower). Pure single-market rows without `*` are reserved for rare geo-locked content.

## Keep updated

```bash
python -m supervisor.catalog_curator run --publish
```
