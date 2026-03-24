#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
CLI_ENTRY="$SCRIPT_DIR/tree_rollback_cli.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "✗ node is required to run the rollback tool" >&2
  exit 1
fi

exec node "$CLI_ENTRY" "$@"
