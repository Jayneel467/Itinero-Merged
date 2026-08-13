#!/usr/bin/env bash
# Keep local booking API (supervisor) alive on :8000 for Vite proxy.
# Local dev defaults to sandbox so mock payment + audit tests work.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="${ITINERO_SUPERVISOR_LOG:-/tmp/itinero-supervisor.log}"
PID_FILE="${ITINERO_SUPERVISOR_PID:-/tmp/itinero-supervisor.pid}"
PY="${ROOT}/.venv/bin/python"

export APP_ENV="${APP_ENV:-sandbox}"
export ITINERO_ALLOW_MOCK_PAYMENT="${ITINERO_ALLOW_MOCK_PAYMENT:-true}"
export ITINERO_LOCAL_DEV="${ITINERO_LOCAL_DEV:-true}"

if [[ ! -x "$PY" ]]; then
  echo "Missing venv python at $PY" >&2
  exit 1
fi

is_up() {
  curl -sf -m 2 http://127.0.0.1:8000/api/health/live >/dev/null 2>&1
}

current_env() {
  curl -sf -m 2 http://127.0.0.1:8000/api/health 2>/dev/null | "$PY" -c "import sys,json; d=json.load(sys.stdin); print(d.get('environment',''))" 2>/dev/null || echo ""
}

FORCE="${1:-}"
if is_up; then
  env_now="$(current_env)"
  if [[ "$FORCE" == "--force" ]] || [[ "$env_now" == "production" ]]; then
  pid="$(lsof -tiTCP:8000 -sTCP:LISTEN | head -1 || true)"
  if [[ -n "${pid}" ]]; then
    echo "restarting supervisor (was env=${env_now:-unknown}, pid=${pid}) with APP_ENV=${APP_ENV}"
    kill "$pid" 2>/dev/null || true
    sleep 1
    if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
      kill -9 "$pid" 2>/dev/null || true
      sleep 1
    fi
  fi
  else
    echo "supervisor already healthy on :8000 (env=${env_now:-unknown})"
    exit 0
  fi
fi

# Stale listener without health → refuse to clobber unless --force
if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  if [[ "$FORCE" != "--force" ]]; then
    echo "Something is on :8000 but /api/health/live failed. Re-run with --force to replace it." >&2
    exit 2
  fi
  pid="$(lsof -tiTCP:8000 -sTCP:LISTEN | head -1 || true)"
  if [[ -n "${pid}" ]]; then
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
fi

echo "---- start $(date) APP_ENV=${APP_ENV} ----" >>"$LOG"
nohup env APP_ENV="$APP_ENV" ITINERO_ALLOW_MOCK_PAYMENT="$ITINERO_ALLOW_MOCK_PAYMENT" ITINERO_LOCAL_DEV="$ITINERO_LOCAL_DEV" \
  "$PY" -m uvicorn supervisor.main:app --host 127.0.0.1 --port 8000 >>"$LOG" 2>&1 &
echo $! >"$PID_FILE"
echo "started pid $(cat "$PID_FILE") — log $LOG (APP_ENV=${APP_ENV})"

for _ in $(seq 1 30); do
  if is_up; then
    echo "healthy: http://127.0.0.1:8000/api/health/live"
    exit 0
  fi
  sleep 0.4
done

echo "started but health check timed out — see $LOG" >&2
exit 3
