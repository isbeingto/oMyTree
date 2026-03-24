# Context v3 Profile & Scope - 配置快照与心智模型

**文档版本**: v1.0  
**快照时间**: 2025-12-11  
**Git Commit**: 851c3dd (T52-4)  
**目标**: 提供 Context v3 档位与记忆范围的完整定义与配置快照，作为后续所有修改的唯一基线。

---

## 一、概览

Context v3 引入了两个维度的可调控制：

1. **档位（Context Profile）**: 控制上下文预算、层级深度、内容密度
2. **记忆范围（Memory Scope）**: 控制上下文的空间范围（路径 vs 全树）

每棵树在创建时或后续可独立配置这两个参数，存储在 `trees` 表的 `context_profile` 和 `memory_scope` 字段。

---

## 二、三档位（Context Profile）详细说明

### 2.1 档位对比表

| 档位 | 适用场景 | tokens 预算 | 最大 tokens | 近期轮数 | 每轮字符限制 | Tree Summary | Parent Full Text | BYOK 限制 |
|------|----------|------------|------------|---------|-------------|--------------|------------------|----------|
| **Lite** | 快速问答、简单任务 | 800 | 2,560 | 2 轮 (4 节点) | 300 | ❌ 不包含 | ❌ 不包含 | ✅ 无限制 |
| **Standard** | 标准对话、中等复杂度 | 2,000 | 6,400 | 4 轮 (8 节点) | 400 | ✅ 包含 (200 字符) | ❌ 不包含 | ✅ 无限制 |
| **Max** | 深度分析、代码生成 | 8,000 | 20,480 | 6 轮 (12 节点) | 600 | ✅ 包含 (400 字符) | ✅ 包含 (600 字符) | ⚠️ 仅 BYOK |

### 2.2 档位详细配置

#### Lite（轻量档）
```javascript
{
  tokensBudget: 800,              // 提示词预算
  maxTokens: 2560,                // 提供商侧上限
  includeTreeStory: false,        // 不包含树级摘要
  pathSummary: 60,                // 路径摘要字符数
  parentSummary: 120,             // 父节点摘要字符数
  parentFull: 0,                  // 不包含父节点全文
  recentTurns: 2,                 // 最少 2 轮对话
  recentTurnPairs: 2,             // 2 对（4 节点）
  minRecentTurnPairs: 2,          // 硬性最小值
  recentTurnChars: 300,           // 每轮字符限制
  treeStoryLimit: 0,              // 不包含树摘要
  prioritizeDialogue: true        // 优先对话内容
}
```

**使用场景**：
- 简单问答、快速查询
- 低成本、高速度需求
- 移动端或低带宽环境
- 初次探索话题时的轻量交互

**优点**：响应快、成本低、适合频繁交互  
**限制**：无法访问深度历史、不适合复杂推理

---

#### Standard（标准档）
```javascript
{
  tokensBudget: 2000,             // 提示词预算
  maxTokens: 6400,                // 提供商侧上限
  includeTreeStory: true,         // 包含树级摘要
  pathSummary: 100,               // 路径摘要字符数
  parentSummary: 160,             // 父节点摘要字符数
  parentFull: 0,                  // 不包含父节点全文
  recentTurns: 4,                 // 最少 4 轮对话
  recentTurnPairs: 4,             // 4 对（8 节点）
  minRecentTurnPairs: 4,          // 硬性最小值
  recentTurnChars: 400,           // 每轮字符限制
  treeStoryLimit: 200,            // 树摘要字符限制
  prioritizeDialogue: true        // 优先对话内容
}
```

**使用场景**：
- 标准对话流程
- 中等复杂度的任务
- 需要一定历史上下文的讨论
- 平台默认推荐配置

**优点**：平衡性好、包含树级摘要、适合大部分场景  
**限制**：不包含完整父节点文本、对超长代码块可能截断

---

#### Max（最大档）
```javascript
{
  tokensBudget: 8000,             // 提示词预算
  maxTokens: 20480,               // 提供商侧上限
  includeTreeStory: true,         // 包含树级摘要
  pathSummary: 160,               // 路径摘要字符数
  parentSummary: 200,             // 父节点摘要字符数
  parentFull: 600,                // 包含父节点全文（600字符）
  recentTurns: 6,                 // 最少 6 轮对话
  recentTurnPairs: 6,             // 6 对（12 节点）
  minRecentTurnPairs: 6,          // 硬性最小值
  recentTurnChars: 600,           // 每轮字符限制
  treeStoryLimit: 400,            // 树摘要字符限制
  prioritizeDialogue: true        // 优先对话内容
}
```

**使用场景**：
- 深度代码分析与生成
- 复杂多步推理
- 需要保留完整上下文的任务
- 长文本处理（如长代码块、大段落）

**优点**：最大上下文、包含父节点全文、深度历史  
**限制**：⚠️ **仅限 BYOK（自带密钥）用户使用**，平台用户请求 Max 时自动降级为 Standard

**BYOK 降级规则**：
```javascript
// api/services/llm/context_profiles.js
export function resolveContextProfile(profile, isByok) {
  const normalized = profile.trim().toLowerCase();
  if (normalized === 'max' && !isByok) {
    // 非 BYOK 用户请求 Max 时自动降级为 Standard
    return { 
      profile: 'standard', 
      maxTokens: 6400, 
      promptTokensBudget: 2000 
    };
  }
  // ...
}
```

---

## 三、两种记忆范围（Memory Scope）

### 3.1 范围对比表

| 范围 | 行为 | 上下文来源 | Tree Summary | 适用场景 |
|------|------|-----------|--------------|----------|
| **branch** | 路径模式 | 当前节点的祖先链 | ❌ 不使用 | 线性对话、专注当前分支 |
| **tree** | 全树模式 | 整棵树的近期轮数 + 树级摘要 | ✅ 使用 | 跨分支讨论、全局视角 |

### 3.2 范围详细说明

#### branch（分支模式）
**行为**：
- 仅包含当前节点到根节点的祖先路径
- 构建路径摘要（breadcrumb path summary）
- 使用父节点摘要或全文（取决于档位）
- 包含路径上的近期对话轮数（由档位决定）

**数据来源**：
```sql
-- 示例：获取当前节点的祖先链
WITH RECURSIVE ancestors AS (
  SELECT id, parent_id, role, text, level, created_at
  FROM tree_nodes
  WHERE id = $1  -- 当前节点
  UNION ALL
  SELECT n.id, n.parent_id, n.role, n.text, n.level, n.created_at
  FROM tree_nodes n
  INNER JOIN ancestors a ON n.id = a.parent_id
)
SELECT * FROM ancestors ORDER BY level;
```

**适用场景**：
- 线性对话流程
- 专注当前话题，不需全局信息
- 减少噪音，避免跨分支干扰

**优点**：干净、专注、低噪音  
**限制**：无法感知其他分支的内容

---

#### tree（全树模式）
**行为**：
- 包含整棵树的近期对话（按时间排序，取最近 N 轮）
- 包含树级摘要（tree_summary），提供全局视角
- 路径摘要仍然保留（作为定位信息）
- 跨分支内容可能混合出现

**数据来源**：
```sql
-- 示例：获取树的全局近期对话
SELECT id, parent_id, role, text, level, created_at
FROM tree_nodes
WHERE tree_id = $1
ORDER BY created_at DESC
LIMIT $2;  -- 由档位的 recentTurns 决定
```

**Tree Summary 示例**：
```json
{
  "id": "tree-uuid",
  "topic": "如何优化 PostgreSQL 查询性能",
  "node_count": 42,
  "summary": "本树探讨了 PostgreSQL 查询优化策略，包括索引设计、查询计划分析、VACUUM 策略、连接池配置等话题。用户提出了慢查询问题，AI 给出了多个优化方案。",
  "generated_at": "2025-12-10T12:34:56Z",
  "version": 3
}
```

**适用场景**：
- 需要跨分支引用的讨论
- "刚才我们在另一个分支讨论过..."
- 需要全局视角的总结性任务
- 探索式对话（多分支并行）

**优点**：全局视野、跨分支感知  
**限制**：可能引入噪音、token 消耗更高

---

## 四、配置快照（生产环境）

### 4.1 代码位置

| 组件 | 文件路径 | 说明 |
|------|---------|------|
| **Profile 配置** | `api/services/llm/context_profiles.js` | maxTokens、promptTokensBudget、降级逻辑 |
| **Limits 配置** | `api/services/llm/context_limits.js` | 各档位的详细 token/字符限制 |
| **层级构建** | `api/services/llm/context_layers.js` | 根据 scope 构建上下文层 |
| **序列化** | `api/services/llm/serialize_context.js` | 将结构化上下文转为文本 |
| **数据库迁移** | `api/db/migrations/20251218_t33_1_context_controls.sql` | 字段定义与约束 |

### 4.2 数据库 Schema

```sql
-- trees 表
ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS context_profile TEXT NOT NULL DEFAULT 'lite',
  ADD COLUMN IF NOT EXISTS memory_scope TEXT NOT NULL DEFAULT 'branch',
  ADD COLUMN IF NOT EXISTS tree_summary JSONB NULL;

-- 约束
ALTER TABLE trees
  ADD CONSTRAINT chk_trees_context_profile
  CHECK (context_profile IN ('lite', 'standard', 'max'));

ALTER TABLE trees
  ADD CONSTRAINT chk_trees_memory_scope
  CHECK (memory_scope IN ('branch', 'tree'));
```

### 4.3 当前默认值

| 字段 | 默认值 | 来源 |
|------|--------|------|
| `context_profile` | `'lite'` | 数据库默认值 |
| `memory_scope` | `'branch'` | 数据库默认值 |
| `tree_summary` | `NULL` | 初始为空，后台任务生成 |

### 4.4 环境变量

| 变量 | 值 | 影响 |
|------|---|------|
| `ENABLE_PROMPT_GUIDE` | `false` | 禁用旧版 prompt guide |
| `ENABLE_CONTEXT_ANCHOR` | `true` | 启用上下文锚点（角色+任务） |
| （无 .env 文件） | - | 所有配置硬编码在代码中 |

---

## 五、档位 × 范围矩阵

### 5.1 组合行为对比

| 档位 | Scope=branch | Scope=tree |
|------|-------------|-----------|
| **Lite** | 祖先链路径 + 2 轮对话，无树摘要 | 全树近期 2 轮 + **无树摘要**（Lite 不启用） |
| **Standard** | 祖先链路径 + 4 轮对话 + 路径摘要 | 全树近期 4 轮 + 树摘要 (200 字符) |
| **Max** | 祖先链路径 + 6 轮对话 + 父节点全文 (600 字符) | 全树近期 6 轮 + 树摘要 (400 字符) + 父节点全文 |

### 5.2 典型用例

| 场景 | 推荐配置 | 理由 |
|------|---------|------|
| 快速问答 | `lite` + `branch` | 最轻量，低成本 |
| 标准对话 | `standard` + `branch` | 平衡性好，默认配置 |
| 跨分支探索 | `standard` + `tree` | 全局视角，适度成本 |
| 代码生成（BYOK） | `max` + `branch` | 深度上下文，专注当前任务 |
| 复杂项目总结（BYOK） | `max` + `tree` | 最大上下文 + 全局视野 |

---

## 六、上下文构建流程（技术细节）

### 6.1 构建顺序

```
1. 获取树的 context_profile 和 memory_scope
   ↓
2. 根据 profile 加载对应的 limits（从 context_limits.js）
   ↓
3. 根据 scope 决定数据来源：
   - branch: 查询祖先链
   - tree: 查询全树近期节点 + tree_summary
   ↓
4. 构建分层上下文：
   - Layer 1: tree_story（仅 tree scope + includeTreeStory=true）
   - Layer 2: core_facts（父节点摘要/全文）
   - Layer 3: path_background（路径摘要或面包屑）
   - Layer 4: recent_dialogue（近期对话轮数）
   ↓
5. 去重（防止重复内容）
   ↓
6. 序列化为 Markdown 格式文本
   ↓
7. 构造 messages 数组：
   [
     { role: 'system', content: '上下文锚点 + 序列化上下文' },
     { role: 'user', content: '用户最新提问' }
   ]
   ↓
8. 发送给 LLM 提供商
```

### 6.2 去重机制

```javascript
// 在 context_layers.js 中
const seen = new Set();
const addUnique = (text) => {
  const key = text.trim().toLowerCase();
  if (seen.has(key)) return null;  // 已存在，跳过
  seen.add(key);
  return text;
};
```

### 6.3 截断策略

- **按句子截断优先**：尝试在句号、问号、感叹号处截断
- **回退到字符截断**：如果无法找到句子边界，硬截断并加省略号 `…`

```javascript
// 示例：truncateBySentence(text, 300)
// 输入："这是第一句。这是第二句。这是第三句。"
// 输出（limit=20）："这是第一句。这是第二句。"（如果刚好在限制内）
// 输出（limit=10）："这是第一句。…"（如果超出限制）
```

---

## 七、验证方法

### 7.1 查询当前树配置

使用 PostgreSQL MCP 或直接查询：

```sql
-- 查询特定树的配置
SELECT id, topic, context_profile, memory_scope, tree_summary
FROM trees
WHERE id = 'tree-uuid';

-- 查询用户所有树的配置分布
SELECT context_profile, memory_scope, COUNT(*) as count
FROM trees
WHERE user_id = 'user-uuid'
GROUP BY context_profile, memory_scope;
```

### 7.2 验证配置生效

1. **创建测试树**：
   ```bash
   curl -X POST http://localhost:8000/api/tree/create \
     -H "Content-Type: application/json" \
     -d '{"topic": "Test", "context_profile": "max", "memory_scope": "tree"}'
   ```

2. **查询 Context Inspector**：
   ```bash
   curl http://localhost:8000/api/dev/context-inspector/tree/{tree_id}
   ```

3. **检查响应中的 profile 和 scope 字段**

### 7.3 验证 BYOK 降级

```javascript
// 测试用例（api/tests/llm_context_profile.test.js）
test('non-BYOK user requesting max should downgrade to standard', () => {
  const { profile, maxTokens } = resolveContextProfile('max', false);
  expect(profile).toBe('standard');
  expect(maxTokens).toBe(6400);
});
```

---

## 八、未来修改约束（重要）

### 8.1 修改流程

⚠️ **任何涉及以下内容的修改，必须先更新本文档再实施代码**：

1. **新增档位**：
   - 在本文档新增章节，说明用途、预算、适用场景
   - 更新对比表格
   - 更新数据库约束（`chk_trees_context_profile`）

2. **修改现有档位配置**：
   - 在"配置快照"章节更新对应数值
   - 标注修改日期、修改人、修改原因
   - 更新 Git Commit 引用

3. **新增记忆范围**：
   - 在"记忆范围"章节新增说明
   - 更新矩阵表格
   - 更新数据库约束（`chk_trees_memory_scope`）

4. **调整行为逻辑**：
   - 在"上下文构建流程"章节标注变更
   - 更新代码位置引用

### 8.2 文档版本管理

| 版本 | 日期 | 修改内容 | Git Commit | 修改人 |
|------|------|---------|-----------|--------|
| v1.0 | 2025-12-11 | 初始版本，快照 T52-4 状态 | 851c3dd | Codex (AI) |

### 8.3 禁止凭感觉修改

⛔ **禁止以下行为**：
- 直接修改 `context_profiles.js` 或 `context_limits.js` 而不更新本文档
- 在 UI 中新增档位选项而不先定义行为
- 未经验证的"临时调整"（必须先更新文档，再实施，再验证）
- 在多个地方硬编码不一致的配置值

✅ **正确流程**：
```
1. 提出需求（例如："Lite 档位 2 轮对话不够用，想加到 3 轮"）
   ↓
2. 更新本文档（修改 Lite 档位配置表格，标注原因）
   ↓
3. 修改代码（api/services/llm/context_limits.js）
   ↓
4. 编写测试用例（验证新配置生效）
   ↓
5. 提交 PR，包含文档 + 代码 + 测试
```

---

## 九、相关文档

- **API 合约**: `web/openapi/openapi.yaml`
- **数据库迁移**: `api/db/migrations/20251218_t33_1_context_controls.sql`
- **测试用例**: `api/tests/context_profiles_*.test.js`, `api/tests/llm_context_profile.test.js`
- **验证脚本**: `tools/scripts/acceptance/verify_p15_backend.sh`
- **Inspector 工具**: `api/routes/admin_context_inspector.js`

---

## 十、常见问题（FAQ）

### Q1: 为什么 Max 档位只能 BYOK 使用？
**A**: Max 档位的 token 预算高（8000 tokens），成本显著高于 Lite/Standard。平台为控制成本，限制非 BYOK 用户使用。如果非 BYOK 用户请求 Max，系统会自动降级为 Standard。

### Q2: `memory_scope=tree` 时会包含其他用户的内容吗？
**A**: 不会。上下文构建始终限定在当前 `tree_id`，不会跨树查询。`scope=tree` 只是改变了"同一棵树内的查询范围"（从祖先链扩展到全树）。

### Q3: 如果 tree_summary 为空，`scope=tree` 会报错吗？
**A**: 不会。系统会优雅降级：
- 如果 `tree_summary` 为 `NULL` 或空，跳过树摘要层
- 仍然包含全树的近期对话（按时间排序）

### Q4: 修改 `context_profile` 会影响已有对话吗？
**A**: 不会。档位和范围只影响**构建新回复时的上下文**，不会改写历史节点内容。修改配置后，后续对话立即生效。

### Q5: 如何查看实际发送给 LLM 的 prompt？
**A**: 使用 Context Inspector：
```bash
curl http://localhost:8000/api/dev/context-inspector/tree/{tree_id}
```
返回的 `context_debug.serialized` 字段即为实际 prompt。

---

## 十一、附录：配置代码片段

### A. context_profiles.js（完整）
```javascript
import { CONTEXT_MESSAGE_LIMITS } from './context_limits.js';

export const CONTEXT_PROFILE_CONFIG = {
  lite: { 
    maxTokens: 2560, 
    promptTokensBudget: CONTEXT_MESSAGE_LIMITS.lite.tokensBudget 
  },
  standard: { 
    maxTokens: 6400, 
    promptTokensBudget: CONTEXT_MESSAGE_LIMITS.standard.tokensBudget 
  },
  max: { 
    maxTokens: 20480, 
    promptTokensBudget: CONTEXT_MESSAGE_LIMITS.max.tokensBudget 
  },
};

export function resolveContextProfile(profile, isByok) {
  const normalized = typeof profile === 'string' ? profile.trim().toLowerCase() : 'lite';
  if (normalized === 'max' && !isByok) {
    const standard = CONTEXT_PROFILE_CONFIG.standard;
    return { 
      profile: 'standard', 
      maxTokens: standard.maxTokens, 
      promptTokensBudget: standard.promptTokensBudget 
    };
  }
  if (CONTEXT_PROFILE_CONFIG[normalized]) {
    const config = CONTEXT_PROFILE_CONFIG[normalized];
    return { 
      profile: normalized, 
      maxTokens: config.maxTokens, 
      promptTokensBudget: config.promptTokensBudget 
    };
  }
  const fallback = CONTEXT_PROFILE_CONFIG.lite;
  return { 
    profile: 'lite', 
    maxTokens: fallback.maxTokens, 
    promptTokensBudget: fallback.promptTokensBudget 
  };
}
```

### B. context_limits.js（关键部分）
```javascript
export const CONTEXT_MESSAGE_LIMITS = {
  lite: {
    tokensBudget: 800,
    includeTreeStory: false,
    pathSummary: 60,
    parentSummary: 120,
    parentFull: 0,
    recentTurns: 2,
    recentTurnPairs: 2,
    minRecentTurnPairs: 2,
    recentTurnChars: 300,
    treeStoryLimit: 0,
    prioritizeDialogue: true,
  },
  standard: {
    tokensBudget: 2000,
    includeTreeStory: true,
    pathSummary: 100,
    parentSummary: 160,
    parentFull: 0,
    recentTurns: 4,
    recentTurnPairs: 4,
    minRecentTurnPairs: 4,
    recentTurnChars: 400,
    treeStoryLimit: 200,
    prioritizeDialogue: true,
  },
  max: {
    tokensBudget: 8000,
    includeTreeStory: true,
    pathSummary: 160,
    parentSummary: 200,
    parentFull: 600,
    recentTurns: 6,
    recentTurnPairs: 6,
    minRecentTurnPairs: 6,
    recentTurnChars: 600,
    treeStoryLimit: 400,
    prioritizeDialogue: true,
  },
};

export const TREE_SUMMARY_LIMIT = 800;
export const TREE_SUMMARY_INITIAL_THRESHOLD = 6;
export const TREE_SUMMARY_REFRESH_INTERVAL = 8;
export const TREE_SUMMARY_MIN_REFRESH_MINUTES = 10;
```

---

**文档结束**

本文档为 Context v3 的唯一权威参考。任何后续修改必须先更新本文档，再实施代码变更。禁止凭感觉或临时调整配置。

**维护责任人**: Codex (Agent A-02)  
**审核责任人**: Architect (Agent A-01)  
**联系方式**: 通过 Git PR 或 Issue 提出修改请求

---

*最后更新: 2025-12-11 | Git Commit: 851c3dd (T52-4)*
