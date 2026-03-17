#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENGINE_DIR="$ROOT_DIR/services/memory-engine"
VENV_DIR="$ENGINE_DIR/.venv-build"
DIST_DIR="$ENGINE_DIR/dist-macos"
WORK_DIR="$ENGINE_DIR/build-pyinstaller"
APP_NAME="open-master-memory-engine"
PIP_INDEX_URL="${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}"
PIP_TRUSTED_HOST="${PIP_TRUSTED_HOST:-pypi.tuna.tsinghua.edu.cn}"

PYTHON_BIN="${PYTHON_BIN:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  for candidate in python3.12 python3.11 python3.10; do
    if command -v "$candidate" >/dev/null 2>&1; then
      PYTHON_BIN="$candidate"
      break
    fi
  done
fi

if [[ -z "$PYTHON_BIN" ]] && command -v conda >/dev/null 2>&1; then
  CONDA_BASE="$(conda info --base 2>/dev/null || true)"
  if [[ -n "$CONDA_BASE" && -x "$CONDA_BASE/bin/python" ]]; then
    PYTHON_BIN="$CONDA_BASE/bin/python"
  fi
fi

if [[ -z "$PYTHON_BIN" ]] && command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
fi

if [[ -z "$PYTHON_BIN" ]]; then
  echo "No Python interpreter found. Python 3.10+ is required." >&2
  exit 1
fi

PYTHON_BIN="$PYTHON_BIN" "$PYTHON_BIN" - <<'PY'
import os
import sys

if sys.version_info < (3, 10):
    print(
        f"Python 3.10+ is required for memory-engine packaging, got {sys.version.split()[0]} from {os.environ['PYTHON_BIN']}",
        file=sys.stderr,
    )
    raise SystemExit(1)
PY
rm -rf "$VENV_DIR"
"$PYTHON_BIN" -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

python -m pip install \
  --index-url "$PIP_INDEX_URL" \
  --trusted-host "$PIP_TRUSTED_HOST" \
  --timeout 180 \
  --retries 10 \
  --prefer-binary \
  -r "$ENGINE_DIR/requirements.txt" pyinstaller

rm -rf "$DIST_DIR" "$WORK_DIR"

pyinstaller \
  --noconfirm \
  --clean \
  --onedir \
  --name "$APP_NAME" \
  --distpath "$DIST_DIR" \
  --workpath "$WORK_DIR" \
  --paths "$ENGINE_DIR" \
  --collect-submodules graphiti_core \
  --collect-submodules kuzu \
  --collect-data graphiti_core \
  "$ENGINE_DIR/run_memory_engine.py"
