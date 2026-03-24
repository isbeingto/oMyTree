#!/usr/bin/env bash
set -euo pipefail

# One-command Docker bootstrap without docker compose.
# Starts: postgres, redis, qdrant, docreader, weknora, api, web

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DOCKER_BIN="docker"
if ! docker ps >/dev/null 2>&1; then
  if sudo -n docker ps >/dev/null 2>&1; then
    DOCKER_BIN="sudo -n docker"
  else
    echo "ERROR: docker not accessible. Run as a user with docker access or configure sudo." >&2
    exit 1
  fi
fi

NETWORK="omytree-net"
POSTGRES_NAME="omytree-postgres"
REDIS_NAME="omytree-redis"
QDRANT_NAME="omytree-qdrant"
DOCREADER_NAME="omytree-docreader"
WEKNORA_NAME="omytree-weknora"
API_NAME="omytree-api"
WEB_NAME="omytree-web"

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-omytree_dev_password}"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-CHANGE_ME_NEXTAUTH_SECRET}"
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:-CHANGE_ME_NEXT_SERVER_ACTIONS_ENCRYPTION_KEY}"
API_KEY_ENCRYPTION_SECRET="${API_KEY_ENCRYPTION_SECRET:-CHANGE_ME_API_KEY_ENCRYPTION_SECRET_BASE64}"
TENANT_AES_KEY="${TENANT_AES_KEY:-CHANGE_ME_TENANT_AES_KEY_64_HEX}"
JWT_SECRET="${JWT_SECRET:-CHANGE_ME_JWT_SECRET_64_HEX}"

SKIP_DOCREADER=0
for arg in "$@"; do
  case "$arg" in
    --skip-docreader) SKIP_DOCREADER=1 ;;
  esac
done

# Network
$DOCKER_BIN network inspect "$NETWORK" >/dev/null 2>&1 || $DOCKER_BIN network create "$NETWORK" >/dev/null

# Volumes
$DOCKER_BIN volume inspect omytree_pgdata >/dev/null 2>&1 || $DOCKER_BIN volume create omytree_pgdata >/dev/null
$DOCKER_BIN volume inspect omytree_qdrant_storage >/dev/null 2>&1 || $DOCKER_BIN volume create omytree_qdrant_storage >/dev/null
$DOCKER_BIN volume inspect omytree_weknora_files >/dev/null 2>&1 || $DOCKER_BIN volume create omytree_weknora_files >/dev/null

# Postgres
if ! $DOCKER_BIN ps -a --format '{{.Names}}' | grep -qx "$POSTGRES_NAME"; then
  $DOCKER_BIN run -d \
    --name "$POSTGRES_NAME" \
    --network "$NETWORK" \
    -e POSTGRES_USER=omytree \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -e POSTGRES_DB=omytree \
    -p 5432:5432 \
    -v omytree_pgdata:/var/lib/postgresql/data \
    -v "$ROOT_DIR/docker/postgres/init/00_create_weknora_db.sql":/docker-entrypoint-initdb.d/00_create_weknora_db.sql:ro \
    -v "$ROOT_DIR/database/sql/init_pg.sql":/docker-entrypoint-initdb.d/01_init_pg.sql:ro \
    postgres:14 >/dev/null
else
  $DOCKER_BIN start "$POSTGRES_NAME" >/dev/null
fi

# Redis
if ! $DOCKER_BIN ps -a --format '{{.Names}}' | grep -qx "$REDIS_NAME"; then
  $DOCKER_BIN run -d \
    --name "$REDIS_NAME" \
    --network "$NETWORK" \
    -p 6379:6379 \
    redis:7-alpine redis-server --save "" --appendonly no >/dev/null
else
  $DOCKER_BIN start "$REDIS_NAME" >/dev/null
fi

# Qdrant
if ! $DOCKER_BIN ps -a --format '{{.Names}}' | grep -qx "$QDRANT_NAME"; then
  $DOCKER_BIN run -d \
    --name "$QDRANT_NAME" \
    --network "$NETWORK" \
    -p 6333:6333 -p 6334:6334 \
    -v omytree_qdrant_storage:/qdrant/storage \
    qdrant/qdrant:latest >/dev/null
else
  $DOCKER_BIN start "$QDRANT_NAME" >/dev/null
fi

echo "Building images (this may take a while on first run)..."
$DOCKER_BIN build -f docker/Dockerfile.node -t omytree-node . >/dev/null
$DOCKER_BIN build -f docker/Dockerfile.weknora -t omytree-weknora . >/dev/null

if [[ "$SKIP_DOCREADER" == "0" ]]; then
  $DOCKER_BIN build -f docker/Dockerfile.docreader -t omytree-docreader . >/dev/null
fi

# docreader
if [[ "$SKIP_DOCREADER" == "0" ]]; then
  if ! $DOCKER_BIN ps -a --format '{{.Names}}' | grep -qx "$DOCREADER_NAME"; then
    $DOCKER_BIN run -d \
      --name "$DOCREADER_NAME" \
      --network "$NETWORK" \
      -p 50051:50051 \
      -e DOCREADER_GRPC_PORT=50051 \
      -e DOCREADER_GRPC_MAX_WORKERS=4 \
      -e DOCREADER_OCR_BACKEND=paddle \
      -e DOCREADER_PDF_OCR_MIN_TEXT_CHARS=200 \
      -e DOCREADER_PDF_OCR_MIN_UNIQUE_RATIO=0.12 \
      -e DOCREADER_PDF_OCR_MAX_PAGES=50 \
      -e DOCREADER_PDF_OCR_RENDER_SCALE=2.0 \
      -e DOCREADER_STORAGE_TYPE=local \
      -e DOCREADER_LOCAL_STORAGE_BASE_DIR=/data/weknora/files \
      -e PYTHONPATH=/app/services/weknora/docreader/proto:/app/services/weknora \
      -v omytree_weknora_files:/data/weknora/files \
      omytree-docreader >/dev/null
  else
    $DOCKER_BIN start "$DOCREADER_NAME" >/dev/null
  fi
fi

# weknora
if ! $DOCKER_BIN ps -a --format '{{.Names}}' | grep -qx "$WEKNORA_NAME"; then
  $DOCKER_BIN run -d \
    --name "$WEKNORA_NAME" \
    --network "$NETWORK" \
    -p 8081:8081 \
    -e GIN_MODE=release \
    -e DISABLE_REGISTRATION=true \
    -e DB_DRIVER=postgres \
    -e DB_HOST=omytree-postgres \
    -e DB_PORT=5432 \
    -e DB_USER=omytree \
    -e DB_PASSWORD="$POSTGRES_PASSWORD" \
    -e DB_NAME=omytree_weknora \
    -e RETRIEVE_DRIVER=qdrant \
    -e QDRANT_HOST=omytree-qdrant \
    -e QDRANT_PORT=6334 \
    -e QDRANT_COLLECTION=omytree_kb \
    -e QDRANT_USE_TLS=false \
    -e DOCREADER_ADDR=${DOCREADER_NAME}:50051 \
    -e STORAGE_TYPE=local \
    -e LOCAL_STORAGE_BASE_DIR=/data/weknora/files \
    -e STREAM_MANAGER_TYPE=memory \
    -e REDIS_ADDR=${REDIS_NAME}:6379 \
    -e REDIS_PASSWORD= \
    -e REDIS_DB=0 \
    -e ENABLE_GRAPH_RAG=false \
    -e AUTO_MIGRATE=true \
    -e AUTO_RECOVER_DIRTY=true \
    -e TENANT_AES_KEY="$TENANT_AES_KEY" \
    -e JWT_SECRET="$JWT_SECRET" \
    -v omytree_weknora_files:/data/weknora/files \
    -v "$ROOT_DIR/docker/weknora/config.yaml":/app/config/config.yaml:ro \
    omytree-weknora >/dev/null
else
  $DOCKER_BIN start "$WEKNORA_NAME" >/dev/null
fi

# api
if ! $DOCKER_BIN ps -a --format '{{.Names}}' | grep -qx "$API_NAME"; then
  $DOCKER_BIN run -d \
    --name "$API_NAME" \
    --network "$NETWORK" \
    -p 8000:8000 \
    -e NODE_ENV=production \
    -e HOST=0.0.0.0 \
    -e PORT=8000 \
    -e TREE_ADAPTER=pg \
    -e PG_DSN="postgres://omytree:${POSTGRES_PASSWORD}@${POSTGRES_NAME}:5432/omytree?sslmode=disable" \
    -e PGUSER=omytree \
    -e PGPASSWORD="$POSTGRES_PASSWORD" \
    -e PGHOST="$POSTGRES_NAME" \
    -e PGPORT=5432 \
    -e PGDATABASE=omytree \
    -e PGSSLMODE=disable \
    -e ACCEPT_DEV_ENDPOINTS=1 \
    -e OPENAI_API_KEY= \
    -e LLM_MODEL=gpt-4o-mini \
    -e MAIL_PROVIDER=log \
    -e APP_PUBLIC_URL=http://localhost:3000 \
    -e API_KEY_ENCRYPTION_SECRET="$API_KEY_ENCRYPTION_SECRET" \
    -w /app/api \
    omytree-node node index.js >/dev/null
else
  $DOCKER_BIN start "$API_NAME" >/dev/null
fi

# web
if ! $DOCKER_BIN ps -a --format '{{.Names}}' | grep -qx "$WEB_NAME"; then
  $DOCKER_BIN run -d \
    --name "$WEB_NAME" \
    --network "$NETWORK" \
    -p 3000:3000 \
    -e NODE_ENV=production \
    -e API_PROXY_TARGET=http://${API_NAME}:8000 \
    -e NEXTAUTH_URL=http://localhost:3000 \
    -e NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
    -e AUTH_TRUST_HOST=true \
    -e NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
    -e DATABASE_URL="postgres://omytree:${POSTGRES_PASSWORD}@${POSTGRES_NAME}:5432/omytree?sslmode=disable" \
    -e PG_DSN="postgres://omytree:${POSTGRES_PASSWORD}@${POSTGRES_NAME}:5432/omytree?sslmode=disable" \
    -e NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" \
    -w /app/web \
    omytree-node sh -c "node scripts/ensure-build.mjs && ./node_modules/next/dist/bin/next start -p 3000 -H 0.0.0.0" >/dev/null
else
  $DOCKER_BIN start "$WEB_NAME" >/dev/null
fi

echo "OK. Services are starting."
echo "- Web:     http://localhost:3000"
echo "- API:     http://localhost:8000"
echo "- WeKnora: http://localhost:8081/health"
