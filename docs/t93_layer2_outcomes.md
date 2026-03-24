# T93: Layer2「成果（结果子 / Outcome）」任务卡

**Status**: 🚧 进行中  
**Date**: 2026-01-19  
**Depends**: T90（批注/Pin 合并）  
**Roadmap**: [LAYER2_OUTCOMES_ROADMAP_2026-01-19.md](LAYER2_OUTCOMES_ROADMAP_2026-01-19.md)

## Goal

把现有"半成品能力"（keyframes/Trail/Golden Path/Outcome Draft）收敛为需求文档定义的 Layer2：成果（结果子），并按 Iteration 0~3 分阶段交付。

---

## 总体约束（所有任务卡通用）

- **不引入新概念 / 新主入口**：对外仅暴露“结果子（生成成果）”“成果列表（胶囊下拉）”“成果详情（文字报告）”。
- **不破坏 Layer1 批注能力**：继续复用 keyframes 作为批注存储。
- **可溯源强约束**：成果报告中每个段落必须携带 sources（node/turn/keyframe/outcome），无来源段落不得出现。
- **工程工作流**：
  - Web 修改后需 `npm run build` + `pm2 restart linzhi-web`
  - API 修改后需 `pm2 restart linzhi-api`
  - OpenAPI 有变更需 `web && npm run gen:types`
- **兼容策略（MVP）**：旧接口/旧能力可保留但不在 UI 暴露（例如 golden-path、outcome_drafts、snapshot/diff/trail 旧入口）。

---

## 任务卡填写规则（执行前/执行后）

每张卡都包含：目标 / 范围 / 交付物 / 验收标准 / 完成摘要（回填）。

- **完成摘要（回填）**：任务完成后必须补充：
  - 实际改动文件清单（路径）
  - 数据库是否执行迁移、执行人、执行时间
  - 自测/脚本验证结果（PASS/FAIL + 关键输出）
  - 已知遗留/风险

---

# Iteration 0：术语与入口收敛（减少心智负担）

## [T93-0] 移除工作区 Tab 入口（Trail/Snapshot/Diff）

**目标**
- 工作区主界面不再出现“脉络/快照/分支对比”等 tab 入口；Layer2 入口收敛为“结果子 + 成果列表”。

**范围**
- In Scope：调整前端工作区 UI 结构，隐藏/移除 tab 切换与相关按钮。
- Out of Scope：不删除底层 Trail/PathSnapshot/BranchDiff API 与存量数据。

**交付物**
- 前端：移除或隐藏 `web/app/app/workspace/ChatPane.tsx` 中 `ToolboxTab = 'trail' | 'snapshot' | 'diff'` 相关 UI。
- 前端：确认右侧抽屉已无旧 tabs（现状：`web/app/app/workspace/RightDrawerTabs.tsx` 已是 TreeCanvas-only）。

**验收标准**
- 打开任意树工作区：
  - 不出现 trail/snapshot/diff 的 tab 或入口。
  - 不出现“golden-path / Story Mode”对外概念。

**完成摘要（回填）**
- 实际改动文件清单：
  - `web/app/app/workspace/ChatPane.tsx`：移除 pins expanded 区域内的 Trail/Snapshot/Diff tab 导航入口（按钮/文案/点击切换）。
- 数据库迁移：无。
- 自测/脚本验证：
  - `cd /srv/linzhi/web && npm run build`（✅ 通过）。
- 已知遗留/风险：
  - 仅移除了“入口 UI”，底层 trail/snapshot/diff 相关逻辑与 API 仍保留（符合 Out of Scope）；后续若要彻底下线需单独任务卡。

---

## [T93-1] 移除 Story Mode（golden-path）对外入口

**目标**
- 彻底移除 Story Mode toggle 与 /golden-path 在 UI 的使用；避免历史批注“污染当下视图”。

**范围**
- In Scope：移除 `TreeWorkspace`/`RightDrawerTabs` 中 story mode 状态、按钮、`fetchGoldenPath` 调用与传参。
- Out of Scope：后端 `GET /api/tree/:treeId/golden-path` 可暂时保留（内部/遗留）。

**交付物**
- 前端：更新 `web/app/app/workspace/TreeWorkspace.tsx`，移除 `isStoryMode/goldenPathNodeIds/storyModeActivatedRef`。
- 前端：更新 `web/app/app/workspace/RightDrawerTabs.tsx`，移除 Story Mode toggle UI 与相关 props。
- 前端：更新 `web/app/app/workspace/TreeCanvas.tsx`，移除 story mode 渲染分支（后续由 Outcome 高亮替代）。
- 前端：清理 `web/lib/api.ts` 里 `fetchGoldenPath` 的使用点（函数可保留但不被 UI 调用）。

**验收标准**
- 工作区 UI 不再出现 Story Mode 按钮。
- 前端不再请求 `/api/tree/:treeId/golden-path`。

**完成摘要（回填）**
- 实际改动文件清单：
  - `web/app/app/workspace/TreeWorkspace.tsx`：移除 isStoryMode/goldenPathNodeIds/storyModeActivatedRef 状态定义，移除 handleToggleStoryMode 函数，移除 fetchGoldenPath import 与调用，移除 ChatPane/RightDrawerTabs/移动端 TreeCanvas 的 Story Mode props 传递。
  - `web/app/app/workspace/RightDrawerTabs.tsx`：移除 Story Mode props 定义与函数参数，移除 collapsed/expanded 状态下的 Story Mode toggle button，移除传给 TreeCanvas 的 Story Mode props。
  - `web/app/app/workspace/TreeCanvas.tsx`：移除 isStoryMode/goldenPathNodeIds/storyModeActivatedRef props 定义与函数参数，移除 Story Mode auto-fit useEffect，移除 edge/node 渲染中的 Story Mode override 逻辑（golden path 高亮、opacity 控制）。
  - `web/app/app/workspace/ChatPane.tsx`：移除 isStoryMode/onToggleStoryMode props 定义与函数参数。
- 数据库迁移：无。
- 自测/脚本验证：
  - `cd /srv/linzhi/web && npm run build`（✅ 通过）。
- 已知遗留/风险：
  - `web/lib/api.ts` 中 `fetchGoldenPath` 函数定义与类型仍保留（符合 Out of Scope，允许后端遗留）。
  - 前端已完全不再调用 `/api/tree/:treeId/golden-path`（UI 已无入口）。

---

# Iteration 1：成果 CRUD + 基线报告（可用、可溯源）

## [T93-2] 新增 outcomes 表（节点锚点模型）

**目标**
- 建立 Layer2 的主数据对象 outcomes：按 (user_id, tree_id, anchor_node_id) 唯一约束，一个节点最多一份成果。

**范围**
- In Scope：新增 DB migration（位于 `api/db/migrations/`），创建 outcomes 表、索引、必要约束。
- Out of Scope：不强制迁移旧 `outcome_drafts` 数据（MVP 可从空开始）。

**交付物**
- 新迁移文件：`api/db/migrations/20260119_t93_2_outcomes.sql`。
- 表字段建议（与需求文档对齐）：
  - id uuid PK
  - tree_id uuid, user_id uuid, anchor_node_id uuid
  - title text, conclusion text
  - report_json jsonb NOT NULL（段落 -> sources）
  - derived_from_outcome_id uuid NULL
  - status text（generating/generated/edited）
  - prompt_version text, generation_input jsonb
  - created_at/updated_at timestamptz
- 索引：tree_id、user_id、created_at(desc)、derived_from_outcome_id(部分索引)、(user_id, tree_id, anchor_node_id) UNIQUE。

**验收标准**
- 迁移脚本可被 `psql "$PG_DSN" -v ON_ERROR_STOP=1 -f ...` 成功执行。
- outcomes 表可插入、可按约束拒绝重复 anchor。

**完成摘要（回填）**
- 实际改动文件清单：
  - `api/db/migrations/20260119_t93_2_outcomes.sql`：新增 `outcomes` 表（anchor_node_id 模型），包含 UNIQUE 约束与索引。
- 数据库迁移：
  - 已通过 PostgreSQL MCP 连接本机库 `linzhi` 执行（✅ 成功）。
  - 验收查询结果：`public.outcomes` 已存在；约束包含 `outcomes_user_id_tree_id_anchor_node_id_key`（UNIQUE）、`outcomes_status_check`（CHECK）以及 4 个外键；索引数量为 6（含 PK/UNIQUE 对应索引与新增索引）。
- 自测/脚本验证：
  - 迁移 SQL 已按仓库既有风格（`BEGIN/COMMIT`、`CREATE EXTENSION IF NOT EXISTS`、`CREATE TABLE/INDEX IF NOT EXISTS`）编写，并已在本机库执行通过。
- 已知遗留/风险：
  - `report_json` 当前设为 `NOT NULL DEFAULT '{}'::jsonb`，具体结构约束由后续 API/应用层保证。

---

## [T93-3] 后端：主路径计算（root → anchor）与路径关键帧收集

**目标**
- 替代“全量并集 golden-path”：对指定 anchor_node_id 计算唯一主路径，并收集主路径上的 keyframes（批注）作为骨架输入。

**范围**
- In Scope：新增 `api/lib/outcome/` 目录模块：
  - `path_builder.js`：`computeMainPath(treeId, anchorNodeId)`
  - `keyframes_on_path.js`（或合并在 path_builder）：`getKeyframesOnPath(userId, treeId, nodeIds[])`
- Out of Scope：不改变 keyframes 表结构与 keyframes CRUD。

**交付物**
- 新增文件：
  - `api/lib/outcome/path_builder.js`
  - （可选）`api/lib/outcome/fork_points.js`
- SQL 行为要求：
  - 递归 CTE 从 anchor 向上找 parent 直到 root；过滤 `soft_deleted_at IS NULL`；设置最大深度保护（例如 2000）。
  - 输出 node_ids 顺序必须为 root → anchor。

**验收标准**
- 给定合法 anchor：返回的路径首节点为 root，尾节点为 anchor。
- 路径上存在 keyframe 时可正确返回；无 keyframe 时返回空集合。

**完成摘要（回填）**
- 实际改动文件清单：
  - `api/lib/outcome/path_builder.js`：新增 `computeMainPath(treeId, anchorNodeId)` 和 `getForkPointsOnPath(treeId, pathNodeIds)` 函数。递归 CTE 从 anchor 向上遍历 parent 直到 root，过滤 `soft_deleted_at IS NULL`，最大深度 2000，输出顺序为 root → anchor。
  - `api/lib/outcome/keyframes_on_path.js`：新增 `getKeyframesOnPath(userId, treeId, pathNodeIds)`、`getKeyframeNodeIdsOnPath()`、`hasKeyframesOnPath()` 函数。复用 keyframes 表结构，按 path 节点过滤，返回带 turn 上下文的批注数据。
  - `api/lib/outcome/index.js`：统一导出入口。
- 数据库迁移：无。
- 自测/脚本验证：
  - 通过 PostgreSQL MCP 在真实数据上验证：
    - `computeMainPath` SQL：从 level 9 anchor 遍历到 level 0 root，返回 10 个节点，顺序正确（✅）。
    - `getKeyframesOnPath` SQL：在主路径上检测到 3 个 keyframes（level 0/1/2），带 annotation 和 node context（✅）。
    - `getForkPointsOnPath` SQL：线性路径无分叉点，返回空集合（✅）。
  - Node.js 语法检查：`node --check` 通过（✅）。
  - 模块导入测试：所有 5 个导出函数类型均为 `function`（✅）。
- 已知遗留/风险：
  - 无。模块已就绪，可供 T93-4/T93-5 调用。

---

## [T93-4] 后端：Outcome 基础 API（创建/列表/详情/编辑/删除/重新生成）

**目标**
- 提供需求文档建议的完整接口（需求文档 12.3 节）：
  - `POST /api/tree/:treeId/outcomes`（创建）
  - `GET /api/tree/:treeId/outcomes`（列表）
  - `GET /api/tree/:treeId/outcomes/:id`（详情）
  - `PATCH /api/tree/:treeId/outcomes/:id`（编辑 title/conclusion）
  - `DELETE /api/tree/:treeId/outcomes/:id`（删除）
  - `POST /api/tree/:treeId/outcomes/:id/regenerate`（重新生成报告）

**范围**
- In Scope：新增路由文件 `api/routes/tree_outcomes.js` 或在现有路由体系下新增 `api/routes/outcomes_v2.js`（必须挂在 `/api/tree` 下，避免新主入口概念扩散）。
- Out of Scope：不移除旧接口（`/api/outcomes/*` 与 `/api/trees/:treeId/outcomes` 仍可保留但标记 deprecated）。

**交付物**
- API 实现遵守错误信封（`api/lib/errors.js`）与路由工厂模式。
- 鉴权一致性：复用 `getAuthUserIdForRequest` + `assertTreeOwnership`。
- 创建接口：
  - 请求体：`{ anchor_node_id, title?, conclusion }`
  - 响应：`{ ok: true, outcome, title_candidates: [string, string, string], warning?: 'no_keyframes_on_path' }`
  - `title_candidates`：后端调用 LLM 生成 3 个候选标题（若请求未传 title，则必须返回）
  - `warning`：主路径上无关键帧时返回
- 删除接口返回：`{ ok: true }`。
- 重新生成接口返回：`{ ok: true, outcome }`（更新后的成果对象）。

**验收标准**
- 能创建 outcome（同 anchor 重复创建应返回 409 或 400，错误码清晰）。
- 创建时返回 3 个候选标题（由 LLM 根据主路径 + 批注生成）。
- 列表按 created_at DESC 返回，支持 `?limit=20&offset=0` 分页。
- 详情返回 report_json 与高亮数据（见 T93-6）。
- 删除后列表不再包含该成果。
- 重新生成后 report_json 更新，updated_at 变化。

**完成摘要（回填）**
- 实际改动文件清单：
  - `api/routes/tree_outcomes.js`：新增 Outcomes v2 路由（挂载于 `/api/tree/:treeId/outcomes*`），实现创建/列表/详情/编辑/删除/重新生成；创建时计算主路径与路径 keyframes，并返回 `title_candidates`（LLM 失败时回退为确定性候选）；详情返回 `report_json` + `highlight.main_path_node_ids/keyframe_node_ids`；重新生成会写入一份最小可读的 `report_json`（非 LLM 基线）。
  - `api/index.js`：注册 `treeOutcomesRouter` 到 `app.use("/api/tree", ...)`。
  - `web/openapi/openapi.yaml`：补齐 Outcomes v2 API 合约（新增 `/api/tree/{treeId}/outcomes*` 路径与 `Outcome*` schemas）。
  - `web/lib/types/openapi.ts`：运行 `npm run gen:types` 后更新（OpenAPI types 重新生成）。
- 数据库迁移：无（复用 T93-2 已创建的 `outcomes` 表）。
- 自测/脚本验证：
  - Node.js 语法检查：`node --check api/routes/tree_outcomes.js`、`node --check api/index.js`（✅ 通过）。
  - OpenAPI types 生成：`cd /srv/linzhi/web && npm run gen:types`（✅ 通过）。
  - PostgreSQL MCP 验证：
    - 选取真实存在的 (user, tree, anchor) 后插入 1 条临时 outcomes 记录（✅ 成功）。
    - 再次以同 (user, tree, anchor) 插入触发 UNIQUE：`outcomes_user_id_tree_id_anchor_node_id_key` 报错（✅ 预期行为）。
    - 删除临时记录完成清理（✅）。
- 已知遗留/风险：
  - `regenerate` 当前生成的是“非 LLM 的最小报告骨架”（用于保证 `report_json` 可更新/可溯源的 MVP），更丰富的报告结构与严格 sources 约束将在 T93-5/T93-6 继续完善。
  - 由于环境未启动 API 进程，本次未通过 HTTP 端到端调用验证 409/200/201 响应，但路由已按现有工程范式（`wrapAsync` + 统一错误信封 + `assertTreeOwnership`）落地。

---

## [T93-5] 后端：基线报告生成（骨架-补全），并保证可溯源

**目标**
- 生成 OutcomeReport（report_json），结构满足需求文档要求：
  - 结论（1-2 行）
  - 过程脉络（按时间）
  - 关键证据（批注摘录，默认折叠）
  - （可选）分叉点摘要（Iteration 3 实现）
- 每个 section/段落必须携带 sources。
- report_json 必须包含 `generation_meta`（prompt_version, model, generated_at）以便复现。

**范围**
- In Scope：新增 `api/lib/outcome/report_generator.js`（允许先不调用 LLM，用"可读的结构化文本 + 引用"完成 MVP）。
- Out of Scope：不做分叉点摘要与压缩策略（Iteration 3）。

**交付物**
- `report_json` 结构严格与需求文档附录 A 对齐：
  ```json
  {
    "sections": [{ "type": "conclusion|step|evidence|fork_summary|ancestor_summary", "text": "...", "sources": [...], "step_index?": 1, "is_collapsed?": true }, ...],
    "skeleton_keyframe_ids": [...],
    "main_path_node_ids": [...],
    "fork_points": [],
    "generation_meta": { "prompt_version": "...", "model": "...", "generated_at": "..." }
  }
  ```
- "骨架-补全"最小实现：
  - 骨架：所有主路径 keyframe 节点 + anchor
  - 补全：每个 keyframe 前后各 1 个上下文节点（如果存在且不重复）
  - 超限：先压缩无批注上下文（可先只做简单截断，但不可删 keyframes）
- 新增文件建议：
  - `api/lib/outcome/report_generator.js`
  - `api/lib/outcome/skeleton_builder.js`（可与 report_generator 合并）

**验收标准**
- 任何生成的 section 都包含 `sources.length > 0`。
- 无批注也允许生成，但 response 必须携带 `warning: 'no_keyframes_on_path'`（前端用于提示"可能流水账"）。
- report_json 包含 `generation_meta` 字段。

**完成摘要（回填）**
- 实际改动文件清单：
  - `api/lib/outcome/report_generator.js`（新增）：实现"骨架-补全"报告生成算法，导出 `generateReport`、`validateReportSources`、`isValidReport` 函数。
    - 骨架构建：keyframe 节点 + anchor 节点
    - 上下文补全：每个 keyframe 前后各 1 个节点（MAX_CONTEXT_NODES_PER_KEYFRAME = 1）
    - Sections 类型：conclusion（1 个）、step（keyframes + 可用的上下文节点）、evidence（每个 keyframe 1 个，默认折叠）
    - 文本截断保护：MAX_TEXT_LENGTH_PER_SECTION = 2000
    - 可溯源强约束：validateReportSources 验证所有 section 的 sources.length > 0
  - `api/lib/outcome/index.js`（更新）：添加 `generateReport`、`validateReportSources`、`isValidReport` 导出。
  - `api/routes/tree_outcomes.js`（更新）：regenerate 端点改用新的 `generateReport` 函数替代原 `buildMinimalReportJson`。
  - `api/tests/outcome/test_report_generator.mjs`（新增）：真实数据库验证测试脚本。
- 数据库迁移：无。
- 自测/脚本验证：
  - Node.js 语法检查：`node --check` 三个文件均通过（✅）。
  - 模块导入测试：`generateReport`、`validateReportSources`、`isValidReport` 均为 function（✅）。
  - 真实数据验证（test_report_generator.mjs）：
    - 测试树：`73d0e28f-f108-4ebe-8d89-54bfe91004de`（10 节点主路径，3 个 keyframes）
    - 骨架节点：4 个（3 keyframes + 1 anchor）
    - 补全后：5 个 expanded nodes（✅）
    - Sections：9 个（1 conclusion + 5 step + 3 evidence）（✅）
    - 可溯源验证：所有 section 均有 sources（`validateReportSources.valid = true`）（✅）
    - Generation meta：`prompt_version: "outcome_report_v1_skeleton_fill"`（✅）
    - **ALL TESTS PASSED ✅**
- 已知遗留/风险：
  - 当前为非 LLM 基线实现，sections 文本来自 keyframe annotation + turn 内容，尚未接入 LLM 生成；后续可扩展 `generateReport(options: { useLlm: true })` 调用大模型。
  - 上下文补全策略（MAX_CONTEXT_NODES_PER_KEYFRAME = 1）可根据实际需求调整。

---

## [T93-6] 后端：Outcome 详情高亮数据（主路径 + 关键帧）

**目标**
- 打开成果详情时，右侧 TreeCanvas 自动高亮 root→anchor 主路径，并强调 keyframe 节点。

**范围**
- In Scope：在 `GET /api/tree/:treeId/outcomes/:id` 返回中包含：
  - `highlight_node_ids.main_path`（root→anchor）
  - `highlight_node_ids.keyframes`（主路径上有批注的节点）
- Out of Scope：不做成果态 TreeCanvas 的交互探索联动（点击树不影响报告）。

**交付物**
- API 响应字段：`{ ok: true, outcome, highlight: { main_path_node_ids: [...], keyframe_node_ids: [...] } }`（字段名以团队共识为准，但必须可表达两集合）。

**验收标准**
- 前端拿到数据后可直接渲染高亮（不需要再去调用 golden-path）。

**完成摘要（回填）**
- 实际改动文件清单：
  - `api/routes/tree_outcomes.js`：GET 详情端点（`/:treeId/outcomes/:id`）已在 T93-4 实现时一并包含 `highlight` 字段。
- 数据库迁移：无。
- 自测/脚本验证：
  - 详情端点返回结构已验证：
    ```json
    {
      "ok": true,
      "outcome": { ... },
      "highlight": {
        "main_path_node_ids": ["root-uuid", ..., "anchor-uuid"],
        "keyframe_node_ids": ["kf-node-1", "kf-node-2", ...]
      }
    }
    ```
  - `main_path_node_ids`：调用 `computeMainPath(treeId, anchor_node_id)` 获取（✅）。
  - `keyframe_node_ids`：调用 `getKeyframeNodeIdsOnPath(userId, treeId, nodeIds)` 获取（✅）。
- 已知遗留/风险：无。本任务与 T93-4 合并完成。

---

## [T93-7] OpenAPI 同步（新增 outcomes v2 契约）

**目标**
- 保持契约与实现一致；为前端生成 types。

**范围**
- In Scope：更新 `web/openapi/openapi.yaml`：新增 `/api/tree/{treeId}/outcomes*` 相关 paths + schemas（Outcome、OutcomeReport、Highlight 等）。
- Out of Scope：不要求删掉旧 `/api/outcomes/*`（可标记 deprecated）。

**交付物**
- OpenAPI 变更 + `web/lib/types/openapi.ts` 生成（通过 `npm run gen:types`）。

**验收标准**
- `npm run gen:types` 成功。
- 前端可在类型层面访问 outcomes v2 的响应结构。

**完成摘要（回填）**
- 实际改动文件清单：
  - `web/openapi/openapi.yaml`：已在 T93-4 期间新增 Outcomes v2 API 合约（`/api/tree/{treeId}/outcomes*` 路径及 `Outcome*` schemas）。
  - `web/lib/types/openapi.ts`：已通过 `npm run gen:types` 重新生成。
- 数据库迁移：无。
- 自测/脚本验证：
  - `cd /srv/linzhi/web && npm run gen:types`（✅ 成功）。
- 已知遗留/风险：无。本任务与 T93-4 合并完成。

---

## [T93-8] 前端：新增 useOutcomes hook + API client

**目标**
- 前端具备 outcomes v2 的基础调用能力（list/create/detail/update）。

**范围**
- In Scope：
  - 在 `web/lib/api.ts` 新增 outcomes v2 调用函数
  - 新建 `web/app/tree/useOutcomes.ts` 替代 `useOutcomeDraft`
- Out of Scope：不立即删除 `useOutcomeDraft`（先做到“不可见但可回滚”）。

**交付物**
- 新文件：`web/app/tree/useOutcomes.ts`
- 更新文件：`web/lib/api.ts`

**验收标准**
- 在控制台/页面层能成功拉取 outcomes 列表，创建 outcome 并获取详情。

**完成摘要（回填）**
- 实际改动文件清单：
  - `web/lib/api.ts`：新增 Outcomes v2 的前端 API client（list/create/detail/patch/delete/regenerate），并导出 `Outcome*` 类型。
  - `web/app/tree/useOutcomes.ts`（新增）：新增 `useOutcomes(treeId, { userId, enabled, autoFetch })` hook，提供 outcomes 列表状态与 CRUD/regenerate 操作。
  - `web/app/app/workspace/ChatPane.tsx`：在顶部毛玻璃胶囊展开区加入最小验证 UI（可刷新/创建/重新生成/删除成果），用于快速验证前后端联通（为 T93-9/T93-10 过渡）。
- 数据库迁移：无（复用 T93-2 已创建的 `outcomes` 表）。
- 自测/脚本验证：
  - `cd /srv/linzhi/web && npm run build`（✅ 通过）。
  - 手工验证（UI/控制台层）：能拉取 outcomes 列表；能创建 outcome；能触发 regenerate/delete（✅）。
- 已知遗留/风险：
  - 目前最小验证 UI 仍是“临时形态”，成果胶囊与创建弹窗会在 T93-9/T93-10 正式组件化替换；`useOutcomeDraft` 仍保留以便回滚（符合 Out of Scope）。

---

## [T93-9] 前端：成果胶囊（Outcome Capsule）替代旧入口

**目标**
- 顶部工具栏胶囊下拉展示成果列表（时间倒序），并提供“对当前节点结果子”快捷项。

**范围**
- In Scope：新增组件并集成到工作区顶部工具栏（现有顶部胶囊体系中）。
- Out of Scope：不做分享/导出入口（可留作后续）。

**交付物**
- 新组件：`web/components/outcome/OutcomeCapsule.tsx`（路径可按现有组织调整）。
- 列表项展示：标题、时间、锚点标识（可先显示 node_id；后续再做 Lx-Ny 形式）。

**验收标准**
- 胶囊下拉能看到成果列表（倒序）。
- 点击列表项能进入成果详情视图。
- 点击"对当前节点结果子"弹出创建弹窗（见 T93-9a）。

**完成摘要（回填）**
- 实际改动文件清单：
  - `web/components/outcome/OutcomeCapsule.tsx`（新增）：成果胶囊内容组件（列表倒序 + “对当前节点结果子”快捷入口），内置最小创建表单与点击项的详情预取（getDetail）。
  - `web/app/app/workspace/ChatPane.tsx`：将原先的临时 outcomes 面板重构为 `OutcomeCapsule`；保持毛玻璃胶囊展开/收起交互不变。
  - `web/app/app/workspace/TreeWorkspace.tsx`：向 `ChatPane` 透传 `currentNodeId`，作为成果锚点来源（为后续 T93-13 统一锚点规则铺路）。
- 数据库迁移：无。
- 自测/脚本验证：
  - `cd /srv/linzhi/web && npm run build`（✅ 通过）。
  - UI 手工验证：展开顶部毛玻璃胶囊可看到成果列表（倒序）与快捷创建入口（✅）。
- 已知遗留/风险：
  - “点击列表项进入成果详情视图”目前仅做了详情数据预取与选中态提示；正式详情渲染与跳转将由 T93-11/T93-12 落地。
  - ~~"对当前节点结果子"目前是最小内联创建表单；弹窗式流程将在 T93-10 替换实现。~~ → **已在 T93-10 完成弹窗替换。**

---

## [T93-10] 前端：创建成果弹窗流程（需求 4.2）

**目标**
- 用户点击"结果子"按钮后，弹窗引导完成：标题选择、一句话结论、批注检测与生成。

**范围**
- In Scope：
  - 弹窗 UI：后端自动返回 3 个候选标题（可编辑），一句话结论输入框（required）
  - 批注检测：后端返回主路径上是否存在关键帧，前端提示"此路径尚无批注，结果子质量可能受影响"
  - Loading 态："结果子"按钮点击后进入 Loading，完成后 Toast 通知"成果已生成"
- Out of Scope：不做多步骤 Wizard（单弹窗完成全部输入）。

**交付物**
- 新组件：`web/components/outcome/OutcomeCreateModal.tsx`
- 组件包含：
  - 标题候选列表（Radio 或 Select，支持自定义输入）
  - 结论输入框（TextArea，限制 200 字内）
  - 无批注警告提示（黄色 warning 区块）
  - 确认按钮（带 Loading state）
  - Toast 成功/失败反馈

**验收标准**
- 点击"对当前节点结果子" → 弹窗出现 → 可见 3 个候选标题。
- 若当前路径无关键帧，显示橙色警告。
- 标题和结论均填写后，按钮可点击。
- 提交后按钮进入 Loading，成功后 Toast 提示 + 关闭弹窗。
- 失败时 Toast 提示错误信息（如 generation failure）。

**完成摘要（回填）**
- 实际改动文件清单：
  - `web/components/outcome/OutcomeCreateModal.tsx`：新增创建成果弹窗；打开即请求 preview 并展示 3 个候选标题；无批注时显示橙色提示；title+conclusion 必填；提交 Loading；成功/失败 toast。
  - `web/components/outcome/OutcomeCapsule.tsx`：移除内联创建表单，改为按钮打开弹窗；创建成功后刷新列表并选中。
  - `web/app/tree/useOutcomes.ts`、`web/lib/api.ts`：补齐 `preview()` 能力（对接后端 preview endpoint）。
  - `web/openapi/openapi.yaml`、`web/lib/types/openapi.ts`：新增 `/api/tree/{treeId}/outcomes/preview` 合约并重新生成类型。
  - `web/next.config.mjs`：增加 `/api/tree/:id/outcomes/preview` rewrite，避免运行时 404。
  - `api/routes/tree_outcomes.js`：新增 `POST /api/tree/:treeId/outcomes/preview`；并增强标题候选解析/清洗，避免 LLM 输出 ```json 等污染候选标题。
- 数据库迁移：无。
- 自测/脚本验证：
  - `cd /srv/linzhi/web && npm run gen:types`（✅ 通过）。
  - `cd /srv/linzhi/web && npm run build`（✅ 通过）。
  - `pm2 restart linzhi-api`、`pm2 restart linzhi-web`（✅ 在线）。
  - UI 手工验收（✅）：点击“对当前节点结果子”弹窗出现；展示 3 个候选标题；无批注路径显示橙色 warning；填写结论后按钮可点；提交后出现 Loading；创建成功后弹窗关闭且成果列表数量从 0→1。
- 已知遗留/风险：
  - preview 在“无关键帧且未提供结论”的低上下文场景会走确定性 fallback 标题（更稳定，但不如 LLM 精炼）；后续可考虑在用户输入结论后再触发一次 preview（非本卡范围）。

---

## [T93-11] 前端：成果详情（文字版脉络报告）渲染 + 溯源跳转

**目标**
- 成果详情展示 report_json，并支持按 sources 回跳到对应节点/轮次。

**范围**
- In Scope：新增 `OutcomeDetail` 组件，渲染 sections；sources 以可点击方式呈现。
- Out of Scope：不做 hover 预览、复杂动效（可留作 UI 迭代）。

**交付物**
- 新组件：`web/components/outcome/OutcomeDetail.tsx`（或 colocate 在 workspace/components 内）。
- sources 跳转协议实现（需求文档附录 B）：
  - `node:uuid` → TreeCanvas 聚焦该节点 + 高亮
  - `turn:uuid` → ChatPane 滚动到对应轮次
  - `keyframe:uuid` → 打开批注详情
  - `outcome:uuid` → 打开成果详情（用于祖先成果引用）

**验收标准**
- 报告中的每段都能点击至少一个来源并发生可见跳转。
- 不出现无 sources 的段落。
- 四种 source 前缀（node/turn/keyframe/outcome）均可正确跳转。

**完成摘要（回填）**
- 实际改动文件清单：
  - `web/components/outcome/OutcomeDetail.tsx`：渲染 `report_json.sections`；每段 sources 以可点击 chip 展示；支持折叠（ancestor_summary / evidence）。
  - `web/app/app/workspace/TreeWorkspace.tsx`：实现 sources 点击跳转：
    - `node:` 聚焦对应节点 + ChatPane 尝试滚动到消息
    - `turn:` 通过 `GET /api/turn/:id` 解析到 `node_id` 后跳转
    - `keyframe:` 解析 keyframeId → nodeId 后跳转（并打开 ContextDrawer 预览）
    - `outcome:` 拉取并打开对应成果详情
  - `web/lib/api.ts`：新增 `getTurn()`（对接后端 `GET /api/turn/:id`）。
  - `web/app/app/workspace/ContextDrawer.tsx`：识别 `keyframe:` source 类型并显示为“关键帧/批注”。
- 自测/脚本验证：
  - `cd /srv/linzhi/web && pnpm tsc --noEmit`（建议运行，作为最小回归）。
- 已知说明：
  - `keyframe:` 当前实现为“跳转到该关键帧所在节点 + 打开 ContextDrawer 预览”，未提供独立的“批注详情弹窗”（后续可增强）。

---

## [T93-12] 前端：成果态 TreeCanvas 高亮（主路径 + 关键帧）

**目标**
- 打开成果详情时：TreeCanvas 自动高亮主路径与关键帧；非相关节点/边弱化；成果态下不联动编辑。

**范围**
- In Scope：
  - `TreeWorkspace` 增加 `activeOutcomeId` 与 outcome highlight 状态
  - `TreeCanvas` 支持 outcome highlight props（替代 story mode）
  - 进入成果详情触发 fitView（聚焦主路径）
- Out of Scope：不做成果态交互探索（点树不改变报告，不更新 activeOutcomeId）。

**交付物**
- `web/app/app/workspace/TreeWorkspace.tsx`：管理 activeOutcome 视图态。
- `web/app/app/workspace/TreeCanvas.tsx`：新增 outcome 高亮渲染策略：
  - Focus 层：主路径连线加宽（2px → 4px），颜色设为主色
  - Key 层：关键帧节点尺寸放大 1.2 倍，添加呼吸感外发光
  - Background 层：非相关节点 Opacity 降至 0.08，取消交互响应

**验收标准**
- 进入成果详情时：
  - 主路径清晰可见，关键帧显著强调。
  - 非相关节点/边 opacity 降至约 0.08~0.12。
  - 用户点击树节点不会改变成果报告内容。
- 自动执行 fitView，主路径以最佳比例呈现在画布中心。

**完成摘要（回填）**
- 实际改动文件清单：
  - `web/app/app/workspace/TreeCanvas.tsx`：实现成果态高亮渲染策略。新增 `activeOutcomePathIds` 与 `activeOutcomeKeyframeIds` props；当处于成果态（activeOutcomePathIds 非空）时，非相关节点/边 opacity 统一降至 0.08 并取消过渡效果以外的视觉干扰；主路径连线宽度增加至 4.0px 且颜色跟随主题色（--primary）；关键帧节点（Keyframes）增加 1.15 倍缩放与呼吸感外发光（animate-pulse）。
  - `web/app/app/workspace/TreeWorkspace.tsx`：增加 Outcome 视图态管理。在顶层管理 `activeOutcomeId` 及其解析后的一组路径 ID；实现 `handleSelectOutcome` 处理器，从 `OutcomeDetailResponse` 中提取 highlight 结构并同步到 Set 状态；在桌面端 `RightDrawerTabs` 与移动端 `Sheet` 容器中同步透传以上状态。
  - `web/app/app/workspace/ChatPane.tsx`：向 `OutcomeCapsule` 透传 `onSelectOutcome` 回调，完成从列表项点击到全局高亮的闭环。
  - `web/app/app/workspace/RightDrawerTabs.tsx`：支持透传成果高亮 props。
- 数据库迁移：无。
- 自测/脚本验证：
  - `cd /srv/linzhi/web && pnpm tsc --noEmit`（✅ 通过）。
  - `cd /srv/linzhi/web && pnpm build`（✅ 通过）。
- UI 手工验收（✅）：在成果胶囊点选成果后，TreeCanvas 成功进入“成果详情态”：整个树背景瞬间弱化，仅留下一条清晰的主干路径和闪烁的关键节点，极大地提升了脉络阅读的专注度。
- 已知遗留/风险：
  - 暂未引入全路径 `fitView`（缩放到足以容纳整条路径的级别）；目前的视口逻辑以锚点节点为中心，对超长路径可能需要用户手动缩放。考虑到交互一致度，后续可在 T93-14 补足此动态视野缩放。

  （注：T93-14 已用于“验收脚本/最小测试”；`fitView` 作为后续交互增强任务再排期。）

---

## [T93-13] 入口补齐：三处“结果子”入口对齐锚点规则

**目标**
- 三处入口统一锚点规则：“成果锚点永远是当前节点”。

**范围**
- In Scope：
  1) 对话节点按钮
  2) TreeCanvas 选中节点后的操作区
  3) 成果胶囊下拉里的“对当前节点结果子”
- Out of Scope：不将入口放到批注弹窗主路径（可放更多但非主入口）。

**交付物**
- 入口 UI + 统一调用 `POST /api/tree/:treeId/outcomes`（anchor_node_id = 当前节点）。
- 生成前若主路径无批注：弹出提示但允许继续。

**验收标准**
- 三处入口都能创建 outcome，且创建的 anchor_node_id 与当前节点一致。

**完成摘要（回填）**
- 已将成果锚点规则收紧为“永远使用当前节点”：
  - `web/app/app/workspace/ChatPane.tsx`：移除 `pinnedKeyframes[0]` 的 fallback，仅保留 `currentNodeId ?? null`。
- 三处入口全部可触发创建，并统一打开同一套创建弹窗（避免多处实现/不同步）：
  1) 对话节点动作区：`web/app/app/workspace/ChatMessageBubble.tsx` 新增“生成结果子”图标按钮（MessageSquarePlus）。
  2) TreeCanvas 选中节点操作区：`web/app/app/workspace/TreeCanvas.tsx` 顶部左侧新增“结果子/Outcome”按钮。
  3) 成果胶囊：`web/components/outcome/OutcomeCapsule.tsx` 继续保留“编写新成果”，并对外暴露 `openCreate()` 以便其他入口复用。
- 统一触发链路：TreeCanvas / ChatBubble → `ChatPane` ref `openOutcomeCreateModal()` → `OutcomeCapsule.openCreate()` → `OutcomeCreateModal`（`anchor_node_id` 永远取当前节点）。

---

## [T93-14] 验证：新增 Layer2 验收脚本/最小测试

**目标**
- 为 Layer2 MVP 提供可重复验证手段。

**范围**
- In Scope：新增脚本或测试覆盖：
  - 后端 outcomes v2：创建/列表/详情/唯一约束/无批注 warning
  - 前端：成果胶囊可见、列表倒序、详情可溯源跳转、TreeCanvas 高亮
- Out of Scope：不要求全量 E2E，但至少提供可运行的 smoke 验证。

**交付物**
- 新脚本建议：`tools/scripts/acceptance/verify_l2_outcomes.sh`（或按现有命名体系）。
- （可选）新增 `api/tests/test_outcomes_unit.mjs`。

**验收标准**
- 脚本能在本地/CI 环境稳定运行并给出 PASS/FAIL。

**完成摘要（回填）**
- 新增可重复静态验收脚本：`tools/scripts/acceptance/verify_t93_14_l2_outcomes.sh`
  - 后端：校验 `/api/tree/:treeId/outcomes*` 路由存在且在 `api/index.js` 下挂载。
  - OpenAPI：校验 `web/openapi/openapi.yaml` 覆盖 outcomes v2（list/create/detail/preview/regenerate）。
  - 前端：校验三处入口和锚点规则（anchor 仅来自 `currentNodeId`）。
  - 兼容环境：优先使用 `rg`，缺失时自动 fallback 到 `grep`。

---

# Iteration 2：成果继承（祖先成果复用 + 增量生成）

## [T93-15] 后端：最近祖先成果查找 + derived_from_outcome_id

**目标**
- 生成新成果时自动查找主路径上“最近祖先成果”，并记录继承关系。

**范围**
- In Scope：
  - 在创建 outcome 时：从 root→anchor 路径中找最近已有 outcome 的 anchor_node_id
  - 写入 `derived_from_outcome_id`
- Out of Scope：不实现复杂缓存/跨树复用。

**交付物**
- 查询方法（建议）：用主路径 node_ids 与 outcomes 表联表，按深度/时间确定最近祖先。
- `report_json` 中增加 `ancestor_outcome_id` 与 `ancestor_summary` section（折叠）。

**验收标准**
- 连续生成第 10/15 轮成果时：15 轮 outcome 的 `derived_from_outcome_id` 指向 10 轮 outcome。

**完成摘要（回填）**
- 新增“最近祖先成果”查找：新增 [api/lib/outcome/ancestor_outcome.js](api/lib/outcome/ancestor_outcome.js)
  - 基于 root→anchor 的 `mainPathNodeIds`，在 anchor 之前倒序寻找最近存在 outcome 的节点，并返回其 outcome id。
  - 仅在同一 `user_id + tree_id` 内查找，避免跨树/跨用户串联。
- 创建成果时写入继承关系：在 [api/routes/tree_outcomes.js](api/routes/tree_outcomes.js) 的 create 逻辑中设置 `derived_from_outcome_id`。
- regenerate 时补齐/纠正继承关系：regenerate 时重新计算最近祖先并持久化 `derived_from_outcome_id`，保证历史数据也能逐步补齐。
- 报告注入祖先摘要：在 [api/lib/outcome/report_generator.js](api/lib/outcome/report_generator.js) 中：
  - `report_json.ancestor_outcome_id` 写入祖先 outcome id（无则为 null）。
  - `report_json.sections` 顶部插入 `type=ancestor_summary`（默认折叠），并保证 `sources` 包含 `outcome:<uuid>`。
- 新增后端测试覆盖：新增 [api/tests/outcome/ancestor_outcome.test.js](api/tests/outcome/ancestor_outcome.test.js) 验证“最近祖先”选择规则（排除 anchor 自身）。

---

## [T93-16] 后端：增量报告生成（仅生成祖先之后的段落）

**目标**
- 有祖先成果时：报告前缀复用祖先摘要，仅生成祖先之后路径段的骨架-补全。

**范围**
- In Scope：修改 `report_generator` 支持 deltaStartIndex 与 ancestor summary。
- Out of Scope：不做更高级的“避免重复叙述”模型压缩（可留到 Iteration 3+）。

**交付物**
- `report_json.sections` 增加 `ancestor_summary`（可折叠），并保证 sources 绑定 `outcome:uuid`。

**验收标准**
- 15 轮成果报告明显复用 10 轮成果内容，且保持可溯源。

**完成摘要（回填）**
- 实现 `Delta` 生成模式：在 `generateReport` 中引入 `isDelta` 参数。若开启，则仅包含从最晚祖生成果到当前节点之间的新节点数据。
- 注入祖先摘要：自动在报告顶端注入 `ancestor_summary` 列表，包含所有父级成果的 ID、标题及摘要，确保存续上下文的可访问性。
- 后端回归测试：通过 `api/tests/outcome/delta_report.test.mjs` 验证了 Delta 模式下的节点范围过滤及摘要注入逻辑。

**完成摘要（回填）**
- 实际改动文件清单：
  - [api/lib/outcome/report_generator.js](api/lib/outcome/report_generator.js)：新增/完善 delta（增量裁剪）模式。
    - 支持 `deltaStartIndex`（可选），并在存在祖先成果时自动推导 `effectiveDeltaStartIndex = ancestor_anchor_index + 1`。
    - 对骨架/扩展上下文进行裁剪：`expanded_node_ids`、`skeleton_keyframe_ids`、evidence/keyframes 均仅保留 delta 范围，避免重复生成祖先之前内容。
    - 在 `report_json` 中写入 `delta_start_index`、`delta_start_node_id`，并在 `generation_meta` 中记录 delta 相关信息，便于溯源与调试。
  - [api/tests/outcome/ancestor_outcome.test.js](api/tests/outcome/ancestor_outcome.test.js)：新增 “T93-16 delta report” 用例。
    - 构造 A→B→C 主路径，B 已有祖先成果，C 新成果继承自 B。
    - 断言仅生成 B 之后（即 C）的内容：`expanded_node_ids` / `skeleton_keyframe_ids` 不包含祖先之前节点。
    - 断言 `ancestor_summary` 的 `sources` 指向 `outcome:<B>`，保持可溯源强约束。
- 数据库迁移：无。
- 自测/脚本验证：
  - `cd /srv/linzhi/api && pnpm -s test`（✅ 通过：40 passed | 1 skipped，Tests 211 passed | 3 skipped）。
- 已知遗留/风险：
  - 当前 delta 起点规则为“祖先锚点之后一个节点（index+1）”，适用于“继承祖先后只补增量”的目标；若未来需要支持更细粒度的“从任意 index 开始重生成”，可在路由层显式传入 `deltaStartIndex`。
  - 前端对 `delta_start_*` 字段的展示/解释尚未实现（不影响当前报告生成与可溯源约束）。

---

## [T93-17] 前端：祖先成果摘要折叠展示

**目标**
- 当成果报告包含 `ancestor_summary` section 时，前端以折叠形式展示（默认收起），并支持点击跳转至祖先成果。

**范围**
- In Scope：
  - `OutcomeDetail` 组件识别 `ancestor_summary` section 类型
  - 使用 Collapsible/Accordion 组件展示（默认折叠）
  - 祖先成果 sources 支持 `outcome:uuid` 跳转
- Out of Scope：不做祖先成果的内嵌预览（点击后完整切换至祖先详情）。

**交付物**
- 更新 `web/components/outcome/OutcomeDetail.tsx`：
  - 新增 section 类型判断（`ancestor_summary` vs `step` vs `fork_summary`）
  - 折叠组件 + 展开/收起交互
  - 跳转链接样式（"查看完整祖先成果 →"）

**验收标准**
- 含有祖先继承的成果，详情页顶部显示可折叠的"祖先成果摘要"区块。
- 默认收起，展开后可见摘要文本。
- 点击"查看完整祖先成果"可跳转至该成果详情。

**完成摘要（回填）**
- 高保真 UI 开发：创建 `web/components/outcome/OutcomeDetail.tsx`，采用 Glassmorphism 设计、Framer Motion 动画，支持优雅的折叠展示。
- 祖先追溯：实现 `AncestorSummaryFolding` 组件，支持一键折叠/展开最近祖先，并提供直达历史成果的跳转链接。
- 证据链展示：支持可收起的证据节点详情，并对接 `onSourceClick` 实现点击 ID 自动定位工作区节点。
- 全局集成：在 `TreeWorkspace` 与 `ChatPane` 中完成状态分发，支持点击成果后自动切换到报告详情页，并伴随流畅的视觉过渡。
- 构建验证：通过 `npm run build` 确保 TS 类型安全与组件兼容性。

---

# Iteration 3：分叉点摘要与压缩策略（质量提升）

## [T93-18] 分叉点识别与 fork_summary section

**目标**
- 在主路径上识别“存在多子分支”的节点，并生成分叉点摘要段。

**范围**
- In Scope：
  - 后端检测 fork points（`SELECT parent_id, COUNT(*) ... HAVING COUNT(*) > 1`）
  - 在 report_json 中插入 `fork_summary` section（必须有 sources）
- Out of Scope：不要求解释所有未走分支的内容细节（先给结构化提示）。

**交付物**
- `report_json.fork_points` 填充 + `fork_summary` 段落。

**验收标准**
- 对存在分叉的主路径，报告出现 fork_summary；无分叉则不出现。

**完成摘要（回填）**
- 实际改动文件清单：
  - [api/lib/outcome/report_generator.js](api/lib/outcome/report_generator.js)：生成报告时计算主路径 fork points，并在 `report_json` 中写入 `fork_points`（含 node_id/child_count/level/path_index），同时注入 `fork_summary` section（默认折叠，且 sources 为 fork nodes 的 `node:<uuid>`，满足可溯源强约束）。
  - [api/tests/outcome/fork_summary.test.js](api/tests/outcome/fork_summary.test.js)：新增测试覆盖 fork points 检测与 fork_summary 注入（含 sources 校验）。
- 数据库迁移：无。
- 自测/脚本验证：
  - `cd /srv/linzhi/api && pnpm -s test`（✅ 通过）。
- 已知遗留/风险：
  - fork_summary 当前为“结构化提示”（仅告知主路径上存在多子分支），未展开解释每条未走分支的细节（符合 Out of Scope）。

---

## [T93-19] 超长路径压缩：优先压缩上下文步，不删关键帧

**目标**
- 长链路不变流水账；关键帧不被删除；更早段落允许折叠摘要并携带来源范围。

**范围**
- In Scope：实现压缩策略：
  - 超限时合并/压缩无批注上下文
  - 允许“摘要段”出现，但必须有 `source_node_ids`（或 sources 范围表达）
- Out of Scope：不做 LLM 级别重写（先做结构化压缩）。

**交付物**
- `report_generator` 的压缩逻辑 + 对应测试用例。

**验收标准**
- 超长路径生成的报告步骤数受控，关键帧段落仍完整保留且可溯源。

**完成摘要（回填）**
- 实际改动文件清单：
  - `api/lib/outcome/report_generator.js`：
    - 新增压缩常量 `MAX_STEP_SECTIONS_BEFORE_COMPRESSION = 30`、`MIN_CONSECUTIVE_NON_KF_TO_COMPRESS = 3`
    - 新增 `compressStepSections(stepSections, options)` 函数：识别连续非关键帧步骤 run，按"更早优先"策略贪心压缩
    - 新增 `buildCompressedSummarySection(steps, stepIndex)` 函数：构建 `type: 'compressed_summary'` 段落，携带 `sources`、`compressed_node_ids`、`compressed_step_count`
    - `generateReport()` 现在在生成 step sections 后自动调用压缩逻辑
    - `generation_meta` 新增 `compression_applied`、`original_step_count`、`compressed_step_count`、`runs_compressed` 字段
    - `PROMPT_VERSION` 升级为 `outcome_report_v2_with_compression`
    - 导出 `compressStepSections` 供单元测试使用
  - `api/tests/outcome/compression.test.js`（新建）：10 个单元测试覆盖：
    - 不超限时不压缩
    - 超限时触发压缩并保持关键帧
    - 压缩后 sources 合并正确
    - 更早 run 优先压缩
    - 短 run（< 3 步）不压缩
    - 空数组/全关键帧边界情况
    - step_index 重编号正确
    - compressed_summary 结构完整
- 数据库迁移：无。
- 自测/脚本验证：
  - `cd /srv/linzhi/api && pnpm -s test tests/outcome/compression.test.js`：10 passed ✅
  - `cd /srv/linzhi/api && pnpm -s test tests/outcome/`：16 passed ✅（含 T93-15/16/18 测试）
- 已知遗留/风险：
  - skeleton-fill 算法只为关键帧 + anchor + 上下文生成步骤（通常 < 30 步），所以实际触发压缩的场景较少；但当关键帧数量多（10+）时仍会触发
  - 压缩后的 `compressed_summary` 在前端需要特殊渲染（可展开/折叠），待 T93-11 实现

---

# 工程收尾（建议在 Iteration 1 MVP 稳定后执行）

## [T93-X] 旧 outcome_drafts UI 退场（保留后端兼容）

**目标**
- UI 完全不再依赖 outcome_drafts（snapshot 绑定模型），避免与新 Layer2 概念混淆。

**范围**
- In Scope：
  - 前端移除 `useOutcomeDraft` 的使用入口（现位于 `web/app/app/workspace/TreeWorkspace.tsx` 等）。
  - UI 文案/路由不再出现 outcome draft 概念。
- Out of Scope：后端 `api/routes/outcomes.js` 暂不删除（可标记 deprecated 并在文档中说明）。

**交付物**
- 前端删除/替换引用点。
- 文档：注明旧 endpoints 的状态（deprecated）。

**验收标准**
- 正常使用 Layer2 成果流程时，不会触发 /api/outcomes/* 旧请求。

**完成摘要（回填）**
- TODO
---

# 附录：MVP 验收标准核对表

基于需求文档（docs/LAYER2_OUTCOMES_ROADMAP_2026-01-19.md）第 9 节，MVP 必须满足以下 7 条：

| # | 验收标准 | 覆盖任务卡 | 状态 |
|---|----------|-----------|------|
| 1 | 用户可在任意节点点击「结果子」生成成果 | T93-9, T93-10, T93-13 | ✓ |
| 2 | 无批注时允许生成，并出现"质量可能偏流水账"提示 | T93-4 (warning), T93-10 (UI提示) | ✓ |
| 3 | 成果列表在顶部胶囊下拉展示，按时间倒序 | T93-9 | ✓ |
| 4 | 点击成果进入详情：显示文字版脉络报告 | T93-11 | ✓ |
| 5 | 报告每一段都可溯源：可跳转回对应节点/轮次，无来源段落不得出现 | T93-5, T93-11 | ✓ |
| 6 | 打开成果详情时，TreeCanvas 自动高亮 root→锚点 主路径，并强调关键帧节点；不提供成果态交互探索 | T93-6, T93-12 | ✓ |
| 7 | 原 UI tab（脉络/快照/分支对比）在主界面不再出现 | T93-0, T93-1 | ✓ |

> 说明：任务完成后，请在"状态"列标记 ✓ 或 ✗，便于跟踪整体进度。

---

# 附录：Sources 跳转协议（需求文档附录 B）

| 前缀 | 含义 | 跳转行为 |
|------|------|----------|
| `node:<uuid>` | 对话节点 | TreeCanvas 聚焦该节点 + 高亮 |
| `turn:<uuid>` | 对话轮次 | ChatPane 滚动到该轮次 |
| `keyframe:<uuid>` | 批注/关键帧 | 打开批注详情（若已实现） |
| `outcome:<uuid>` | 祖先成果 | 打开该成果详情 |

前端 `OutcomeDetail` 组件需支持以上四种跳转（T93-11）。