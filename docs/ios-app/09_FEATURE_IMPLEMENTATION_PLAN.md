# 09 — 功能实现路线图

> 分阶段交付计划 · MVP → V1.0 → V1.5 → V2.0

---

## 9.1 总体策略

按 **递增式交付** 方式推进，每个阶段结束都是一个可用的 App：

| 阶段 | 目标 | 预估周期 | 核心交付 |
|------|------|---------|---------|
| **Phase 0** | 基础骨架 | 3-5 天 | 项目搭建、网络层、认证 |
| **Phase 1** | MVP | 1-2 周 | 对话流 + 流式渲染 |
| **Phase 2** | V1.0 | 1-2 周 | 分支导航、Keyframes、设置 |
| **Phase 3** | V1.5 | 1-2 周 | Artifacts（Memo/Outcome/Trail）、Knowledge |
| **Phase 4** | V2.0 | 2-3 周 | Tree 可视化、iPad 适配、高级功能 |

---

## 9.2 Phase 0 — 基础骨架 (3-5 天)

### 目标：项目能跑起来，有登录流程，能发 API 请求

| # | 任务 | 优先级 | 依赖 | 涉及文件 |
|---|------|--------|------|---------|
| 0.1 | 创建 Xcode 项目 + 文件夹结构 | P0 | 无 | 整个项目 |
| 0.2 | 实现 `APIConfig` | P0 | 0.1 | `Core/Network/APIConfig.swift` |
| 0.3 | 实现 `KeychainManager` | P0 | 0.1 | `Core/Auth/KeychainManager.swift` |
| 0.4 | 实现 `APIClient`（基础版） | P0 | 0.2 | `Core/Network/APIClient.swift` |
| 0.5 | 实现 `AuthSession` | P0 | 0.3 | `Core/Auth/AuthSession.swift` |
| 0.6 | 实现 `LoginView` | P0 | 0.5 | `Views/Auth/LoginView.swift` |
| 0.7 | 实现 `RegisterView` | P0 | 0.5 | `Views/Auth/RegisterView.swift` |
| 0.8 | 实现 `ContentView`（路由分发） | P0 | 0.5, 0.6 | `ContentView.swift` |
| 0.9 | 定义所有数据模型 (Codable) | P0 | 无 | `Models/*.swift` |
| 0.10 | 添加 SPM 依赖 | P0 | 0.1 | Package.resolved |
| 0.11 | 配置 Info.plist (ATS) | P0 | 0.1 | Info.plist |

**验收标准**：
- [x] 能在模拟器运行
- [x] 登录页能显示
- [x] 注册 → 自动登录 → 跳转主界面
- [x] 邮箱密码登录成功后跳转主界面
- [x] 退出登录回到登录页

---

## 9.3 Phase 1 — MVP (1-2 周)

### 目标：完整的对话体验 — 新建对话、发送消息、实时流式接收 AI 回复

| # | 任务 | 优先级 | 依赖 | 涉及文件 |
|---|------|--------|------|---------|
| 1.1 | `TreeService` — 获取 Tree 列表 | P0 | 0.4 | `Services/TreeService.swift` |
| 1.2 | `TreeListView` — 对话列表 | P0 | 1.1 | `Views/TreeList/TreeListView.swift` |
| 1.3 | `TreeListRow` — 列表行组件 | P0 | 1.2 | `Views/TreeList/TreeListRow.swift` |
| 1.4 | `SSEClient` — SSE 流解析 | P0 | 0.4 | `Core/Network/SSEClient.swift` |
| 1.5 | `TurnService` — 发送 Turn | P0 | 1.4 | `Services/TurnService.swift` |
| 1.6 | `ChatViewModel` | P0 | 1.5 | `ViewModels/ChatViewModel.swift` |
| 1.7 | `ChatView` — 主对话视图 | P0 | 1.6 | `Views/Chat/ChatView.swift` |
| 1.8 | `MessageBubble` — 消息气泡 | P0 | 1.7 | `Views/Chat/MessageBubble.swift` |
| 1.9 | `ComposerView` — 输入框 | P0 | 1.7 | `Views/Chat/ComposerView.swift` |
| 1.10 | `StreamingCursor` — 光标动画 | P1 | 1.8 | `Views/Chat/StreamingCursor.swift` |
| 1.11 | Markdown 渲染 (MarkdownUI) | P0 | 1.8 | `MessageBubble.swift` |
| 1.12 | 新建 Tree (start-root SSE) | P0 | 1.5 | `ChatViewModel.swift` |
| 1.13 | 删除 Tree (左滑删除) | P1 | 1.1 | `TreeListView.swift` |
| 1.14 | Stop Generating (中止流) | P0 | 1.6 | `ChatViewModel.swift` |
| 1.15 | `NodeService` — 获取节点 | P0 | 0.4 | `Services/NodeService.swift` |
| 1.16 | 加载对话历史（path 节点） | P0 | 1.15 | `ChatViewModel.swift` |
| 1.17 | 下拉刷新 Tree 列表 | P1 | 1.2 | `TreeListView.swift` |
| 1.18 | Loading / Empty 状态 | P1 | 1.7 | `Shared/LoadingView.swift` |

**验收标准**：
- [x] 看到所有对话列表
- [x] 点击进入对话，看到历史消息
- [x] 发送新消息，实时看到 AI 流式回复
- [x] 可以中止生成
- [x] 可以新建对话（进入新 Tree）
- [x] 可以删除对话
- [x] Markdown 正确渲染（标题、列表、代码块）

---

## 9.4 Phase 2 — V1.0 (1-2 周)

### 目标：分支、Keyframes、模型选择、设置

| # | 任务 | 优先级 | 依赖 | 涉及文件 |
|---|------|--------|------|---------|
| 2.1 | `BranchIndicator` — 分支切换 | P0 | 1.16 | `Views/Chat/BranchIndicator.swift` |
| 2.2 | 分支导航逻辑 (ChatViewModel) | P0 | 2.1 | `ChatViewModel.swift` |
| 2.3 | `ModelPickerButton` — 模型选择 | P0 | - | `Views/Shared/ModelPickerButton.swift` |
| 2.4 | 获取可用模型列表 | P0 | 2.3 | `Services/AccountService.swift` |
| 2.5 | `KeyframeService` | P1 | 0.4 | `Services/KeyframeService.swift` |
| 2.6 | Keyframe 标记/列表 | P1 | 2.5 | `ChatView.swift` |
| 2.7 | `SettingsView` — 设置页 | P1 | - | `Views/Settings/SettingsView.swift` |
| 2.8 | `AccountView` — 账户信息 | P1 | 0.4 | `Views/Settings/AccountView.swift` |
| 2.9 | 配额显示 (QuotaStatus) | P1 | 2.8 | `AccountView.swift` |
| 2.10 | Tree 重命名 | P1 | 1.1 | `TreeListView.swift` |
| 2.11 | 搜索对话 | P1 | 1.2 | `TreeListView.swift` |
| 2.12 | 编辑用户消息（创建分支） | P1 | 2.2 | `ChatViewModel.swift` |
| 2.13 | `ReasoningView` — 推理过程 | P1 | 1.8 | `Views/Chat/ReasoningView.swift` |
| 2.14 | 国际化 (en + zh-Hans) | P1 | - | `Localization/` |
| 2.15 | Dark Mode 验证 | P1 | - | 所有 Views |
| 2.16 | HapticManager 集成 | P2 | - | 各交互点 |
| 2.17 | Google Sign-In 集成 | P1 | 0.5 | `Core/Auth/GoogleAuthManager.swift` |

**验收标准**：
- [x] 有分支的节点显示 ← 1/3 → 导航器
- [x] 可以切换不同分支查看内容
- [x] 可以选择不同 AI 模型
- [x] 可以标记 Keyframe
- [x] 设置页显示账户信息和配额
- [x] 支持中英文切换
- [x] Dark Mode 正确显示

---

## 9.5 Phase 3 — V1.5 (1-2 周)

### 目标：Artifacts 系统 (Memo/Outcome/Trail)、Knowledge

| # | 任务 | 优先级 | 依赖 |
|---|------|--------|------|
| 3.1 | `MemoService` | P1 | 0.4 |
| 3.2 | `MemoView` — 生成/查看 Memo | P1 | 3.1 |
| 3.3 | `OutcomeService` (v2) | P1 | 0.4 |
| 3.4 | `OutcomeView` — 查看 Outcome | P1 | 3.3 |
| 3.5 | `TrailService` | P1 | 0.4 |
| 3.6 | `TrailView` — 查看 Trail | P1 | 3.5 |
| 3.7 | `KnowledgeService` | P1 | 0.4 |
| 3.8 | `KnowledgeListView` — Knowledge 管理 | P1 | 3.7 |
| 3.9 | Knowledge 文件上传 | P2 | 3.7 |
| 3.10 | PathSnapshot 查看 | P2 | 0.4 |
| 3.11 | BranchDiff 查看 | P2 | 0.4 |
| 3.12 | Tree 导出 (JSON/Markdown) | P2 | - |
| 3.13 | Evidence 管理 | P2 | 0.4 |
| 3.14 | 分享功能 (UIActivityViewController) | P2 | - |

**验收标准**：
- [x] 可以在对话中生成 Memo
- [x] 可以查看 Outcome
- [x] 可以查看 Trail
- [x] 可以浏览 Knowledge 列表
- [x] 可以上传 Knowledge 文件

---

## 9.6 Phase 4 — V2.0 (2-3 周)

### 目标：高级功能、iPad 适配、优化

| # | 任务 | 优先级 | 依赖 |
|---|------|--------|------|
| 4.1 | `TreeMapView` — 树状可视化 | P1 | 1.16 |
| 4.2 | iPad NavigationSplitView 布局 | P1 | 1.2, 1.7 |
| 4.3 | Workspace 多工作区切换 | P2 | 0.4 |
| 4.4 | BYOK (Bring Your Own Key) 设置 | P2 | 2.7 |
| 4.5 | 高级上下文构建配置 | P2 | 2.7 |
| 4.6 | 本地缓存 (离线浏览) | P2 | - |
| 4.7 | Push Notifications | P2 | - |
| 4.8 | Deep Link / Universal Links | P2 | - |
| 4.9 | Widget（锁屏快捷入口） | P3 | - |
| 4.10 | Spotlight 搜索集成 | P3 | - |
| 4.11 | 性能优化 (大量消息) | P1 | - |
| 4.12 | Accessibility 完善 | P1 | - |
| 4.13 | App Store 提交准备 | P0 | 全部 |

---

## 9.7 按文件的实现顺序

建议严格按以下顺序创建文件，每完成一个确保编译通过：

```
Phase 0:
 1. Models/Tree.swift
 2. Models/TreeNode.swift
 3. Models/Turn.swift
 4. Models/SSEEvent.swift
 5. Models/User.swift
 6. Core/Network/APIConfig.swift
 7. Core/Network/APIError.swift
 8. Core/Network/APIClient.swift
 9. Core/Auth/KeychainManager.swift
10. Core/Auth/AuthService.swift
11. Core/Auth/AuthSession.swift
12. Views/Auth/LoginView.swift
13. Views/Auth/RegisterView.swift
14. ContentView.swift

Phase 1:
15. Services/TreeService.swift
16. Views/TreeList/TreeListRow.swift
17. ViewModels/TreeListViewModel.swift  (可选)
18. Views/TreeList/TreeListView.swift
19. Core/Network/SSEClient.swift
20. Services/TurnService.swift
21. Services/NodeService.swift
22. ViewModels/ChatViewModel.swift
23. Views/Shared/LoadingView.swift
24. Views/Shared/EmptyStateView.swift
25. Views/Chat/StreamingCursor.swift
26. Views/Chat/MessageBubble.swift
27. Views/Chat/ComposerView.swift
28. Views/Chat/ChatView.swift

Phase 2:
29. Views/Chat/BranchIndicator.swift
30. Views/Shared/ModelPickerButton.swift
31. Services/KeyframeService.swift
32. Services/AccountService.swift
33. Views/Chat/ReasoningView.swift
34. Views/Settings/SettingsView.swift
35. Views/Settings/AccountView.swift
36. Core/Auth/GoogleAuthManager.swift
37. Core/Utilities/HapticManager.swift
38. Localization/Localizable.xcstrings

Phase 3-4:
39. Models/Keyframe.swift, Memo.swift, Outcome.swift, Trail.swift...
40. Services/MemoService.swift, OutcomeService.swift, ...
41. Views/Artifacts/MemoView.swift, ...
42. Views/TreeVis/TreeMapView.swift
```

---

## 9.8 关键技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| SSE 流在弱网环境断开 | 消息丢失 | 自动重连 + 从断点续传（通过 node_id 判断） |
| 大量消息的 ScrollView 性能 | 卡顿 | 使用 LazyVStack + 分页加载 |
| Liquid Glass 在旧设备不可用 | UI 退化 | 使用标准 SwiftUI 组件，自动退化 |
| Markdown 渲染复杂内容 | 崩溃/卡顿 | 限制单条消息渲染长度，分段显示 |
| NextAuth cookie 不适合原生 App | 无法认证 | ✅ 已解决：`/api/mobile/login` 和 `/api/mobile/google-login` 端点已上线 |
| 树状可视化在移动端体验 | 可用性差 | 小地图 + 内联指示器双模式 |

---

## 9.9 后端配套改动状态

为支持 iOS App，后端已完成以下改动：

| 改动 | 状态 | 说明 |
|------|------|------|
| `POST /api/mobile/login` | ✅ 已完成 | 邮箱密码登录，返回 userId + 用户信息。实现文件：`api/routes/mobile_auth.js` |
| `POST /api/mobile/google-login` | ✅ 已完成 | 验证 Google ID Token，自动注册/查找用户。支持 `google-auth-library` + tokeninfo fallback |
| `GET /api/mobile/me` | ✅ 已完成 | 通过 `x-omytree-user-id` header 获取用户 Profile |
| `POST /api/mobile/refresh-profile` | ✅ 已完成 | 与 `/me` 相同，POST 方式便于主动刷新 |
| `GOOGLE_IOS_CLIENT_ID` 环境变量 | ✅ 已完成 | 在 `ecosystem.config.js` 中配置（待填入实际值） |
| `.well-known/apple-app-site-association` | ✅ 已完成 | Universal Links + 密码自动填充。文件：`web/public/.well-known/apple-app-site-association`（TEAM_ID 待替换） |
| Next.js rewrite for `/api/mobile/*` | ✅ 已完成 | 已在 `web/next.config.mjs` 中添加 fallback rewrite |
| AASA Content-Type header | ✅ 已完成 | 已在 `web/next.config.mjs` 的 `headers()` 中配置 |
| `GET /api/trees` 分页参数 | ✅ 已有 | 已支持 `?limit=&offset=&search=` |
| 健康检查 `GET /readyz` | ✅ 已有 | 已有端点，返回 Postgres/Redis/tree_adapter 状态 |

### 仍需完成的配置

| 配置项 | 说明 |
|--------|------|
| `GOOGLE_IOS_CLIENT_ID` 实际值 | 在 Google Cloud Console 创建 iOS OAuth Client 后填入 `ecosystem.config.js` |
| AASA 文件中的 `TEAM_ID` | 在获取 Apple Developer Team ID 后替换 `web/public/.well-known/apple-app-site-association` |
