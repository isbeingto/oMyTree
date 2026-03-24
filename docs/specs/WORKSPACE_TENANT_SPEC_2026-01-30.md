# Workspace / Tenant Spec (2026-01-30)

> 目标：为 ToC 强隔离与 Team 共享提供统一底座；让 oMyTree workspace 与 WeKnora tenant 一一映射。

---

## 1) 术语与边界

- **Workspace**：oMyTree 的空间/组织概念。ToC 个人版为 `personal`，Team 版为 `team`。
- **Workspace Member**：用户在 workspace 内的成员关系及角色。
- **WeKnora Tenant**：WeKnora 原生租户（由 API key 解析确定），负责 KB/Doc/Chunk 隔离。
- **映射关系**：**一个 workspace ⇔ 一个 WeKnora tenant**（一对一）。

非目标：
- 不在此阶段实现邀请流、计费、配额、审计报表。

---

## 2) 请求上下文与优先级

**新增 Header**：
- `x-omytree-workspace-id`：显式指定当前 workspace（Team 版必备）。

**已有 Header**：
- `x-omytree-user-id`：现有鉴权 header（保持不变）。

**解析优先级**：
1) `x-omytree-workspace-id`
2) `users.active_workspace_id`
3) personal workspace（兜底：无 active 时创建/返回 personal）

**后端写入（统一约定）**：
- `res.locals.authUserId`
- `res.locals.workspaceId`

---

## 3) 角色模型（最小集）

- `owner`：全权限 + 管理成员
- `admin`：管理成员 + 管理 KB
- `member`：读写 KB（具体权限策略后续可细分）

---

## 4) 数据模型（P0 基线）

`workspaces`
- `id UUID PK`
- `kind TEXT CHECK (personal|team)`
- `name TEXT`
- `owner_user_id UUID FK users(id)`
- `weknora_tenant_id BIGINT NULL`
- `weknora_api_key_encrypted TEXT NULL`
- `created_at/updated_at`

`workspace_members`
- `workspace_id UUID FK workspaces(id)`
- `user_id UUID FK users(id)`
- `role TEXT CHECK (owner|admin|member)`
- `created_at`
- `PRIMARY KEY (workspace_id, user_id)`

`users.active_workspace_id`（可空）

**不变量**：
- 每个用户最多一个 `personal` workspace。
- personal workspace 必须存在对应 member 记录（role=owner）。
- `weknora_api_key_encrypted` 必须为加密密文（AES-256-GCM）。

---

## 5) WeKnora Key 处理规范

- **禁止明文落库**：写入 `workspaces.weknora_api_key_encrypted` 前必须使用 `api/lib/api_key_crypto.js` 加密。
- **业务请求默认使用 workspace key**：不再依赖全局 `WEKNORA_API_KEY`（仅允许显式迁移期开关）。

---

## 6) 兼容性与演进

- ToC：默认 personal workspace，不展示 selector。
- Team：启用 selector + 成员管理 API。
- 未来：可在不改 WeKnora 的情况下扩展至团队共享、审计、轮换。
