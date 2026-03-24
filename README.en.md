# oMyTree

English | [简体中文](README.md)

[![Live](https://img.shields.io/badge/Live-www.omytree.com-1f7a5a)](https://www.omytree.com)
[![Node](https://img.shields.io/badge/Node-20%2B-3c873a)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-336791)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-black)](LICENSE)

oMyTree is an AI workspace for deep research and structured thinking. It turns chat sessions into process assets: users can branch endlessly on a canvas, annotate key reasoning steps, turn important paths into outcome reports, and promote reusable work into a knowledge base.

Instead of treating AI conversations as disposable transcripts, oMyTree is built around preserving how an idea evolved, what evidence mattered, and which intermediate results should remain reusable.

> Branding note: the project was renamed from LinZhi to oMyTree on 2026-01-22. Some historical docs may still reference the old name.

## Overview

- Infinite canvas + tree structure for non-linear exploration
- Curation layer with annotations, keyframes, and outcome reports
- Knowledge-base integration for reusable assets and explicit RAG workflows
- Multi-model support across hosted providers, BYOK, and Ollama-style local setups

## Why oMyTree

AI makes it easy to get an answer. For serious research, writing, planning, and analysis, the harder problems are different:

- Which branches have already been explored?
- Which evidence actually matters?
- How did a conclusion emerge from prior reasoning?
- Which parts should be promoted into reusable knowledge?

oMyTree is designed to keep that middle layer instead of losing it.

## Core Highlights

### 1. Space → Curation → Assets

The product and codebase are organized around three connected layers:

- Space: an infinite canvas for branching exploration
- Curation: keyframes and outcomes for active sense-making
- Assets: reusable knowledge promoted into a knowledge layer

That makes oMyTree more than “chat + RAG”. It is a workflow for exploration, editorial judgment, and long-term reuse.

### 2. Traceable outcomes instead of isolated summaries

Outcome reports are generated from a selected anchor node plus the root-to-anchor path and curated annotations. This keeps outputs grounded in a visible process, not just a detached model summary.

### 3. User-controlled retrieval

The knowledge backend is integrated on top of Tencent's open-source WeKnora project. In oMyTree, retrieval remains explicitly user-controlled: users choose the knowledge base or files they want to bring into a conversation, instead of relying on silent automatic recall.

### 4. A maintainable frontend data architecture

The frontend uses a deliberate data layer rather than ad-hoc fetches inside components:

- TanStack Query handles async state, caching, and invalidation.
- A unified client in `web/lib/app-api-client.ts` centralizes path normalization, request serialization, credentials, and API error handling.
- Domain-specific hooks build on top of that client for trees, settings, models, metrics, sharing, and other modules.

This structure is better suited to a product that keeps evolving.

### 5. Production-shaped development workflow

The repository is designed around PM2 production-mode workflows rather than relying on local-only dev servers for day-to-day work. Web and API services are reloaded in the same shape they are deployed.

### 6. Strong operational detail for a product repo

The codebase includes observability and operational support beyond core features: Prometheus-style metrics, trace middleware, hot-reload scripts, Docker orchestration, and service-aware deployment scripts.

## Product Capabilities

| Capability | Description |
| --- | --- |
| Tree-based exploration | Keep branching from any node while preserving the full path |
| AI-assisted branching | Continue exploration with multiple model providers |
| Keyframes / annotations | Mark important evidence and reasoning checkpoints |
| Outcome reports | Generate traceable milestone reports from curated paths |
| Knowledge-base integration | Use WeKnora + Qdrant + docreader for upload, retrieval, and RAG |
| Snapshots and sharing | Preserve states over time and share trees for collaboration |
| Multi-model support | Platform models, BYOK, and local model flows |
| Observability | Built-in tracing, metrics, logging, and maintenance scripts |

## Architecture

```text
Browser
  -> Web (Next.js 16 + React 19)
  -> API (Express 5 + Node.js 20)
  -> PostgreSQL / Redis
  -> Knowledge services (WeKnora + Qdrant + docreader)
```

### Frontend

- Next.js 16 App Router
- React 19
- TanStack Query as the shared query/cache layer
- Unified API client + modular hooks
- OpenAPI-based type generation to keep contracts aligned

### Backend

- Express 5 + Node.js 20, ESM-only
- Route-factory composition centered in `api/index.js`
- Shared PostgreSQL pool instead of ad-hoc clients
- Redis-backed rate limiting and quota control paths

### Knowledge Layer

- Knowledge backend based on Tencent's open-source WeKnora
- Qdrant for vector retrieval
- docreader for parsing, chunking, and preprocessing
- oMyTree API adds workspace/tenant integration, retrieval injection, and citation shaping on top

## Quick Start

### Option A: Docker

See [docs/DOCKER_QUICKSTART.md](docs/DOCKER_QUICKSTART.md) for the full guide.

```bash
sudo docker compose -f docker/compose.yaml up -d --build
sudo docker compose -f docker/compose.yaml exec api node scripts/run_migrations.mjs
```

Default endpoints:

- Web: http://localhost:3000
- API: http://localhost:8000
- WeKnora health: http://localhost:8081/health

### Option B: Manual Setup

#### 1. Clone

```bash
git clone https://github.com/isbeingto/oMyTree.git /srv/oMyTree
cd /srv/oMyTree
```

#### 2. Install dependencies

```bash
corepack enable
pnpm install --frozen-lockfile
```

#### 3. Prepare PostgreSQL

```sql
CREATE DATABASE omytree;
CREATE USER omytree WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE omytree TO omytree;
```

Run the main business migrations:

```bash
PG_DSN="postgres://omytree:your_password_here@127.0.0.1:5432/omytree?sslmode=disable" node api/scripts/run_migrations.mjs
```

If you also need the legacy tree-engine tables:

```bash
PGPASSWORD='your_password_here' psql -U omytree -h 127.0.0.1 -d omytree -f database/sql/init_pg.sql
```

#### 4. Configure services

```bash
cp ecosystem.config.example.js ecosystem.config.js
```

Then fill in the database, auth, model, billing, mail, and WeKnora-related settings for your environment.

#### 5. Generate types and build

```bash
pnpm --filter omytree-web run gen:types
pnpm --filter omytree-web run build
```

#### 6. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 list
```

## Development Workflow

This repository is primarily operated in PM2 production mode.

```bash
pnpm --filter omytree-web run build && pm2 reload omytree-web
pm2 reload omytree-api
pnpm --filter omytree-web run gen:types
```

Convenience scripts:

```bash
bash scripts/deploy/hot-reload.sh web
bash scripts/deploy/hot-reload.sh api
bash scripts/deploy/hot-reload.sh all
```

## Project Structure

```text
api/                 Express API, route factories, services, migrations, tests
web/                 Next.js app, UI components, API client, hooks, OpenAPI types
services/weknora/    Embedded WeKnora service source
database/sql/        SQL bootstrap and migration scripts
docker/              Docker images and compose stack
scripts/             Deployment, maintenance, and diagnostics scripts
docs/                Navigation, specs, integration memos, and operations docs
```

## Testing

```bash
pnpm --filter omytree-api test
pnpm --filter omytree-web test
pnpm test:e2e
```

## Documentation

- Docker quickstart: [docs/DOCKER_QUICKSTART.md](docs/DOCKER_QUICKSTART.md)
- Layer 2 / Layer 3 integration memo: [docs/L2_L3_INTEGRATION_MEMO.md](docs/L2_L3_INTEGRATION_MEMO.md)
- Layer 2 outcomes: [docs/t93_layer2_outcomes.md](docs/t93_layer2_outcomes.md)
- Product positioning and feature overview: [docs/PRODUCT_POSITIONING_AND_FEATURES_2026-02-21.md](docs/PRODUCT_POSITIONING_AND_FEATURES_2026-02-21.md)
- Copilot collaboration notes: [.github/copilot-instructions.md](.github/copilot-instructions.md)
- API contract: [web/openapi/openapi.yaml](web/openapi/openapi.yaml)
- Operations scripts: [scripts/README.md](scripts/README.md)

## Open Source Notes

- `ecosystem.config.js` is intentionally not tracked; copy from `ecosystem.config.example.js`.
- Database backups, private keys, and local environment files should never be committed.
- If you deploy your own instance, check auth, billing, mail, object storage, and knowledge-service settings first.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Web changes do not appear | Run `pnpm --filter omytree-web run build` before `pm2 reload omytree-web` |
| OpenAPI types are outdated | Run `pnpm --filter omytree-web run gen:types` |
| PM2 process is missing | Run `pm2 start ecosystem.config.js` |
| Database connection fails | Verify `PG_DSN`, `PGUSER`, `PGPASSWORD`, and grants |
| Redis connection fails | Confirm Redis is running and reachable |

## License

MIT. See [LICENSE](LICENSE).