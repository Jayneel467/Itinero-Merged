#!/usr/bin/env bash
# Vero AI audit — health, page-context smoke, killshots, companion critical subset.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="${ROOT}/.venv/bin/python"
REPORT_DIR="${ROOT}/reports"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SUMMARY="${REPORT_DIR}/vero-audit-${TIMESTAMP}.md"

mkdir -p "${REPORT_DIR}"

{
  echo "# Vero AI audit — ${TIMESTAMP}"
  echo ""
} >"${SUMMARY}"

if [[ ! -x "${PY}" ]]; then
  echo "result: **skipped** — missing ${PY}" >>"${SUMMARY}"
  cat "${SUMMARY}"
  exit 1
fi

"${ROOT}/scripts/dev-vero.sh" >>"${SUMMARY}" 2>&1 || true
"${ROOT}/scripts/dev-supervisor.sh" >>"${SUMMARY}" 2>&1 || true

echo "## Pytest (Vero chat smoke)" >>"${SUMMARY}"
set +e
"${PY}" -m pytest "${ROOT}/supervisor/tests/test_vero_chat_smoke.py" -q --tb=short \
  | tee "${REPORT_DIR}/vero-pytest-${TIMESTAMP}.log"
pytest_exit=${PIPESTATUS[0]}
set -e
if [[ ${pytest_exit} -eq 0 ]]; then
  echo "pytest: **passed**" >>"${SUMMARY}"
else
  echo "pytest: **failed** — see reports/vero-pytest-${TIMESTAMP}.log" >>"${SUMMARY}"
fi

if curl -sf http://127.0.0.1:8001/api/health/live >/dev/null 2>&1; then
  echo "" >>"${SUMMARY}"
  echo "## Killshots (adversarial)" >>"${SUMMARY}"
  set +e
  "${PY}" "${ROOT}/general_agent/eval/vero_killshots.py" 2>&1 | tee "${REPORT_DIR}/vero-killshots-${TIMESTAMP}.log"
  kill_exit=${PIPESTATUS[0]}
  set -e
  if [[ ${kill_exit} -eq 0 ]]; then
    echo "killshots: **completed**" >>"${SUMMARY}"
  else
    echo "killshots: **error**" >>"${SUMMARY}"
  fi

  echo "" >>"${SUMMARY}"
  echo "## Companion eval (critical IDs)" >>"${SUMMARY}"
  set +e
  "${PY}" "${ROOT}/general_agent/eval/vero_companion_eval.py" --critical 2>&1 \
    | tee "${REPORT_DIR}/vero-companion-${TIMESTAMP}.log"
  comp_exit=${PIPESTATUS[0]}
  set -e
  if [[ ${comp_exit} -eq 0 ]]; then
    echo "companion: **completed**" >>"${SUMMARY}"
  else
    echo "companion: **error**" >>"${SUMMARY}"
  fi
else
  echo "killshots/companion: **skipped** — Vero :8001 down" >>"${SUMMARY}"
  kill_exit=0
  comp_exit=0
fi

echo "" >>"${SUMMARY}"
echo "## Summary" >>"${SUMMARY}"
echo "- pytest: ${pytest_exit}" >>"${SUMMARY}"
echo "- killshots: ${kill_exit:-skipped}" >>"${SUMMARY}"
echo "- companion: ${comp_exit:-skipped}" >>"${SUMMARY}"

cat "${SUMMARY}"

if [[ ${pytest_exit} -ne 0 ]]; then
  exit 1
fi
