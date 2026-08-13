#!/usr/bin/env bash
# Start Vero (general_agent) on :8001 for chat + voice.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="${ROOT}/.venv/bin/python"
LOG="/tmp/itinero-vero.log"
PORT="${ITINERO_VERO_PORT:-8001}"

if [[ ! -x "${PY}" ]]; then
  echo "missing ${PY} — create .venv and install deps first" >&2
  exit 1
fi

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "vero already listening on :${PORT} — log ${LOG}"
  curl -sf "http://127.0.0.1:${PORT}/api/health/live" >/dev/null && echo "healthy"
  exit 0
fi

cd "${ROOT}"
nohup "${PY}" -m uvicorn general_agent.run:app --host 127.0.0.1 --port "${PORT}" \
  >"${LOG}" 2>&1 &
echo $! > /tmp/itinero-vero.pid
sleep 2

for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${PORT}/api/health/live" >/dev/null 2>&1; then
    MODEL="$(curl -sf "http://127.0.0.1:${PORT}/api/health" | "${PY}" -c 'import sys,json; print(json.load(sys.stdin).get("model","?"))' 2>/dev/null || echo '?')"
    echo "started pid $(cat /tmp/itinero-vero.pid) — log ${LOG} (model=${MODEL})"
    exit 0
  fi
  sleep 1
done

echo "vero failed to become healthy — tail ${LOG}" >&2
tail -20 "${LOG}" >&2 || true
exit 1
