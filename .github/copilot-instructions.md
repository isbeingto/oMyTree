# Copilot instructions for oMyTree

## Big picture
- Monorepo (pnpm workspace): `api/` (Express 5, Node 20, ESM) + `web/` (Next.js App Router, React 19).
- Primary runtime is **production mode** managed by PM2; docs explicitly warn against relying on dev mode for day-to-day work.
- Core data store is PostgreSQL; API also uses Redis for rate/quota and WeKnora (Go) + Qdrant + docreader (Python) for “Knowledge” features.

## Local/dev workflow (project-specific)
- Install deps once: `corepack enable && pnpm install --frozen-lockfile`.
- Web typegen: `pnpm --filter omytree-web run gen:types` (from `web/openapi/openapi.yaml` → `web/lib/types/openapi.ts`).
- Web deploy loop (this repo’s norm): `pnpm --filter omytree-web run build && pm2 reload omytree-web`.
- API deploy loop: `pm2 reload omytree-api`.
- PM2 entrypoints + env live in `ecosystem.config.js` (repo convention: don’t use `.env.local` for web).
- Docker “one command” stack: `sudo docker compose -f docker/compose.yaml up -d --build` (see `docs/DOCKER_QUICKSTART.md`).

## Service boundaries & data flow
- Browser → `web/` → (Next rewrites) → `api/` → Postgres.
- Next.js proxies most `/api/*` to the API using rewrites in `web/next.config.mjs` with `API_PROXY_TARGET`.
  - If you add/rename an API path, update rewrites when needed.
  - Note: some `/api/*` are handled by Next.js routes first; rewrites are in `fallback` for that reason.
- “Knowledge” depends on WeKnora: API reads `WEKNORA_BASE_URL`/`WEKNORA_API_KEY` from `ecosystem.config.js` and routes live under `api/routes/knowledge/`.

## Backend conventions (API)
- ESM-only (`api/package.json` has `"type": "module"`): use `import`/`export`.
- Route modules are usually factories that accept DB handles, e.g. `createXRouter(pgClient)`; wiring happens centrally in `api/index.js`.
- DB access: reuse the shared pool from `api/db/pool.js` (`pool`, `getClient()`); avoid creating ad-hoc `new pg.Client()`.
- Global middleware chain is set up in `api/index.js` (notably `traceMiddleware`, `securityHeaders`, `constitutionGuard`, `rateQuotaGuard`).
- Prefer the shared error helper `respondWithError` from `api/lib/errors.js` to keep API error shape consistent.

## Tests
- API: `pnpm --filter omytree-api test` (runs `api/scripts/api_smoke_test.js` then `vitest` with single-fork DB config in `api/vitest.config.js`).
- Web: `pnpm --filter omytree-web test` (Vitest) and `pnpm test:e2e` (Playwright from repo root).

## Repo gotchas
- The `scripts/` directory at root level contains all operational scripts (deploy, docker, maintenance, diagnostics, dev tools).
- Each sub-project keeps its own specialized scripts: `api/tools/`, `web/tools/`, `services/weknora/scripts/`.
