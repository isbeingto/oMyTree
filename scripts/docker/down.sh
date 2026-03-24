#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DOCKER_BIN="docker"
if ! docker ps >/dev/null 2>&1; then
  if sudo -n docker ps >/dev/null 2>&1; then
    DOCKER_BIN="sudo -n docker"
  else
    echo "ERROR: docker not accessible." >&2
    exit 1
  fi
fi

CONTAINERS=(
  omytree-web
  omytree-api
  omytree-weknora
  omytree-docreader
  omytree-qdrant
  omytree-redis
  omytree-postgres
)

for c in "${CONTAINERS[@]}"; do
  if $DOCKER_BIN ps -a --format '{{.Names}}' | grep -qx "$c"; then
    $DOCKER_BIN rm -f "$c" >/dev/null
  fi
done

if $DOCKER_BIN network inspect omytree-net >/dev/null 2>&1; then
  $DOCKER_BIN network rm omytree-net >/dev/null || true
fi

echo "OK. Containers removed. Volumes preserved (omytree_pgdata/omytree_qdrant_storage/omytree_weknora_files)."
