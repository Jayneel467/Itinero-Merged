#!/usr/bin/env bash
# Run backend smoke (supervisor) + Playwright UI smoke (itinero, itinero-web, ui).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_DIR="${ROOT}/reports"
PY="${ROOT}/.venv/bin/python"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SUMMARY="${REPORT_DIR}/site-audit-${TIMESTAMP}.md"

mkdir -p "${REPORT_DIR}"

backend_status="skipped"
frontend_status="skipped"

{
  echo "# Itinero site audit — ${TIMESTAMP}"
  echo ""
} >"${SUMMARY}"

if [[ -x "${PY}" ]]; then
  echo "## Backend smoke (supervisor)" >>"${SUMMARY}"
  if [[ "${ITINERO_AUDIT_RESTART:-}" == "1" ]]; then
    "${ROOT}/scripts/dev-supervisor.sh" --force >/dev/null 2>&1 || true
    echo "supervisor: restarted (ITINERO_AUDIT_RESTART=1)" >>"${SUMMARY}"
  elif "${ROOT}/scripts/dev-supervisor.sh" >/dev/null 2>&1; then
    echo "supervisor: healthy" >>"${SUMMARY}"
  else
    echo "supervisor: unavailable — run ./scripts/dev-supervisor.sh" >>"${SUMMARY}"
  fi

  set +e
  "${PY}" -m pytest "${ROOT}/supervisor/tests" -q --tb=short | tee "${REPORT_DIR}/pytest-${TIMESTAMP}.log"
  pytest_exit=${PIPESTATUS[0]}
  set -e

  if [[ ${pytest_exit} -eq 0 ]]; then
    backend_status="passed"
    echo "result: **passed**" >>"${SUMMARY}"
  else
    backend_status="failed (${pytest_exit})"
    echo "result: **failed** — see reports/pytest-${TIMESTAMP}.log" >>"${SUMMARY}"
  fi
  echo "" >>"${SUMMARY}"
else
  echo "## Backend smoke" >>"${SUMMARY}"
  echo "result: **skipped** — missing ${PY}" >>"${SUMMARY}"
  echo "" >>"${SUMMARY}"
fi

if command -v npm >/dev/null 2>&1; then
  echo "## Frontend Playwright smoke" >>"${SUMMARY}"
  pushd "${ROOT}/e2e" >/dev/null

  if [[ ! -d node_modules ]]; then
    npm install --no-audit --no-fund
    npx playwright install chromium
  fi

  start_if_down() {
    local port="$1"
    local cmd="$2"
    if ! lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      (cd "${ROOT}" && eval "${cmd}") >/tmp/itinero-dev-${port}.log 2>&1 &
      sleep 2
    fi
  }

  start_if_down 8000 "./scripts/dev-supervisor.sh"
  start_if_down 5173 "cd itinero && npm run dev -- --host 127.0.0.1 --port 5173"
  start_if_down 3001 "cd itinero-web && npm run dev -- --hostname 127.0.0.1 --port 3001"
  start_if_down 3000 "cd ui && npm run dev -- --host 127.0.0.1 --port 3000"

  set +e
  npm test 2>&1 | tee "${REPORT_DIR}/playwright-${TIMESTAMP}.log"
  pw_exit=${PIPESTATUS[0]}
  set -e
  popd >/dev/null

  if [[ ${pw_exit} -eq 0 ]]; then
    frontend_status="passed"
    echo "result: **passed**" >>"${SUMMARY}"
  else
    frontend_status="failed (${pw_exit})"
    echo "result: **failed** — see reports/playwright-${TIMESTAMP}.log" >>"${SUMMARY}"
  fi
  echo "" >>"${SUMMARY}"
  echo "HTML report: e2e/reports/playwright/index.html" >>"${SUMMARY}"
else
  echo "## Frontend Playwright smoke" >>"${SUMMARY}"
  echo "result: **skipped** — npm not in PATH" >>"${SUMMARY}"
fi

echo "" >>"${SUMMARY}"
echo "## Summary" >>"${SUMMARY}"
echo "- Backend: ${backend_status}" >>"${SUMMARY}"
echo "- Frontend: ${frontend_status}" >>"${SUMMARY}"

cat "${SUMMARY}"

if [[ "${backend_status}" == failed* ]] || [[ "${frontend_status}" == failed* ]]; then
  exit 1
fi
