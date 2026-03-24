# Layer2 ↔ Layer3 衔接：成果入库（用户视角设计备忘录）

**Status**: Draft  
**Date**: 2026-02-04  
**任务卡（施工/验收）**：`docs/tasks/OUTCOME_ASSET_INTEGRATION_TASKS_2026-02-04.md`  

## 0. 背景：为什么“成果入库”不是锦上添花，而是产品点睛

从用户角度看，oMyTree 的价值不在于“对话更长”，而在于：

- **把发散探索变成可回溯的过程资产（Layer1）**：用户能在任意节点分叉、试错、批注，保留“草稿纸”
- **把噪音收敛成阶段性可交付（Layer2）**：用户明确告诉系统“哪些逻辑值得被保留”
- **把可复用的经验沉淀为长期资产（Layer3）**：以后遇到相似问题，能用检索与推荐快速复用

但现实里，用户的行为有三个“常理约束”：

1. **用户不会为了“未来可能用到”付出大量当下成本**（尤其是学习/研究时已经很累）
2. **用户只在“需要交付/复盘/复用”的时刻才愿意整理**（而不是每一次对话都整理）
3. **用户对 AI 总结天然不信任**，除非能快速回到证据与原上下文（这正是 oMyTree 的优势：sources 可回链）

所以 Layer2↔Layer3 的衔接目标不是“多一个功能”，而是：

> 让用户在“最自然的时刻”用“最小的额外动作”，把“真正有用的阶段成果”沉淀成“以后找得到、信得过、用得上”的资产。

---

## 1. 术语与现状（以用户心智为主）

### 用户心智里的 3 个容器

- **树（Tree / Layer1）**：工作台。用于探索、试错、分叉、记录过程，天然会变乱
- **成果（Outcome / Layer2）**：里程碑。用户认可“这一段探索值得保留”，系统把过程叙事化并可溯源
- **知识库（Knowledge Base / Layer3）**：档案馆。用于长期管理、检索、复用；应当“少而精”

### 当前实现（代码入口）

- Layer2（成果/批注）
  - Web：`web/components/outcome/OutcomeCapsule.tsx`、`web/components/outcome/OutcomeDetail.tsx`、`web/components/outcome/InlineOutcomeCreate.tsx`
  - API：`api/routes/keyframes.js`、`api/routes/tree_outcomes.js`、`api/lib/outcome/*`
  - DB：`api/db/migrations/20260105_keyframe_tables.sql`、`api/db/migrations/20260119_t93_2_outcomes.sql`

- Layer3（知识库/检索）
  - Web：`web/app/app/workspace/KnowledgePanel.tsx`、`web/components/composer/KnowledgeMentionPicker.tsx`、`web/app/app/workspace/ChatPane.tsx`
  - API：`api/routes/knowledge/index.js`、`api/services/knowledge/search_service.js`、`api/routes/turn.js`、`api/services/turn/create.js`
  - Workspace/租户：`api/db/migrations/20260130_p0_workspaces.sql`、`api/services/workspaces/weknora_provisioning.js`

> 现状：用户可以“手动选择知识库/文件参与提问”，但成果（Outcome）还不能一键沉淀为可检索资产，也缺乏版本/去重/治理。

---

## 2. “符合常理”的用户路径（我们要对齐的真实行为）

### 用户什么时候会想“把它存下来”？

高频触发点通常不是“对话中途”，而是：

1. **完成一个阶段性结论**：例如做完一次 ToC、写完方案、明确决策
2. **准备交付**：要发给同事/客户、要写文档、要做复盘
3. **未来要复用**：意识到“这类问题我以后还会遇到”

### 用户希望“存下来”之后带来什么即时收益？

如果入库只是“为了未来”，会很难养成；必须有即时价值，例如：

- **下次提问不用再手动找**：系统默认就能召回相关成果
- **可以分享/协作**：给队友一份“可回链的成果文档”
- **可以复盘**：看到结论背后的关键帧与来源，降低 AI 总结的不可信感

---

## 3. 建议的 MVP（最小闭环，优先满足“有用 + 低负担”）

### MVP-1：一键“同步到知识库”（用户控制，低风险）

**用户故事**
- 作为用户，当我创建成果后，我想一键把它变成知识库里的文档，之后能通过检索复用、并能回到原树复盘。

**交互建议**
- 在成果详情页提供一个主按钮：`同步到知识库`
- 默认目标知识库：workspace 下的“过程资产库”（如不存在，创建一次即可）
- 同步后显示状态：`已入库 · 可更新`（并提供“再次同步/覆盖更新”）

**为什么符合常理**
- 不改变用户原有习惯：先做成果（Layer2），再决定是否入库（Layer3）
- 动作最少：一次点击完成
- 风险可控：用户有明确意图才入库，避免自动塞入大量噪音

### MVP-2：成果文档的“可回链”格式（信任与复盘）

入库内容建议是 **Markdown + 元数据**，并显式保留“回链”：

- outcome_id / tree_id / anchor_node_id
- conclusion（结论）
- report sections（过程叙事，含 sources）
- “打开原成果/打开原树/定位锚点节点”的链接（Web 路由）

> 关键点：知识库文档不是取代树，而是成为“索引与入口”。用户要能一键回到原上下文。

### MVP-3：最小治理：映射与更新

至少需要一个映射，支持：

- **去重**：同一个 outcome 不要重复生成多份文档
- **更新**：Outcome regenerate 后能覆盖/追加更新同一文档
- **删除/撤回**：Outcome 删除或用户撤回入库时能同步删除/禁用文档

---

## 4. 进阶方案（在 MVP 验证后再做）

### A. 低负担召回：默认把“成果库”纳入检索（可开关）

用户最讨厌的是“每次都要手动选库”。更贴近常理的做法是：

- 默认检索：`本树成果`（或 workspace 过程资产库）topK 很小（如 1~3）
- 明确提示引用来源：像现在 citations 一样展示“来自成果资产”
- 提供开关：`本次不使用成果库` / `总是关闭自动召回`

### B. 资产化不等于“全量入库”：用“质量门槛”保护 Layer3

Layer3 的问题永远是噪音。建议把“入库门槛”做成对用户友好的常理规则，例如：

- 只有当 outcome 有 **≥N 个 keyframes** 或用户手动确认“值得沉淀”才允许一键同步
- 对入库文档添加状态：`draft / verified / deprecated`
- 支持“过期提醒”：长期未被召回/引用的资产自动降权

### C. 让成果更像“经验卡片”：结构化字段 + 标签

未来可以把 Outcome 变成可管理的资产对象（类似“经验卡”）：

- problem / context / decision / rationale / evidence / trade-offs / next steps
- tags、owner、scope（个人/团队/项目）

这一步应在验证用户确实愿意“沉淀并复用”之后再做，否则会变成负担。

---

## 5. 从用户角度出发的 3 个关键决策题（替代“内部实现视角”）

1. **用户在哪个时刻最愿意付出一次点击？**
   - 创建成果后？关闭页面前？导出/分享时？还是被系统提醒“这份成果被反复用到”时？

2. **用户对“入库内容”的最低可接受质量是什么？**
   - 只要能回链就行，还是必须有“可直接复用的结论+结构化要点”？是否允许“未验证的草稿资产”进入库？

3. **用户未来“找回并复用”的默认入口是什么？**
   - 通过提问时自动召回？通过知识库搜索？通过成果列表筛选？还是跨树的“成果检索/推荐”？

这三个问题的答案会直接决定：默认行为、UI 入口、以及是否需要强治理/版本机制。

---

## 6. 推荐的实验与度量（用现实校验理论）

为了避免“逻辑自洽但不被使用”，建议以实验驱动：

- **Activation**：创建成果的用户中，有多少人愿意点击一次“同步到知识库”
- **Reuse**：入库后的成果文档在未来 7/30 天内被召回/打开/引用的比例
- **Trust**：用户点击 citations/source 回链的次数（越多越说明“可溯源”有价值）
- **Noise**：知识库召回被用户关闭/投诉“无关”的比例

如果 “同步率低”，优先优化入口时机与默认库策略；如果 “复用率低”，优先优化入库内容结构与检索召回策略。

---

## 7. 建议的实现落点（仅供后续开发定位）

- Web
  - `web/components/outcome/OutcomeDetail.tsx`：加入“同步到知识库/更新/撤回”入口与状态展示
  - `web/components/outcome/InlineOutcomeCreate.tsx`：可选增加“创建后自动同步（本次）”
  - `web/app/app/workspace/KnowledgePanel.tsx`：支持筛选“来自成果”的文档（如用 metadata 标记）

- API
  - `api/routes/tree_outcomes.js`：新增 publish/sync/revoke 端点（或在 outcomes PATCH 中扩展）
  - `api/routes/knowledge/index.js`：复用 `/bases/:id/documents/file` 上传；需要支持传 metadata（Outcome 回链信息）
  - `api/services/knowledge/search_service.js`：未来可对“成果资产库”做召回权重与展示区分

- DB（建议新增）
  - outcome ↔ knowledge document 映射表（用于去重/更新/删除/审计），字段示例：
    - workspace_id, outcome_id, knowledge_base_id, knowledge_document_id, version, synced_at, status
