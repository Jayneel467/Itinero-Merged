#!/usr/bin/env bash
# Daily catalog curator - improve packages, fill markets, verify Explore + Packages.
# Cron example (06:15 UTC):
#   15 6 * * * /path/to/Itinero-Merged/scripts/daily_catalog_curator.sh >> /var/log/itinero-curator.log 2>&1

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MARKETS="${CURATOR_MARKETS:-GLOBAL,US,IN,GB,AE,SG,AU,JP,CA}"
export PYTHONPATH="${PYTHONPATH:-}:$ROOT"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] curator daily start markets=$MARKETS"
python3 -m supervisor.catalog_curator daily --markets "$MARKETS" --publish
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] curator daily done"
