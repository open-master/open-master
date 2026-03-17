#!/bin/sh
set -e

if [ ! -d "node_modules/.package-lock.json" ] && [ ! -d "node_modules/next" ]; then
  echo "[entrypoint] Installing dependencies..."
  npm install --legacy-peer-deps
fi

exec "$@"
