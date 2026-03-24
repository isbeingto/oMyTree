# 04 — iOS App 架构设计

> 目标 iOS 版本：iOS 26+  
> 语言：Swift 6.2  
> UI 框架：SwiftUI (Liquid Glass)  
> 架构模式：SwiftUI 原生状态驱动 + Service Layer  
> 最低部署目标：iOS 26.0

---

## 4.1 项目文件结构

```
oMyTree/
├── oMyTree.xcodeproj
├── oMyTreeApp.swift                    # App 入口
├── Info.plist
├── Assets.xcassets/                    # 资源文件
│   ├── AppIcon.appiconset/
│   ├── Colors/
│   └── Images/
│
├── Core/                               # 核心基础设施
│   ├── Network/
│   │   ├── APIClient.swift             # 网络层单例
│   │   ├── APIEndpoint.swift           # 端点定义
│   │   ├── APIError.swift              # 错误类型
│   │   ├── SSEClient.swift             # SSE 流式客户端
│   │   └── AuthInterceptor.swift       # 认证拦截器
│   │
│   ├── Auth/
│   │   ├── AuthManager.swift           # 认证状态管理
│   │   ├── KeychainHelper.swift        # Keychain 存取
│   │   ├── GoogleSignInHelper.swift    # Google OAuth
│   │   └── TokenRefresher.swift        # Token 刷新
│   │
│   ├── Storage/
│   │   ├── UserDefaults+Keys.swift     # 偏好存储
│   │   └── CacheManager.swift          # 缓存管理
│   │
│   └── Utilities/
│       ├── AnyCodable.swift            # 动态 JSON
│       ├── MarkdownRenderer.swift      # Markdown 渲染
│       ├── HapticManager.swift         # 触觉反馈
│       └── Logger.swift                # 日志工具
│
├── Models/                             # 数据模型
│   ├── Tree.swift
│   ├── TreeNode.swift
│   ├── Turn.swift
│   ├── SSEEvent.swift
│   ├── Memo.swift
│   ├── Outcome.swift
│   ├── Trail.swift
│   ├── PathSnapshot.swift
│   ├── Evidence.swift
│   ├── Knowledge.swift
│   ├── User.swift
│   ├── Workspace.swift
│   └── RequestModels.swift
│
├── Services/                           # 业务逻辑层
│   ├── TreeService.swift               # Tree CRUD
│   ├── TurnService.swift               # Turn & SSE 流
│   ├── NodeService.swift               # Node 操作
│   ├── MemoService.swift               # Memo 生成/管理
│   ├── OutcomeService.swift            # Outcome 管理
│   ├── TrailService.swift              # Trail 管理
│   ├── EvidenceService.swift           # Evidence 管理
│   ├── KnowledgeService.swift          # Knowledge 管理
│   ├── AccountService.swift            # 账户/配额
│   └── WorkspaceService.swift          # 工作空间
│
├── ViewModels/                         # 视图状态管理 (仅复杂场景)
│   ├── ChatViewModel.swift             # 对话核心状态
│   ├── TreeListViewModel.swift         # 树列表状态
│   └── SettingsViewModel.swift         # 设置状态
│
├── Views/                              # SwiftUI 视图
│   ├── App/
│   │   ├── MainTabView.swift           # 主标签页
│   │   └── SplitView.swift             # iPad 分栏
│   │
│   ├── Auth/
│   │   ├── LoginView.swift             # 登录
│   │   ├── RegisterView.swift          # 注册
│   │   ├── ForgotPasswordView.swift    # 忘记密码
│   │   └── VerifyEmailView.swift       # 邮箱验证
│   │
│   ├── TreeList/
│   │   ├── TreeListView.swift          # 树列表
│   │   ├── TreeListRow.swift           # 列表行
│   │   └── SearchChatsView.swift       # 搜索
│   │
│   ├── Chat/
│   │   ├── ChatView.swift              # 对话主视图
│   │   ├── MessageBubble.swift         # 消息气泡
│   │   ├── StreamingText.swift         # 流式文本显示
│   │   ├── BranchIndicator.swift       # 分支指示器
│   │   ├── ComposerView.swift          # 输入框/编辑器
│   │   ├── ModelPicker.swift           # 模型选择器
│   │   └── ReasoningView.swift         # 推理过程展示
│   │
│   ├── TreeVis/
│   │   ├── TreeVisualization.swift     # 树状可视化
│   │   ├── NodeView.swift              # 节点视图
│   │   └── BranchPath.swift            # 分支路径
│   │
│   ├── Artifacts/
│   │   ├── MemoView.swift              # Memo 展示
│   │   ├── OutcomeView.swift           # Outcome 展示
│   │   ├── TrailView.swift             # Trail 展示
│   │   ├── PathSnapshotView.swift      # 快照展示
│   │   └── BranchDiffView.swift        # 分支对比
│   │
│   ├── Knowledge/
│   │   ├── KnowledgePanelView.swift    # 知识库面板
│   │   ├── KnowledgeBaseList.swift     # 知识库列表
│   │   └── DocumentUploadView.swift    # 文档上传
│   │
│   ├── Settings/
│   │   ├── SettingsView.swift          # 设置主页
│   │   ├── LLMSettingsView.swift       # LLM 配置
│   │   ├── BYOKSettingsView.swift      # BYOK 设置
│   │   ├── AccountView.swift           # 账户信息
│   │   ├── QuotaView.swift             # 配额查看
│   │   └── WorkspaceView.swift         # 工作空间管理
│   │
│   └── Shared/
│       ├── MarkdownView.swift          # Markdown 渲染
│       ├── LoadingView.swift           # 加载状态
│       ├── ErrorView.swift             # 错误状态
│       ├── EmptyStateView.swift        # 空状态
│       └── ConfirmDialog.swift         # 确认对话框
│
├── Localization/
│   ├── en.lproj/Localizable.strings    # 英文
│   └── zh-Hans.lproj/Localizable.strings # 中文
│
└── Preview Content/
    └── PreviewData.swift               # SwiftUI 预览数据
```

---

## 4.2 架构层次

```
┌─────────────────────────────────────────────┐
│                   Views                      │
│        (SwiftUI Views + ViewModels)          │
│                                              │
│   @State, @Binding, @Environment             │
│   @Observable (for complex state)            │
└──────────────┬──────────────────────────────┘
               │ calls
┌──────────────▼──────────────────────────────┐
│                Services                      │
│         (Business Logic Layer)               │
│                                              │
│   TreeService, TurnService, etc.             │
│   Stateless, async methods                   │
└──────────────┬──────────────────────────────┘
               │ calls
┌──────────────▼──────────────────────────────┐
│              APIClient                       │
│         (Network Layer)                      │
│                                              │
│   URLSession, SSEClient                      │
│   Auth interceptor, retry logic              │
└──────────────┬──────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────┐
│          oMyTree API Server                  │
│      (Express 5 + PostgreSQL)                │
└─────────────────────────────────────────────┘
```

### 层次职责

| 层 | 职责 | 技术 |
|---|------|------|
| **Views** | UI 渲染、用户交互、局部状态 | SwiftUI, @State, @Binding |
| **ViewModels** | 复杂页面状态、业务流编排（仅需要时） | @Observable, async/await |
| **Services** | 业务逻辑封装、API 调用、数据转换 | Swift struct, async methods |
| **APIClient** | HTTP 请求发送/接收、SSE 解析、认证 | URLSession, Codable |
| **Models** | 数据结构定义 | Codable, Identifiable, Hashable |

---

## 4.3 关键设计决策

### 1. 状态管理：SwiftUI 原生优先
```swift
// ✅ 简单页面：直接使用 @State
struct TreeListView: View {
    @State private var trees: [TreeListItem] = []
    @State private var isLoading = false
    @State private var searchText = ""
}

// ✅ 复杂页面（如 ChatView）：@Observable ViewModel
@Observable
class ChatViewModel {
    var currentTree: Tree?
    var nodes: [TreeNode] = []
    var streamingText: String = ""
    var isStreaming = false
    // ...
}
```

### 2. 全局状态注入
```swift
// App 入口注入全局服务
@main
struct oMyTreeApp: App {
    @State private var authManager = AuthManager()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authManager)
        }
    }
}
```

### 3. 导航：NavigationStack + Enum-Based Routing
```swift
enum AppRoute: Hashable {
    case treeList
    case chat(treeId: String)
    case chatNewTree
    case settings
    case treeDetail(treeId: String)
    case share(shareId: String)
    case memoDetail(memoId: String)
    case outcomeDetail(treeId: String, outcomeId: String)
    case trailDetail(treeId: String)
    case knowledgeBase(baseId: String)
}

struct ContentView: View {
    @Environment(AuthManager.self) var authManager
    @State private var path = NavigationPath()
    
    var body: some View {
        if authManager.isAuthenticated {
            NavigationStack(path: $path) {
                TreeListView()
                    .navigationDestination(for: AppRoute.self) { route in
                        switch route {
                        case .chat(let treeId):
                            ChatView(treeId: treeId)
                        case .chatNewTree:
                            ChatView(treeId: nil)
                        case .settings:
                            SettingsView()
                        // ... etc
                        }
                    }
            }
        } else {
            LoginView()
        }
    }
}
```

### 4. 网络请求：泛型 + async/await
```swift
// Service 调用示例
class TreeService {
    private let api = APIClient.shared
    
    func listTrees(limit: Int = 20, offset: Int = 0) async throws -> TreeListResponse {
        try await api.request(.get("/trees", query: ["limit": "\(limit)", "offset": "\(offset)"]))
    }
    
    func getTree(id: String) async throws -> Tree {
        try await api.request(.get("/tree/\(id)"))
    }
    
    func deleteTree(id: String) async throws {
        let _: APIResponse<EmptyData> = try await api.request(.delete("/tree/\(id)/delete"))
    }
}
```

### 5. SSE 流式处理：AsyncSequence
```swift
// ChatViewModel 中处理 SSE
func sendMessage(text: String) async {
    isStreaming = true
    streamingText = ""
    
    do {
        let stream = try await TurnService.shared.streamTurn(
            treeId: currentTree!.id,
            nodeId: currentNodeId,
            text: text
        )
        
        for try await event in stream {
            await MainActor.run {
                switch event {
                case .delta(let text):
                    streamingText += text
                case .reasoning(let text):
                    reasoningText += text
                case .done(let payload):
                    finalizeMessage(payload)
                case .error(let error):
                    handleError(error)
                default: break
                }
            }
        }
    } catch {
        handleError(error)
    }
    
    isStreaming = false
}
```

---

## 4.4 依赖管理 (Swift Package Manager)

### 推荐依赖

| 包 | 用途 | 必要性 |
|---|------|--------|
| [swift-markdown-ui](https://github.com/gonzalezreal/swift-markdown-ui) | Markdown 渲染 | **必须** |
| [KeychainAccess](https://github.com/kishikawakatsumi/KeychainAccess) | Keychain 简化 | 推荐（或自行封装） |
| [GoogleSignIn-iOS](https://github.com/google/GoogleSignIn-iOS) | Google 登录 | 推荐 |
| [Nuke](https://github.com/kean/Nuke) | 图片加载缓存 | 可选 |

### Package.swift 配置原则
- 尽量减少第三方依赖
- SwiftUI + URLSession 已能覆盖大部分需求
- SSE 客户端自行实现（逻辑简单且高度定制）
- 不引入大型网络库（如 Alamofire），URLSession 已足够

---

## 4.5 iPad 适配

### 使用 NavigationSplitView
```swift
struct AppView: View {
    @State private var selectedTreeId: String?
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    
    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            // Sidebar: Tree list
            TreeListView(selectedTreeId: $selectedTreeId)
        } detail: {
            // Detail: Chat view
            if let treeId = selectedTreeId {
                ChatView(treeId: treeId)
            } else {
                EmptyStateView(message: "Select a conversation")
            }
        }
    }
}
```

---

## 4.6 错误处理策略

```swift
enum AppError: LocalizedError {
    case network(APIError)
    case auth(AuthError)
    case notFound
    case quotaExceeded(resetsAt: Date?)
    case serverError(String)
    case decodingError(Error)
    
    var errorDescription: String? {
        switch self {
        case .network(let error): return error.localizedDescription
        case .auth: return "Authentication required"
        case .notFound: return "Resource not found"
        case .quotaExceeded: return "Quota exceeded"
        case .serverError(let msg): return msg
        case .decodingError: return "Data format error"
        }
    }
}

// View 中的错误处理
struct TreeListView: View {
    @State private var error: AppError?
    
    var body: some View {
        // ...
        .alert("Error", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error?.errorDescription ?? "Unknown error")
        }
    }
}
```

---

## 4.7 离线策略

### Phase 1（MVP）
- 不支持离线，需网络连接
- 加载状态显示优雅的 loading UI

### Phase 2（后续）
- 缓存最近的 Tree 列表（UserDefaults/文件）
- 缓存当前 Tree 的节点数据
- 离线时显示缓存数据 + 离线提示
- 网络恢复时自动刷新
