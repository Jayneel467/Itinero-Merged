#!/usr/bin/env bash
# Probe supervisor + Vero health endpoints for Postgres, Redis, SMTP, and Sentry.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${ITINERO_API_BASE:-http://127.0.0.1:8000}"
VERO_BASE="${ITINERO_VERO_API_BASE:-http://127.0.0.1:8001}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="${ROOT}/reports/infra-check-${TIMESTAMP}.md"

mkdir -p "${ROOT}/reports"

fetch_json() {
  local url="$1"
  curl -fsS "${url}" 2>/dev/null || echo '{"error":"unreachable"}'
}

status_icon() {
  case "$1" in
    ready) echo "✅" ;;
    unset) echo "⚪" ;;
    error) echo "❌" ;;
    *) echo "❓" ;;
  esac
}

{
  echo "# Itinero infra check — ${TIMESTAMP}"
  echo ""
  echo "| Service | Endpoint | Status |"
  echo "|---------|----------|--------|"
} >"${REPORT}"

check_service() {
  local name="$1"
  local base="$2"
  local live
  live="$(fetch_json "${base}/api/health/live")"
  if echo "${live}" | grep -q '"live": true'; then
    echo "| ${name} | ${base}/api/health/live | ✅ live |" >>"${REPORT}"
  else
    echo "| ${name} | ${base}/api/health/live | ❌ down |" >>"${REPORT}"
    return 1
  fi

  local health
  health="$(fetch_json "${base}/api/health")"
  echo "" >>"${REPORT}"
  echo "## ${name} — ${base}" >>"${REPORT}"
  echo '```json' >>"${REPORT}"
  if formatted="$(echo "${health}" | python3 -m json.tool 2>/dev/null)"; then
    echo "${formatted}" >>"${REPORT}"
  else
    echo "${health}" >>"${REPORT}"
  fi
  echo '```' >>"${REPORT}"

  if [[ "${name}" == "supervisor" ]]; then
    echo "" >>"${REPORT}"
    echo "### Dependency matrix" >>"${REPORT}"
    for dep in postgres redis smtp sentry; do
      st="$(echo "${health}" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('dependencies') or {}).get('${dep}', {}).get('status', 'missing'))" 2>/dev/null || echo missing)"
      echo "- $(status_icon "${st}") **${dep}**: ${st}" >>"${REPORT}"
    done
  fi
}

failed=0
check_service "supervisor" "${API_BASE}" || failed=1
check_service "vero" "${VERO_BASE}" || failed=1

echo "" >>"${REPORT}"
echo "Report: ${REPORT}"

if [[ ${failed} -ne 0 ]]; then
  echo "Some services are unreachable. Start with:"
  echo "  ./scripts/dev-supervisor.sh --force"
  echo "  ./scripts/dev-vero.sh"
  exit 1
fi

echo "Infra check complete → ${REPORT}"
