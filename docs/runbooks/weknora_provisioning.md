# WeKnora Workspace Provisioning Runbook

> 目标：为每个 workspace 绑定独立 WeKnora tenant/API key，并安全写入 oMyTree 数据库。

---

## 0) 前置条件

- 已完成 `P0-DB-002`（workspaces 表存在）
- 已设置加密密钥：`API_KEY_ENCRYPTION_SECRET`（生产必需）
- 已有 WeKnora 管理权限（可创建 tenant 并获取 API key）

---

## 1) 获取 workspace 信息

从数据库查出目标 workspace：

```sql
SELECT id, name, kind, owner_user_id
FROM workspaces
WHERE name ILIKE '%your-workspace-name%'
LIMIT 5;
```

记录 `workspace_id`。

---

## 2) 在 WeKnora 创建 tenant

使用 WeKnora 管理端创建 tenant，拿到：

- `tenant_id`
- `api_key`

> 注意：`api_key` 为敏感信息，请勿写入文档或日志。

---

## 3) 写入 oMyTree（脚本推荐）

推荐使用脚本写入（自动加密）：

```bash
export WEKNORA_API_KEY="sk-xxx"
export API_KEY_ENCRYPTION_SECRET="your-32-bytes-secret"

node api/scripts/weknora_provision_workspace.mjs \
  --workspace-id <workspace-uuid> \
  --api-key-env WEKNORA_API_KEY \
  --tenant-id <tenant-id>
```

可先 dry-run：

```bash
node api/scripts/weknora_provision_workspace.mjs \
  --workspace-id <workspace-uuid> \
  --api-key-env WEKNORA_API_KEY \
  --tenant-id <tenant-id> \
  --dry-run
```

---

## 4) 验证

### 4.1 DB 检查（只看是否写入，不解密）

```sql
SELECT id, weknora_tenant_id, weknora_api_key_encrypted
FROM workspaces
WHERE id = '<workspace-uuid>';
```

### 4.2 API 验证（可选）

通过 `/api/knowledge/bases` 调用验证该 workspace 下可正常访问（需携带 `x-omytree-user-id` 及 `x-omytree-workspace-id`）。

---

## 5) 常见问题

- **报错：API_KEY_ENCRYPTION_SECRET not configured**
  - 需在环境变量中配置至少 32 字节密钥。
- **报错：workspace not found**
  - 检查 `workspace_id` 是否正确。
- **API key 泄露风险**
  - 避免在 shell history 中直接传明文，优先使用 `--api-key-env`。
