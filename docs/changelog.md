# LinZhi Changelog

## 2026-01-16 · T59-2 Quick Capture Removal (Deprecation)

- **Summary:** Fully removed the T59-2 Quick Capture (手动捕获) feature. The system now relies solely on AI-generated ledger atoms via memory_patch, eliminating manual capture UI complexity.
- **Deleted Files:**
  - `api/routes/ledger_capture.js` - API 路由
  - `api/services/ledger/capture_service.js` - 捕获服务
  - `web/app/tree/useCapture.ts` - React Hook
  - `web/components/capture/QuickCapture.tsx` - UI 组件
  - `tools/scripts/legacy/verify_t59_2_quick_capture.sh` - 验证脚本
  - `docs/tasks/T59-2_quick_capture_ledger.md` - 任务文档
- **OpenAPI Changes:** Removed `/api/ledger/capture` endpoints, `CaptureRequest`/`CaptureResponse` schemas
- **Backend Changes:** `memory_patch.js` VALID_KINDS now restricted to: `insight`, `key_point`, `definition`, `example`, `question`
- **Database Migration:** `20260116_p02_remove_capture_kinds.sql` cleans up deprecated ledger atom kinds
- **Rationale:** Manual capture introduced UX friction without measurable adoption. AI-generated atoms provide better consistency.

## 2025-12-29 · T86 Upload Lifecycle & Quota

- **Summary:** Implemented upload cascade delete and quota enforcement. Deleting a tree now automatically removes all associated uploads. Added v0 quota limits for file/tree/user storage.
- **Cascade Delete:** 
  - Soft delete triggers manual cleanup of `turn_uploads` → `uploads` records
  - API response includes `uploads_deleted` count
- **Quota Limits:**
  - Single file: 2 MB
  - Per tree: 10 MB
  - Per user storage: 50 MB
  - Per user files: 100
- **API Changes:**
  - `DELETE /api/tree/:id` returns `uploads_deleted` field
  - `GET /api/upload/config` returns `quotas` object
  - `POST /api/upload` returns 413 with specific error codes for quota violations
- **Error Codes:** `quota_file_too_large`, `quota_tree_exceeded`, `quota_user_storage_exceeded`, `quota_user_file_limit_exceeded`
- **Verification:** `verify_t86_cascade_and_quota.sh` - 11/11 tests passing
- **Docs:** [T86_UPLOAD_LIFECYCLE_QUOTA.md](T86_UPLOAD_LIFECYCLE_QUOTA.md)

## 2025-12-29 · T85 Text File Upload v0

- **Summary:** Implemented text file upload as message attachments with PostgreSQL `bytea` storage. Users can attach .txt, .md, .json, .csv and other text files to their questions for LLM context.
- **API Endpoints:**
  - `POST /api/upload` - Upload file
  - `GET /api/upload/:id` - Get metadata
  - `GET /api/upload/:id/download` - Download content
  - `DELETE /api/upload/:id` - Delete upload
  - `GET /api/trees/:treeId/uploads` - List uploads
- **Frontend:** `useUpload` hook + `UploadChip` component with status states (uploading/success/error)
- **Database:** New `uploads` table with `bytea` content, `turn_uploads` junction table
- **Auth Fix:** Added `x-omytree-user-id` header passing from frontend to backend via Next.js proxy. Fixed 401 enforcement in proxy routes.
- **Verification:** `verify_t85_upload.sh` - 20/20 tests passing
- **Docs:** [T85_TEXT_UPLOAD_V0.md](T85_TEXT_UPLOAD_V0.md)

## 2025-03-07 · P14-A Demo Tree Edge Hotfix

- **Summary:** `/api/tree/demo` now always emits both node and edge arrays, with the bridge wiring each `branch.confirm`
  event into the in-memory engine as a node-plus-edge pair. Integration stats expose total node and edge counts so backend
  verifiers can confirm growth after demo events.
- **Notes:** `verify_p14a_backend.sh` now asserts edge presence/targets alongside node growth; rerun it after deploying the
  backend to confirm demo topology consistency.

## 2025-03-06 · P14-C Tree Engine Seeding & Bridge Growth

- **Summary:** Added an in-memory tree engine powering `/api/tree/demo`, taught the bus→tree bridge to append nodes for each
  `branch.confirm` event, and exposed a dev-only `/api/tree/seed` helper so the `/tree-viz` UI renders at least ten demo nodes
  out of the box.
- **Notes:** `GET /api/tree/seed` is disabled in production builds and intended only for local bootstrapping; rerun
  `verify_p14a_backend.sh` to confirm node growth matches bridge counters.

## 2025-03-03 · P14-A Bridge Metrics Enrichment

- **Summary:** Added sanitized bridge counters (`linzhi_bridge_*`) to unified metrics, extended `/api/integration/tree/stats`
  with matching totals, and introduced `verify_p14a_backend.sh` to assert monotonic forwarding behaviour.
- **Notes:** Downstream scrapers should read the new `## bridge` section; run the new verifier alongside existing P12/P13
  checks.

## 2025-02-24 · P13 Unified Metrics & Health Probes

- **Summary:** Unified `/metrics` by reusing the existing Prometheus sections, introduced trace-aware `/healthz` and `/readyz`
  probes, and published verification scripts for backend and UI coverage.
- **Notes:** Next.js now proxies `/healthz` and `/readyz` via rewrites; rebuild the web app (`pnpm -C web build` then `pm2 restart linzhi-web`) after merging to load the updated routes.
- **Runbook:**
  ```sh
  curl -i http://127.0.0.1:8000/metrics
  curl -i http://127.0.0.1:8000/healthz
  curl -i http://127.0.0.1:8000/readyz
  curl -i http://127.0.0.1:3000/healthz
  curl -i http://127.0.0.1:3000/readyz
  ```

## 2025-02-17 · P10 UI Observability SSR Hotfix

- **Root cause:** Server-side rendering fetched `/metrics/bus` with a relative path, bypassing the Next.js rewrite and returning `404` in production-like deployments.
- **Fix:** The ecosystem page now resolves an absolute API base (via `NEXT_PUBLIC_API_BASE` or `http://127.0.0.1:8000` without trailing slashes) for SSR metric calls, preserving `cache: "no-store"`, and a new `verify-p10-ui.sh` script guards the Observability badge and response headers.

## 2025-02-20 · P12 Tree Bridge Badge & Verifier

- **Summary:** Surfaced the Tree Bridge badge during SSR using the absolute API base, parsed `/metrics/tree` counters, and added `verify-p12-ui.sh`.
- **Notes:** Do not commit `.next/` artifacts; after merging run `pnpm -C web build && pm2 restart linzhi-web` to redeploy the frontend.
