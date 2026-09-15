#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# Use the shared backend environment used by the Node API, while allowing a
# backend-local .env file to override it for deployment-specific settings.
if [[ -f ../artifacts/api-server/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source ../artifacts/api-server/.env
  set +a
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
export PORT="${PORT:-${BACKEND_PORT:-8000}}"

exec python -m uvicorn app.main:app \
  --host "$BACKEND_HOST" \
  --port "$PORT"
