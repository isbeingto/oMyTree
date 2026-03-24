# Phase 0 Setup Runbook (Workspace/Tenant)

> 目标：一键完成 Phase 0 底座准备（迁移、回填、基础验证）。

---

## 1) 执行数据库迁移

**推荐（统一 runner）：**

```bash
node api/scripts/run_migrations.mjs --from 20260130_p0_workspaces.sql
```

**或手动执行（psql）：**

```bash
psql -U omytree -d omytree -f api/db/migrations/20260130_p0_workspaces.sql
```

---

## 2) 回填 personal workspace

先 dry-run 看规模：

```bash
node api/scripts/backfill_personal_workspaces.mjs --dry-run
```

执行回填：

```bash
node api/scripts/backfill_personal_workspaces.mjs
```

---

## 3) 可选：绑定 WeKnora tenant/key

参考 `docs/runbooks/weknora_provisioning.md`：

```bash
export WEKNORA_API_KEY="sk-xxx"
export API_KEY_ENCRYPTION_SECRET="your-32-bytes-secret"

node api/scripts/weknora_provision_workspace.mjs \
  --workspace-id <workspace-uuid> \
  --api-key-env WEKNORA_API_KEY \
  --tenant-id <tenant-id>
```

---

## 4) 验证（可选）

```bash
pnpm --filter omytree-api exec vitest run tests/workspaces_store.test.js
```

> 说明：测试依赖数据库已执行上述迁移。
