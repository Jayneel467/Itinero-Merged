#!/usr/bin/env bash
# Optional: call live supervisor daily endpoint from cron / Cloud Scheduler.
#   CURATOR_BASE_URL=https://api.example.com CATALOG_CURATOR_TOKEN=secret ./scripts/trigger_catalog_daily.sh

set -euo pipefail
BASE="${CURATOR_BASE_URL:?set CURATOR_BASE_URL}"
TOKEN="${CATALOG_CURATOR_TOKEN:?set CATALOG_CURATOR_TOKEN}"
MARKETS="${CURATOR_MARKETS:-US,IN,GB}"

curl -fsS -X POST \
  -H "X-Curator-Token: ${TOKEN}" \
  -H "Accept: application/json" \
  "${BASE%/}/api/catalog/daily?markets=${MARKETS}&publish=true" | python3 -m json.tool
