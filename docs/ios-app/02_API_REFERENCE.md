# 02 — oMyTree API 完整接口文档

> 本文档涵盖 iOS App 需要调用的所有后端 API 端点。  
> 基础 URL: `https://www.omytree.com` (生产) / `http://127.0.0.1:8000` (开发)

---

## 2.1 认证机制

### 认证方式
iOS App **不使用** Web 端的 NextAuth session cookie。后端已实现移动端专用认证端点：

1. **登录**：调用 `POST /api/mobile/login`（邮箱密码）或 `POST /api/mobile/google-login`（Google）获取 `userId`
2. **存储**：将 `userId` 安全保存到 Keychain
3. **后续请求**：每个 API 请求携带以下 Header：

```
x-omytree-user-id: <用户UUID>
x-omytree-workspace-id: <工作空间UUID>  (可选，Team 计划)
Content-Type: application/json
```

### 用户 ID 获取
API 通过 `getAuthUserIdForRequest()` 函数解析用户 ID，优先级：
1. `x-omytree-user-id` header
2. `x-user-id` header  
3. `req.auth.user_id`
4. 回退到 demo 用户（受限模式）

> **iOS App 方案**：调用 `/api/mobile/login` 获取 userId → 存入 Keychain → 每个请求加 `x-omytree-user-id` header。详见 `07_AUTH_AND_SECURITY.md` 和 `2.18 Mobile Auth` 章节。

---

## 2.2 通用响应格式

### 成功响应
```json
{
  "ok": true,
  "data": { ... }
}
```

### 错误响应
```json
{
  "ok": false,
  "error": "error_code",
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "hint": "Optional hint for recovery",
  "detail": "Optional technical detail"
}
```

### HTTP 状态码
| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 429 | 速率/配额超限 |
| 500 | 服务器内部错误 |
| 502 | 上游服务（LLM）错误 |

---

## 2.3 核心端点 — Tree 管理

### POST /api/tree/start-root — 创建新 Tree 并发送首轮消息
> **最重要的端点之一**：创建新树 + 首轮对话，返回 SSE 流

**请求体：**
```json
{
  "user_text": "用户的第一条消息",
  "route_mode": "auto",
  "context_profile": "standard",
  "memory_scope": "branch",
  "provider": "openai",
  "provider_mode": "platform",
  "model": "gpt-4o",
  "upload_ids": ["uuid1"],
  "knowledge_base_ids": ["kb-uuid"],
  "knowledge": {
    "baseId": "kb-uuid",
    "documentIds": ["doc-uuid"]
  },
  "enable_grounding": false
}
```

**响应：SSE 流** (`text/event-stream`)
```
: connected

data: {"type":"tree","tree":{"id":"uuid","topic":"","user_id":"uid",...}}

data: {"type":"start","trace_id":"...","provider":"openai","model":"gpt-4o"}

data: {"type":"reasoning","text":"思考过程..."}

data: {"type":"delta","text":"AI回复的"}

data: {"type":"delta","text":"一段文本"}

data: {"type":"done","turn":{...},"user_node":{...},"ai_node":{...},"root_node":{...},"tree":{...},"has_reasoning":false,"provider":"openai","model":"gpt-4o"}
```

**SSE Event 类型：**

| type | 说明 | 数据字段 |
|------|------|----------|
| `tree` | 新树已创建（仅 start-root） | `tree` (完整树对象) |
| `start` | LLM 流开始 | `trace_id`, `provider`, `model` |
| `reasoning` | 推理过程增量（DeepSeek R1） | `text` |
| `delta` | AI 回复文本增量 | `text` |
| `done` | 完成 | `turn`, `user_node`, `ai_node`, `root_node`, `tree`, `has_reasoning`, `provider`, `model`, `usage`, `is_byok` |
| `error` | 错误 | `error: {code, provider, message}` |

---

### POST /api/turn/stream — 继续对话（核心交互）
> **App 最核心的端点**：在已有 Tree 中发送用户消息，获取 AI 流式回复

**请求体：**
```json
{
  "tree_id": "tree-uuid",
  "node_id": "parent-node-uuid",
  "user_text": "用户消息",
  "with_ai": true,
  "who": "ios_app",
  "route_mode": "auto",
  "provider": "openai",
  "provider_mode": "platform",
  "model": "gpt-4o",
  "upload_ids": [],
  "knowledge_base_ids": [],
  "knowledge": null,
  "enable_grounding": false
}
```

**响应：SSE 流** (与 start-root 类似，但没有 `tree` event)
```
: connected

data: {"type":"start","trace_id":"..."}

data: {"type":"reasoning","text":"..."}

data: {"type":"delta","text":"一段文字"}

data: {"type":"done","turn":{...},"user_node":{...},"ai_node":{...},"has_reasoning":false,"citations":null,"usage":null,"provider":"openai","model":"gpt-4o","is_byok":false}
```

**心跳：** 每 15 秒发送 `: ping\n\n`

**客户端断开：** 关闭连接会触发后端中止 LLM 请求

---

### POST /api/turn/abort — 中止 AI 生成

**请求体：**
```json
{
  "turn_id": "turn-uuid"
}
```

**响应：**
```json
{ "ok": true }
```

---

### GET /api/trees — 获取 Tree 列表

**查询参数：**
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| limit | int | 20 | 每页数量 |
| offset | int | 0 | 偏移 |
| search | string | - | 搜索关键词 |

**响应：**
```json
{
  "ok": true,
  "trees": [
    {
      "id": "uuid",
      "topic": "讨论话题",
      "title": "树标题",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T12:00:00Z",
      "node_count": 42,
      "context_profile": "standard",
      "memory_scope": "branch"
    }
  ],
  "total": 100,
  "has_more": true
}
```

---

### GET /api/tree/:id — 获取 Tree 完整快照

**响应：**
```json
{
  "id": "uuid",
  "topic": "对话主题",
  "title": "树标题",
  "nodes": [
    {
      "id": "node-uuid",
      "parent_id": "parent-uuid | null",
      "role": "user | assistant",
      "text": "消息内容",
      "created_at": "2026-01-01T00:00:00Z",
      "provider": "openai",
      "model": "gpt-4o",
      "reasoning_content": "推理过程(可选)",
      "has_reasoning": false,
      "turn_id": "turn-uuid",
      "children_count": 2,
      "seq": 1
    }
  ],
  "context": {
    "context_profile": "standard",
    "memory_scope": "branch",
    "tree_summary": { ... },
    "tree_summary_text": "摘要文本"
  }
}
```

---

### DELETE /api/tree/:id/delete — 删除 Tree

**响应：**
```json
{ "ok": true }
```

---

### PATCH /api/tree/:id/rename — 重命名 Tree

**请求体：**
```json
{
  "title": "新标题"
}
```

**响应：**
```json
{ "ok": true, "title": "新标题" }
```

---

### PUT /api/tree/:id/config — 更新 Tree 配置

**请求体：**
```json
{
  "context_profile": "lite | standard | max",
  "memory_scope": "branch | tree"
}
```

**响应：**
```json
{ "ok": true }
```

---

### POST /api/tree/:id/export/json — 导出 JSON

**响应：** JSON 文件下载

---

### POST /api/tree/:id/export/md — 导出 Markdown

**响应：** Markdown 文本

---

### POST /api/tree/:id/share — 创建/管理分享链接

**请求体：**
```json
{
  "action": "enable | disable"
}
```

**响应：**
```json
{
  "ok": true,
  "share_id": "share-uuid",
  "share_url": "https://www.omytree.com/share/share-uuid"
}
```

---

### GET /api/share/:shareId — 查看分享的 Tree

**响应：** 完整的 Tree 快照（公开访问，无需认证）

---

### POST /api/tree/create — 创建空 Tree

**请求体：**
```json
{
  "title": "可选标题"
}
```

**响应：**
```json
{
  "ok": true,
  "tree": { "id": "uuid", "title": "..." }
}
```

---

### POST /api/tree/fork — 从分享创建副本

**请求体：**
```json
{
  "share_id": "share-uuid"
}
```

**响应：**
```json
{
  "ok": true,
  "tree_id": "new-tree-uuid"
}
```

---

## 2.4 核心端点 — Node 操作

### GET /api/node/:id — 获取节点详情

**响应：**
```json
{
  "ok": true,
  "node": {
    "id": "uuid",
    "parent_id": "uuid | null",
    "role": "user | assistant",
    "text": "完整内容",
    "created_at": "...",
    "provider": "openai",
    "model": "gpt-4o",
    "reasoning_content": "推理过程",
    "has_reasoning": true,
    "thought_signature": "...",
    "turn_id": "uuid",
    "seq": 5,
    "children": ["child-uuid-1", "child-uuid-2"]
  }
}
```

---

### DELETE /api/node/:id/delete — 删除单个节点

**响应：**
```json
{ "ok": true, "deleted_count": 1 }
```

---

### POST /api/node/:id/delete-from — 删除该节点及其所有后代

**响应：**
```json
{ "ok": true, "deleted_count": 15 }
```

---

### POST /api/node/:id/prune — 修剪分支

**请求体：**
```json
{
  "keep_node_id": "保留的子节点UUID"
}
```

---

### POST /api/node/:id/edit-question — 编辑问题（非流式）

**请求体：**
```json
{
  "new_text": "修改后的问题",
  "provider": "openai",
  "model": "gpt-4o"
}
```

---

### POST /api/node/:id/edit-question/stream — 编辑问题（SSE 流式）

**请求体：** 同上

**响应：** SSE 流（与 turn/stream 类似的 delta/done 格式）

---

## 2.5 Keyframes（书签/关键帧）

### GET /api/tree/:treeId/keyframes — 获取树的所有 Keyframes

**响应：**
```json
{
  "ok": true,
  "keyframes": [
    {
      "id": "uuid",
      "node_id": "node-uuid",
      "tree_id": "tree-uuid",
      "annotation": "用户标注",
      "created_at": "..."
    }
  ]
}
```

---

### POST /api/tree/:treeId/keyframes/:nodeId — 添加 Keyframe

**请求体：**
```json
{
  "annotation": "可选标注"
}
```

---

### DELETE /api/tree/:treeId/keyframes/:nodeId — 删除 Keyframe

---

## 2.6 Memo（摘要）

### POST /api/memo/generate — 生成 Memo

**请求体：**
```json
{
  "tree_id": "tree-uuid",
  "focus_node_id": "node-uuid",
  "limit_n": 50,
  "based_on_memo_id": "previous-memo-uuid",
  "provider": "openai",
  "model": "gpt-4o",
  "lang": "auto | en | zh"
}
```

**响应：**
```json
{
  "ok": true,
  "memo": {
    "memo_id": "uuid",
    "created_at": "...",
    "scope": { "type": "branch", "root_node_id": "uuid" },
    "bullets": [
      {
        "text": "要点1",
        "anchors": [{ "type": "node", "id": "node-uuid" }]
      }
    ],
    "coverage": { "node_count": 42, "delta_count": 10 },
    "lang": "zh"
  }
}
```

---

### GET /api/memo/history?tree_id=xxx — 获取 Memo 历史

---

### GET /api/memo/latest?tree_id=xxx — 获取最新 Memo

---

### GET /api/memo/:memo_id — 获取特定 Memo

---

## 2.7 Outcome（成果 v2）

### POST /api/tree/:treeId/outcomes — 创建 Outcome

**请求体：**
```json
{
  "anchor_node_id": "node-uuid",
  "title": "可选标题",
  "conclusion": "可选结论",
  "provider": "openai",
  "model": "gpt-4o"
}
```

**响应：**
```json
{
  "ok": true,
  "outcome": {
    "id": "uuid",
    "tree_id": "tree-uuid",
    "anchor_node_id": "node-uuid",
    "title": "生成的标题",
    "conclusion": "结论",
    "report_json": { ... },
    "status": "generated",
    "created_at": "...",
    "updated_at": "..."
  },
  "title_candidates": ["标题1", "标题2", "标题3"]
}
```

---

### GET /api/tree/:treeId/outcomes — 列出 Outcomes

---

### POST /api/tree/:treeId/outcomes/preview — 预览标题候选

---

### GET /api/tree/:treeId/outcomes/:id — 获取 Outcome 详情

---

### PATCH /api/tree/:treeId/outcomes/:id — 更新 Outcome

---

### DELETE /api/tree/:treeId/outcomes/:id — 删除 Outcome

---

### POST /api/tree/:treeId/outcomes/:id/regenerate — 重新生成报告

---

## 2.8 Trail（探索轨迹）

### POST /api/tree/:treeId/trail — 生成 Trail

**请求体：**
```json
{
  "provider": "openai",
  "model": "gpt-4o"
}
```

**响应：**
```json
{
  "ok": true,
  "version": {
    "id": "uuid",
    "created_at": "...",
    "prompt_version": "v2",
    "provider": "openai",
    "model": "gpt-4o"
  },
  "content_markdown": "# Trail\n\n...",
  "keyframes_count": 5,
  "steps_processed": 5,
  "duration_ms": 3200
}
```

---

### GET /api/tree/:treeId/trail/latest — 获取最新 Trail

---

### GET /api/tree/:treeId/trail/versions — Trail 版本列表

---

### GET /api/tree/:treeId/trail/versions/:versionId — 获取特定版本

---

## 2.9 PathSnapshot（路径快照）

### POST /api/tree/:treeId/path-snapshots — 创建快照

### GET /api/tree/:treeId/path-snapshots — 列出快照

### GET /api/tree/:treeId/path-snapshots/latest — 最新快照

### GET /api/tree/:treeId/path-snapshots/:id — 获取快照

### DELETE /api/tree/:treeId/path-snapshots/:id — 删除快照

### POST /api/tree/:treeId/path-snapshots/:id/replay — 回放快照

---

## 2.10 BranchDiff（分支对比）

### POST /api/tree/:treeId/branch-diff — 对比两条分支

**请求体：**
```json
{
  "node_id_a": "node-uuid",
  "node_id_b": "node-uuid"
}
```

**响应：**
```json
{
  "ok": true,
  "diff": { "id": "uuid", "created_at": "..." },
  "diff_points": [
    {
      "summary": "分歧要点",
      "node_ids_a": ["uuid"],
      "node_ids_b": ["uuid"],
      "rationale": "原因"
    }
  ],
  "content_markdown": "对比报告 Markdown"
}
```

---

## 2.11 Evidence（证据）

### POST /api/evidence — 创建证据

**请求体：**
```json
{
  "tree_id": "tree-uuid",
  "type": "url | text",
  "title": "证据标题",
  "summary": "摘要",
  "source_url": "https://...",
  "text_content": "文本内容",
  "tags": ["tag1", "tag2"]
}
```

---

### POST /api/evidence/upload — 上传文件证据 (multipart/form-data)

### GET /api/evidence/:id — 获取证据详情

### GET /api/trees/:treeId/evidence — 列出树的证据

### POST /api/nodes/:nodeId/evidence/:evidenceId — 附加证据到节点

### DELETE /api/nodes/:nodeId/evidence/:evidenceId — 解除关联

### GET /api/nodes/:nodeId/evidence — 列出节点的证据

---

## 2.12 Knowledge（知识库）

### GET /api/knowledge/bases — 获取知识库列表

### POST /api/knowledge/bases — 创建知识库

### DELETE /api/knowledge/bases/:id — 删除知识库

### POST /api/knowledge/bases/:id/documents — 上传文档 (multipart/form-data)

### GET /api/knowledge/bases/:id/documents — 列出文档

### DELETE /api/knowledge/documents/:id — 删除文档

### POST /api/knowledge/search — 语义搜索

**请求体：**
```json
{
  "query": "搜索关键词",
  "base_id": "kb-uuid",
  "limit": 5
}
```

---

## 2.13 Upload（文件上传）

### POST /api/upload — 上传文件

**请求：** `multipart/form-data`
- `file`: 文件
- `tree_id`: 关联的 Tree ID（可选）

**响应：**
```json
{
  "ok": true,
  "upload_id": "uuid",
  "filename": "doc.pdf",
  "mime_type": "application/pdf",
  "size": 12345
}
```

---

## 2.14 Account（账户管理）

### GET /api/account/quota-status — 获取配额状态

**响应：**
```json
{
  "ok": true,
  "plan": "free | pro | team",
  "quota": {
    "turns_used": 50,
    "turns_limit": 100,
    "resets_at": "2026-03-10T00:00:00Z"
  },
  "is_byok": false,
  "has_active_providers": false
}
```

---

### GET /api/account/llm-settings — 获取 LLM 设置

**响应：**
```json
{
  "ok": true,
  "settings": {
    "enable_advanced_context": false,
    "preferred_llm_provider": "openai"
  }
}
```

---

### PUT /api/account/llm-settings — 更新 LLM 设置

---

### GET /api/account/enabled-models — 获取可用模型列表

**响应：**
```json
{
  "ok": true,
  "models": [
    {
      "provider": "openai",
      "model": "gpt-4o",
      "label": "GPT-4o",
      "enabled": true,
      "mode": "platform"
    }
  ]
}
```

---

### GET /api/account/user-providers — 获取用户 BYOK 提供商

### POST /api/account/user-providers — 添加/更新 BYOK 提供商

### DELETE /api/account/user-providers/:id — 删除 BYOK 提供商

---

### GET /api/account/api-keys — 获取 API Keys

### POST /api/account/api-keys — 创建 API Key

### DELETE /api/account/api-keys/:id — 删除 API Key

---

### GET /api/me/usage — 获取用量统计

---

## 2.15 Billing（计费）

### GET /api/billing/status — 获取订阅状态

### POST /api/billing/checkout — 创建支付 checkout

### POST /api/billing/portal — 获取管理门户链接

---

## 2.16 Workspace（工作空间）

### GET /api/workspaces — 获取工作空间列表

**响应：**
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "name": "My Workspace",
      "is_active": true,
      "role": "owner",
      "member_count": 3
    }
  ],
  "active_workspace_id": "uuid"
}
```

### POST /api/workspaces/:id/activate — 切换活跃工作空间

---

## 2.17 Auth（认证）

### Web 端认证端点（参考）

Web 端使用 NextAuth cookie-based session。这些端点对 iOS App **不直接使用**，但注册/验证/重置密码等仍可复用：

```
POST /api/auth/register            — 注册新用户（iOS 可直接调用）
POST /api/auth/verify-email        — 邮箱验证 { token }
POST /api/auth/resend-verification — 重发验证邮件 { userId, email }
POST /api/auth/forgot-password     — 忘记密码 { email }
POST /api/auth/reset-password      — 重置密码 { token, password }
```

---

## 2.18 Mobile Auth — iOS/移动端专用认证（✅ 已实现）

> **路径前缀**: `/api/mobile/`  
> **实现文件**: `api/routes/mobile_auth.js`  
> **状态**: 已部署上线，iOS App 应使用这些端点进行认证

### POST /api/mobile/login — 邮箱密码登录

> iOS App 登录入口。验证邮箱密码后返回 userId 和用户信息。

**请求体：**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**成功响应 (200)：**
```json
{
  "ok": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "name": "张三",
  "role": "user",
  "plan": "free",
  "preferred_language": "zh-CN",
  "email_verified": true,
  "enable_advanced_context": false,
  "created_at": "2025-01-15T08:30:00.000Z"
}
```

**错误响应：**
| 状态码 | code | 场景 |
|--------|------|------|
| 400 | `missing_credentials` | 邮箱或密码为空 |
| 401 | `invalid_credentials` | 邮箱或密码错误 |
| 401 | `no_password` | 该账号通过 Google 注册，无密码 |
| 403 | `account_disabled` | 账号已被禁用 |
| 500 | `internal_error` | 服务器内部错误 |

---

### POST /api/mobile/google-login — Google ID Token 登录

> 验证 Google Sign-In SDK 返回的 ID Token，查找或自动注册用户。

**请求体：**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIs...",
  "email": "user@gmail.com",
  "name": "User Name"
}
```

**成功响应 (200)：** 与 `/api/mobile/login` 相同格式。

**错误响应：**
| 状态码 | code | 场景 |
|--------|------|------|
| 400 | `missing_token` | idToken 为空 |
| 401 | `invalid_google_token` | Token 验证失败 |
| 403 | `account_disabled` | 账号已被禁用 |
| 500 | `internal_error` | 服务器内部错误 |

**后端验证逻辑：**
- 优先使用 `google-auth-library` 的 `verifyIdToken()` 验证
- Fallback 使用 Google `tokeninfo` 端点 (`https://oauth2.googleapis.com/tokeninfo`)
- 验证 `audience` 匹配 `GOOGLE_CLIENT_ID` 或 `GOOGLE_IOS_CLIENT_ID`
- 如果用户不存在，自动注册（`emailVerified = NOW()`）

---

### GET /api/mobile/me — 获取当前用户信息

> 根据 `x-omytree-user-id` header 获取用户 Profile。用于 App 启动时验证/刷新缓存的用户信息。

**Headers：**
```
x-omytree-user-id: 550e8400-e29b-41d4-a716-446655440000
```

**成功响应 (200)：** 与 `/api/mobile/login` 相同格式。

**错误响应：**
| 状态码 | code | 场景 |
|--------|------|------|
| 401 | `unauthorized` | 缺少或无效的 x-omytree-user-id header |
| 403 | `account_disabled` | 账号已被禁用 |
| 404 | `user_not_found` | 用户不存在 |

> **注意**：userId 必须是有效的 UUID 格式，否则返回 401。

---

### POST /api/mobile/refresh-profile — 刷新用户信息

> 与 `/api/mobile/me` 功能相同，POST 方式便于 App 主动调用。

**Headers / 响应格式**：与 `GET /api/mobile/me` 完全一致。

---

### GET /readyz — 就绪检查

**响应：**
```json
{
  "status": "ok",
  "postgres": "ok",
  "redis": "ok",
  "tree_adapter": "ok"
}
```

---

## 2.20 SSE 协议规范（iOS 实现关键）

### 连接握手
```
: connected\n\n
```

### 心跳（每15秒）
```
: ping\n\n
```

### 数据帧格式
```
data: {"type":"...","field":"value"}\n\n
```

### 事件类型汇总
| type | 出现场景 | 含义 |
|------|----------|------|
| `tree` | start-root | 新树已创建，包含完整 tree 对象 |
| `start` | 所有流 | LLM 开始生成，包含 provider/model/trace_id |
| `reasoning` | 有推理的模型 | 推理过程文本增量 |
| `delta` | 所有流 | AI 回复文本增量（核心数据） |
| `done` | 所有流 | 生成完成，包含完整 node 数据 |
| `error` | 所有流 | 错误，包含 code/provider/message |

### iOS SSE 解析注意事项
1. 以 `:` 开头的行是注释/心跳，忽略但用于保活检测
2. `data:` 后面是 JSON，可能跨多行
3. 空行 (`\n\n`) 分隔事件
4. 连接断开时应自动清理资源
5. 客户端关闭连接 = 中止 AI 生成
6. 超时建议：至少 600 秒（LLM 生成可能很慢）
