# Context v4 升级技术规格文档

**文档版本**: v1.8  
**创建日期**: 2026-01-24  
**最后更新**: 2026-01-27  
**作者**: Codex (Tech Lead / PM)  
**状态**: Spec 已完成（P0 已落地，P1 已落地，P2/P3 尚未实现）  

---

## 目录

- [一、概述](#一概述)
- [二、P0 阶段：滚动摘要 (Rolling Summarization)](#二p0-阶段滚动摘要-rolling-summarization)
  - [2.1 背景与问题](#21-背景与问题)
  - [2.2 解决方案概述](#22-解决方案概述)
  - [2.3 数据库变更](#23-数据库变更)
  - [2.4 核心算法设计](#24-核心算法设计)
  - [2.5 代码实现规格](#25-代码实现规格)
  - [2.6 配置参数](#26-配置参数)
  - [2.7 集成点](#27-集成点)
  - [2.8 测试方案](#28-测试方案)
  - [2.9 迁移计划](#29-迁移计划)
  - [2.10 监控与指标](#210-监控与指标)
- [三、P1 阶段：语义相关性选择 (Semantic Selection)](#三p1-阶段语义相关性选择-semantic-selection)
  - [3.1 背景与问题](#31-背景与问题)
  - [3.2 解决方案概述](#32-解决方案概述)
  - [3.3 核心算法设计](#33-核心算法设计)
  - [3.4 代码实现规格](#34-代码实现规格)
  - [3.5 配置参数](#35-配置参数)
  - [3.6 集成点](#36-集成点)
  - [3.7 测试方案](#37-测试方案)
  - [3.8 性能优化](#38-性能优化)
  - [3.9 迁移计划](#39-迁移计划)
  - [3.10 监控与指标](#310-监控与指标)
- [四、P2 阶段：分支摘要 (Branch Summary)](#四p2-阶段分支摘要-branch-summary)
  - [4.1 背景与问题](#41-背景与问题)
  - [4.2 解决方案概述](#42-解决方案概述)
  - [4.3 数据库变更](#43-数据库变更)
  - [4.4 核心算法设计](#44-核心算法设计)
  - [4.5 代码实现规格](#45-代码实现规格)
  - [4.6 配置参数](#46-配置参数)
  - [4.7 集成点](#47-集成点)
  - [4.8 测试方案](#48-测试方案)
  - [4.9 迁移计划](#49-迁移计划)
  - [4.10 监控与指标](#410-监控与指标)
- [五、P3 阶段：提示词缓存 (Prompt Caching)](#五p3-阶段提示词缓存-prompt-caching)
  - [5.1 背景与问题](#51-背景与问题)
  - [5.2 解决方案概述](#52-解决方案概述)
  - [5.3 缓存策略设计](#53-缓存策略设计)
  - [5.4 代码实现规格](#54-代码实现规格)
  - [5.5 配置参数](#55-配置参数)
  - [5.6 集成点](#56-集成点)
  - [5.7 测试方案](#57-测试方案)
  - [5.8 成本效益分析](#58-成本效益分析)
  - [5.9 迁移计划](#59-迁移计划)
  - [5.10 监控与指标](#510-监控与指标)
  - [5.11 2025-2026 研究补充与 oMyTree 树结构化增强](#511-2025-2026-研究补充与-omytree-树结构化增强)

---

## 一、概述

### 1.1 升级背景

Context v3 采用三档位（Lite/Standard/Max）+ 双范围（Branch/Tree）的矩阵式控制，在基本场景下表现良好。但在长对话和复杂分支场景中存在明显缺陷：

| 问题 | 影响 | 严重程度 |
|------|------|----------|
| 硬截断丢失信息 | 超限时直接丢弃旧内容，关键信息可能丢失 | 🔴 高 |
| 无智能选择 | 按时间而非相关性选择，无关内容占用上下文 | 🔴 高 |
| 分支间隔离 | 无法在新分支引用旧分支的结论 | 🟡 中 |
| 缺少缓存 | 每次重建完整 context，成本高 | 🟡 中 |

### 1.2 升级路线图

| 阶段 | 名称 | 核心能力 | 预计工期 |
|------|------|----------|----------|
| **P0** | 滚动摘要 | 历史对话增量压缩，保留核心信息 | 3-5 天 |
| P1 | 语义选择 | 基于用户问题相关性选择上下文 | 2-3 天 |
| P2 | 分支摘要 | 分支级摘要与跨分支检索 | 5-7 天 |
| P3 | Prompt Caching | 利用厂商缓存降低成本 | 3-4 天 |

### 1.3 设计原则

1. **渐进式升级**：每个阶段独立可用，不破坏现有功能
2. **向后兼容**：旧数据无需迁移即可工作
3. **可配置降级**：出问题时可快速回退到 v3 行为
4. **可观测性**：关键指标可监控、可审计

---

### 1.4 用户体验 (UX) 核心原则

作为产品经理，我们必须确保技术升级服务于用户直觉，而不是增加认知负荷：

1. **“无感”智能 (Invisible Intelligence)**：语义选择和摘要应在后台静默准确操作，不应让用户感觉到明显的延迟增加。第一令牌延迟 (TTFT) 仍是核心指标。
2. **可预测性 (Predictability)**：AI 的记忆应当符合人类的“联想逻辑”。如果用户提到“刚才提到的索引”，AI 能够召回，这符合预期；如果 AI 召回了完全无关的旧文档，则属于“过度聪明”。
3. **透明度与控制 (Transparency & Control)**：
   - **Context Badge**：在 UI 中（后续配套更新）应展示当前 AI 使用了哪些背景信息（如：“引用自 Branch A”，“已压缩历史”）。
   - **重置/钉住**：用户应能显式地告诉 AI “忘记这段历史”或“一直记住这段摘要”。建议与现有 `keyframes`（钉住节点）能力对齐，并在 Context v4 中把 pinned keyframes 作为 **Hard Anchors** 进入上下文（见 5.11）。
4. **稳定优先 (Stability Over Novelty)**：复杂的“分支权重”计算不应对核心对话路径产生干扰。如果算法复杂性导致了不确定的行为，应降级回简单的路径溯源。

### 1.5 产品守卫线 (Product Guardrails)

| 指标 | 目标要求 | 强制守卫措施 |
|------|----------|--------------|
| **首字延迟 (TTFT)** | < 1.5s (标准档位) | 如果上下文组装超过 300ms，自动降级为 v3 时间序模式。 |
| **推理准确性** | 召回率 > 90% | 对语义选择结果进行定期抽样评估，相关度低于 0.6 的轮次不应被召回。 |
| **Token 配额** | Lite 档位节省 50% | 禁止在低成本场景下触发长文本摘要生成。 |
| **失败退化** | 0 报错弹出 | 所有 P0-P3 的后台计算失败都必须静默失败，并回滚到基础 Context。 |

### 1.6 当前仓一致性核对（2026-01-26）

#### 1.6.1 PostgreSQL 实库核验（直连 SQL 查询）

本次核验对本地 `omytree` 数据库执行了 `information_schema` / `to_regclass` 查询，并结合验收脚本 `tools/scripts/acceptance/verify_p0_rolling_summary.sh` 的结果，用于排除“文档写了但 DB 未落地 / 反之 DB 已落地但仓库未同步”的误判（核验日期：2026-01-26）。

- P2 相关表：`branch_summaries` / `branch_references` **均不存在**。
- P0 相关字段：`public.node_summaries` **已包含** `rolling_summary` 列（`jsonb`）。
- `public.node_summaries` 当前列包含：`node_id`、`path_summary`、`parent_summary`、`rolling_summary`、`updated_by`、`updated_at`、`lens_text`。
- 现有 `branch_*` 表仅发现 `branch_candidate`、`branch_resumes`，其语义与本规格的“分支摘要/跨分支引用”不一致，不能视为 P2 落地。
- 现有可复用资产（已在库）：`keyframes`（钉住节点）、`memos`（增量 memo）、`outcomes`（结构化产出）。这些更贴近树结构，可作为 P0/P2 的锚点层/来源层。

#### 1.6.2 迁移/脚本核验（排除 docs 的仓内搜索）

- `api/db/migrations/` 中与 `node_summaries` 相关的迁移包括：
  - 建表脚本：`20251111_add_node_summaries.sql`
  - P0 增量列：`20260126_p0_add_rolling_summary.sql`（新增 `rolling_summary jsonb`）
- ⚠️ 实库存在 `lens_text` 列，但该列未出现在仓内迁移中（可能是历史漂移/手工变更）。若以迁移作为唯一真相，部署环境可能缺列；建议补充补丁迁移或更新基线迁移。
- 未发现任何创建 `branch_summaries` / `branch_references` 的迁移脚本或 SQL 文件。
- `database/sql/create_node_summaries.sql` 当前为空文件，不应作为 P0 迁移依据。

| 阶段 | 文档描述 | 仓库现状 | 校对结论 |
|------|----------|----------|----------|
| P0 滚动摘要 | 新增 `rolling_summary` 与摘要生成流程 | 已落地（迁移 + read/write-path + 指标 + 验收脚本） | **已实现（2026-01-26）** |
| P1 语义选择 | 语义相关性筛选近期对话 | 已落地（embeddings + read-path 修复 + 缓存 + 指标 + 验收脚本 + 质量增强） | **已实现（2026-01-27）** |
| P2 分支摘要 | 分支级摘要与跨分支检索 | 未发现 `branch_summaries`/`branch_references` 表与实现 | **未实现，属于规划** |
| P3 提示词缓存 | 多厂商 Prompt Caching | 仓内仅有 `gemini_cache_metrics.js` 指标采集 | **指标已落地，缓存尚未实现** |

本节为校对结果：后续章节均以“现状对齐/拟新增”明确区分已落地与规划内容。

## 二、P0 阶段：滚动摘要 (Rolling Summarization)

### 2.1 背景与问题

#### 2.1.1 当前行为分析

当前 `context_layers.js` 的 `buildLayeredContextSections()` 处理近期对话的逻辑：

```javascript
// 当前实现（简化）
const turnLimit = Math.max(0, limits.recentTurns || 0);
const trimmedRecent = sourceTurns.slice(0, turnLimit);
```

**问题**：当对话轮数超过 `turnLimit` 时，旧轮次被**完全丢弃**，而非压缩保留。

#### 2.1.2 问题场景示例

假设用户在 Lite 档位（`recentTurns=2`）进行以下对话：

```
Turn 1: 用户询问 PostgreSQL 索引优化
Turn 2: AI 回复了 5 条关键建议
Turn 3: 用户询问第 3 条建议的细节  ← 当前节点
Turn 4: 用户询问如何实现           ← 新问题
```

当处理 Turn 4 时：
- **当前行为**：只保留 Turn 3-4，Turn 1-2 的关键建议完全丢失
- **期望行为**：Turn 1-2 被压缩为摘要，关键建议仍可被引用

#### 2.1.3 行业参考

Factory.AI (2025-07) 的滚动摘要方案（Compressing Context）：  
https://factory.ai/news/compressing-context

> *"We persist anchored summaries of earlier turns and, when compression is needed, summarize only the newly dropped span and merge it into the persisted summary."*

LangChain 的 `ConversationSummaryBufferMemory`：

```
┌─────────────────────────────────────────────────┐
│  Rolling Summary (压缩的历史)                    │
├─────────────────────────────────────────────────┤
│  Buffer (完整保留的近期轮次)                     │
│  - Turn N-2                                      │
│  - Turn N-1                                      │
│  - Turn N (当前)                                 │
└─────────────────────────────────────────────────┘
```

### 2.2 解决方案概述

#### 2.2.1 核心概念

引入 **Conversation Rolling Summary (对话滚动摘要)** 机制：

```
┌──────────────────────────────────────────────────────────────┐
│                    Context Window                            │
├──────────────────────────────────────────────────────────────┤
│  [Layer 1] Tree Story (if tree scope)                        │
│  [Layer 2] Path Background                                   │
│  [Layer 3] Core Facts (parent summary)                       │
│  [Layer 4] ★ Rolling Summary ★  ← 新增：压缩的旧对话         │
│  [Layer 5] Recent Buffer        ← 完整保留的近期轮次         │
│  [Layer 6] User Input                                        │
└──────────────────────────────────────────────────────────────┘
```

#### 2.2.2 数据流

```
用户发送新消息
    ↓
获取当前路径的 rolling_summary (从 DB)
    ↓
计算需要压缩的轮次 = 全部轮次 - buffer_size
    ↓
如果有新轮次需要压缩:
    ↓
    增量摘要: merge(旧摘要, 新轮次) → 新摘要
    ↓
    异步写入 DB
    ↓
组装上下文: [rolling_summary] + [recent_buffer]
    ↓
发送给 LLM
```

#### 2.2.3 压缩策略

采用**增量压缩**而非全量压缩：

| 策略 | 朴素方法 | 增量方法（采用） |
|------|----------|------------------|
| 压缩范围 | 所有历史 | 仅新增轮次 |
| LLM 调用 | 每次全量 | 仅差量 |
| 成本增长 | 线性 O(n) | 恒定 O(1) |
| 延迟 | 随对话增长 | 恒定 |

### 2.3 数据库变更

> **实库核验（2026-01-26）**：`public.node_summaries` 表已存在，且已包含 `rolling_summary (jsonb)` 列；对应迁移为 `api/db/migrations/20260126_p0_add_rolling_summary.sql`。

#### 2.3.1 Schema 变更

```sql
-- 文件: api/db/migrations/20260126_p0_add_rolling_summary.sql

BEGIN;

-- 1. 在 node_summaries 表添加 rolling_summary 列
-- 存储该节点位置的对话滚动摘要
ALTER TABLE node_summaries
ADD COLUMN IF NOT EXISTS rolling_summary JSONB NULL;

-- 2. 添加注释
COMMENT ON COLUMN node_summaries.rolling_summary IS
  'P0: Rolling summary JSON payload for context window compression (e.g., {text, meta:{last_node_id, compressed_turn_count,...}}).';

-- 3. 为查询优化添加索引（可选，根据实际性能决定）
-- CREATE INDEX IF NOT EXISTS idx_node_summaries_rolling ON node_summaries(node_id) 
--   WHERE rolling_summary IS NOT NULL;

COMMIT;
```

#### 2.3.2 数据结构定义

```typescript
// TypeScript 类型定义（供参考）
interface RollingSummary {
  text: string;                    // 压缩后的摘要文本
  meta: {
    version: number;               // 格式版本，当前为 1
    last_node_id: string | null;   // 最后一个被压缩的节点 ID（nodes.id）
    compressed_turn_count: number; // 已压缩的轮次数量
    created_at: string;            // ISO 时间戳
    updated_at: string;            // ISO 时间戳
    provider?: string | null;      // 生成摘要时使用的 provider（可选，用于观测）
    model?: string | null;         // 生成摘要时使用的模型（可选，用于观测）
  };
}
```

### 2.4 核心算法设计

#### 2.4.1 压缩决策算法

```
输入:
  - all_turns: 当前路径的所有对话轮次
  - buffer_size: 完整保留的轮次数（由档位决定）
  - existing_summary: 已有的滚动摘要（可能为空）

输出:
  - need_compress: 是否需要压缩
  - turns_to_compress: 需要压缩的轮次列表
  - buffer_turns: 完整保留的轮次列表

算法:
  1. IF len(all_turns) <= buffer_size:
       RETURN {need_compress: false, buffer_turns: all_turns}
  
  2. buffer_turns = all_turns[-buffer_size:]  // 最新的 N 轮
  
  3. IF existing_summary IS NULL:
       turns_to_compress = all_turns[:-buffer_size]  // 所有旧轮
     ELSE:
       // 增量：只压缩上次之后新增的轮次
       last_compressed_id = existing_summary.meta.last_node_id
       turns_to_compress = all_turns 中 last_compressed_id 之后、buffer 之前的轮次
  
  4. IF len(turns_to_compress) == 0:
       RETURN {need_compress: false, buffer_turns}
  
  5. RETURN {need_compress: true, turns_to_compress, buffer_turns}
```

#### 2.4.2 增量摘要算法

```
输入:
  - existing_summary: 已有摘要（可能为空）
  - new_turns: 需要压缩的新轮次
  - context: {topic, path_summary, user_language}

输出:
  - merged_summary: 合并后的新摘要

算法:
  1. IF existing_summary IS NULL:
       // 首次压缩：直接摘要
       prompt = build_initial_summary_prompt(new_turns, context)
     ELSE:
       // 增量压缩：合并
       prompt = build_incremental_summary_prompt(existing_summary, new_turns, context)
  
  2. response = call_llm(prompt, {max_tokens: 300, temperature: 0.3})
  
  3. merged_summary = {
       text: response.text,
       meta: {
         version: 1,
         last_node_id: new_turns[-1].id,
         compressed_turn_count: existing_count + len(new_turns),
         updated_at: now()
       }
     }
  
  4. RETURN merged_summary
```

#### 2.4.3 Prompt 模板设计

**首次压缩 Prompt**:

```
Target language: {user_language}
Task: Summarize the following conversation turns into a concise summary.

=== CONVERSATION TURNS ===
{formatted_turns}

=== INSTRUCTIONS ===
1. Extract key information: facts, decisions, questions, conclusions
2. Preserve important details that may be referenced later
3. Remove redundant greetings, filler words, repeated content
4. Keep the summary under 200 words
5. Use bullet points for clarity
6. Output in {user_language}

=== OUTPUT FORMAT ===
• [Key point 1]
• [Key point 2]
...
```

**增量压缩 Prompt**:

```
Target language: {user_language}
Task: Update the existing conversation summary with NEW turns.

=== EXISTING SUMMARY ===
{existing_summary_text}

=== NEW TURNS TO MERGE ===
{formatted_new_turns}

=== INSTRUCTIONS ===
1. Integrate new information into the existing summary
2. If new content contradicts old content, prefer the newer information
3. Remove redundant points that are already covered
4. Keep the merged summary under 250 words
5. Maintain chronological flow where relevant
6. Output in {user_language}

=== OUTPUT FORMAT ===
• [Updated/Merged point 1]
• [Updated/Merged point 2]
...
```

### 2.5 代码实现规格（已落地，2026-01-26）

> **实现现状（以仓库代码为准）**：P0 已落地（DB + read-path 注入 + write-path 异步刷新 + 并发锁 + 指标 + 验收脚本）。
>
> **关键决策**：read-path **不做**滚动摘要生成（避免把摘要生成放入 TTFT 关键路径）；摘要仅在 turn 完成后异步刷新（fail-open），并通过 Postgres advisory lock 抑制多实例重复生成。

#### 2.5.0 真实实现对照（P0 路线 → 代码落点）

| P0 子目标 | 代码/脚本落点 | 说明 |
|---|---|---|
| DB：新增 `rolling_summary jsonb` | `api/db/migrations/20260126_p0_add_rolling_summary.sql` | `node_summaries.rolling_summary`（可空） |
| 读写：rolling_summary store | `api/services/llm/rolling_summary_store.js` | `getRollingSummary()` / `saveRollingSummary()` |
| 核心：压缩决策 + LLM 摘要 | `api/services/llm/rolling_summary.js` | `decideCompression()` / `generateRollingSummary()` / `processRollingSummary()` |
| read-path：上下文注入 | `api/services/turn/create.js`、`api/services/turn/retry.js`、`api/services/llm/index.js`、`api/services/llm/context_layers.js`、`api/services/llm/serialize_context.js` | 仅注入已存在的 `rolling_summary`（开关控制） |
| write-path：异步刷新 + 并发锁 | `api/services/turn/create.js`、`api/services/turn/retry.js`、`api/services/llm/rolling_summary.js` | `setImmediate()` 触发，`pg_try_advisory_lock()` 抑制重复 |
| 可观测：/metrics 指标段 | `api/services/llm/rolling_summary_metrics.js`、`api/routes/metrics_unified.js` | `## llm_rolling_summary` + `omytree_rolling_summary_*` |
| 验收脚本 | `tools/scripts/acceptance/verify_p0_rolling_summary.sh` | 覆盖 schema/upsert/单测/开关/metrics |

#### 2.5.1 新增文件

> ✅ 已落地新增文件（请以仓库实现为准）：
> - `api/services/llm/rolling_summary.js`：滚动摘要核心逻辑 + 异步 updater（含 advisory lock）
> - `api/services/llm/rolling_summary_store.js`：DB 读写接口（jsonb upsert）
> - `api/services/llm/rolling_summary_metrics.js`：指标采集与输出（Prometheus text）
>
> 备注：下方长代码块为 2026-01-24 的草案伪代码，保留用于对照思路；**不应直接复制**作为当前实现依据。

**（草案伪代码，已废弃）**：`api/services/llm/rolling_summary.js`

```javascript
/**
 * P0 Rolling Summary Module
 * 
 * Provides conversation rolling summarization capabilities.
 * Compresses old conversation turns into a persistent summary while
 * keeping recent turns intact for full context.
 */

import { pool } from '../../db/pool.js';
import { clampText } from './context_limits.js';
import { resolveProviderForRequest } from './providers/index.js';

// Configuration
export const ROLLING_SUMMARY_CONFIG = {
  // Buffer sizes by profile (轮次数，不是节点数)
  buffer_size: {
    lite: 2,
    standard: 4,
    max: 6,
  },
  // Maximum summary length in characters
  max_summary_chars: 600,
  // Minimum turns before triggering compression
  min_turns_for_compression: 3,
  // LLM parameters for summarization
  llm: {
    max_tokens: 300,
    temperature: 0.3,
  },
};

/**
 * Get buffer size for a given profile
 * @param {string} profile - 'lite' | 'standard' | 'max'
 * @returns {number}
 */
export function getBufferSize(profile) {
  const normalized = (profile || 'lite').toLowerCase();
  return ROLLING_SUMMARY_CONFIG.buffer_size[normalized] 
    || ROLLING_SUMMARY_CONFIG.buffer_size.lite;
}

/**
 * Fetch existing rolling summary for a node
 * @param {string} nodeId 
 * @returns {Promise<RollingSummary|null>}
 */
export async function fetchRollingSummary(nodeId) {
  const result = await pool.query(
    `SELECT rolling_summary FROM node_summaries WHERE node_id = $1`,
    [nodeId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].rolling_summary || null;
}

/**
 * Persist rolling summary to database
 * @param {string} nodeId 
 * @param {RollingSummary} summary 
 */
export async function persistRollingSummary(nodeId, summary) {
  await pool.query(
    `INSERT INTO node_summaries (node_id, rolling_summary, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (node_id) 
     DO UPDATE SET rolling_summary = $2, updated_at = NOW()`,
    [nodeId, JSON.stringify(summary)]
  );
}

/**
 * Decide what needs to be compressed
 * @param {Array} allTurns - All conversation turns in path
 * @param {number} bufferSize - How many recent turns to keep intact
 * @param {RollingSummary|null} existingSummary 
 * @returns {{needCompress: boolean, turnsToCompress: Array, bufferTurns: Array}}
 */
export function decideCompression(allTurns, bufferSize, existingSummary) {
  const totalTurns = allTurns.length;
  
  // Not enough turns to compress
  if (totalTurns <= bufferSize) {
    return {
      needCompress: false,
      turnsToCompress: [],
      bufferTurns: allTurns,
    };
  }
  
  // Split into buffer (recent) and potential compression targets
  const bufferTurns = allTurns.slice(-bufferSize);
  const olderTurns = allTurns.slice(0, -bufferSize);
  
  // No existing summary: compress all older turns
  if (!existingSummary || !existingSummary.meta?.last_node_id) {
    return {
      needCompress: olderTurns.length >= ROLLING_SUMMARY_CONFIG.min_turns_for_compression,
      turnsToCompress: olderTurns,
      bufferTurns,
    };
  }
  
  // Incremental: find turns after last compressed
  const lastCompressedId = existingSummary.meta.last_node_id;
  const lastIdx = olderTurns.findIndex(t => t.id === lastCompressedId);
  
  if (lastIdx === -1) {
    // Last compressed turn not found in older turns, compress all
    return {
      needCompress: olderTurns.length > 0,
      turnsToCompress: olderTurns,
      bufferTurns,
    };
  }
  
  // Only compress turns after the last compressed one
  const newTurnsToCompress = olderTurns.slice(lastIdx + 1);
  
  return {
    needCompress: newTurnsToCompress.length > 0,
    turnsToCompress: newTurnsToCompress,
    bufferTurns,
  };
}

/**
 * Format turns for prompt
 * @param {Array} turns 
 * @param {number} maxCharsPerTurn 
 * @returns {string}
 */
function formatTurnsForPrompt(turns, maxCharsPerTurn = 300) {
  return turns.map((turn, idx) => {
    const role = turn.role === 'assistant' ? 'AI' : 'User';
    const text = clampText(turn.text || '', maxCharsPerTurn);
    return `[${idx + 1}] ${role}: ${text}`;
  }).join('\n\n');
}

/**
 * Build prompt for initial summarization
 * @param {Array} turns 
 * @param {object} context 
 * @returns {string}
 */
function buildInitialSummaryPrompt(turns, context) {
  const { topic = '', userLanguage = 'en' } = context;
  const isZh = userLanguage.startsWith('zh');
  
  const formattedTurns = formatTurnsForPrompt(turns);
  
  if (isZh) {
    return `目标语言: 中文
任务: 将以下对话轮次压缩为简洁的摘要。

=== 对话主题 ===
${topic || '(未指定)'}

=== 对话内容 ===
${formattedTurns}

=== 要求 ===
1. 提取关键信息：事实、决定、问题、结论
2. 保留可能被后续引用的重要细节
3. 删除冗余的寒暄、填充词、重复内容
4. 摘要控制在 150 字以内
5. 使用要点列表格式

=== 输出格式 ===
• [要点1]
• [要点2]
...`;
  }
  
  return `Target language: English
Task: Summarize the following conversation turns into a concise summary.

=== CONVERSATION TOPIC ===
${topic || '(not specified)'}

=== CONVERSATION TURNS ===
${formattedTurns}

=== INSTRUCTIONS ===
1. Extract key information: facts, decisions, questions, conclusions
2. Preserve important details that may be referenced later
3. Remove redundant greetings, filler words, repeated content
4. Keep the summary under 150 words
5. Use bullet points for clarity

=== OUTPUT FORMAT ===
• [Key point 1]
• [Key point 2]
...`;
}

/**
 * Build prompt for incremental summarization
 * @param {RollingSummary} existingSummary 
 * @param {Array} newTurns 
 * @param {object} context 
 * @returns {string}
 */
function buildIncrementalSummaryPrompt(existingSummary, newTurns, context) {
  const { topic = '', userLanguage = 'en' } = context;
  const isZh = userLanguage.startsWith('zh');
  
  const formattedTurns = formatTurnsForPrompt(newTurns);
  const existingText = existingSummary.text || '';
  
  if (isZh) {
    return `目标语言: 中文
任务: 将新对话轮次合并到现有摘要中。

=== 对话主题 ===
${topic || '(未指定)'}

=== 现有摘要 ===
${existingText}

=== 新增对话轮次 ===
${formattedTurns}

=== 要求 ===
1. 将新信息整合到现有摘要中
2. 如果新内容与旧内容矛盾，以新内容为准
3. 删除已覆盖的冗余要点
4. 合并后摘要控制在 200 字以内
5. 保持信息的时间顺序

=== 输出格式 ===
• [更新/合并后的要点1]
• [更新/合并后的要点2]
...`;
  }
  
  return `Target language: English
Task: Update the existing conversation summary with NEW turns.

=== CONVERSATION TOPIC ===
${topic || '(not specified)'}

=== EXISTING SUMMARY ===
${existingText}

=== NEW TURNS TO MERGE ===
${formattedTurns}

=== INSTRUCTIONS ===
1. Integrate new information into the existing summary
2. If new content contradicts old content, prefer the newer information
3. Remove redundant points that are already covered
4. Keep the merged summary under 200 words
5. Maintain chronological flow where relevant

=== OUTPUT FORMAT ===
• [Updated/Merged point 1]
• [Updated/Merged point 2]
...`;
}

/**
 * Generate or update rolling summary
 * @param {object} params
 * @param {Array} params.turnsToCompress - Turns that need compression
 * @param {RollingSummary|null} params.existingSummary - Existing summary
 * @param {object} params.context - {topic, userLanguage}
 * @param {string} params.userId - For provider resolution
 * @returns {Promise<RollingSummary>}
 */
export async function generateRollingSummary({
  turnsToCompress,
  existingSummary,
  context,
  userId,
}) {
  if (!turnsToCompress || turnsToCompress.length === 0) {
    return existingSummary;
  }
  
  // Build prompt
  const prompt = existingSummary?.text
    ? buildIncrementalSummaryPrompt(existingSummary, turnsToCompress, context)
    : buildInitialSummaryPrompt(turnsToCompress, context);
  
  const { provider, defaultModel } = await resolveProviderForRequest({ userId });

  const response = await provider.callChat({
    prompt,
    metadata: { mode: 'rolling_summary' },
    options: {
      model: process.env.ROLLING_SUMMARY_LLM_MODEL || defaultModel || 'gpt-4o-mini',
      max_tokens: ROLLING_SUMMARY_CONFIG.llm.max_tokens,
      temperature: ROLLING_SUMMARY_CONFIG.llm.temperature,
    },
  });
  
  const summaryText = clampText(
    response?.ai_text || response?.text || '',
    ROLLING_SUMMARY_CONFIG.max_summary_chars
  );
  
  // Build new summary object
  const compressedCount = (existingSummary?.meta?.compressed_turn_count || 0) 
    + turnsToCompress.length;
  
  const newSummary = {
    text: summaryText,
    meta: {
      version: 1,
      last_node_id: turnsToCompress[turnsToCompress.length - 1]?.id || null,
      compressed_turn_count: compressedCount,
      created_at: existingSummary?.meta?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
  
  return newSummary;
}

/**
 * Main entry: process rolling summary for a conversation path
 * @param {object} params
 * @param {string} params.nodeId - Current node ID
 * @param {Array} params.pathTurns - All turns in current path
 * @param {string} params.profile - Context profile
 * @param {object} params.context - {topic, userLanguage}
 * @param {string} params.userId
 * @returns {Promise<{rollingSummary: string|null, bufferTurns: Array}>}
 */
export async function processRollingSummary({
  nodeId,
  pathTurns,
  profile,
  context,
  userId,
}) {
  const bufferSize = getBufferSize(profile);
  const existingSummary = await fetchRollingSummary(nodeId);
  
  const { needCompress, turnsToCompress, bufferTurns } = decideCompression(
    pathTurns,
    bufferSize,
    existingSummary
  );
  
  if (!needCompress) {
    return {
      rollingSummary: existingSummary?.text || null,
      bufferTurns,
    };
  }
  
  // Generate new summary (can be made async/background later)
  const newSummary = await generateRollingSummary({
    turnsToCompress,
    existingSummary,
    context,
    userId,
  });
  
  // Persist (fire-and-forget for now, could be queued)
  persistRollingSummary(nodeId, newSummary).catch(err => {
    console.error('[RollingSummary] Failed to persist:', err);
  });
  
  return {
    rollingSummary: newSummary.text,
    bufferTurns,
  };
}

// Export for testing
export const __private__ = {
  formatTurnsForPrompt,
  buildInitialSummaryPrompt,
  buildIncrementalSummaryPrompt,
};
```

#### 2.5.2 修改文件

> ✅ 已落地修改文件（请以仓库实现为准）：
> - `api/services/turn/create.js`：read-path 读取 `rolling_summary` 并透传；turn 完成后异步触发 `maybeUpdateRollingSummary()`
> - `api/services/turn/retry.js`：retry 复用同一 read-path，并在 commit 后异步触发 `maybeUpdateRollingSummary()`
> - `api/services/llm/index.js`：`ROLLING_SUMMARY_ENABLED` kill switch；仅在 enabled 时注入 “History/历史摘要” 层
> - `api/services/llm/context_layers.js`：新增 `rolling_summary` layer（去重 + truncate）
> - `api/services/llm/serialize_context.js`：序列化 `rolling_summary` 为 `- History:` 行
> - `api/routes/admin_context_inspector.js`：在 `layers.rolling_summary` 返回 `{text, meta, compressed_turn_count}`
> - `api/routes/metrics_unified.js`：拼接 `buildRollingSummaryMetricsLines()` 输出到 `/metrics`
>
> 备注：以下为 2026-01-24 的草案片段，保留用于对照；与当前实现（尤其是“同步生成 vs 异步刷新”的决策）不完全一致。

**文件**: `api/services/llm/context_limits.js`

```javascript
// 在现有配置后添加

/**
 * P0 Rolling Summary: Buffer sizes per profile
 * These determine how many recent turns are kept intact (not compressed)
 */
export const ROLLING_SUMMARY_BUFFER_SIZE = {
  lite: 2,      // 保留最近 2 轮完整
  standard: 4,  // 保留最近 4 轮完整
  max: 6,       // 保留最近 6 轮完整
};

/**
 * P0 Rolling Summary: Character limits for summary text
 */
export const ROLLING_SUMMARY_CHAR_LIMIT = {
  lite: 300,
  standard: 450,
  max: 600,
};
```

**文件**: `api/services/llm/context_layers.js`

在 `buildLayeredContextSections` 函数中集成滚动摘要：

```javascript
// 在 sections 对象定义后添加新层
const sections = {
  tree_story: null,
  rolling_summary: null,    // ← P0 新增
  core_facts: [],
  path_background: null,
  recent_dialogue: [],
};

// 在 recent_dialogue 处理逻辑前添加
// P0: Handle rolling summary if provided
if (params.rollingSummary && typeof params.rollingSummary === 'string') {
  const summaryText = truncateBySentence(params.rollingSummary, limits.rollingSummaryChars || 400);
  if (summaryText) {
    sections.rolling_summary = summaryText;
  }
}
```

**文件**: `api/services/llm/serialize_context.js`

在 `serializeContext` 函数中添加 rolling_summary 层的序列化：

```javascript
// 在 tree_story 序列化后添加

// Rolling summary (P0)
if (contextData.rolling_summary) {
  const label = isZh ? '历史摘要' : 'History';
  lines.push(`- ${label}: ${contextData.rolling_summary}`);
}
```

**文件**: `api/services/llm/index.js`

在 `buildContextMessages` 函数中集成滚动摘要处理：

```javascript
// 在 selectedRecent 计算前添加
import { processRollingSummary } from './rolling_summary.js';

// 替换或增强 selectedRecent 的计算逻辑
let rollingSummaryText = null;
let effectiveRecentTurns = normalized.recent_turns || [];

// P0: Process rolling summary if enabled
const rollingSummaryEnabled = process.env.ROLLING_SUMMARY_ENABLED !== '0';
if (rollingSummaryEnabled && effectiveRecentTurns.length > limits.recentTurns) {
  try {
    const { rollingSummary, bufferTurns } = await processRollingSummary({
      nodeId: normalized.node_id,
      pathTurns: effectiveRecentTurns,
      profile,
      context: {
        topic: normalized.root_topic || '',
        userLanguage: userLang,
      },
      userId: options.userId,
    });
    rollingSummaryText = rollingSummary;
    effectiveRecentTurns = bufferTurns;
  } catch (err) {
    console.warn('[P0:RollingSummary] Error, falling back to truncation:', err.message);
    // Fallback: use original truncation behavior
  }
}

// 修改 layered 调用，传入 rollingSummary
const layered = await buildLayeredContextSections({
  scope,
  breadcrumbTitles,
  pathSummary: normalized.path_summary || '',
  parentSummary: normalized.parent_summary || '',
  parentFullText: normalized.parent_full_text || '',
  treeSummary: treeSummaryInput,
  recentTurns: effectiveRecentTurns,  // 使用处理后的轮次
  rollingSummary: rollingSummaryText,  // P0 新增
  activeTopicTag: topicTag || null,
  limits: {
    pathSummary: limits.pathSummary,
    parentSummary: limits.parentSummary,
    parentFull: limits.parentFull,
    recentTurns: limits.recentTurns,
    recentTurnChars: limits.recentTurnChars || limits.parentSummary,
    treeStory: treeStoryLimit,
    rollingSummaryChars: limits.rollingSummaryChars || 400,  // P0 新增
  },
}, {
  userText: normalized.user_text || '',
  semanticCoreFactsEnabled: options.semanticCoreFactsEnabled ?? SEMANTIC_CORE_FACTS_ENABLED,
  profile,
});
```

### 2.6 配置参数

#### 2.6.1 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `ROLLING_SUMMARY_ENABLED` | `0` | P0 总开关（`1/true/on/yes` 启用）。同时控制 read-path 注入与 write-path 异步刷新。 |
| `ROLLING_SUMMARY_LLM_MODEL` | *(空)* | 可选：指定 rolling summary 生成所用模型；未设置时使用 provider 默认模型（再 fallback 到 `gpt-4o-mini`）。 |

#### 2.6.2 代码配置

在 `api/services/llm/rolling_summary.js` 中：

```javascript
export const ROLLING_SUMMARY_CONFIG = {
  enabledEnv: 'ROLLING_SUMMARY_ENABLED',
  modelEnv: 'ROLLING_SUMMARY_LLM_MODEL',
  bufferSize: { lite: 2, standard: 4, max: 6 }, // fallback；优先使用 CONTEXT_MESSAGE_LIMITS[profile].recentTurns
  minTurnsToCompress: 3,
  maxSummaryChars: { lite: 300, standard: 450, max: 600 },
  llm: { max_tokens: 220, temperature: 0.1, timeout_ms: 30000 },
};
```

### 2.7 集成点

#### 2.7.1 与现有系统的集成

read-path（同步、无生成；只注入已存在摘要）：

```text
createTurn() / retryTurn()
  -> buildRelevanceContext() / fetchParentLensSummary()
     - 读取 node_summaries.rolling_summary（如有）
  -> streamAnswer() / getAnswer()
     -> buildContextMessages()
        - 若 ROLLING_SUMMARY_ENABLED=1，则把 rolling_summary 注入为 “History/历史摘要” layer
        - serializeContext() 负责输出 `- History: ...`
```

write-path（异步刷新；不影响 TTFT）：

```text
turn 完成（AI node 落库）后
  setImmediate()
    -> maybeUpdateRollingSummary()
       - pg_try_advisory_lock(hashtext('rolling_summary'), hashtext(nodeId))  (多实例互斥)
       - fetchPathTurnsForRollingSummary()  (沿 parent 链回溯同一路径)
       - processRollingSummary()  (decide -> generate -> save)
       - 失败全部 fail-open（不影响主链路）
```

#### 2.7.2 与 Admin Context Inspector 的集成

在 `admin_context_inspector.js` 中显示滚动摘要信息：

```javascript
// 在返回 JSON 的 layers 对象中添加
layers.rolling_summary = {
  text: rollingSummaryText,
  meta: rollingSummaryMeta,
  compressed_turn_count: rollingSummaryMeta?.compressed_turn_count || 0,
};
```

### 2.8 测试方案

#### 2.8.0 已落地测试覆盖（以仓库为准）

- 单元测试：`api/tests/rolling_summary.test.js`
- read-path：`api/tests/rolling_summary_read_path.test.js`
- write-path：`api/tests/rolling_summary_write_path.test.js`
- 验收脚本：`tools/scripts/acceptance/verify_p0_rolling_summary.sh`

建议运行：

```bash
cd api
npx vitest run -t "P0 rolling summary" --reporter=dot
cd ..
bash tools/scripts/acceptance/verify_p0_rolling_summary.sh
```

> 备注：下方保留了 2026-01-24 的草案示例代码（用于对照思路）；请以仓库内实际测试文件与验收脚本为准。

#### 2.8.1 单元测试

**文件**: `api/tests/rolling_summary.test.js`

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  decideCompression,
  getBufferSize,
  __private__,
} from '../services/llm/rolling_summary.js';

describe('Rolling Summary P0', () => {
  describe('getBufferSize', () => {
    it('returns correct buffer size for each profile', () => {
      expect(getBufferSize('lite')).toBe(2);
      expect(getBufferSize('standard')).toBe(4);
      expect(getBufferSize('max')).toBe(6);
    });

    it('defaults to lite for invalid profile', () => {
      expect(getBufferSize('invalid')).toBe(2);
      expect(getBufferSize(null)).toBe(2);
    });
  });

  describe('decideCompression', () => {
    const makeTurn = (id) => ({ id, role: 'user', text: `Turn ${id}` });

    it('does not compress when turns <= buffer size', () => {
      const turns = [makeTurn('1'), makeTurn('2')];
      const result = decideCompression(turns, 2, null);
      
      expect(result.needCompress).toBe(false);
      expect(result.bufferTurns).toEqual(turns);
      expect(result.turnsToCompress).toEqual([]);
    });

    it('compresses older turns when exceeding buffer', () => {
      const turns = [
        makeTurn('1'), makeTurn('2'), makeTurn('3'),
        makeTurn('4'), makeTurn('5'),
      ];
      const result = decideCompression(turns, 2, null);
      
      expect(result.needCompress).toBe(true);
      expect(result.bufferTurns.map(t => t.id)).toEqual(['4', '5']);
      expect(result.turnsToCompress.map(t => t.id)).toEqual(['1', '2', '3']);
    });

    it('only compresses new turns incrementally', () => {
      const turns = [
        makeTurn('1'), makeTurn('2'), makeTurn('3'),
        makeTurn('4'), makeTurn('5'), makeTurn('6'),
      ];
      const existingSummary = {
        text: 'Previous summary',
        meta: { last_node_id: '2', compressed_turn_count: 2 },
      };
      const result = decideCompression(turns, 2, existingSummary);
      
      expect(result.needCompress).toBe(true);
      expect(result.bufferTurns.map(t => t.id)).toEqual(['5', '6']);
      // Should only compress turns after '2' and before buffer
      expect(result.turnsToCompress.map(t => t.id)).toEqual(['3', '4']);
    });
  });

  describe('prompt building', () => {
    const { buildInitialSummaryPrompt, buildIncrementalSummaryPrompt } = __private__;

    it('builds Chinese prompt when language is zh', () => {
      const turns = [{ role: 'user', text: '你好' }];
      const prompt = buildInitialSummaryPrompt(turns, { userLanguage: 'zh-CN' });
      
      expect(prompt).toContain('目标语言: 中文');
      expect(prompt).toContain('User: 你好');
    });

    it('builds English prompt by default', () => {
      const turns = [{ role: 'user', text: 'Hello' }];
      const prompt = buildInitialSummaryPrompt(turns, { userLanguage: 'en' });
      
      expect(prompt).toContain('Target language: English');
    });

    it('includes existing summary in incremental prompt', () => {
      const existing = { text: '• Point 1\n• Point 2' };
      const newTurns = [{ role: 'user', text: 'New message' }];
      const prompt = buildIncrementalSummaryPrompt(existing, newTurns, {});
      
      expect(prompt).toContain('Point 1');
      expect(prompt).toContain('New message');
    });
  });
});
```

#### 2.8.2 集成测试

**文件（已落地）**: `api/tests/rolling_summary_read_path.test.js`、`api/tests/rolling_summary_write_path.test.js`（端到端验证以 `tools/scripts/acceptance/verify_p0_rolling_summary.sh` 为准）

> 备注：下方代码块为早期草案示例（未在仓库中以同名文件落地），保留仅用于说明“如何写集成测试”的思路。

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../db/pool.js';
import { processRollingSummary } from '../services/llm/rolling_summary.js';

describe('Rolling Summary Integration', () => {
  let testUserId;
  let testNodeId;

  beforeAll(async () => {
    // Setup test data
    const userRes = await pool.query(
      `INSERT INTO users (name, email) VALUES ('RollingSummaryTest', $1) RETURNING id`,
      [`rolling-test-${Date.now()}@example.com`]
    );
    testUserId = userRes.rows[0].id;
    
    // Create a test tree and node
    const treeRes = await pool.query(
      `INSERT INTO trees (user_id, topic) VALUES ($1, 'Test Topic') RETURNING id`,
      [testUserId]
    );
    const treeId = treeRes.rows[0].id;
    
    const nodeRes = await pool.query(
      `INSERT INTO nodes (tree_id, role, text, level) VALUES ($1, 'user', 'Test', 0) RETURNING id`,
      [treeId]
    );
    testNodeId = nodeRes.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
  });

  it('returns buffer only when turns <= buffer size', async () => {
    const turns = [
      { id: '1', role: 'user', text: 'Hello' },
      { id: '2', role: 'assistant', text: 'Hi there' },
    ];

    const result = await processRollingSummary({
      nodeId: testNodeId,
      pathTurns: turns,
      profile: 'lite',
      context: { topic: 'Test', userLanguage: 'en' },
      userId: testUserId,
    });

    expect(result.rollingSummary).toBeNull();
    expect(result.bufferTurns).toEqual(turns);
  });

  it('generates summary when turns exceed buffer', async () => {
    const turns = [
      { id: '1', role: 'user', text: 'What is PostgreSQL?' },
      { id: '2', role: 'assistant', text: 'PostgreSQL is a relational database.' },
      { id: '3', role: 'user', text: 'How do I create a table?' },
      { id: '4', role: 'assistant', text: 'Use CREATE TABLE statement.' },
      { id: '5', role: 'user', text: 'Show me an example.' },
    ];

    const result = await processRollingSummary({
      nodeId: testNodeId,
      pathTurns: turns,
      profile: 'lite', // buffer = 2
      context: { topic: 'PostgreSQL', userLanguage: 'en' },
      userId: testUserId,
    });

    expect(result.rollingSummary).toBeTruthy();
    expect(result.bufferTurns.length).toBe(2);
    expect(result.bufferTurns.map(t => t.id)).toEqual(['4', '5']);
  });
});
```

#### 2.8.3 验收测试脚本

**文件**: `tools/scripts/acceptance/verify_p0_rolling_summary.sh`

> 已落地脚本覆盖：schema 检查、DB upsert（事务回滚）、P0 单测、read-path kill switch、`/metrics` 指标段校验。下方代码块为早期草案示例，具体以仓库脚本为准。

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "P0 Rolling Summary 验收测试"
echo "=========================================="

API_BASE="${API_BASE:-http://127.0.0.1:8000}"
PG_DSN="${PG_DSN:-${DATABASE_URL:-}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [[ -z "${PG_DSN}" ]]; then
  echo "❌ PG_DSN not set (export PG_DSN or DATABASE_URL)"
  exit 1
fi

# 检查 migration 是否执行
echo "[1/5] 检查数据库 schema..."
COLUMN_EXISTS=$(
  psql "$PG_DSN" -t -c \
    "SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'node_summaries'
       AND column_name = 'rolling_summary'" \
    | tr -d '[:space:]'
)
if [[ "$COLUMN_EXISTS" -lt 1 ]]; then
  echo "❌ FAIL: rolling_summary 列不存在"
  exit 1
fi
echo "✅ PASS: Schema 已更新"

# 检查新模块可加载
echo "[2/5] 检查模块可加载..."
cd "$REPO_ROOT"
node -e "import('./api/services/llm/rolling_summary.js').then(() => console.log('OK'))" || {
  echo "❌ FAIL: rolling_summary.js 无法加载"
  exit 1
}
echo "✅ PASS: 模块加载成功"

# 运行单元测试
echo "[3/5] 运行单元测试..."
cd "$REPO_ROOT/api"
npm test -- --grep "Rolling Summary" --reporter=dot || {
  echo "❌ FAIL: 单元测试失败"
  exit 1
}
echo "✅ PASS: 单元测试通过"

# 功能测试：创建长对话并验证压缩
echo "[4/5] 功能测试：长对话压缩..."
# TODO: 创建测试用户、树、多轮对话，验证 rolling_summary 生成

# 性能基线测试
echo "[5/5] 性能基线记录..."
# TODO: 记录压缩耗时、摘要质量等指标

echo ""
echo "=========================================="
echo "P0 Rolling Summary 验收: ✅ 全部通过"
echo "=========================================="
```

### 2.9 迁移计划

#### 2.9.1 部署步骤

```
第一步: 部署数据库变更 (低风险)
    $ psql -f api/db/migrations/20260126_p0_add_rolling_summary.sql
    - 仅添加可空列，不影响现有数据
    - 无需停机

第二步: 部署代码 (默认禁用)
    $ git pull && npm install
    $ pm2 restart omytree-api
    - 环境变量 ROLLING_SUMMARY_ENABLED=0 (默认)
    - 代码部署但功能关闭

第三步: 灰度启用 (可选)
    - 针对特定用户群启用
    - 监控错误率和延迟

第四步: 全量启用
    $ export ROLLING_SUMMARY_ENABLED=1
    $ pm2 restart omytree-api
    - 功能全量开放
```

#### 2.9.2 回滚计划

```
如果出现问题:
    $ export ROLLING_SUMMARY_ENABLED=0
    $ pm2 restart omytree-api
    
系统会自动降级到 v3 行为（硬截断），无需数据回滚。
rolling_summary 列中的数据可保留，后续重新启用时可复用。
```

#### 2.9.3 数据迁移（可选）

现有对话无需迁移。P0 的 rolling summary 在 **turn 完成后异步刷新**（write-path），因此通常会在“启用开关后的第一轮回答完成”后逐步产生可复用的 `rolling_summary`，并在后续请求的 read-path 中被注入。

如需批量预生成（可选，未纳入 P0 落地），可后续补充离线脚本（当前仓库未实现）：

```bash
# TODO(后续): 增加离线回填脚本，例如 api/scripts/backfill_rolling_summary.js
# node api/scripts/backfill_rolling_summary.js --dry-run
# node api/scripts/backfill_rolling_summary.js --batch=100
```

### 2.10 监控与指标

#### 2.10.1 关键指标

| 指标 | 类型 | 说明 | 告警阈值 |
|------|------|------|----------|
| `omytree_rolling_summary_update_attempts_total{profile}` | Counter | 异步刷新尝试次数 | - |
| `omytree_rolling_summary_update_success_total{profile}` | Counter | 异步刷新成功次数 | - |
| `omytree_rolling_summary_update_errors_total{profile}` | Counter | 异步刷新失败次数（fail-open） | > 10/min |
| `omytree_rolling_summary_update_skipped_total{profile,reason}` | Counter | 异步刷新跳过次数（`disabled/missing_pool/invalid_node_id/locked`） | `reason="locked"` 持续升高需排查 |
| `omytree_rolling_summary_compressions_total{profile,provider,model}` | Counter | 触发 LLM 压缩的次数 | - |
| `omytree_rolling_summary_compressed_turns_total{profile,provider,model}` | Counter | 被压缩的 turns 数量累计 | - |
| `omytree_rolling_summary_compression_errors_total{profile,provider,model}` | Counter | LLM 压缩失败次数 | > 10/min |
| `omytree_rolling_summary_compress_latency_ms_histogram_*` | Histogram | LLM 压缩耗时分布（ms） | P99 > 3000ms |
| `omytree_rolling_summary_summary_length_histogram_*` | Histogram | 生成摘要长度分布（字符数） | - |

> `/metrics` 中以 `## llm_rolling_summary` 分段输出上述指标（Prometheus text format）。

#### 2.10.2 日志格式

```javascript
// write-path 异步刷新失败（fail-open，不影响主链路；成功默认不打日志，靠 metrics 观测）
console.warn('[turn.create] rolling summary refresh failed:', err?.message || err);
console.warn('[retry] rolling summary refresh failed:', err?.message || err);
```

#### 2.10.3 Admin Dashboard 扩展

在 Context Debug 端点（Admin Context Inspector）中返回滚动摘要信息：

```json
{
  "layers": {
    "rolling_summary": {
      "text": "compressed history ...",
      "meta": {
        "version": 1,
        "last_node_id": "uuid",
        "compressed_turn_count": 12,
        "updated_at": "2026-01-26T00:00:00.000Z"
      },
      "compressed_turn_count": 12
    }
  }
}
```

---

## 三、P1 阶段：语义相关性选择 (Semantic Selection)

### 3.1 背景与问题

#### 3.1.1 当前行为分析（与仓库对齐）

当前 `buildContextMessages()` 已引入语义选择器，若禁用或异常则回退到时间排序；随后 `context_layers.js` 仅对已选轮次做截断与去重：

```javascript
// api/services/llm/index.js（简化）
const selectedRecent = await selectRecentDialogueSemantic({
  turns: normalized.recent_turns || [],
  userText: normalized.user_text || '',
  profile,
  limit: limits.recentTurns,
});

// api/services/llm/context_layers.js（简化）
const trimmedRecent = sourceTurns.slice(0, turnLimit);
```

**问题**：语义选择仍受窗口大小与 topK 固定值限制，且仅作用于近期窗口，跨分支与长程引用仍不足。

#### 3.1.2 问题场景示例

**场景 1：话题跳跃**

```
Turn 1-5:  讨论 PostgreSQL 索引优化（5轮）
Turn 6-8:  闲聊天气和午餐（3轮）        ← 无关内容
Turn 9:    用户问："刚才那个索引优化方案..."  ← 当前问题
```

当前行为（Lite，buffer=2）：
- 保留 Turn 8-9（天气 + 当前问题）
- **丢失** Turn 1-5 的索引优化讨论

期望行为：
- 检测到问题与 Turn 1-5 相关
- 选择 Turn 4-5（索引相关的最后2轮）而非 Turn 8（天气）

**场景 2：多线程讨论**

```
Turn 1-3:  讨论前端性能优化
Turn 4-6:  讨论后端 API 设计
Turn 7-9:  讨论数据库设计
Turn 10:   用户问："回到前端性能的问题..."  ← 引用早期内容
```

当前行为（Standard，buffer=4）：
- 保留 Turn 7-10
- 前端性能相关的 Turn 1-3 完全丢失

期望行为：
- 识别问题与 Turn 1-3 相关
- 混合选择：Turn 2-3（前端相关）+ Turn 9-10（近期+当前）

#### 3.1.3 行业参考

**Elastic（Context Engineering）的语义分块 + 邻域扩展**：  
https://www.elastic.co/search-labs/blog/context-engineering-for-agents

> *"By breaking content into chunks that group related concepts together and then retrieving not just the target chunk but its immediate surroundings, we equip the agent with richer, more complete context."*

**RAGFlow（Parent-Child Chunking / Context Window）**：  
https://docs.ragflow.io/docs/dev/references/run#parent-child-chunking  
https://docs.ragflow.io/docs/dev/guides/set_context_window

- Parent-Child Chunking：检索命中 child chunk 后，自动关联并带回对应 parent chunk，补足更高层语义。
- Context Window：把 chunk 的上/下文与图表等邻域内容纳入 chunk 语义范围，减少“命中但缺语境”。

**LangChain 的 Vector Store Retrieval**：

```python
# 语义检索而非时间排序
relevant_docs = vectorstore.similarity_search(
    query=user_question,
    k=5  # 最相关的 5 个文档
)
```

**Elastic（Context Engineering）的语义片段拼接（K=5）**：  
https://www.elastic.co/search-labs/blog/context-engineering-for-agents

> *"The sweet spot was retrieving five semantic fragments from the top five documents (K=5). This setup allowed the agent to access all required information in 93.3% of cases, while reducing context size by over 40%."*

### 3.2 解决方案概述

#### 3.2.1 核心概念

引入 **Semantic Relevance Ranking (语义相关性排序)** 机制：

```
用户问题: "刚才的索引优化方案..."
    ↓
在近期窗口内计算每轮对话与问题的语义相似度
    ↓
现状（已落地）：语义 topK（窗口内），并按原始顺序返回
拟增强（建议）：混合排序（语义 + 时间）+ 邻域扩展（见 3.2.2）
    ↓
选择 top-K 轮次（保持时间顺序）
    ↓
组装到 context
```

#### 3.2.2 混合排序策略

**现状（已落地）**：仓库当前实现是 **语义优先 + 近期窗口**（见 `api/services/llm/recent_dialogue_semantic.js`）
- 在窗口 `window` 内计算 cosine 相似度并选择 `topK`（按 profile 固定）
- 仅在相似度打平时使用 recency 作为 tie-break（更“近期”的轮次优先）
- 返回时恢复窗口内的时间顺序，保证对话连贯性

**拟增强（建议）**：引入显式的 **混合评分（语义 + 时间）**，并支持“邻域扩展”
- 混合评分解决“纯语义导致跳跃、纯时间导致无关”的两难
- 邻域扩展解决“只取命中轮次但缺少上下文前后文”的不完整

**混合评分公式（建议）**：

```
final_score = semantic_score × 0.7 + recency_score × 0.3

其中:
  semantic_score ∈ [0, 1]  // 语义相似度（cosine）
  recency_score = 1 - (turn_index / total_turns)  // 时间近度（在 branch scope 中以路径为序；tree scope 中以全树时间序）
```

**权重调整**（建议可配置）：

| 场景 | 语义权重 | 时间权重 | 适用情况 |
|------|---------|---------|----------|
| 探索式对话 | 0.8 | 0.2 | 用户频繁跳跃话题 |
| 标准对话 | 0.7 | 0.3 | 默认，平衡 |
| 连续对话 | 0.5 | 0.5 | 话题线性推进 |

#### 3.2.3 数据流

```
buildContextMessages()
    ↓
获取 recent_turns（由 createTurn() → buildRelevanceContext() 提供，已按 profile 扩窗）
    ↓
P1: selectRecentDialogueSemantic(
      turns, 
      userText,     ← 当前问题
      profile, 
      limit
    )
    ↓
enabled: 语义相似度 topK（窗口内），并恢复时间顺序
disabled/error: 回退到时间序截取（recency slice）
    ↓
返回选中的轮次（保持对话连贯性）
```

### 3.3 核心算法设计

#### 3.3.1 语义相似度计算

```
输入:
  - turn_text: 对话轮次的文本
  - user_query: 用户当前问题
  - cache: embedding 缓存

输出:
  - similarity_score ∈ [0, 1]

算法:
  1. IF turn_text IN cache:
       turn_embedding = cache[turn_text]
     ELSE:
       turn_embedding = await embedText(turn_text)
       cache[turn_text] = turn_embedding
  
  2. IF user_query IN cache:
       query_embedding = cache[user_query]
     ELSE:
       query_embedding = await embedText(user_query)
       cache[user_query] = query_embedding
  
  3. similarity = cosine(turn_embedding, query_embedding)
  
  4. RETURN similarity
```

#### 3.3.2 混合排序算法

> **拟增强**：当前仓库尚未实现显式 `semantic_score × w + recency_score × (1-w)` 的混合评分；现状为“语义优先 + 近期窗口 + tie-break by recency”（见 3.2.2 与 3.4.1）。

```
输入:
  - turns: 所有可选轮次
  - user_query: 用户问题
  - limit: 选择数量上限
  - weights: {semantic: 0.7, recency: 0.3}

输出:
  - selected_turns: 选中的轮次（按时间排序）

算法:
  1. IF len(turns) <= limit:
       RETURN turns  // 无需选择
  
  2. scored_turns = []
     total_turns = len(turns)
     
  3. FOR each (turn, index) IN turns:
       semantic_score = computeSemanticSimilarity(turn.text, user_query)
       recency_score = 1 - (index / total_turns)
       final_score = semantic_score * weights.semantic + recency_score * weights.recency
       
       scored_turns.append({
         turn: turn,
         score: final_score,
         index: index
       })
  
  4. // 按 score 降序排序
     scored_turns.sort(by: score DESC)
  
  5. // 选择 top-K
     top_k = scored_turns[:limit]
  
  6. // 恢复时间顺序（按原始 index）
     top_k.sort(by: index ASC)
  
  7. RETURN [item.turn for item in top_k]
```

#### 3.3.3 短路优化

为避免不必要的 embedding 计算：

```
优化 1: 轮次数 <= limit 时直接返回
  IF len(turns) <= limit:
    RETURN turns  // 跳过所有计算

优化 2: 用户问题过短时降级为时间排序
  IF len(user_query) < 10:
    RETURN turns[-limit:]  // 使用时间排序

优化 3: 批量 embedding（如果支持）
  embeddings = await embedTexts([turn.text for turn in turns] + [user_query])
  // 一次调用减少网络往返
```

### 3.4 代码实现规格（与仓库对齐）

#### 3.4.1 已落地：语义选择近期对话

**文件**: `api/services/llm/recent_dialogue_semantic.js`

```javascript
const PROFILE_RULES = {
  lite: { window: 6, topK: 2 },
  standard: { window: 10, topK: 4 },
  max: { window: 12, topK: 5 },
};

export async function selectRecentDialogueSemantic({
  turns = [],
  userText = '',
  profile = 'lite',
  limit = 0,
} = {}) {
  const effectiveLimit = Math.max(0, limit || normalized.length);
  if (!isSemanticEnabled() || normalized.length === 0 || !userText.trim()) {
    return normalized.slice(0, effectiveLimit);
  }

  const rule = PROFILE_RULES[profile] || PROFILE_RULES.lite;
  const windowSize = Math.min(rule.window, normalized.length);
  const topK = Math.min(rule.topK, effectiveLimit || rule.topK, windowSize);
  const window = normalized.slice(0, windowSize);
  // ... cosine similarity + topK 选择 + 时间顺序恢复
}
```

> **校对结论**：该模块已实现“语义优先 + 近期窗口 + tie-break by recency”的选择框架；底层 embedding 由 `api/services/semantic/embeddings.js` 提供，默认 provider 为 `mock`。自 2026-01-26 起已支持 `openai` provider（见 `api/services/semantic/embeddings_openai.js`），但需要显式配置 `EMBEDDING_PROVIDER=openai` 与 `EMBEDDING_OPENAI_MODEL` 才会启用真实 embedding。权重策略、邻域扩展、跨分支引用仍未实现。

#### 3.4.2 已落地：语义排序工具

**文件**: `api/services/llm/semantic_ranker.js`

```javascript
export async function rankTextsBySimilarity(texts = [], query = '', topK = 1) {
  const clean = (texts || []).filter((t) => typeof t === 'string' && t.trim());
  const queryText = typeof query === 'string' ? query.trim() : '';
  if (!clean.length || !queryText) return clean.slice(0, topK);
  try {
    // ... embedding + cosine + 排序
    return scored.slice(0, topK).map((s) => s.text);
  } catch {
    // fail-open：异常回退到原始顺序（不阻断主链路）
    return clean.slice(0, topK);
  }
}
```

该函数被 `context_layers.js` 用于**核心要点**与**路径背景**的语义选择（`SEMANTIC_CORE_FACTS_ENABLED`）。

#### 3.4.3 与上下文构建的集成

**文件**: `api/services/llm/index.js`

```javascript
const selectedRecent = await selectRecentDialogueSemantic({
  turns: normalized.recent_turns || [],
  userText: normalized.user_text || '',
  profile,
  limit: limits.recentTurns,
});
```

该调用位于 `buildContextMessages()` 中，属于 **P1 已落地的主入口**。

#### 3.4.4 已知注意点（以仓库事实为准）

1) **embedding 默认 mock（安全/成本）**：默认 provider 为 `mock`；仓库已支持 `openai` provider，可通过 `EMBEDDING_PROVIDER=openai` + 配置 embedding model/key 切到真实语义。  
2) **Batch embeddings（可选优化）**：OpenAI provider 已支持 batch embeddings API（减少 RTT），当前语义选择以“并发单条 + 共享缓存”实现；窗口扩大或延迟敏感时可再做批量化。  

> 已修复（仓库事实）：Native Provider 显式历史的 role 归一、附件字段保留与 hydrate、retry 路径 recent_turns 对齐、LRU/TTL 缓存、指标与验收脚本。

### 3.5 配置参数

#### 3.5.1 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `RECENT_DIALOGUE_SEMANTIC_ENABLED` | `true` | 是否启用近期对话语义选择 (`false` 禁用) |
| `SEMANTIC_CORE_FACTS_ENABLED` | `false` | 是否启用核心要点/路径背景的语义排序 |
| `EMBEDDING_ENABLED` | `true` | embedding 总开关（关闭后语义选择会自动 fallback 到时间序；同样影响 `semantic_ranker`） |
| `EMBEDDING_PROVIDER` | `mock` | embedding provider（支持 `mock`/`openai`；默认 `mock`） |
| `EMBEDDING_MODEL` | *(空)* | embeddings 模型名（当 `EMBEDDING_PROVIDER=openai` 时必填之一；低优先级于 `EMBEDDING_OPENAI_MODEL`） |
| `EMBEDDING_OPENAI_API_KEY` | *(空)* | 可选：单独指定 embeddings 用 OpenAI key；未设置则复用 `OPENAI_API_KEY` |
| `EMBEDDING_OPENAI_MODEL` | *(空)* | 可选：OpenAI embeddings 模型名（优先于 `EMBEDDING_MODEL`） |
| `EMBEDDING_OPENAI_BASE` | *(空)* | 可选：OpenAI base URL（优先级高于 `OPENAI_API_BASE`） |
| `EMBEDDING_OPENAI_TIMEOUT_MS` | `15000` | 可选：embeddings 超时（毫秒） |
| `EMBEDDING_OPENAI_DIMENSIONS` | *(空)* | 可选：部分 embedding 模型支持 `dimensions` 参数（不支持则忽略/报错） |
| `EMBEDDING_DIM` | `64` | embedding 维度（`mock` provider 使用；同时参与 cache key） |
| `EMBEDDING_CACHE_MAX_SIZE` | `500` | embedding 共享缓存最大条目数（LRU） |
| `EMBEDDING_CACHE_TTL_MS` | `3600000` | embedding 共享缓存 TTL（毫秒） |
| `SEMANTIC_MIN_QUERY_LENGTH` | `3` | 语义选择最短 query 长度（过短直接短路回退） |
| `SEMANTIC_SCORE_WEIGHT` | `0.8` | 混合评分权重（1=纯语义；0=纯时间序） |
| `SEMANTIC_NEIGHBOR_EXPAND_ENABLED` | `true` | 是否启用命中 turn 的邻域扩展 |
| `SEMANTIC_NEIGHBOR_EXPAND` | `1` | 邻域扩展步数（每个命中 turn 前后补 N 条） |

#### 3.5.2 代码配置

```javascript
// api/services/llm/recent_dialogue_semantic.js
const PROFILE_RULES = {
  lite: { window: 6, topK: 2 },
  standard: { window: 10, topK: 4 },
  max: { window: 12, topK: 5 },
};
```

> **校对结论（2026-01-27）**：窗口与 topK 仍固定在代码中；混合评分权重与邻域扩展已提供 env 配置（见上表）。

### 3.6 集成点

#### 3.6.1 与 P0 的协同

P0 和 P1 是**互补**的，可同时启用：

```
┌────────────────────────────────────────────────────┐
│            All Path Turns (20 轮)                   │
├────────────────────────────────────────────────────┤
│  P0: 决定压缩范围                                   │
│  ├─ Rolling Summary (Turn 1-14, 压缩为摘要)         │
│  └─ Buffer Turns (Turn 15-20, 完整保留)             │
│                      │                              │
│                      ▼                              │
│  P1: 在 Buffer 中进行语义选择                        │
│  ├─ 候选: Turn 15-20 (6轮)                          │
│  ├─ 限制: limit=4 (Standard)                        │
│  └─ 语义选择: Turn 16, 18, 19, 20 (最相关的4轮)      │
└────────────────────────────────────────────────────┘

最终上下文:
  - Rolling Summary (Turn 1-14 压缩)
  - Turn 16, 18, 19, 20 (语义选择后的完整轮次)
```

#### 3.6.2 数据流图

```
createTurn() / retryTurn()
    ↓
buildRelevanceContext() / fetchParentLensSummary()
    ↓
获取 recent_turns（按 profile 扩窗，most-recent-first）+ rolling_summary（来自 node_summaries）
    ↓
buildContextMessages()
    ↓
┌──────────────────────────────────────────────┐
│ P1: selectRecentDialogueSemantic()           │
│   IF RECENT_DIALOGUE_SEMANTIC_ENABLED        │
│   AND EMBEDDING_ENABLED:                     │
│     → 语义 topK（窗口内）并恢复原顺序         │
│   ELSE/ERROR:                                │
│     → 回退到时间序 slice（取最近 N 条）       │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ P0: Rolling Summary 注入（read-path）         │
│   IF ROLLING_SUMMARY_ENABLED 且 DB 有摘要:    │
│     → 注入 History/历史摘要 layer             │
│   ELSE:                                      │
│     → 不注入（完全不影响主链路）              │
└──────────────────────────────────────────────┘
    ↓
buildLayeredContextSections() → serializeContext()

注：P0 的摘要生成发生在 write-path（turn 完成后异步刷新），不在 read-path 同步生成。
```

### 3.7 测试方案

#### 3.7.1 单元测试（已落地）

**文件**: `api/tests/recent_dialogue_semantic.test.js`

```javascript
import { selectRecentDialogueSemantic } from '../services/llm/recent_dialogue_semantic.js';

describe('semantic recent dialogue selection', () => {
  it('prefers programming turns when query is about Python', async () => {
    const picked = await selectRecentDialogueSemantic({
      turns,
      userText: '怎么系统学 Python？',
      profile: 'standard',
      limit: 3,
    });
    // 断言语义相关轮次被优先选择
  });

  it('falls back to recency when disabled', async () => {
    process.env.RECENT_DIALOGUE_SEMANTIC_ENABLED = 'false';
    const picked = await selectRecentDialogueSemantic({
      turns,
      userText: '怎么系统学 Python？',
      profile: 'lite',
      limit: 2,
    });
    // 断言回退到时间序
  });
});
```

#### 3.7.2 集成测试（建议）

当前仓库已具备 P1 单测 + 验收脚本（覆盖语义选择、embeddings provider、指标输出）：

- 单测：`api/tests/recent_dialogue_semantic.test.js`、`api/tests/embeddings_openai.test.js`、`api/tests/semantic_selection_metrics.test.js`
- 验收脚本：`tools/scripts/acceptance/verify_p1_semantic_selection.sh`

仍建议补充一条“真实 DB recent_turns 形态（most-recent-first、role=ai、含历史附件）+ Native Provider 显式历史”的端到端验证，以覆盖生产数据形态与 `context_limits` 配额联动。

### 3.8 性能优化

#### 3.8.1 Embedding 缓存策略

> **现状核对（2026-01-27）**：仓库已落地共享 LRU/TTL embedding 缓存：
> - `api/services/semantic/embedding_cache.js`（maxSize/ttl + key 含 provider/model/dim）
> - 调用方：`api/services/llm/recent_dialogue_semantic.js`、`api/services/llm/semantic_ranker.js`
> - 指标：`api/services/llm/semantic_selection_metrics.js`（cache hit/miss/size + embedding_calls）
>
> 批量 embedding/并发上限仍可作为可选优化点。

**问题**：频繁计算 embedding 成本高

**解决**：

```javascript
// LRU Cache implementation
class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest (first) entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

const embeddingCache = new LRUCache(1000);
```

#### 3.8.2 批量 Embedding（如果 API 支持）

```javascript
// Batch embedding for efficiency
async function selectTurnsBySemantic({ turns, userText, ... }) {
  // ... 
  
  // Batch compute all embeddings at once
  const allTexts = [userText, ...turns.map(t => t.text)];
  const embeddings = await embedTexts(allTexts); // Batch API call
  
  const queryEmbedding = embeddings[0];
  const turnEmbeddings = embeddings.slice(1);
  
  // Compute similarities (no more async calls)
  for (let i = 0; i < turns.length; i++) {
    const similarity = cosine(queryEmbedding, turnEmbeddings[i]);
    // ...
  }
}
```

#### 3.8.3 早期终止优化

```javascript
// 如果前 K 个轮次已经高度相关，无需继续计算
async function selectTurnsBySemantic({ turns, userText, limit, ... }) {
  const scored = [];
  let highScoreCount = 0;
  const highScoreThreshold = 0.9;
  
  for (let i = 0; i < turns.length; i++) {
    const score = await computeScore(turns[i], userText);
    scored.push({ turn: turns[i], score, index: i });
    
    if (score > highScoreThreshold) {
      highScoreCount++;
    }
    
    // Early termination: if we have enough high-scoring turns
    if (highScoreCount >= limit && i > limit * 1.5) {
      break; // No need to score remaining turns
    }
  }
  
  // ...
}
```

### 3.9 迁移计划

#### 3.9.1 部署步骤

```
第一步: 确认依赖
    - 确保 `api/services/semantic/embeddings.js` 正常工作
    - 注意：截至 2026-01-26，仓库默认 provider 为 `mock`；如需真实语义，可配置 `EMBEDDING_PROVIDER=openai` 并设置 `EMBEDDING_OPENAI_MODEL`（以及 OpenAI key）

第二步: 部署代码（默认禁用）
    $ git pull && npm install
    $ export RECENT_DIALOGUE_SEMANTIC_ENABLED=0
    $ pm2 restart omytree-api

第三步: 小范围启用测试
    - 针对内部测试账号启用
    - 监控 embedding 调用量与选择延迟（如接入真实 provider）

第四步: 灰度启用
    - 10% 用户启用，观察 24 小时
    - 50% 用户启用，观察 48 小时

第五步: 全量启用
    $ export RECENT_DIALOGUE_SEMANTIC_ENABLED=1
    $ pm2 restart omytree-api
```

#### 3.9.2 回滚计划

```
紧急回滚:
    $ export RECENT_DIALOGUE_SEMANTIC_ENABLED=0
    $ pm2 restart omytree-api
    
系统自动降级为时间排序，无副作用。

如果 embedding API 故障，代码中有 try-catch 自动 fallback。
```

#### 3.9.3 成本评估

> **现状说明（2026-01-26）**：仓库 embedding provider 当前仅 `mock`，不产生任何外部 embedding API 调用。以下“成本/延迟/缓存”评估仅适用于后续接入真实 embedding provider 后的上线阶段。

| 因素 | 影响 | 缓解措施 |
|------|------|----------|
| Embedding API 调用 | 成本增加 | 使用缓存减少 70-90% |
| 计算延迟 | 响应时间+50-200ms | 批量 embedding、异步预计算 |
| 内存占用 | 缓存占用内存 | LRU 限制为 1000 条 (~10MB) |

**预估成本**（假设 OpenAI embeddings）：
- 每次对话：6 轮 × 200 tokens = 1200 tokens
- 缓存命中率 80% → 实际调用 240 tokens/对话
- 成本：$0.0001/1K tokens × 0.24 = $0.000024/对话
- 月成本（10万对话）：$2.4

### 3.10 监控与指标

> **现状核对（2026-01-26）**：仓库当前未为 P1 输出专门的 metrics 段（`/metrics` 中无 `semantic_selection` section），也未做“成功路径”日志打点；目前仅在 embedding 报错时 `console.warn` 并回退到时间序。下列为建议指标与日志（未落地），用于后续任务卡实现。

#### 3.10.1 关键指标

| 指标 | 类型 | 说明 | 告警阈值 |
|------|------|------|----------|
| `omytree_semantic_selection_attempts_total{profile}` | Counter | 尝试进行语义选择的次数 | - |
| `omytree_semantic_selection_success_total{profile}` | Counter | 语义选择成功次数（embedding 成功） | - |
| `omytree_semantic_selection_fallback_total{profile,reason}` | Counter | 回退到时间序次数（如 `disabled/empty_query/embedding_error`） | > 5% |
| `omytree_semantic_selection_latency_ms_histogram_*` | Histogram | 选择耗时分布（含 embedding） | P99 > 1000ms |
| `omytree_embedding_cache_hits_total{scope}` | Counter | embedding 缓存命中（`scope=recent_dialogue|ranker`） | < 60%（趋势） |

#### 3.10.2 日志格式

```javascript
// 当前仓库实际：仅在 embedding 出错时打 warn 并回退
console.warn('[recent_dialogue_semantic] fallback to recency due to error:', err?.message || err);
```

#### 3.10.3 A/B 测试框架

```javascript
// 为对比效果，记录选择结果
async function selectTurnsBySemantic({ turns, userText, ... }) {
  const semanticResult = await doSemanticSelection(...);
  const timeBasedResult = turns.slice(-limit);
  
  // Log for A/B comparison
  logSelectionComparison({
    userId,
    treeId,
    query: userText,
    semantic: semanticResult.map(t => t.id),
    timeBased: timeBasedResult.map(t => t.id),
    overlap: computeOverlap(semanticResult, timeBasedResult),
  });
  
  return semanticResult;
}
```

---

## 四、P2 阶段：分支摘要 (Branch Summary)

### 4.1 背景与问题

#### 4.1.1 当前架构限制

当前 oMyTree 的对话结构基于**树状分支**：

```
Root
├── Branch A (讨论 PostgreSQL 优化)
│   ├── Node A1
│   ├── Node A2
│   └── Node A3
├── Branch B (讨论前端性能)
│   ├── Node B1
│   └── Node B2
└── Branch C (讨论部署策略)
    └── Node C1
```

**当前 memory_scope 行为**：

1. **`branch` scope**（默认）：
   - 只能访问当前节点的**祖先链**
   - 例如在 Node A3，只能看到 Root → A1 → A2 → A3
   - **无法访问** Branch B 或 Branch C 的内容

2. **`tree` scope**（全局）：
   - 可以访问整个树的 `tree_summary`（从 `tree_summaries` 表）
   - 但这个摘要是**全树级别**的，过于粗粒度
   - 无法针对性地获取特定分支的详细信息

#### 4.1.2 问题场景示例

**场景 1：跨分支引用**

```
用户在 Branch A 讨论 PostgreSQL 索引优化（10 轮）
  → 创建 Branch B 讨论前端性能（5 轮）
  → 创建 Branch C，问："Branch A 的索引方案能否应用到 B 的场景？"

当前行为（Branch C，branch scope）:
  - 只能看到 Root → C1 的路径
  - Branch A 的内容**完全不可见**
  - 用户必须手动重复之前的讨论

期望行为:
  - 识别到用户引用了 Branch A
  - 自动加载 Branch A 的摘要到上下文
  - 辅助 LLM 理解跨分支引用
```

**场景 2：多分支对比**

```
用户创建 3 个分支分别讨论 3 种技术方案：
  - Branch A: 方案 1（微服务架构）
  - Branch B: 方案 2（单体架构）
  - Branch C: 方案 3（Serverless）

在 Branch D 问："对比前面三个方案的优缺点"

当前行为:
  - 无法同时看到 A、B、C 的内容
  - 只能看到全树摘要（过于粗略）

期望行为:
  - 检测到需要对比 A、B、C
  - 为每个分支生成结构化摘要
  - 在 Branch D 的上下文中同时加载 3 个分支摘要
```

**场景 3：分支重组**

```
用户在 Branch A 讨论数据库设计（20 轮）
  → 发现设计有问题，从中间节点 A10 创建 Branch B 重新设计
  → 在 Branch B 需要引用 Branch A 中放弃的原因

当前行为:
  - Branch B 只能看到 A1-A10（分支点之前）
  - A11-A20 的讨论**不可见**

期望行为:
  - 识别到 Branch A 和 Branch B 的关系
  - 提供 Branch A 完整分支的摘要（包括 A11-A20）
```

#### 4.1.3 行业参考

**LangChain 的多对话管理**：

```python
# ConversationChain with multiple sessions
chain_a = ConversationChain(memory=memory_a)
chain_b = ConversationChain(memory=memory_b)

# Cross-session context injection
context = f"Previous session summary: {memory_a.summary}"
chain_b.run(f"{context}\n\n{user_input}")
```

**MemGPT/Letta 的分层记忆**：  
- 将短期工作上下文与长期 Archival Memory 分层管理；需要时通过检索把相关记忆注入工作上下文。  
- 参考：Letta Docs（Archival Memory）https://docs.letta.com/concepts/archival-memory；MemGPT 论文 https://arxiv.org/abs/2310.08560

**GitLab/GitHub 的分支摘要**：

- Merge Request 自动生成分支变更摘要
- 对比不同分支的 diff 和描述
- oMyTree 可借鉴：为每个对话分支生成摘要

### 4.2 解决方案概述

#### 4.2.1 核心概念

引入 **Branch Summary (分支摘要)** 机制：

```
每个树分支 = 一个独立的对话线程
    ↓
为每个分支生成结构化摘要
    ↓
存储到 branch_summaries 表
    ↓
在需要时（跨分支引用）加载相关分支摘要
```

#### 4.2.2 分支识别与边界

**分支定义**：
- 从根节点或最近分支点（fork ancestor）开始，到当前节点（branch tip）为止，构成一条**线性线程片段**（thread segment）
- `branch_id` 可由 `(branch_root_node_id, branch_tip_node_id)` 生成（稳定编码），用于唯一定位该线程片段

**分支边界计算**：

```sql
-- 找到某个节点所属的分支
WITH RECURSIVE branch_path AS (
  SELECT id, parent_id, tree_id, 0 AS depth
  FROM nodes
  WHERE id = :current_node_id
    AND tree_id = :tree_id
    AND soft_deleted_at IS NULL
  
  UNION ALL
  
  SELECT n.id, n.parent_id, n.tree_id, bp.depth + 1
  FROM nodes n
  JOIN branch_path bp ON n.id = bp.parent_id
  WHERE n.tree_id = :tree_id
    AND n.soft_deleted_at IS NULL
),
fork_ancestors AS (
  SELECT bp.id, bp.depth
  FROM branch_path bp
  JOIN LATERAL (
    SELECT COUNT(*) AS children_count
    FROM nodes c
    WHERE c.tree_id = :tree_id
      AND c.parent_id = bp.id
      AND c.soft_deleted_at IS NULL
  ) cc ON true
  WHERE bp.parent_id IS NULL OR cc.children_count > 1
  ORDER BY bp.depth ASC  -- 从当前节点向上，找到最近的“分支点/根”
  LIMIT 1
)
SELECT id AS branch_root_node_id
FROM fork_ancestors;
```

#### 4.2.3 摘要生成策略

**增量更新**（类似 P0 的 Rolling Summary）：

```
新节点创建时:
  1. 识别所属分支
  2. 获取该分支的现有摘要（如果存在）
  3. 决定是否需要更新:
     - 分支新增节点（消息）≥ 5 条 → 触发更新
     - 分支总 tokens 增加 ≥ 2000 → 触发更新
  4. 调用 LLM 生成新摘要
  5. 更新 branch_summaries 表
```

**摘要结构**：

```json
{
  "branch": {
    "branch_id": "branch-<root>-to-<tip>",
    "branch_root_node_id": "<uuid>",
    "branch_tip_node_id": "<uuid>"
  },
  "summary": {
    "overview": "讨论 PostgreSQL 索引优化方案",
    "key_points": [
      "B-tree 索引适合范围查询",
      "Hash 索引仅支持等值查询",
      "Composite index 顺序很关键"
    ],
    "conclusions": "决定使用 B-tree + partial index",
    "open_questions": ["如何处理高频更新表的索引膨胀？"]
  },
  "statistics": {
    "node_count": 15,
    "total_tokens": 8500,
    "created_at": "2026-01-24T10:00:00Z",
    "updated_at": "2026-01-24T10:30:00Z"
  }
}
```

#### 4.2.4 跨分支引用检测

**启发式规则**：

1. **显式引用**：用户消息包含分支标识符
   ```
   "Branch A 的方案"
   "之前在另一个分支讨论的..."
   "回到主线的讨论"
   ```

2. **语义检测**：用户问题与其他分支的摘要相似度高
   ```
   当前分支: Branch C（讨论部署）
   用户问: "索引优化怎么做？"
   → 检测到与 Branch A（索引优化）相似度 0.85
   → 加载 Branch A 摘要
   ```

3. **主动提示**：系统检测到潜在引用时提示用户
   ```
   System: "我注意到你在 Branch A 讨论过类似的索引优化问题，
           需要我引用那个分支的内容吗？"
   ```

#### 4.2.5 数据流

```
用户在 Branch C 提问
    ↓
buildContextMessages()
    ↓
检测跨分支引用需求
    ↓
IF detected:
  ├─ 查询 branch_summaries 表
  ├─ 获取相关分支摘要
  └─ 插入到上下文的 "cross_branch" 层
    ↓
与 P0/P1 生成的上下文合并
    ↓
发送给 LLM
```

### 4.3 数据库变更

> **现状核对（双重验证）**：
> 1) **仓库层面**：未发现 `branch_summaries`/`branch_references` 的迁移脚本与代码引用（排除 docs 的全文搜索）。
> 2) **实库层面（直连 SQL 查询）**：`omytree` 数据库中 **不存在** `branch_summaries`/`branch_references` 两表。
>
> 备注：当前库中虽存在 `branch_candidate`、`branch_resumes` 等 `branch_*` 表，但其用途与“分支摘要/跨分支引用”不一致，不能视为 P2 的替代实现。
>
> 以下为**拟新增**数据库结构，供实现阶段评审。

#### 4.3.1 新增表：branch_summaries

```sql
-- 分支摘要表
CREATE TABLE branch_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL,  -- 分支唯一标识符（建议：branch_root_node_id + branch_tip_node_id 的稳定编码）
    
    -- 分支边界
    branch_root_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    branch_tip_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    
    -- 摘要内容
    summary JSONB NOT NULL,  -- 结构化摘要（overview, key_points, conclusions, open_questions）
    summary_text TEXT NOT NULL,  -- 纯文本摘要（用于语义检索）
    
    -- 统计信息
    node_count INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    
    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    summarized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 索引
    CONSTRAINT uk_branch_summary UNIQUE(tree_id, branch_id)
);

-- 索引
CREATE INDEX idx_branch_summaries_tree_id ON branch_summaries(tree_id);
CREATE INDEX idx_branch_summaries_branch_root ON branch_summaries(branch_root_node_id);
CREATE INDEX idx_branch_summaries_branch_tip ON branch_summaries(branch_tip_node_id);
CREATE INDEX idx_branch_summaries_updated_at ON branch_summaries(updated_at DESC);

-- GIN 索引用于 JSONB 查询
CREATE INDEX idx_branch_summaries_summary_gin ON branch_summaries USING gin(summary);

-- 注释
COMMENT ON TABLE branch_summaries IS 'P2: Branch-level conversation summaries';
COMMENT ON COLUMN branch_summaries.branch_id IS 'Unique identifier for the branch (e.g., "branch-<root>-to-<tip>")';
COMMENT ON COLUMN branch_summaries.summary IS 'Structured summary: {overview, key_points, conclusions, open_questions}';
COMMENT ON COLUMN branch_summaries.summary_text IS 'Plain text summary for semantic search';
```

#### 4.3.2 新增表：branch_references

```sql
-- 跨分支引用记录表（用于分析和优化）
CREATE TABLE branch_references (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    
    -- 引用来源
    source_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    source_branch_id TEXT NOT NULL,
    
    -- 被引用分支
    referenced_branch_id TEXT NOT NULL,
    
    -- 引用方式
    reference_type TEXT NOT NULL,  -- 'explicit', 'semantic', 'manual'
    confidence_score DOUBLE PRECISION,  -- 语义引用的置信度
    
    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_branch_refs_source ON branch_references(source_node_id);
CREATE INDEX idx_branch_refs_tree ON branch_references(tree_id);

COMMENT ON TABLE branch_references IS 'P2: Track cross-branch reference patterns';
COMMENT ON COLUMN branch_references.reference_type IS 'explicit: user mention, semantic: detected by similarity, manual: user selected';
```

#### 4.3.3 迁移脚本

```sql
-- Migration: P2 Branch Summaries
-- Version: 4.2.0
-- Date: 2026-01-24

BEGIN;

-- 1. Create branch_summaries table
CREATE TABLE branch_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL,
    branch_root_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    branch_tip_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    summary JSONB NOT NULL,
    summary_text TEXT NOT NULL,
    node_count INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    summarized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_branch_summary UNIQUE(tree_id, branch_id)
);

CREATE INDEX idx_branch_summaries_tree_id ON branch_summaries(tree_id);
CREATE INDEX idx_branch_summaries_branch_root ON branch_summaries(branch_root_node_id);
CREATE INDEX idx_branch_summaries_branch_tip ON branch_summaries(branch_tip_node_id);
CREATE INDEX idx_branch_summaries_updated_at ON branch_summaries(updated_at DESC);
CREATE INDEX idx_branch_summaries_summary_gin ON branch_summaries USING gin(summary);

-- 2. Create branch_references table
CREATE TABLE branch_references (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    source_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    source_branch_id TEXT NOT NULL,
    referenced_branch_id TEXT NOT NULL,
    reference_type TEXT NOT NULL,
    confidence_score DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_branch_refs_source ON branch_references(source_node_id);
CREATE INDEX idx_branch_refs_tree ON branch_references(tree_id);

COMMIT;

-- Rollback script
-- DROP TABLE IF EXISTS branch_references CASCADE;
-- DROP TABLE IF EXISTS branch_summaries CASCADE;
```

### 4.4 核心算法设计

#### 4.4.1 分支识别算法

```
输入:
  - node_id: 当前节点 ID
  - tree_id: 树 ID

输出:
  - branch_id: 分支标识符
  - branch_nodes: 分支中的所有节点

算法:
  1. 从 node_id 开始，向上遍历到根节点
  2. 记录路径: [root, ..., parent, node_id]
  3. 识别分支点（有多个子节点的节点）:
     FOR each node IN path:
       children_count = COUNT(SELECT FROM nodes WHERE parent_id = node)
       IF children_count > 1:
         branch_point = node
         BREAK
  4. 取分支线程（线性）:
     branch_nodes = path 中从 branch_point 到 node_id 的连续片段
  5. 生成 branch_id = f"branch-{branch_point}-to-{node_id}"
  6. RETURN branch_id, branch_nodes
```

#### 4.4.2 分支摘要生成算法

```
输入:
  - branch_id: 分支 ID
  - branch_nodes: 分支中的所有节点
  - existing_summary: 现有摘要（如果存在）

输出:
  - new_summary: 更新后的摘要

算法:
  1. 检查是否需要更新:
     IF len(branch_nodes) < 5:
       RETURN existing_summary  // 太短不值得摘要
     
     IF existing_summary IS NOT NULL:
       new_node_count = len(branch_nodes) - existing_summary.node_count
       IF new_node_count < 5:
         RETURN existing_summary  // 变化不大
  
  2. 提取分支内容:
     turns = []
     FOR node IN branch_nodes:
       turns.append({
         role: node.role,
         text: node.text
       })
  
  3. 构建摘要提示:
     IF existing_summary IS NOT NULL:
       prompt = f"""
       现有摘要:
       {existing_summary.summary_text}
       
       新增对话（{new_node_count} 条消息）:
       {format_turns(new_turns)}
       
       请更新摘要，保留核心要点，整合新内容。
       """
     ELSE:
       prompt = f"""
       请为以下对话分支生成结构化摘要（{len(turns)} 轮）:
       {format_turns(turns)}
       
       输出 JSON 格式:
       {{
         "overview": "一句话概括本分支讨论的主题",
         "key_points": ["要点1", "要点2", ...],
         "conclusions": "达成的结论或决策",
         "open_questions": ["未解决的问题"]
       }}
       """
  
  4. 调用 LLM:
     response = await callLLM(prompt, model: "gpt-4o-mini")
     summary_json = JSON.parse(response)
  
  5. 生成纯文本摘要（用于语义检索）:
     summary_text = f"""
     主题: {summary_json.overview}
     要点: {', '.join(summary_json.key_points)}
     结论: {summary_json.conclusions}
     """
  
  6. 保存到数据库:
     INSERT INTO branch_summaries (
       tree_id, branch_id, branch_root_node_id, branch_tip_node_id,
       summary, summary_text, node_count, ...
     ) VALUES (...)
     ON CONFLICT (tree_id, branch_id) DO UPDATE ...
  
  7. RETURN summary_json
```

#### 4.4.3 跨分支引用检测算法

```
输入:
  - user_text: 用户当前问题
  - current_branch_id: 当前分支 ID
  - tree_id: 树 ID

输出:
  - referenced_branches: 需要引用的分支列表

算法:
  1. 显式引用检测:
     keywords = ["另一个分支", "之前的分支", "Branch A", "主线", "回到"]
     IF any(keyword IN user_text.lower() for keyword IN keywords):
       // 解析用户意图，提取分支名称或特征
       referenced_branches = extract_branch_mentions(user_text)
  
  2. 语义引用检测:
     // 获取当前树的所有分支摘要（排除当前分支）
     all_branch_summaries = SELECT * FROM branch_summaries 
                            WHERE tree_id = :tree_id 
                            AND branch_id != :current_branch_id
     
     // 计算语义相似度
     scored_branches = []
     FOR branch IN all_branch_summaries:
       similarity = computeSemanticSimilarity(
         user_text, 
         branch.summary_text
       )
       IF similarity > 0.65:  // 阈值
         scored_branches.append({
           branch_id: branch.branch_id,
           score: similarity
         })
     
     // 排序并选择 top-K
     scored_branches.sort(by: score DESC)
     referenced_branches.extend(scored_branches[:2])  // 最多引用 2 个分支
  
  3. 去重与验证:
     referenced_branches = deduplicate(referenced_branches)
  
  4. RETURN referenced_branches
```

### 4.5 代码实现规格

> **现状核对**：`branch_summary.js` 与相关调用在当前仓库中不存在。
> 以下为**拟新增实现规格**，非现有代码。

#### 4.5.1 新模块：branch_summary.js

**文件**: `api/services/llm/branch_summary.js`

```javascript
/**
 * P2: Branch Summary Management
 */
import { pool } from '../../db/pool.js';
import { resolveProviderForRequest } from './providers/index.js';
import { parseOpenAiJson } from './providers/openai.js';
import { embedText } from '../semantic/embeddings.js';

const embedCache = new Map(); // text -> vector

async function getEmbedding(text) {
  const key = (text || '').trim();
  if (!key) return [];
  if (embedCache.has(key)) return embedCache.get(key);
  const vec = await embedText(key);
  embedCache.set(key, vec);
  return vec;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

async function computeSemanticSimilarity(a, b) {
  const [va, vb] = await Promise.all([getEmbedding(a), getEmbedding(b)]);
  return cosineSimilarity(va, vb);
}

/**
 * Identify the branch that a node belongs to
 * @param {string} nodeId - Current node ID
 * @param {string} treeId - Tree ID
 * @returns {Promise<{branchId: string, branchNodes: Array}>}
 */
export async function identifyBranch(nodeId, treeId) {
  const client = await pool.connect();
  try {
    // Get path from root to current node
    const pathResult = await client.query(`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id, created_at, 0 AS depth
        FROM nodes
        WHERE id = $1 AND tree_id = $2 AND soft_deleted_at IS NULL

        UNION ALL

        SELECT n.id, n.parent_id, n.created_at, a.depth + 1
        FROM nodes n
        JOIN ancestors a ON a.parent_id = n.id
        WHERE n.tree_id = $2 AND n.soft_deleted_at IS NULL
      )
      SELECT id, parent_id, created_at, depth
      FROM ancestors
      ORDER BY depth DESC
    `, [nodeId, treeId]);

    if (pathResult.rows.length === 0) {
      throw new Error(`Node ${nodeId} not found in tree ${treeId}`);
    }

    const path = pathResult.rows;
    
    // Find nearest branch point (closest fork ancestor; fallback to root)
    let branchPoint = path[0].id; // Default to root

    for (let i = path.length - 1; i >= 0; i -= 1) {
      const node = path[i];
      const childrenResult = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM nodes
        WHERE parent_id = $1 AND tree_id = $2 AND soft_deleted_at IS NULL
      `, [node.id, treeId]);
      
      const childrenCount = parseInt(childrenResult.rows[0].count, 10);
      if (childrenCount > 1) {
        branchPoint = node.id;
        break;
      }
    }

    // Branch nodes = the path segment from branchPoint to current node (linear thread)
    const branchStartIndex = path.findIndex((n) => n.id === branchPoint);
    const branchNodes = path.slice(branchStartIndex).map((n) => n.id);
    
    // Generate branch ID
    const branchId = `branch-${branchPoint}-to-${nodeId}`;

    return { branchId, branchNodes, branchPoint, branchTipNodeId: nodeId };
  } finally {
    client.release();
  }
}

/**
 * Check if branch summary needs update
 * @param {string} treeId
 * @param {string} branchId 
 * @param {number} currentNodeCount 
 * @returns {Promise<{needsUpdate: boolean, existingSummary: object}>}
 */
export async function shouldUpdateBranchSummary(treeId, branchId, currentNodeCount) {
  const result = await pool.query(`
    SELECT summary, node_count, total_tokens, summarized_at
    FROM branch_summaries
    WHERE tree_id = $1 AND branch_id = $2
    ORDER BY updated_at DESC
    LIMIT 1
  `, [treeId, branchId]);

  if (result.rows.length === 0) {
    // No existing summary
    return { needsUpdate: currentNodeCount >= 5, existingSummary: null };
  }

  const existing = result.rows[0];
  const newNodes = currentNodeCount - existing.node_count;

  // Update if: new nodes >= 5 OR total nodes >= 10
  const needsUpdate = newNodes >= 5 || (currentNodeCount >= 10 && newNodes > 0);

  return {
    needsUpdate,
    existingSummary: existing,
  };
}

/**
 * Generate or update branch summary
 * @param {object} params
 * @param {string} params.treeId
 * @param {string} params.branchId
 * @param {Array} params.branchNodes - Node IDs in the branch
 * @param {string} params.branchPoint - Branch root node ID
 * @param {object} params.existingSummary - Existing summary (if any)
 * @param {string|null} [params.userId] - For BYOK provider routing (optional)
 * @returns {Promise<object>} New summary
 */
export async function generateBranchSummary({
  treeId,
  branchId,
  branchNodes,
  branchPoint,
  existingSummary = null,
  userId = null,
}) {
  // Fetch node contents
  const nodesResult = await pool.query(`
    SELECT id, role, text, created_at
    FROM nodes
    WHERE id = ANY($1::uuid[])
    AND tree_id = $2
    AND soft_deleted_at IS NULL
    ORDER BY created_at ASC
  `, [branchNodes, treeId]);

  const turns = nodesResult.rows.map(row => ({
    role: row.role,
    text: row.text || '',
  }));

  if (turns.length < 5) {
    console.log(`[P2:BranchSummary] Branch ${branchId} too short (${turns.length} messages), skipping`);
    return existingSummary;
  }

  // Build prompt
  let prompt;
  if (existingSummary) {
    const previousCount = existingSummary.node_count || 0;
    const previousSummary = existingSummary.summary || existingSummary;
    const newTurnCount = turns.length - previousCount;
    const newTurns = turns.slice(-newTurnCount);
    
    prompt = `你是一个对话摘要助手。请更新以下分支的摘要。

现有摘要（${previousCount} 条消息）:
${JSON.stringify(previousSummary, null, 2)}

新增对话（${newTurnCount} 轮）:
${newTurns.map((t, i) => `${t.role}: ${t.text}`).join('\n\n')}

请更新摘要，保留核心要点，整合新内容。输出 JSON 格式:
{
  "overview": "一句话概括本分支讨论的主题",
  "key_points": ["要点1", "要点2", ...],
  "conclusions": "达成的结论或决策",
  "open_questions": ["未解决的问题"]
}`;
  } else {
    prompt = `你是一个对话摘要助手。请为以下对话分支生成结构化摘要。

对话内容（${turns.length} 轮）:
${turns.map((t, i) => `${i + 1}. ${t.role}: ${t.text}`).join('\n\n')}

请输出 JSON 格式的摘要:
{
  "overview": "一句话概括本分支讨论的主题",
  "key_points": ["要点1", "要点2", "要点3"],
  "conclusions": "达成的结论或决策",
  "open_questions": ["未解决的问题1", "未解决的问题2"]
}`;
  }

  const { provider, defaultModel } = await resolveProviderForRequest({ userId });
  const response = await provider.callChat({
    prompt,
    metadata: { treeId, nodeId: branchNodes[branchNodes.length - 1] },
    options: {
      model: process.env.BRANCH_SUMMARY_LLM_MODEL || defaultModel || 'gpt-4o-mini',
      max_tokens: 400,
      temperature: 0.3,
      mode: 'branch_summary',
    },
  });

  let summaryJson = response?.parsed_json || null;
  if (!summaryJson && typeof response?.ai_text === 'string') {
    try {
      summaryJson = parseOpenAiJson(response.ai_text);
    } catch (err) {
      console.warn('[P2:BranchSummary] JSON parse failed, using fallback:', err?.message || err);
    }
  }
  if (!summaryJson) {
    summaryJson = {
      overview: '对话分支摘要',
      key_points: turns.slice(-3).map(t => (t.text || '').slice(0, 100)),
      conclusions: '',
      open_questions: [],
    };
  }

  // Generate plain text for semantic search
  const summaryText = `
主题: ${summaryJson.overview}
要点: ${summaryJson.key_points.join('; ')}
结论: ${summaryJson.conclusions}
`.trim();

  // Calculate tokens (rough estimate)
  const totalTokens = turns.reduce((sum, t) => sum + Math.ceil(t.text.length / 4), 0);

  const branchTipNodeId = branchNodes[branchNodes.length - 1];

  // Save to database
  await pool.query(`
    INSERT INTO branch_summaries (
      tree_id, branch_id, branch_root_node_id, branch_tip_node_id,
      summary, summary_text, node_count, total_tokens,
      created_at, updated_at, summarized_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
    ON CONFLICT (tree_id, branch_id) DO UPDATE SET
      summary = EXCLUDED.summary,
      summary_text = EXCLUDED.summary_text,
      node_count = EXCLUDED.node_count,
      total_tokens = EXCLUDED.total_tokens,
      updated_at = NOW(),
      summarized_at = NOW()
  `, [
    treeId,
    branchId,
    branchPoint,
    branchTipNodeId,
    summaryJson,
    summaryText,
    turns.length,
    totalTokens,
  ]);

  console.log(`[P2:BranchSummary] Generated summary for ${branchId} (${turns.length} messages)`);

  return summaryJson;
}

/**
 * Detect cross-branch references in user text
 * @param {string} userText - User's current question
 * @param {string} currentBranchId - Current branch ID
 * @param {string} treeId - Tree ID
 * @returns {Promise<Array>} Referenced branch IDs with scores
 */
export async function detectCrossBranchReferences(userText, currentBranchId, treeId) {
  const referenced = [];

  // 1. Explicit reference detection
  const explicitKeywords = [
    '另一个分支', '之前的分支', '主线', '回到', 
    'branch a', 'branch b', '分支',
  ];
  
  const hasExplicitMention = explicitKeywords.some(kw => 
    userText.toLowerCase().includes(kw)
  );

  if (hasExplicitMention) {
    console.log('[P2:CrossBranch] Detected explicit branch mention');
    // TODO: Parse user intent to extract specific branch
  }

  // 2. Semantic reference detection
  const branchSummaries = await pool.query(`
    SELECT branch_id, summary_text, summary
    FROM branch_summaries
    WHERE tree_id = $1
    AND branch_id != $2
    ORDER BY updated_at DESC
  `, [treeId, currentBranchId]);

  for (const branch of branchSummaries.rows) {
    const similarity = await computeSemanticSimilarity(
      userText,
      branch.summary_text
    );

    if (similarity > 0.65) {
      referenced.push({
        branchId: branch.branch_id,
        score: similarity,
        summary: branch.summary,
        referenceType: 'semantic',
      });
    }
  }

  // Sort by score and limit to top 2
  referenced.sort((a, b) => b.score - a.score);
  const topReferenced = referenced.slice(0, 2);

  if (topReferenced.length > 0) {
    console.log('[P2:CrossBranch] Detected semantic references:', 
      topReferenced.map(r => `${r.branchId} (${r.score.toFixed(2)})`));
  }

  return topReferenced;
}

/**
 * Record cross-branch reference for analytics
 */
export async function recordBranchReference({
  treeId,
  sourceNodeId,
  sourceBranchId,
  referencedBranchId,
  referenceType,
  confidenceScore,
}) {
  await pool.query(`
    INSERT INTO branch_references (
      tree_id, source_node_id, source_branch_id,
      referenced_branch_id, reference_type, confidence_score
    ) VALUES ($1, $2, $3, $4, $5, $6)
  `, [treeId, sourceNodeId, sourceBranchId, referencedBranchId, referenceType, confidenceScore]);
}
```

#### 4.5.2 集成到上下文构建

**文件**: `api/services/llm/index.js`

```javascript
// 在 buildContextMessages 中添加跨分支引用检测

import {
  identifyBranch,
  shouldUpdateBranchSummary,
  generateBranchSummary,
  detectCrossBranchReferences,
  recordBranchReference,
} from './branch_summary.js';

// 在 llm/index.js 内部的 buildContextMessages() 中集成
async function buildContextMessages(payload, options = {}) {
  const {
    tree_id,
    node_id,
    user_text,
    context_profile = 'lite',
    memory_scope = 'branch',
  } = payload;

  // ... existing code ...

  // P2: Branch Summary Integration
  const branchSummaryEnabled = process.env.BRANCH_SUMMARY_ENABLED !== '0';
  let crossBranchContext = null;

  if (branchSummaryEnabled && user_text) {
    try {
      // 1. Identify current branch
      const { branchId, branchNodes, branchPoint } = await identifyBranch(node_id, tree_id);

      // 2. Check if branch summary needs update
      const { needsUpdate, existingSummary } = await shouldUpdateBranchSummary(
        tree_id,
        branchId,
        branchNodes.length
      );

      if (needsUpdate) {
        await generateBranchSummary({
          treeId: tree_id,
          branchId,
          branchNodes,
          branchPoint,
          existingSummary,
          userId: options.userId || null,
        });
      }

      // 3. Detect cross-branch references
      const referencedBranches = await detectCrossBranchReferences(
        user_text,
        branchId,
        tree_id
      );

      if (referencedBranches.length > 0) {
        // Build cross-branch context
        crossBranchContext = {
          branches: referencedBranches.map(ref => ({
            branchId: ref.branchId,
            summary: ref.summary,
            relevanceScore: ref.score,
          })),
        };

        // Record references for analytics
        for (const ref of referencedBranches) {
          await recordBranchReference({
            treeId: tree_id,
            sourceNodeId: node_id,
            sourceBranchId: branchId,
            referencedBranchId: ref.branchId,
            referenceType: ref.referenceType,
            confidenceScore: ref.score,
          });
        }
      }
    } catch (err) {
      console.warn('[P2:BranchSummary] Error:', err.message);
    }
  }

  // ... existing code (P0, P1 context building) ...

  // Insert cross-branch context into contextData (T50-1 serializer expects snake_case: cross_branch)
  if (crossBranchContext) {
    contextData.cross_branch = crossBranchContext;
  }

  // ... serialize and return ...
}
```

#### 4.5.3 上下文序列化增强

**文件**: `api/services/llm/serialize_context.js`

```javascript
// P2: 为现有 serializeContext 增加跨分支引用展示（保持 T50-1 的“纯上下文”原则）
// 约定：buildContextData 新增字段 cross_branch（snake_case，与其他字段一致）
// contextData.cross_branch = { branches: [{ branchId, relevanceScore, summary: {overview,key_points,...} }] }

// 在 labels 中新增
labels.crossBranch = isZh ? '跨分支引用' : 'Cross-branch';

// 在 serializeContext() 中新增一段（建议放在 core_facts 之后、tree_story 之前）
if (contextData.cross_branch?.branches?.length) {
  lines.push(`- ${labels.crossBranch}:`);
  for (const [idx, branch] of contextData.cross_branch.branches.entries()) {
    const score = Number.isFinite(branch.relevanceScore) ? (branch.relevanceScore * 100).toFixed(0) : 'n/a';
    lines.push(`  - #${idx + 1} (${score}%) ${branch.branchId || ''}`.trim());
    if (branch.summary?.overview) lines.push(`    - 主题: ${branch.summary.overview}`);
    if (Array.isArray(branch.summary?.key_points) && branch.summary.key_points.length) {
      lines.push('    - 要点:');
      for (const p of branch.summary.key_points) lines.push(`      - ${p}`);
    }
    if (branch.summary?.conclusions) lines.push(`    - 结论: ${branch.summary.conclusions}`);
    if (Array.isArray(branch.summary?.open_questions) && branch.summary.open_questions.length) {
      lines.push(`    - 未解决问题: ${branch.summary.open_questions.join('; ')}`);
    }
  }
}
```

### 4.6 配置参数

#### 4.6.1 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `BRANCH_SUMMARY_ENABLED` | `1` | 是否启用分支摘要 (`0` 禁用) |
| `BRANCH_SUMMARY_MIN_TURNS` | `5` | 生成摘要的最小轮次 |
| `BRANCH_SUMMARY_UPDATE_THRESHOLD` | `5` | 触发更新的新增轮次阈值 |
| `CROSS_BRANCH_SIMILARITY_THRESHOLD` | `0.65` | 语义引用检测的相似度阈值 |
| `CROSS_BRANCH_MAX_REFERENCES` | `2` | 最多引用的分支数量 |
| `BRANCH_SUMMARY_LLM_MODEL` | `gpt-4o-mini` | 生成摘要使用的模型 |

#### 4.6.2 代码配置

```javascript
// api/services/llm/branch_summary_config.js
export const BRANCH_SUMMARY_CONFIG = {
  // Minimum turns to generate summary
  minTurns: 5,
  
  // Update thresholds
  updateThreshold: {
    newTurns: 5,        // New turns since last summary
    newTokens: 2000,    // New tokens since last summary
  },
  
  // Cross-branch detection
  crossBranch: {
    similarityThreshold: 0.65,  // Minimum similarity to trigger reference
    maxReferences: 2,           // Maximum branches to reference
    explicitKeywords: [
      '另一个分支', '之前的分支', 'branch', '主线', '回到',
    ],
  },
  
  // LLM settings for summarization
  llm: {
    model: 'gpt-4o-mini',
    temperature: 0.3,
    maxTokens: 800,
  },
  
  // Summary structure validation
  requiredFields: ['overview', 'key_points', 'conclusions', 'open_questions'],
};
```

### 4.7 集成点

#### 4.7.1 与 P0/P1 的协同

P0、P1、P2 三者**独立且互补**：

```
┌─────────────────────────────────────────────────────────┐
│                Current Branch (Branch C)                 │
├─────────────────────────────────────────────────────────┤
│  P0: Rolling Summary                                     │
│    Turn 1-10 → compressed summary                        │
│                                                          │
│  P1: Semantic Selection                                  │
│    Turn 11-20 → select top 4 by relevance               │
│                                                          │
│  P2: Cross-Branch References (NEW)                       │
│    ├─ Detect: user mentions "Branch A"                   │
│    ├─ Retrieve: Branch A summary from DB                 │
│    └─ Inject: Branch A summary into context              │
└─────────────────────────────────────────────────────────┘

Final Context:
  - Tree Summary (global overview)
  - Branch A Summary (cross-branch reference)  ← P2
  - Rolling Summary of Branch C (Turn 1-10)    ← P0
  - Recent Turns from Branch C (Turn 17, 18, 19, 20)  ← P1
  - User's current question
```

#### 4.7.2 触发时机

```
createTurn() (api/services/turn/create.js)
    ↓
[Async Post-Processing]
    ↓
identifyBranch(node_id) → branchId, branchNodes
    ↓
shouldUpdateBranchSummary(tree_id, branchId, nodeCount)
    ↓
IF needsUpdate:
  generateBranchSummary() → save to DB
    ↓
[Synchronous Context Building]
    ↓
buildContextMessages()
    ↓
detectCrossBranchReferences(user_text, branchId)
    ↓
IF references detected:
  load branch summaries from DB
  inject into context
```

### 4.8 测试方案

#### 4.8.1 单元测试

**文件**: `api/tests/branch_summary.test.js`

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  identifyBranch,
  shouldUpdateBranchSummary,
  generateBranchSummary,
  detectCrossBranchReferences,
} from '../services/llm/branch_summary.js';
import { pool } from '../db/pool.js';

describe('P2 Branch Summary', () => {
  let userId;
  let testTreeId;
  let testNodes = {};

  beforeAll(async () => {
    // Create test tree structure:
    // Root
    //   ├─ A1 ─ A2 ─ A3 (Branch A: PostgreSQL)
    //   └─ B1 ─ B2      (Branch B: Frontend)
    
    userId = randomUUID();
    await pool.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, $3)`,
      [userId, `${userId}@example.com`, 'Test User']
    );

    const treeResult = await pool.query(
      `INSERT INTO trees (topic, created_by, status, user_id)
       VALUES ($1, $2, 'active', $3)
       RETURNING id`,
      ['Test Tree', 'test', userId]
    );
    testTreeId = treeResult.rows[0].id;

    // Create nodes
    const root = await createNode(testTreeId, null, 0, 'system', 'Start discussion');
    testNodes.root = root;

    const a1 = await createNode(testTreeId, root, 1, 'user', 'How to optimize PostgreSQL?');
    const a2 = await createNode(testTreeId, a1, 2, 'ai', 'Use indexes');
    const a3 = await createNode(testTreeId, a2, 3, 'user', 'What about B-tree vs Hash?');
    testNodes.a3 = a3;

    const b1 = await createNode(testTreeId, root, 1, 'user', 'React performance tips?');
    const b2 = await createNode(testTreeId, b1, 2, 'ai', 'Use React.memo');
    testNodes.b2 = b2;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM trees WHERE id = $1', [testTreeId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  describe('identifyBranch', () => {
    it('identifies branch A correctly', async () => {
      const result = await identifyBranch(testNodes.a3, testTreeId);
      
      expect(result.branchId).toContain('branch-');
      expect(result.branchNodes.length).toBeGreaterThan(0);
    });

    it('identifies branch B correctly', async () => {
      const result = await identifyBranch(testNodes.b2, testTreeId);
      
      expect(result.branchId).toContain('branch-');
    });
  });

  describe('shouldUpdateBranchSummary', () => {
    it('requires update for new branch (no existing summary)', async () => {
      const result = await shouldUpdateBranchSummary(testTreeId, 'new-branch', 10);
      
      expect(result.needsUpdate).toBe(true);
      expect(result.existingSummary).toBeNull();
    });
  });

  describe('generateBranchSummary', () => {
    it('generates summary for branch with sufficient turns', async () => {
      // Add more nodes to meet minimum threshold
      let leaf = testNodes.a3;
      for (let i = 0; i < 5; i++) {
        leaf = await createNode(testTreeId, leaf, 4 + i, 'user', `PostgreSQL question ${i}`);
      }

      const { branchId, branchNodes, branchPoint } = await identifyBranch(leaf, testTreeId);

      const summary = await generateBranchSummary({
        treeId: testTreeId,
        branchId,
        branchNodes,
        branchPoint,
        userId,
      });

      expect(summary).toHaveProperty('overview');
      expect(summary).toHaveProperty('key_points');
      expect(summary.key_points).toBeInstanceOf(Array);
    });
  });

  describe('detectCrossBranchReferences', () => {
    it('detects semantic reference to another branch', async () => {
      // Generate summaries for both branches first
      let leafA = testNodes.a3;
      for (let i = 0; i < 5; i++) {
        leafA = await createNode(testTreeId, leafA, 10 + i, 'user', `PostgreSQL follow-up ${i}`);
      }
      const branchA = await identifyBranch(leafA, testTreeId);
      await generateBranchSummary({
        treeId: testTreeId,
        branchId: branchA.branchId,
        branchNodes: branchA.branchNodes,
        branchPoint: branchA.branchPoint,
        userId,
      });

      const branchB = await identifyBranch(testNodes.b2, testTreeId);
      
      // User in Branch B asks about PostgreSQL (Branch A topic)
      const references = await detectCrossBranchReferences(
        'How do I optimize database queries?',  // Related to Branch A
        branchB.branchId,
        testTreeId
      );

      expect(references.length).toBeGreaterThan(0);
      expect(references[0]).toHaveProperty('branchId');
      expect(references[0]).toHaveProperty('score');
    });
  });
});

async function createNode(treeId, parentId, level, role, text) {
  const result = await pool.query(`
    INSERT INTO nodes (tree_id, parent_id, level, role, text)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [treeId, parentId, level, role, text]);
  return result.rows[0].id;
}
```

#### 4.8.2 集成测试

**文件**: `api/tests/branch_summary_integration.test.js`

```javascript
import { describe, it, expect } from 'vitest';
import { buildContextMessages } from '../services/llm/index.js';

describe('P2 Integration: Branch Summary in Context', () => {
  it('includes cross-branch reference in context', async () => {
    // Setup: Create tree with multiple branches (use test helpers)
    const { treeId, branchANode, branchBNode } = await createMultiBranchTree();

    // Generate summary for Branch A
    await triggerBranchSummaryGeneration(branchANode);

    // Build context for Branch B with reference to Branch A
    const payload = {
      tree_id: treeId,
      node_id: branchBNode,
      user_text: 'Can we apply the PostgreSQL optimization from Branch A?',
      context_profile: 'standard',
      memory_scope: 'branch',
    };

    process.env.BRANCH_SUMMARY_ENABLED = '1';
    
    const messages = await buildContextMessages(payload, { userId: 'test-user' });
    
    const systemMsg = messages.find(m => m.role === 'system');
    
    // Should include cross-branch reference
    expect(systemMsg.content).toContain('跨分支引用');
    expect(systemMsg.content).toContain('PostgreSQL');
  });
});
```

#### 4.8.3 验收脚本

**文件**: `tools/scripts/acceptance/verify_p2_branch_summary.sh`

```bash
#!/bin/bash
# Verify P2 Branch Summary functionality

set -e

echo "=== P2 Branch Summary Verification ==="

# 1. Check database schema
echo "1. Checking branch_summaries table..."
psql "${PG_DSN:?PG_DSN is required}" -c "\\d branch_summaries" || {
  echo "❌ branch_summaries table not found"
  exit 1
}

echo "2. Checking branch_references table..."
psql "$PG_DSN" -c "\\d branch_references" || {
  echo "❌ branch_references table not found"
  exit 1
}

# 2. Test branch summary generation (API call)
echo "3. Testing branch summary generation..."
# NOTE: 需要新增验收端点（建议挂在 ACCEPT_DEV_ENDPOINTS=1 下）
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8000}"
RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/dev/p2/branch-summary" \
  -H "Content-Type: application/json" \
  -d '{
    "tree_id": "test-tree",
    "branch_nodes": ["node1", "node2", "node3"]
  }')

echo "$RESPONSE" | jq -e '.summary.overview' || {
  echo "❌ Branch summary generation failed"
  exit 1
}

# 3. Test cross-branch reference detection
echo "4. Testing cross-branch reference detection..."
RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/dev/p2/cross-branch-detect" \
  -H "Content-Type: application/json" \
  -d '{
    "user_text": "Back to the PostgreSQL discussion",
    "current_branch_id": "branch-b",
    "tree_id": "test-tree"
  }')

echo "$RESPONSE" | jq -e '.references' || {
  echo "❌ Cross-branch detection failed"
  exit 1
}

echo "✅ All P2 verifications passed"
```

### 4.9 迁移计划

#### 4.9.1 部署步骤

```
阶段 1: 数据库迁移（停机窗口：5 分钟）
    1.1 备份数据库
        $ pg_dump "$PG_DSN" > backup_pre_p2.sql
    
    1.2 执行迁移脚本
        $ psql "$PG_DSN" -f api/db/migrations/YYYYMMDD_p2_branch_summaries.sql
    
    1.3 验证表结构
        $ psql "$PG_DSN" -c "\\d branch_summaries"

阶段 2: 代码部署（默认禁用）
    2.1 部署代码
        $ git pull origin main
        $ npm install
    
    2.2 设置环境变量（禁用 P2）
        $ export BRANCH_SUMMARY_ENABLED=0
    
    2.3 重启服务
        $ pm2 restart omytree-api

阶段 3: 回填历史数据（可选，后台任务）
    3.1 运行回填脚本（异步）
        $ node tools/scripts/backfill_branch_summaries.js
    
    3.2 监控进度
        $ tail -f logs/backfill_branch_summaries.log

阶段 4: 灰度启用
    4.1 启用 P2（内部测试账号）
        $ export BRANCH_SUMMARY_ENABLED=1
        $ export BRANCH_SUMMARY_TEST_USER_IDS="user1,user2"
        $ pm2 restart omytree-api
    
    4.2 观察 24 小时，检查:
        - 分支摘要生成成功率
        - 跨分支引用检测准确率
        - LLM 调用成本
    
    4.3 扩大灰度范围
        - 50% 用户（48 小时）
        - 100% 用户（全量）

阶段 5: 全量启用
    $ unset BRANCH_SUMMARY_TEST_USER_IDS
    $ pm2 restart omytree-api
```

#### 4.9.2 回滚计划

```
紧急回滚:
    $ export BRANCH_SUMMARY_ENABLED=0
    $ pm2 restart omytree-api
    
系统自动退化为标准 branch scope，不影响现有功能。

完全回滚（包括数据库）:
    $ psql "$PG_DSN" -c "DROP TABLE IF EXISTS branch_references CASCADE;"
    $ psql "$PG_DSN" -c "DROP TABLE IF EXISTS branch_summaries CASCADE;"
    $ psql "$PG_DSN" < backup_pre_p2.sql
```

#### 4.9.3 成本与性能评估

| 因素 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 摘要生成 | 每 5 轮新增调用 1 次 | 使用 `gpt-4o-mini` 降低成本 |
| 数据库存储 | 新增 2 张表 | 索引优化，定期清理旧数据 |
| 语义检索延迟 | 每次对话 +50-100ms | Embedding 缓存（P1 已实现） |
| 分支识别计算 | 递归查询开销 | 缓存分支结构，增量更新 |

**预估成本**（假设 OpenAI gpt-4o-mini）：
- 分支摘要生成：每 15 轮生成 1 次，输入 ~3000 tokens，输出 ~500 tokens
- 成本：$0.15/1M input + $0.60/1M output → $0.00075/摘要
- 月成本（10万分支更新）：$75

### 4.10 监控与指标

#### 4.10.1 关键指标

| 指标 | 类型 | 说明 | 告警阈值 |
|------|------|------|----------|
| `branch_summary.generation_count` | Counter | 分支摘要生成次数 | - |
| `branch_summary.generation_latency_ms` | Histogram | 生成摘要的耗时 | P99 > 5000ms |
| `branch_summary.generation_errors` | Counter | 生成失败次数 | > 5% |
| `cross_branch.detection_count` | Counter | 跨分支引用检测次数 | - |
| `cross_branch.reference_ratio` | Gauge | 引用命中率（检测到引用的对话比例） | < 5% 可能阈值过低 |
| `branch_summary.avg_turns_per_branch` | Gauge | 每个分支平均轮次 | - |
| `branch_summary.db_size_mb` | Gauge | branch_summaries 表大小 | > 500MB 需清理 |

#### 4.10.2 日志格式

```javascript
// 生成摘要
console.log('[P2:BranchSummary]', {
  action: 'generate',
  branchId,
  nodeCount: turns.length,
  isUpdate: !!existingSummary,
  latencyMs: Date.now() - start,
});

// 跨分支引用
console.log('[P2:CrossBranch]', {
  action: 'detect',
  sourceBranchId: currentBranchId,
  referencedBranches: references.map(r => ({
    id: r.branchId,
    score: r.score.toFixed(2),
  })),
  detectionType: references[0]?.referenceType,
});

// 错误
console.error('[P2:BranchSummary] Error:', {
  action: 'generate',
  branchId,
  error: err.message,
  stack: err.stack,
});
```

#### 4.10.3 数据分析查询

```sql
-- 1. 分支摘要生成统计
SELECT 
  DATE(created_at) AS date,
  COUNT(*) AS summary_count,
  AVG(node_count) AS avg_nodes,
  SUM(total_tokens) AS total_tokens
FROM branch_summaries
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY date
ORDER BY date DESC;

-- 2. 跨分支引用分析
SELECT 
  reference_type,
  COUNT(*) AS reference_count,
  AVG(confidence_score) AS avg_confidence
FROM branch_references
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY reference_type;

-- 3. 热门分支（被引用最多）
SELECT 
  br.referenced_branch_id,
  bs.summary->>'overview' AS branch_topic,
  COUNT(*) AS reference_count
FROM branch_references br
JOIN branch_summaries bs ON bs.branch_id = br.referenced_branch_id
WHERE br.created_at > NOW() - INTERVAL '30 days'
GROUP BY br.referenced_branch_id, bs.summary
ORDER BY reference_count DESC
LIMIT 10;

-- 4. 长期未更新的分支摘要
SELECT 
  branch_id,
  summary->>'overview' AS topic,
  node_count,
  updated_at,
  NOW() - updated_at AS age
FROM branch_summaries
WHERE updated_at < NOW() - INTERVAL '30 days'
ORDER BY updated_at ASC
LIMIT 20;
```

#### 4.10.4 性能仪表盘

建议在 Grafana 或类似工具中创建：

1. **分支摘要面板**
   - 生成频率（次/小时）
   - 平均耗时（P50, P95, P99）
   - 错误率

2. **跨分支引用面板**
   - 检测成功率
   - 引用分布（显式 vs 语义）
   - Top 10 被引用分支

3. **存储与成本面板**
   - 数据库表大小增长
   - LLM 调用成本（按天/周/月）
   - Token 消耗统计

---

## 五、P3 阶段：提示词缓存 (Prompt Caching)

### 5.1 背景与问题

#### 5.1.1 当前成本分析

在典型的 LLM 对话中，每次请求都会发送**完整的上下文**：

```
每次 API 调用包含:
  - System Prompt (固定，~500 tokens)
  - Tree Summary (缓慢变化，~800 tokens)
  - Rolling Summary (P0，每 5 轮更新，~600 tokens)
  - Branch Summaries (P2，偶尔变化，~400 tokens)
  - Recent Turns (P1 选择，变化频繁，~1000 tokens)
  - User Question (每次不同，~100 tokens)
  ----------------------------------------
  Total: ~3400 tokens per request
```

**问题**：前 4 项（System Prompt + 摘要）占 **~2300 tokens (68%)**，但它们变化缓慢，却在每次请求中重复发送。

#### 5.1.2 成本浪费场景

**场景 1：连续对话**

```
用户连续问 10 个问题:
  Request 1: System (500) + Tree (800) + Rolling (600) + ... = 3400 tokens
  Request 2: System (500) + Tree (800) + Rolling (600) + ... = 3400 tokens  ← 重复
  Request 3: System (500) + Tree (800) + Rolling (600) + ... = 3400 tokens  ← 重复
  ...
  Request 10: ...

总输入 tokens: 34,000
实际变化部分: 仅 Recent Turns + User Question (~11,000 tokens)
浪费: 23,000 tokens (68%)
```

**场景 2：Tree Summary 未变化**

```
Tree Summary 每 10 轮更新一次（P0）:
  在这 10 轮中，Tree Summary 内容完全相同
  → 重复发送 10 次
  → 浪费 8000 tokens
```

**场景 3：高频用户**

```
BYOK 用户（Max profile）每天对话 100 次:
  每次请求 ~5000 tokens (Max profile)
  其中固定/缓慢变化部分: ~3500 tokens
  → 每天浪费 350,000 tokens
  → 月成本取决于“输入单价 × 重复输入占比”
  → 使用缓存后可显著降低重复输入（不同厂商的折扣/计费方式不同，见 5.1.3）
```

#### 5.1.3 行业解决方案

本节仅记录“与实现强相关、且已由官方文档确认”的部分；所有价格/折扣均可能随时间变化，建议以官方文档为准并在上线前做一次快照校验。

**Anthropic Prompt Caching**（官方能力）：
- **机制**：在消息内容块上标记 `cache_control`，由 SDK/HTTP 层建立缓存边界（显式控制）。
- **生命周期**：默认 **5 分钟**（每次使用刷新）；支持 **1 小时**（需显式指定）。
- **计费关键点**（以“基础输入 token 单价”为基准）：  
  - 5 分钟缓存：**cache write = 1.25×**，**cache read = 0.1×**  
  - 1 小时缓存：**cache write = 2×**，**cache read = 0.1×**

**OpenAI Prompt Caching**（官方能力）：
- **机制**：默认自动启用（通常**无需改代码**），对 **≥ 1024 tokens** 的长提示更容易命中。
- **可控项**：可用 `prompt_cache_key` 提高跨请求复用；部分模型支持 `prompt_cache_retention`（如 `in_memory` / `24h`）。
- **可观测**：响应 `usage.prompt_tokens_details.cached_tokens` 可直接看到“命中缓存”的 token 数。

**Google Gemini Context Caching**（官方能力）：
- **机制**：区分 **Implicit caching（自动）** 与 **Explicit caching（显式、可控、可保证节省）**。
- **生命周期**：Explicit caching 默认 TTL **1 小时**（可配置）。
- **计费关键点**：通常包含“缓存写入/读取”与“缓存存储（按 token×时间）”两部分，且随模型不同而不同（见官方 pricing）。

### 5.2 解决方案概述

#### 5.2.1 核心策略

为不同变化频率的上下文部分应用**分层缓存策略**：

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: System Prompt (从不变化)                       │
│   - Cache TTL: 永久（直到代码更新）                      │
│   - 缓存命中率: ~99%                                     │
│   - 节省: ~500 tokens/request                           │
├─────────────────────────────────────────────────────────┤
│ Layer 2: Tree Summary (每 10 轮更新)                    │
│   - Cache TTL: 5 分钟（Anthropic）/ 自动（OpenAI）      │
│   - 缓存命中率: ~85%                                     │
│   - 节省: ~800 tokens/request                           │
├─────────────────────────────────────────────────────────┤
│ Layer 3: Rolling Summary (每 5 轮更新，P0)              │
│   - Cache TTL: 5 分钟                                   │
│   - 缓存命中率: ~75%                                     │
│   - 节省: ~600 tokens/request                           │
├─────────────────────────────────────────────────────────┤
│ Layer 4: Branch Summaries (按需加载，P2)                │
│   - Cache TTL: 5 分钟                                   │
│   - 缓存命中率: ~60%                                     │
│   - 节省: ~400 tokens/request (when present)            │
├─────────────────────────────────────────────────────────┤
│ Layer 5: Recent Turns (每次变化，P1)                    │
│   - 不缓存（变化频繁）                                   │
├─────────────────────────────────────────────────────────┤
│ Layer 6: User Question (每次不同)                       │
│   - 不缓存                                               │
└─────────────────────────────────────────────────────────┘
```

#### 5.2.2 缓存边界定义

**Anthropic 实现**（显式控制）：

```javascript
const messages = [
  {
    role: 'system',
    content: [
      { type: 'text', text: systemPrompt },
      { type: 'text', text: treeSummary },
      { 
        type: 'text', 
        text: rollingSummary,
        cache_control: { type: 'ephemeral' }  // ← 缓存边界
      }
    ]
  },
  { role: 'user', content: userQuestion }
];
```

**OpenAI 实现**（自动缓存，无需显式边界标记）：

```javascript
// OpenAI Prompt Caching 通常自动生效（≥1024 tokens 更容易命中）
// 可选：使用 prompt_cache_key / prompt_cache_retention 提升复用与可控性（模型支持情况以官方文档为准）

const messages = [
  { role: 'system', content: systemPrompt },
  { role: 'system', content: treeSummary },
  { role: 'system', content: rollingSummary },
  { role: 'user', content: `${recentTurns}\n\n${userQuestion}` },
];

const response = await openai.responses.create({
  model: 'gpt-5', // 示例
  prompt_cache_key: cacheKey,             // optional
  prompt_cache_retention: 'in_memory',    // optional
  input: messages,
});

const cachedTokens = response.usage?.prompt_tokens_details?.cached_tokens || 0;
```

### 5.3 缓存策略设计

#### 5.3.1 缓存内容哈希

为避免缓存污染（不同树/用户的上下文混淆），使用**内容哈希**：

```javascript
import crypto from 'crypto';

function computeCacheKey(content) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(content))
    .digest('hex')
    .slice(0, 16);  // 前 16 字符足够
}

// 示例
const systemCacheKey = computeCacheKey({
  type: 'system',
  content: systemPrompt,
  version: '4.0',  // 代码版本
});

const treeCacheKey = computeCacheKey({
  type: 'tree_summary',
  treeId: tree_id,
  content: treeSummary,
  updatedAt: tree.summarized_at,
});
```

**用途**：
- 日志记录：追踪缓存命中/未命中
- 调试：识别缓存失效原因
- 监控：统计缓存效率

#### 5.3.2 缓存失效策略

```
失效条件:
  1. TTL 过期（取决于 provider/retention：5 分钟/1 小时/24 小时等）
  2. 上下文内容变化:
     - Tree Summary 更新（P0 触发）
     - Rolling Summary 更新（P0 触发）
     - Branch Summary 更新（P2 触发）
  3. System Prompt 变化（代码部署）

处理:
  - 自动创建新缓存
  - 旧缓存自然过期（按 provider TTL）
  - 不需要显式清理
```

### 5.4 代码实现规格

> **现状核对**：当前仓库未发现 `prompt_cache.js` 或提示词缓存的请求拼装逻辑。
> 已落地部分仅包含 **Gemini 缓存指标采集**。

**已存在模块**：`api/services/llm/gemini_cache_metrics.js`

```javascript
export function recordGeminiCacheUsage({ model, usage }) {
  // usage.cachedTokens -> cache_hits_total / cached_tokens_total
}
```

**拟新增模块**（规划）：`api/services/llm/prompt_cache.js`
- 负责不同厂商（Anthropic/OpenAI/Gemini）的缓存边界构建
- 生成缓存键与命中指标
- 与 `callChat` 调用链集成

### 5.5 配置参数

#### 5.5.1 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PROMPT_CACHING_ENABLED` | `1` | 是否启用提示词缓存 (`0` 禁用) |
| `PROMPT_CACHE_MIN_TOKENS` | `1024` | 启用缓存的最小 token 数（OpenAI 要求） |
| `PROMPT_CACHE_TIMESTAMP_ROUNDING_MIN` | `5` | 时间戳规范化间隔（分钟） |
| `PROMPT_CACHE_ENABLE_METRICS` | `1` | 是否记录缓存指标 |

### 5.6 集成点

#### 5.6.1 与 P0/P1/P2 的协同

P3 是 **横向增强**，不改变上下文内容，只优化传输效率：

```
Context Building (P0 + P1 + P2):
  buildContextMessages()
    ↓
  contextLayers = {
    system: "...",
    treeSummary: "...",         ← P0 生成
    rollingSummary: "...",      ← P0 生成
    crossBranch: "...",         ← P2 生成
    recentTurns: "...",         ← P1 选择
    userQuestion: "..."
  }
    ↓
P3: Prompt Caching:
  applyCaching(contextLayers)
    ↓
  {
    system: [
      { text: system },
      { text: treeSummary },
      { text: rollingSummary, cache_control: {...} }  ← 缓存边界
    ],
    messages: [
      { role: 'user', content: recentTurns + userQuestion }
    ]
  }
    ↓
LLM API Call
```

### 5.7 测试方案

**单元测试**：`api/tests/prompt_cache.test.js`
- 测试缓存键生成一致性
- 测试时间戳规范化
- 测试Anthropic/OpenAI缓存结构构建
- 测试缓存指标提取

**集成测试**：`api/tests/prompt_cache_integration.test.js`
- 测试实际LLM调用中的缓存效果
- 验证第二次调用缓存命中

**验收脚本**：`tools/scripts/acceptance/verify_p3_prompt_cache.sh`
- 检查环境变量配置
- 测试Anthropic缓存工作
- 测试OpenAI缓存工作

### 5.8 成本效益分析

#### 5.8.1 成本对比（以 Anthropic 5 分钟缓存为例）

为避免“价格快照过期”导致误导，本节使用 **可验证的官方计费倍数**（见 5.1.3），用变量表示基础单价。

**场景**：Standard Profile，连续请求 10 次  
假设每次输入 3400 tokens，其中可缓存前缀 2300 tokens（system + summaries），不可缓存输入 1100 tokens；输出 500 tokens。

令：
- `P_in` = 基础输入 token 单价
- `P_out` = 基础输出 token 单价
- Anthropic（5 分钟）：`write=1.25×P_in`，`read=0.1×P_in`

**无缓存**：
- Input：`10 × 3400 × P_in`
- Output：`10 × 500 × P_out`

**有缓存**：
- 第 1 次（写入）：`(2300 × 1.25 + 1100) × P_in` + `500 × P_out`
- 第 2-10 次（读取）：`9 × (2300 × 0.1 + 1100) × P_in` + `9 × 500 × P_out`

**仅看输入部分的节省（token 等价）**：
- 无缓存：`3400 × 10 = 34000`
- 有缓存：`(2300×1.25+1100) + 9×(2300×0.1+1100) = 15945`
- 输入节省约 **53.1%**（输出部分不变，整体节省取决于输出占比）

#### 5.8.2 规模化效益（公式）

令：
- `N` = 月请求数
- `C` = 可缓存前缀 tokens
- `U` = 非缓存输入 tokens
- `W/R` = cache write/read 倍数（Anthropic 5 分钟为 1.25 / 0.1）
- `H` = 缓存命中率（0~1）

则输入成本近似：
- 无缓存：`N × (C + U) × P_in`
- 有缓存：`N × U × P_in + N × C × (H×R + (1-H)×W) × P_in`

> 建议用线上真实日志的 token 分布（按 profile / scope / provider 分桶）做回放计算，再把结果写回本节作为“上线时刻快照”。这比写死美元数字更不容易过期。

### 5.9 迁移计划

#### 5.9.1 部署步骤

```
阶段 1: 代码部署（默认禁用）
    1.1 部署代码
        $ git pull origin main && npm install
    
    1.2 设置环境变量（禁用 P3）
        $ export PROMPT_CACHING_ENABLED=0
    
    1.3 重启服务
        $ pm2 restart omytree-api

阶段 2: 灰度测试（Anthropic）
    2.1 启用 Anthropic 缓存（内部测试）
        $ export PROMPT_CACHING_ENABLED=1
        $ export PROMPT_CACHE_PROVIDER_WHITELIST="anthropic"
        $ pm2 restart omytree-api
    
    2.2 观察 24 小时:
        - 缓存命中率 (目标 >70%)
        - API 错误率 (目标 <0.1%)
        - 成本节省 (目标 >25%)
    
    2.3 扩大灰度:
        - 10% BYOK 用户（24 小时）
        - 50% BYOK 用户（48 小时）
        - 100% BYOK 用户

阶段 3: 扩展到 OpenAI
    3.1 启用 OpenAI 缓存
        $ unset PROMPT_CACHE_PROVIDER_WHITELIST
        $ pm2 restart omytree-api
    
    3.2 观察 48 小时
    
    3.3 全量启用

阶段 4: 监控与优化
    4.1 分析缓存命中率
    4.2 调整缓存边界策略
    4.3 优化时间戳规范化
```

#### 5.9.2 回滚计划

```
紧急回滚:
    $ export PROMPT_CACHING_ENABLED=0
    $ pm2 restart omytree-api
    
系统自动降级为标准请求，不影响功能。

已有缓存会在 provider 对应 TTL 内自然过期（5 分钟/1 小时/24 小时等），无需手动清理。
```

### 5.10 监控与指标

#### 5.10.1 关键指标

| 指标 | 类型 | 说明 | 告警阈值 |
|------|------|------|----------|
| `prompt_cache.hit_rate` | Gauge | 缓存命中率 | < 60% |
| `prompt_cache.hit_count` | Counter | 缓存命中次数 | - |
| `prompt_cache.miss_count` | Counter | 缓存未命中次数 | - |
| `prompt_cache.creation_tokens` | Counter | 缓存创建 token 数 | - |
| `prompt_cache.read_tokens` | Counter | 缓存读取 token 数 | - |
| `prompt_cache.savings_percent` | Gauge | 成本节省百分比 | < 20% |
| `prompt_cache.latency_reduction_ms` | Gauge | 延迟减少（毫秒） | - |
| `prompt_cache.error_rate` | Gauge | 缓存相关错误率 | > 1% |

#### 5.10.2 日志格式

```javascript
// 缓存命中
console.log('[P3:PromptCache]', {
  action: 'cache_hit',
  provider: 'anthropic',
  model: '<model>',
  cacheKeys: {
    system: 'abc123...',
    tree: 'def456...',
    rolling: 'ghi789...',
  },
  metrics: {
    cacheReadTokens: 2300,
    inputTokens: 1100,
    savingsPercent: 67.6,
  },
});

// 缓存未命中
console.log('[P3:PromptCache]', {
  action: 'cache_miss',
  provider: 'anthropic',
  reason: 'first_request',  // or 'content_changed', 'ttl_expired'
  cacheCreationTokens: 2300,
});
```

#### 5.10.3 数据分析查询

```sql
-- 说明：当前仓库未存在 llm_request_logs / cache_hit 等字段。
-- 现阶段可用 llm_usage_events 做“输入 token 是否下降”的粗粒度观测；
-- cache hit / cached_tokens 建议走 Prometheus 指标（与 gemini_cache_metrics 同风格）。

-- 1) 输入/输出 tokens（按天、provider、档位）
SELECT
  DATE(created_at) AS date,
  provider,
  context_profile,
  SUM(tokens_input) AS tokens_input,
  SUM(tokens_output) AS tokens_output,
  COUNT(*) AS requests
FROM llm_usage_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY date, provider, context_profile
ORDER BY date DESC, provider, context_profile;

-- 2) 同一 provider 的输入 token 在启用缓存前后对比（需要在灰度时记录启用时间点）
-- 建议：以 feature flag 切换时刻为边界，做分桶对比（这里仅示例结构）
-- SELECT ... WHERE created_at BETWEEN :before_start AND :before_end
-- SELECT ... WHERE created_at BETWEEN :after_start AND :after_end
```

---

### 5.11 2025-2026 研究补充与 oMyTree 树结构化增强

> 本节基于 2025-2026 的“上下文压缩 / 长程记忆 / 缓存”研究与官方实践进行吸收，但**不照搬**传统线性对话记忆。oMyTree 的关键差异在于：上下文不是“一条聊天记录”，而是**树上的空间定位 + 多分支证据链**。

#### 5.11.1 研究要点（与本规格直接相关）

1. **压缩并不等于摘要**：更接近“结构化选择 + 表示压缩 + 检索成功率最大化”。以 CoLoR（ACL 2025）为代表，关注点是“压缩后还能否被正确检索/使用”，而不是“看起来像不像人写的总结”。
2. **递归/循环压缩**：LCIRC（NAACL 2025）等工作强调把压缩作为持续的过程：随着新信息到来，压缩表示会不断被更新，而不是每次从零开始全量摘要。
3. **分段/层级化缓存与复用**：CompLLM（2025）与多厂商 Prompt Caching 的共同点是“把上下文拆成不同变化频率的片段”，让稳定片段复用、让变化片段最小化重传。
4. **评估比算法更重要**：Factory（2025）强调用“压缩前后在任务上的损失”衡量，而不是凭主观感觉。对 oMyTree 来说，这意味着要把评估做成树结构专属：跨分支引用、回到旧节点继续、对比多方案等。

#### 5.11.2 oMyTree 专属策略：Tree-First Context（建议）

**核心目标**：让用户在树上“随时跳转/对比/回溯”时，AI 的记忆表现像人类专家一样稳定：  
能记住关键结论（不会忘事），能抓住当前分支重点（听得懂话），能跨分支联想（专家联想），并且尽量快且省（又快又省）。

**A. 把“树结构资产”纳入上下文堆栈（现有能力可复用）**

当前仓库/数据库已存在与“钉住/回顾/产出”相关的资产，可作为 Tree-First Context 的硬锚点层：
- `keyframes`：用户显式钉住的节点（最强信号，优先级高于任何语义排序）
- `memos`：增量 memo（天然适配“滚动摘要”的长期记忆形态）
- `outcomes`：结构化产出/结论（非常适合作为跨分支引用的“短答案来源”）

**建议新增/对齐的上下文层（按优先级从高到低）**：

```
Layer 0 (Hard Anchors): Keyframes / Outcomes / User-pinned notes
Layer 1 (Tree Story): tree_summary（全树概况，scope=tree）
Layer 2 (Path Background): path_summary（空间定位）
Layer 3 (Core Facts): parent_summary / parent_full_text（就近事实）
Layer 4 (Rolling Memory): rolling_summary（P0：线性线程的长期记忆）
Layer 5 (Cross-Branch): cross_branch summaries（P2：仅在需要时注入）
Layer 6 (Recent Dialogue): P1 语义选择后的近期对话
Layer 7 (User Input): 当前问题
```

> 这套层级的关键点是：**树上的“硬锚点”先于一切**。这能把 UX 原则中的“钉住”从 UI 口号落到上下文算法里。

**B. 分支权重与路径偏置（Branch-Weighted Packing）**
- **用户感知**：AI 更懂“你此刻在这条分支上要解决什么”，而不是把整棵树混在一起。
- **实现建议**：在候选片段打分里加入结构项：  
  `score = semantic + recency + structural_distance + user_signal`  
  其中 `user_signal` 来自 pin/keyframe、收藏、最近活跃路径等；`structural_distance` 来自“与当前路径的距离/最近公共祖先深度”。

**C. 子树语义回捞（Subtree Semantic Recall）**
- **触发**：检测到用户显式/隐式在做跨分支对比（例如出现“另一个分支/对比/之前方案”）。
- **策略**：先用 `summary_text`（branch_summaries）做粗排，再对 topK 做精排与“邻域扩展”（取命中摘要的前后关键节点/关键帧）。

**D. 分支差异摘要（Branch Delta Summary）**
- **用户感知**：对比多方案时回复更短、更聚焦差异。
- **实现建议**：在同时注入 2 个分支摘要时，额外生成一个 `delta_summary`（可同步生成或异步缓存），结构为：`common_ground` / `A_only` / `B_only` / `decision_tradeoffs`。

**E. 树结构化评估（建议加入验收与持续监控）**

把评估做成 tree-native 的脚本/数据集，而不是通用聊天 benchmark：
- **回溯题**：在同一路径上隔 N 层后回问早期关键信息（检验 P0/rolling）
- **对比题**：在分支 B 中要求对比分支 A 的结论（检验 P2/cross-branch）
- **重启题**：从旧节点继续生成新分支（检验“继承的长期记忆”是否串线）
- **噪声题**：中间插入无关闲聊/长文本（检验 P1 语义选择的抗噪）

指标建议：
- Recall@K（关键锚点是否被包含）
- Cross-branch hit rate（跨分支引用是否命中正确分支）
- Context build latency（组装耗时）
- Token-in reduction（输入 token 是否下降）

#### 5.11.3 落地路线建议（PM 分期）

| 目标 | 用户价值 | 推荐阶段 |
|------|----------|----------|
| **“钉住就记住”** | Keyframes/Outcomes 作为硬锚点进入上下文（强可控） | P0.1（可并行，低风险） |
| **“不会忘事”** | 滚动摘要（P0）形成长期记忆 | P0 |
| **“听得懂话”** | 语义选择（P1）持续迭代（加入混合评分/邻域扩展） | P1（Live/Iterating） |
| **“专家联想”** | 分支摘要 + 跨分支引用（P2），并支持 delta summary | P2（Growth） |
| **“又快又省”** | 多厂商 Prompt Caching（P3），减少重复输入 | P3（Optimization） |

## 附录 A：术语表

| 术语 | 定义 |
|------|------|
| Rolling Summary | 滚动摘要，对早期对话轮次的增量压缩（P0） |
| Buffer | 缓冲区，未被压缩的最近对话轮次 |
| Node | 树节点，一条消息（role+text），数据库 `nodes` 的一行 |
| Turn | 本文语境中 turn ≈ 一条消息（同 Node）；历史资料可能把 user+assistant 视为一轮 |
| TurnPair | 一次问答对（user + assistant），仅用于示例讨论 |
| Incremental Compression | 增量压缩，仅对新增内容进行摘要并合并 |
| Semantic Selection | 语义选择，基于相似度而非时间选择对话轮次（P1） |
| Hybrid Scoring | 混合评分，结合语义相关性和时间近度的排序策略 |
| Branch Summary | 分支摘要，对树状对话中每个分支的结构化摘要（P2） |
| Cross-Branch Reference | 跨分支引用，在一个分支中引用另一个分支的内容 |
| Prompt Caching | 提示词缓存，重用 LLM 请求中不变的上下文部分（P3） |
| Cache Control | 缓存控制标记，指示 LLM API 哪些内容应被缓存 |
| Cache Hit | 缓存命中，请求的内容在缓存中找到 |
| Cache Miss | 缓存未命中，需要重新发送完整内容 |
| TTL | Time To Live，缓存的生存时间 |

## 附录 B：参考资料

### 工业实践

1. **Factory.AI - Rolling Summarization**  
   https://factory.ai/news/compressing-context
   - 增量摘要策略
   - “anchored summaries”的工程落地细节

2. **Factory.AI - Evaluating Context Compression for AI Agents**  
   https://factory.ai/news/evaluating-compression
   - 用任务成功率/探针题评估压缩，而不是凭主观“像不像摘要”
   - 对 oMyTree 的启发：评估必须覆盖“跨分支引用/对比/回溯”等树结构场景

3. **Elastic - Context Engineering for Agents**  
   https://www.elastic.co/search-labs/blog/context-engineering-for-agents
   - 分块与邻域扩展（retrieve surroundings）
   - 语义片段拼接的工程经验（K=5 等）

4. **LangChain - Memory Types**  
   https://python.langchain.com/docs/modules/memory/
   - ConversationSummaryBufferMemory
   - 多种记忆类型对比

5. **MemGPT / Letta - Memory Management**  
   https://docs.letta.com/concepts/archival-memory  
   https://arxiv.org/abs/2310.08560
   - 分层记忆（工作上下文 + 归档记忆）
   - 通过检索把长期记忆注入当前上下文

6. **RAGFlow - Parent-Child Chunking / Context Window**  
   https://docs.ragflow.io/docs/dev/references/run#parent-child-chunking  
   https://docs.ragflow.io/docs/dev/guides/set_context_window
   - Parent-Child Chunking（检索时关联 parent chunk）
   - 邻域扩展（上/下文、图表等）作为 chunk 语义的一部分

7. **Anthropic - Prompt Caching**  
   https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
   - 官方文档
   - 最佳实践

8. **OpenAI - Prompt Caching**  
   https://platform.openai.com/docs/guides/prompt-caching
   - 自动缓存 + `cached_tokens` 可观测
   - `prompt_cache_key` / `prompt_cache_retention`（模型支持情况以官方为准）

9. **Google - Gemini Context Caching**  
   https://ai.google.dev/gemini-api/docs/caching
   - Implicit caching vs Explicit caching
   - TTL、接口与限制

10. **Google - Gemini API Pricing（Context caching）**  
   https://ai.google.dev/gemini-api/docs/pricing
   - 缓存写入/读取/存储的计费规则（按模型区分）

### 学术论文

11. **Lost in the Middle: How Language Models Use Long Contexts**  
   Liu et al., 2023  
   https://arxiv.org/abs/2307.03172
   - 长上下文使用问题

12. **Compress, Then Prompt: Improving Prompt-based LLMs with Text Compression**  
   Wingate et al., 2023
   https://arxiv.org/abs/2305.11150
   - 上下文压缩技术

13. **Efficient Long Context Language Model Retrieval with Compression (CoLoR)**  
   Seo et al., ACL 2025  
   https://aclanthology.org/2025.acl-long.740/
   - 以“检索成功率”为目标的压缩训练思路（压缩必须服务于可用性）

14. **LCIRC: A Recurrent Compression Approach to Long Context LLM Inference**  
   NAACL 2025  
   https://aclanthology.org/2025.naacl-long.524/
   - 查询相关、迭代式压缩：更接近“持续更新的长期记忆”

15. **Pretraining Context Compressor for Large Language Models with Embedding-Based Memory**  
   ACL 2025  
   https://aclanthology.org/2025.acl-long.1394/
   - “压缩表示 + 记忆检索”的组合思路（对树结构的启发：把子树当作可复用片段）

16. **CompLLM: Compression for Long Context Q&A**  
   arXiv 2025  
   https://arxiv.org/abs/2509.19228
   - 分段压缩与复用（与 P3 的“分层缓存”在工程目标上高度一致）

17. **ConMax: Confidence-Maximizing Compression for Chain-of-Thought Reasoning**  
   arXiv 2026  
   https://arxiv.org/abs/2601.04973
   - 自适应压缩预算（对 oMyTree 的启发：压缩强度应随任务/置信度动态调整）

### oMyTree 内部文档

18. **Context v3 Profile and Scope**  
    `docs/context-v3-profile-and-scope.md`
    - 当前上下文系统设计

19. **Context Construction Report**  
    `docs/CONTEXT_CONSTRUCTION_REPORT.md`
    - 上下文构建机制分析

## 附录 C：变更历史

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| v1.6 | 2026-01-24 | Codex | 继续核验修订：修正 3.1.3 行业引用归属（Elastic vs RAGFlow）；更新 Factory/LCIRC/CompLLM/Microsoft 参考链接；修订 P0 验收脚本示例（`PG_DSN` + repo root）；补充术语表（Node/Turn）。 |
| v1.5 | 2026-01-24 | Codex | 校对并重构：修复 5.11 位置与 TOC 锚点；对齐实库/仓库差异（`node_summaries` 列、无 `llm_request_logs`）；P2 全面切换到现有 `trees/nodes` 模型；P3 更新为官方最新缓存机制；扩展 Tree-First Context（`keyframes/memos/outcomes`）与参考资料。 |
| v1.4 | 2026-01-24 | Claude | 深度核验：对齐仓库现状、修正重复内容、补充 2025-2026 研究与树结构专属策略 |
| v1.3 | 2026-01-24 | Claude | 追加 P3 阶段：提示词缓存（规格稿） |
| v1.2 | 2026-01-24 | Claude | 追加 P2 阶段：分支摘要 |
| v1.1 | 2026-01-24 | Claude | 追加 P1 阶段：语义相关性选择 |
| v1.0 | 2026-01-24 | Claude | P0 阶段初稿 |

---

## 最终评审总结 (PM Final Review)

**评审背景**：
作为 oMyTree 产品负责人，我对 Context v4 规格文档进行了深度审计。我们的核心挑战在于：如何在树状非线性空间中，既能让 AI 拥有类似人类的长程记忆，又不因过度复杂的技术架构导致响应迟缓或用户认知断层。

**核心评审结论**：

1. **价值锚点定位**：
   - **P0 (滚动摘要)** 是最基础的体验保障。它必须解决“分支深处对话迷失”的问题。
   - **P2 (跨分支引用)** 是 oMyTree 的杀手级特性。它打破了分支间的孤岛，真正实现了“一棵树就是一个思考整体”的愿景。

2. **UX 风险管控**：
   - **防幻觉机制**：当 AI 自动召回其他分支时，必须明确标注来源。
   - **延迟零容忍**：所有后台摘要计算（Summarization）和嵌入（Embedding）必须与核心响应流（Stream Answer）解耦。

3. **未来演进建议**：
   - 考虑引入 **User-Driven Weighting**。允许用户对某个分支点右键点击“设为核心参考”，从而在算法层面给该分支加权重。

**最终判决**：
✅ **准予执行**。该文档已从纯技术 spec 进化为以用户价值为导向的研发指南。

---

_文档结束。_
