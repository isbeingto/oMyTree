# Copilot Instructions for oMyTree iOS App

> 这是 AI 编程助手（Cursor / Copilot / Claude）在开发 oMyTree iOS App 时应遵循的规则文件。
> 将此文件放置在 iOS 项目根目录下：`.github/copilot-instructions.md` 或 `.cursorrules`

---

## Project Overview

oMyTree 是一个基于**树状分支对话**的 AI 探索工具。iOS App 是其原生客户端，连接已有的 Express API 后端。

- **平台**: iOS 26+, iPadOS 26+
- **语言**: Swift 6.2
- **框架**: SwiftUI (Liquid Glass), Swift Concurrency
- **构建工具**: Xcode 26, Swift Package Manager
- **最低部署版本**: iOS 26.0

---

## Architecture

采用 **SwiftUI 原生状态管理 + Service 层** 架构（非严格 MVVM）：

```
Views (SwiftUI) → ViewModels (@Observable) → Services → APIClient (actor) → Backend API
```

### Layer Rules

1. **Views**: 纯 UI，不直接调用 API，数据从 `@Environment` 或 ViewModel 获取
2. **ViewModels**: 仅复杂页面使用（ChatView、TreeListView），标记 `@Observable`
3. **Services**: 无状态，封装单个领域的 API 调用，返回 `async throws` 结果
4. **APIClient**: 全局 `actor`，处理认证 header 注入、错误映射、请求构建
5. **Models**: `Codable` structs，字段用 `snake_case` CodingKeys 映射到 camelCase

---

## Critical Coding Conventions

### Swift 6.2 Concurrency

```swift
// ✅ 使用 @Observable (不是 ObservableObject)
@Observable
class ChatViewModel { ... }

// ✅ 使用 @Environment (不是 @EnvironmentObject)
@Environment(AuthSession.self) private var auth

// ✅ APIClient 是 actor
actor APIClient { ... }

// ✅ 使用 AsyncThrowingStream 处理 SSE
func streamTurn(...) -> AsyncThrowingStream<TurnStreamEvent, Error>

// ❌ 不要使用
class MyViewModel: ObservableObject { @Published var ... }  // legacy pattern
```

### API 通信

```swift
// 所有请求必须携带认证 header
request.setValue(userId, forHTTPHeaderField: "x-omytree-user-id")

// JSON 编解码配置
let decoder = JSONDecoder()
decoder.keyDecodingStrategy = .convertFromSnakeCase
decoder.dateDecodingStrategy = .iso8601

let encoder = JSONEncoder()
encoder.keyEncodingStrategy = .convertToSnakeCase

// Base URLs
// Debug:   http://127.0.0.1:8000
// Release: https://www.omytree.com
// API prefix: /api
```

### SSE (Server-Sent Events) Protocol

后端使用 SSE 推送流式响应，解析规则：

```
格式:  data: {"type":"xxx", ...}\n\n
心跳:  : ping\n\n        (每15秒，忽略)
连接:  : connected\n\n    (首次连接确认，忽略)

事件类型:
- "tree"      → Tree 元数据 (新建时)
- "start"     → Turn 开始，含 node_id
- "reasoning" → 推理过程内容（DeepSeek 模型）
- "delta"     → 增量文本 content
- "done"      → 流结束
- "error"     → 错误信息
```

解析方式：使用 `URLSession.bytes(for:).lines`，逐行读取，提取 `data:` 前缀后的 JSON。

### Keychain 存储

```swift
// 敏感数据存 Keychain (Security framework)
// - userId (UUID string)
// - email
// - displayName

// 非敏感偏好存 UserDefaults
// - selectedModelId
// - preferredLanguage
// - currentWorkspaceId
```

---

## File Structure

```
oMyTree/
├── Core/Network/          # APIClient, SSEClient, APIConfig
├── Core/Auth/             # AuthSession, KeychainManager, AuthService
├── Core/Utilities/        # HapticManager, Extensions
├── Models/                # Codable structs (Tree, TreeNode, Turn, etc.)
├── Services/              # TreeService, TurnService, NodeService, etc.
├── ViewModels/            # ChatViewModel, TreeListViewModel
├── Views/Auth/            # LoginView, RegisterView
├── Views/TreeList/        # TreeListView, TreeListRow
├── Views/Chat/            # ChatView, MessageBubble, ComposerView
├── Views/Settings/        # SettingsView, AccountView
├── Views/Shared/          # LoadingView, EmptyStateView, ModelPickerButton
├── Localization/          # Localizable.xcstrings (en, zh-Hans)
└── Resources/             # Assets.xcassets
```

---

## Key API Endpoints

| 动作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| **认证** | | | |
| 邮箱密码登录 | POST | `/api/mobile/login` | 返回 userId + 用户信息 ✅ |
| Google 登录 | POST | `/api/mobile/google-login` | 验证 ID Token ✅ |
| 获取用户信息 | GET | `/api/mobile/me` | 需 x-omytree-user-id header ✅ |
| 刷新用户信息 | POST | `/api/mobile/refresh-profile` | 同 /me ✅ |
| 注册 | POST | `/api/auth/register` | 注册后自动调用 /mobile/login |
| **Tree 操作** | | | |
| Tree 列表 | GET | `/api/trees?user_id=` | 分页 |
| 创建 Tree + 首条消息 | POST | `/api/tree/start-root` | SSE 流 |
| 发送消息 | POST | `/api/turn/stream` | SSE 流 |
| 获取节点 | GET | `/api/tree/:treeId/nodes` | 含完整子节点列表 |
| 获取根路径 | GET | `/api/tree/:treeId/root-path` | 当前分支路径 |
| 删除 Tree | DELETE | `/api/tree/:id?userId=` | |
| 重命名 Tree | PATCH | `/api/tree/:id` | `{ title }` |
| **账户** | | | |
| 获取配额 | GET | `/api/account/quota-status?userId=` | |

---

## Do's and Don'ts

### DO ✅
- 使用 SwiftUI 原生组件，让系统自动应用 Liquid Glass 效果
- 使用 `NavigationStack` 和 enum-based routing
- 使用 `LazyVStack` 提高长列表性能
- 使用 `os.Logger` 进行分类日志记录
- 所有用户可见文本使用 `String(localized:)` 或 `LocalizedStringKey`
- 处理 `429 Too Many Requests` (配额耗尽) 给用户友好提示
- 在 SSE 断开时自动重连

### DON'T ❌
- 不要使用 `ObservableObject` + `@Published`（使用 `@Observable` 代替）
- 不要使用 `NavigationView`（已废弃，使用 `NavigationStack`）
- 不要使用第三方网络库（Alamofire 等），使用原生 `URLSession`
- 不要在 `UserDefaults` 中存储 userId 或任何认证数据
- 不要硬编码颜色值（使用 `Color.primary`、`Color.accentColor` 等系统颜色）
- 不要在 Views 中直接调用 APIClient
- 不要使用 `async let` 处理 SSE 流（使用 `AsyncThrowingStream`）
- 不要创建多个 APIClient 实例（它是全局 actor 单例）

---

## Dependencies (SPM)

| Package | URL | Version |
|---------|-----|---------|
| swift-markdown-ui | `https://github.com/gonzalezreal/swift-markdown-ui` | latest |
| GoogleSignIn-iOS | `https://github.com/google/GoogleSignIn-iOS` | latest |

> 最小依赖原则：能用系统 API 实现的不引入第三方库。

---

## Reference Documentation

以下文档提供了完整的技术细节，在遇到具体实现问题时参考：

| 文档 | 内容 |
|------|------|
| `01_PROJECT_OVERVIEW.md` | 产品功能、用户流程、核心概念 |
| `02_API_REFERENCE.md` | 所有 API 端点详细文档 |
| `03_DATA_MODELS.md` | 完整的 Swift Codable 模型定义 |
| `04_IOS_ARCHITECTURE.md` | 架构设计、文件结构、技术选型 |
| `05_SWIFT_IMPLEMENTATION_GUIDE.md` | APIClient、SSEClient、ChatViewModel 完整代码 |
| `06_UI_DESIGN_SPEC.md` | UI 布局、组件映射、动画、无障碍 |
| `07_AUTH_AND_SECURITY.md` | 认证流程、Keychain、安全最佳实践 |
| `08_DEV_ENVIRONMENT_SETUP.md` | Xcode 配置、项目结构、调试工具 |
| `09_FEATURE_IMPLEMENTATION_PLAN.md` | 分阶段路线图、文件创建顺序 |

---

## Common Patterns

### 创建新的 Service

```swift
// Services/XxxService.swift
import Foundation

enum XxxService {
    static func getAll(userId: String) async throws -> [Xxx] {
        try await APIClient.shared.request(
            endpoint: "/api/xxx",
            queryItems: [URLQueryItem(name: "user_id", value: userId)]
        )
    }
    
    static func create(_ input: CreateXxxRequest, userId: String) async throws -> Xxx {
        try await APIClient.shared.request(
            endpoint: "/api/xxx",
            method: .post,
            body: input
        )
    }
}
```

### 创建新的 View

```swift
// Views/Xxx/XxxView.swift
import SwiftUI

struct XxxView: View {
    @Environment(AuthSession.self) private var auth
    @State private var items: [Xxx] = []
    @State private var isLoading = false
    @State private var error: String?
    
    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if let error {
                ErrorView(message: error, retry: { Task { await load() } })
            } else {
                List(items) { item in
                    XxxRow(item: item)
                }
            }
        }
        .navigationTitle("Xxx")
        .task { await load() }
    }
    
    private func load() async {
        guard let userId = auth.userId else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            items = try await XxxService.getAll(userId: userId)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
```

---

## Localization

支持两种语言：English (`en`) 和 简体中文 (`zh-Hans`)。

```swift
// 使用 String Catalog (Localizable.xcstrings)
Text("Conversations", comment: "Tree list title")
Text("New Conversation", comment: "New tree button")
Text("Send", comment: "Send message button")

// 带参数
Text("Branch \(current) of \(total)", comment: "Branch indicator")
```

---

## Error Handling

```swift
// 统一错误处理模式
do {
    let result = try await SomeService.doSomething()
    // success
} catch let apiError as APIError {
    switch apiError {
    case .unauthorized:
        auth.logout()  // 跳回登录
    case .rateLimited:
        showQuotaExhaustedAlert()
    case .serverError(let message):
        self.error = message
    default:
        self.error = apiError.localizedDescription
    }
} catch {
    self.error = error.localizedDescription
}
```
