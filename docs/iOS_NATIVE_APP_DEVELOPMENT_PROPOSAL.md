# oMyTree iOS 原生 App 开发方案

**文档版本**: v1.0  
**创建日期**: 2026-01-12  
**项目**: oMyTree (LinZhi) 知识树应用  
**作者**: 技术架构分析

---

## 📋 目录

1. [项目概述](#1-项目概述)
2. [现有系统分析](#2-现有系统分析)
3. [iOS App 功能规划](#3-ios-app-功能规划)
4. [技术架构设计](#4-技术架构设计)
5. [API 对接方案](#5-api-对接方案)
6. [数据模型映射](#6-数据模型映射)
7. [认证与安全](#7-认证与安全)
8. [UI/UX 设计建议](#8-uiux-设计建议)
9. [开发阶段规划](#9-开发阶段规划)
10. [技术栈推荐](#10-技术栈推荐)
11. [风险与挑战](#11-风险与挑战)
12. [附录](#12-附录)

---

## 1. 项目概述

### 1.1 产品定位

oMyTree 是一个**树状知识持久化系统**，帮助用户以树形结构组织和探索知识。用户通过与 AI 对话，逐步构建个人知识树。

**线上地址**: https://www.omytree.com

### 1.2 iOS App 目标

| 目标 | 描述 |
|------|------|
| **移动端体验** | 提供原生流畅的 iOS 交互体验 |
| **随时随地** | 支持离线浏览、碎片化学习 |
| **快速对话** | 移动端优化的输入和对话界面 |
| **知识可视化** | 原生实现的树形可视化 |
| **推送通知** | 学习提醒、分享通知 |

### 1.3 核心价值

- 🌳 **知识树管理**: 创建、浏览、编辑个人知识树
- 💬 **AI 对话**: 通过问答方式探索和扩展知识
- 📊 **学习洞察**: 查看学习报告和进度指标
- 🔗 **分享协作**: 生成分享链接，导出知识

---

## 2. 现有系统分析

### 2.1 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Production Stack                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────────┐         ┌──────────────┐                │
│   │   Next.js    │ rewrites│  Express 5   │                │
│   │   Web App    │────────▶│   API        │                │
│   │   :3000      │         │   :8000      │                │
│   └──────────────┘         └──────┬───────┘                │
│                                   │                         │
│                                   ▼                         │
│                            ┌──────────────┐                │
│                            │  PostgreSQL  │                │
│                            │   Database   │                │
│                            └──────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 API 概览

后端 API 基于 Express 5，提供 RESTful + SSE 接口：

| 类别 | 端点示例 | 说明 |
|------|---------|------|
| **树管理** | `GET/POST /api/tree/:id` | 获取/创建树 |
| **节点操作** | `POST /api/turn/stream` | 对话流式响应 |
| **分支操作** | `POST /api/branch/suggest` | 生成分支建议 |
| **导出** | `GET /api/tree/:id/export` | JSON/Markdown导出 |
| **分享** | `POST /api/tree/:id/share` | 生成分享链接 |
| **用户** | `GET /api/me/usage` | 用户用量统计 |
| **认证** | `POST /api/auth/*` | 注册/登录 |

### 2.3 核心数据模型

#### QANode 模型 (核心)
```typescript
type QANode = {
  id: string;              // 节点唯一ID
  tree_id: string;         // 所属树ID
  user_node_id: string;    // 用户问题节点ID
  user_text: string;       // 用户问题文本
  ai_node_id: string | null;
  ai_text: string | null;  // AI回答文本
  parent_id: string | null;
  children_ids: string[];
  created_at: string;
  updated_at: string;
};
```

#### Tree 快照结构
```typescript
type TreeSnapshot = {
  id: string;
  title: string;
  nodes: QANode[];
  topic: string;
  context: TreeContext;
};
```

### 2.4 现有功能清单

| 功能模块 | 状态 | iOS 适配优先级 |
|---------|------|---------------|
| 用户注册/登录 | ✅ 已实现 | 🔴 P0 必须 |
| Google OAuth | ✅ 已实现 | 🟡 P1 重要 |
| 创建知识树 | ✅ 已实现 | 🔴 P0 必须 |
| AI 对话 (流式) | ✅ 已实现 | 🔴 P0 必须 |
| 树可视化 | ✅ 已实现 | 🔴 P0 必须 |
| 编辑问题 | ✅ 已实现 | 🟡 P1 重要 |
| 删除节点/分支 | ✅ 已实现 | 🟡 P1 重要 |
| JSON/MD 导出 | ✅ 已实现 | 🟢 P2 有则更佳 |
| 分享链接 | ✅ 已实现 | 🟢 P2 有则更佳 |
| Memo 摘要 | ✅ 已实现 | 🟢 P2 有则更佳 |
| 快照回顾 | ✅ 已实现 | 🟢 P2 有则更佳 |
| 证据管理 | ✅ 已实现 | 🔵 P3 未来版本 |
| Outcome 输出 | ✅ 已实现 | 🔵 P3 未来版本 |
| 文件上传 | ✅ 已实现 | 🟡 P1 重要 |
| BYOK (自带密钥) | ✅ 已实现 | 🔵 P3 未来版本 |
| 上下文档位 | ✅ 已实现 | 🟢 P2 有则更佳 |

---

## 3. iOS App 功能规划

### 3.1 MVP 功能 (v1.0)

#### 核心功能
- [ ] **账户系统**
  - 邮箱注册/登录
  - 会话持久化
  - 用户信息展示

- [ ] **知识树管理**
  - 树列表页（我的树）
  - 创建新树
  - 重命名树
  - 删除树

- [ ] **对话交互**
  - 提问输入框
  - AI 流式回复展示
  - 对话历史查看

- [ ] **树可视化**
  - 简化版树形图
  - 节点导航
  - 当前路径展示

#### 辅助功能
- [ ] 设置页面
- [ ] 深色模式适配
- [ ] 基础错误处理

### 3.2 v1.1 功能增强

- [ ] Google 登录
- [ ] 编辑问题
- [ ] 删除节点/分支
- [ ] 分享功能
- [ ] 推送通知

### 3.3 v1.2 高级功能

- [ ] 离线浏览（本地缓存）
- [ ] 导出功能
- [ ] Memo 摘要
- [ ] 上下文档位设置
- [ ] 文件上传

### 3.4 v2.0 远期规划

- [ ] Apple Watch 伴侣应用
- [ ] Widget 小组件
- [ ] Siri 快捷指令
- [ ] iCloud 同步
- [ ] iPad 优化布局

---

## 4. 技术架构设计

### 4.1 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                       iOS App Architecture                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     Presentation Layer                      │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │ │
│  │  │  Views   │  │ViewModels│  │Coordinators│ │  Router  │   │ │
│  │  │ (SwiftUI)│  │(MVVM)    │  │(Navigation)│ │          │   │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                      Domain Layer                           │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │ │
│  │  │Use Cases │  │Repositories│ │  Models  │                  │ │
│  │  │          │  │(Protocol) │ │(Entities)│                  │ │
│  │  └──────────┘  └──────────┘  └──────────┘                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                       Data Layer                            │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │ │
│  │  │ Network  │  │  Cache   │  │ Keychain │  │ Storage  │   │ │
│  │  │ Service  │  │ (Realm)  │  │(SecItems)│  │ (Files)  │   │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│                              ▼                                    │
│                    ┌──────────────────┐                          │
│                    │   oMyTree API    │                          │
│                    │   (HTTPS/SSE)    │                          │
│                    └──────────────────┘                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 模块划分

```
OMyTree/
├── App/
│   ├── OMyTreeApp.swift           # 应用入口
│   ├── AppCoordinator.swift       # 根协调器
│   └── DependencyContainer.swift  # 依赖注入
│
├── Core/
│   ├── Network/
│   │   ├── APIClient.swift        # HTTP 客户端
│   │   ├── SSEClient.swift        # 流式事件客户端
│   │   ├── Endpoints.swift        # API 端点定义
│   │   └── NetworkError.swift     # 网络错误
│   │
│   ├── Storage/
│   │   ├── KeychainService.swift  # 安全存储
│   │   ├── CacheService.swift     # 本地缓存
│   │   └── UserDefaults+Ext.swift
│   │
│   └── Utilities/
│       ├── Extensions/
│       └── Helpers/
│
├── Domain/
│   ├── Models/
│   │   ├── User.swift
│   │   ├── Tree.swift
│   │   ├── QANode.swift
│   │   ├── Memo.swift
│   │   └── Message.swift
│   │
│   ├── Repositories/
│   │   ├── AuthRepository.swift
│   │   ├── TreeRepository.swift
│   │   └── UserRepository.swift
│   │
│   └── UseCases/
│       ├── Auth/
│       ├── Tree/
│       └── Chat/
│
├── Features/
│   ├── Auth/
│   │   ├── Views/
│   │   │   ├── LoginView.swift
│   │   │   └── RegisterView.swift
│   │   └── ViewModels/
│   │       └── AuthViewModel.swift
│   │
│   ├── Home/
│   │   ├── Views/
│   │   │   ├── HomeView.swift
│   │   │   └── TreeListView.swift
│   │   └── ViewModels/
│   │       └── HomeViewModel.swift
│   │
│   ├── Tree/
│   │   ├── Views/
│   │   │   ├── TreeWorkspaceView.swift
│   │   │   ├── TreeCanvasView.swift
│   │   │   └── TreeDrawerView.swift
│   │   └── ViewModels/
│   │       └── TreeViewModel.swift
│   │
│   ├── Chat/
│   │   ├── Views/
│   │   │   ├── ChatPaneView.swift
│   │   │   ├── MessageBubble.swift
│   │   │   └── ComposerView.swift
│   │   └── ViewModels/
│   │       └── ChatViewModel.swift
│   │
│   └── Settings/
│       ├── Views/
│       │   └── SettingsView.swift
│       └── ViewModels/
│           └── SettingsViewModel.swift
│
├── Components/
│   ├── TreeCanvas/
│   │   ├── NodeView.swift
│   │   ├── EdgeView.swift
│   │   └── TreeLayout.swift
│   │
│   ├── Common/
│   │   ├── LoadingView.swift
│   │   ├── ErrorView.swift
│   │   └── EmptyStateView.swift
│   │
│   └── UI/
│       ├── Theme.swift
│       ├── Colors.swift
│       └── Typography.swift
│
└── Resources/
    ├── Assets.xcassets
    ├── Localizable.strings
    └── Info.plist
```

### 4.3 数据流

```
┌───────────────────────────────────────────────────────────┐
│                    Unidirectional Data Flow               │
├───────────────────────────────────────────────────────────┤
│                                                           │
│   ┌─────────┐    Action    ┌───────────┐                 │
│   │  View   │ ──────────▶ │ ViewModel │                 │
│   │(SwiftUI)│              │  (State)  │                 │
│   └────▲────┘              └─────┬─────┘                 │
│        │                         │                        │
│        │                         │ Call                   │
│        │ State                   ▼                        │
│        │                   ┌───────────┐                 │
│        │                   │ Use Case  │                 │
│        │                   └─────┬─────┘                 │
│        │                         │                        │
│        │                         │ Execute                │
│        │                         ▼                        │
│        │                   ┌───────────┐                 │
│        │                   │Repository │                 │
│        │                   └─────┬─────┘                 │
│        │                         │                        │
│        │   ┌─────────────────────┼─────────────────────┐ │
│        │   │                     │                     │ │
│        │   ▼                     ▼                     │ │
│        │ ┌──────────┐      ┌──────────┐               │ │
│        │ │  Cache   │      │  Network │               │ │
│        │ └──────────┘      └──────────┘               │ │
│        │                                               │ │
│        └───────────────────────────────────────────────┘ │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

## 5. API 对接方案

### 5.1 API 客户端设计

```swift
// MARK: - API Client Protocol
protocol APIClientProtocol {
    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T
    func requestStream(_ endpoint: Endpoint) -> AsyncThrowingStream<String, Error>
}

// MARK: - Endpoint Definition
struct Endpoint {
    let path: String
    let method: HTTPMethod
    let headers: [String: String]?
    let queryItems: [URLQueryItem]?
    let body: Encodable?
    
    static func tree(_ id: String) -> Endpoint {
        Endpoint(path: "/api/tree/\(id)", method: .get)
    }
    
    static func turnStream(treeId: String, nodeId: String, text: String) -> Endpoint {
        Endpoint(
            path: "/api/turn/stream",
            method: .post,
            body: TurnRequest(tree_id: treeId, node_id: nodeId, user_text: text)
        )
    }
}
```

### 5.2 核心 API 对接

#### 5.2.1 认证接口

```swift
// 注册
POST /api/auth/register
Request: { email, password, name? }
Response: { ok: true, userId, email }

// 登录 (NextAuth credentials)
POST /api/auth/callback/credentials
Request: { email, password, redirect: false }
Response: Session or Error

// 获取 Session
GET /api/auth/session
Response: { user: { id, email, name } }
```

**iOS 实现建议**:
- 使用 Keychain 存储认证令牌
- 实现 Session 刷新机制
- 支持生物识别快速登录

#### 5.2.2 树管理接口

```swift
// 树列表
GET /api/trees
Headers: { x-omytree-user-id: <user_id> }
Response: { trees: [{ id, title, updated_at }] }

// 获取树详情
GET /api/tree/:id
Response: TreeSnapshot

// 创建树
POST /api/tree
Request: { title, topic? }
Response: { tree_id, ok }

// 重命名
PATCH /api/tree/:id/rename
Request: { title }

// 删除
DELETE /api/tree/:id
```

#### 5.2.3 对话接口 (SSE)

```swift
// 流式对话 - 核心接口
POST /api/turn/stream
Headers: { 
    x-omytree-user-id: <user_id>,
    Content-Type: application/json,
    Accept: text/event-stream
}
Request: {
    tree_id: string,
    node_id: string,     // 父节点ID
    user_text: string,   // 用户问题
    with_ai: true
}
Response: SSE Stream
    data: {"type":"chunk","text":"..."}
    data: {"type":"done","node_id":"..."}
```

**SSE 处理示例**:

```swift
class SSEClient {
    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<ChatEvent, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    let (bytes, response) = try await urlSession.bytes(for: request)
                    
                    for try await line in bytes.lines {
                        if line.hasPrefix("data: ") {
                            let jsonStr = String(line.dropFirst(6))
                            if let event = try? JSONDecoder().decode(ChatEvent.self, from: jsonStr.data(using: .utf8)!) {
                                continuation.yield(event)
                            }
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }
}
```

### 5.3 请求头规范

所有认证请求需携带：

```swift
extension URLRequest {
    mutating func addAuthHeaders(userId: String) {
        setValue(userId, forHTTPHeaderField: "x-omytree-user-id")
        setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
}
```

### 5.4 错误处理

后端错误格式：

```json
{
  "error": "Human-readable message",
  "code": "machine_readable_code",
  "hint": "Optional hint",
  "detail": "Optional detail"
}
```

iOS 映射：

```swift
struct APIError: Decodable, LocalizedError {
    let error: String
    let code: String
    let hint: String?
    let detail: String?
    
    var errorDescription: String? { error }
    
    var localizedDescription: String {
        switch code {
        case "tree_not_found": return "知识树不存在"
        case "authentication_required": return "请先登录"
        case "quota_exceeded": return "配额已用尽"
        default: return error
        }
    }
}
```

---

## 6. 数据模型映射

### 6.1 核心模型

```swift
// MARK: - User
struct User: Codable, Identifiable {
    let id: String
    let email: String
    let name: String?
    let image: String?
    let emailVerified: Date?
}

// MARK: - Tree
struct Tree: Codable, Identifiable {
    let id: String
    let title: String
    let topic: String?
    let context: TreeContext?
    let createdAt: Date
    let updatedAt: Date
    
    // 元数据
    let nodeCount: Int?
    let shareEnabled: Bool?
}

// MARK: - TreeContext
struct TreeContext: Codable {
    let contextProfile: ContextProfile
    let memoryScope: MemoryScope
    let treeSummary: String?
}

enum ContextProfile: String, Codable {
    case lite
    case standard
    case max
}

enum MemoryScope: String, Codable {
    case branch
    case tree
}

// MARK: - QANode
struct QANode: Codable, Identifiable {
    let id: String
    let treeId: String
    let userNodeId: String
    let userText: String
    let aiNodeId: String?
    let aiText: String?
    let parentId: String?
    let childrenIds: [String]
    let createdAt: Date
    let updatedAt: Date
    
    var isRoot: Bool { parentId == nil }
    var hasAIResponse: Bool { aiText != nil }
}

// MARK: - Message (UI层)
struct Message: Identifiable {
    let id: String
    let role: Role
    let content: String
    let timestamp: Date
    let status: Status
    
    enum Role {
        case user
        case assistant
    }
    
    enum Status {
        case sending
        case streaming
        case complete
        case failed
    }
}
```

### 6.2 API 响应模型

```swift
// MARK: - TreeListResponse
struct TreeListResponse: Decodable {
    let trees: [TreeSummary]
}

struct TreeSummary: Decodable, Identifiable {
    let id: String
    let title: String
    let updatedAt: Date
    let nodeCount: Int?
}

// MARK: - TreeSnapshotResponse
struct TreeSnapshotResponse: Decodable {
    let id: String
    let title: String
    let nodes: [QANode]
    let topic: String?
    let context: TreeContext?
}

// MARK: - TurnStreamEvent
enum TurnStreamEvent: Decodable {
    case chunk(text: String)
    case done(nodeId: String)
    case error(message: String)
    
    enum CodingKeys: String, CodingKey {
        case type, text, nodeId = "node_id", message
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        
        switch type {
        case "chunk":
            let text = try container.decode(String.self, forKey: .text)
            self = .chunk(text: text)
        case "done":
            let nodeId = try container.decode(String.self, forKey: .nodeId)
            self = .done(nodeId: nodeId)
        case "error":
            let message = try container.decode(String.self, forKey: .message)
            self = .error(message: message)
        default:
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Unknown event type"))
        }
    }
}
```

---

## 7. 认证与安全

### 7.1 认证流程

```
┌──────────────────────────────────────────────────────────────┐
│                    Authentication Flow                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐                                                 │
│  │  App    │                                                 │
│  │  Start  │                                                 │
│  └────┬────┘                                                 │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────┐     No      ┌─────────────────┐        │
│  │ Check Keychain  │────────────▶│  Login Screen   │        │
│  │ (Stored Token?) │             │                 │        │
│  └────────┬────────┘             └────────┬────────┘        │
│       Yes │                               │                  │
│           ▼                               ▼                  │
│  ┌─────────────────┐             ┌─────────────────┐        │
│  │ Validate Session│             │ POST /auth/login│        │
│  │ GET /auth/session│            │                 │        │
│  └────────┬────────┘             └────────┬────────┘        │
│           │                               │                  │
│       ┌───┴───┐                           │                  │
│  Valid│       │Invalid                    │                  │
│       ▼       ▼                           │                  │
│  ┌────────┐ ┌──────────┐                  │                  │
│  │  Home  │ │Re-Login  │                  │                  │
│  │ Screen │ │ Screen   │                  │                  │
│  └────────┘ └──────────┘                  │                  │
│       ▲                                   │                  │
│       └───────────────────────────────────┘                  │
│                   (Store Token)                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 Keychain 存储

```swift
class KeychainService {
    private let service = "com.omytree.ios"
    
    enum Key: String {
        case userId
        case sessionToken
        case refreshToken
    }
    
    func save(_ value: String, for key: Key) throws {
        let data = value.data(using: .utf8)!
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
            kSecValueData as String: data
        ]
        
        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status)
        }
    }
    
    func get(_ key: Key) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
            kSecReturnData as String: true
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }
        return value
    }
    
    func delete(_ key: Key) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue
        ]
        SecItemDelete(query as CFDictionary)
    }
}
```

### 7.3 安全最佳实践

| 措施 | 实现 |
|------|------|
| **传输安全** | 强制 HTTPS，证书固定 (Certificate Pinning) |
| **存储安全** | Keychain 存储敏感数据，不使用 UserDefaults |
| **会话管理** | 短期令牌 + 刷新机制 |
| **生物识别** | Face ID / Touch ID 快速解锁 |
| **输入验证** | 客户端 + 服务端双重验证 |
| **日志脱敏** | 生产环境不记录敏感信息 |

---

## 8. UI/UX 设计建议

### 8.1 设计原则

1. **原生优先**: 遵循 Apple Human Interface Guidelines
2. **简洁直观**: 减少认知负担，核心功能突出
3. **流畅体验**: 动画过渡自然，响应及时
4. **深色适配**: 完整支持 Light/Dark 模式
5. **可访问性**: 支持动态字体、VoiceOver

### 8.2 主题系统

基于 Web 端深墨绿主题：

```swift
// MARK: - Color Theme
extension Color {
    struct OMyTree {
        // Primary
        static let primary = Color(hex: "#0d4a3e")        // 深墨绿
        static let primaryLight = Color(hex: "#1a6b56")
        static let primaryDark = Color(hex: "#0a3a30")
        
        // Background
        static let background = Color(.systemBackground)
        static let secondaryBackground = Color(.secondarySystemBackground)
        
        // Text
        static let text = Color(.label)
        static let secondaryText = Color(.secondaryLabel)
        static let mutedText = Color(.tertiaryLabel)
        
        // Semantic
        static let success = Color.green
        static let warning = Color.orange
        static let error = Color.red
        
        // Node Colors (树节点层级色彩)
        static let nodeLevel0 = Color(hex: "#0d4a3e")
        static let nodeLevel1 = Color(hex: "#2e7d32")
        static let nodeLevel2 = Color(hex: "#558b2f")
        static let nodeLevel3 = Color(hex: "#7cb342")
    }
}
```

### 8.3 核心页面设计

#### 8.3.1 首页 - 树列表

```
┌─────────────────────────────────────┐
│ ◉ My Trees                    [+]   │ ← Navigation Bar
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 🌳 Swift 学习笔记               │ │
│ │ 最后更新: 2小时前   12个节点    │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 🌳 产品设计思考                 │ │
│ │ 最后更新: 昨天     8个节点      │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 🌳 读书摘录                     │ │
│ │ 最后更新: 3天前    25个节点     │ │
│ └─────────────────────────────────┘ │
│                                     │
│           ─ ─ ─ ─ ─ ─               │
│                                     │
│                                     │
├─────────────────────────────────────┤
│    🏠      🌳      ⚙️              │ ← Tab Bar
│   首页    探索    设置              │
└─────────────────────────────────────┘
```

#### 8.3.2 树工作区

```
┌─────────────────────────────────────┐
│ ← Swift 学习笔记              [⋮]  │ ← Navigation
├─────────────────────────────────────┤
│                                     │
│         ┌───────┐                   │
│         │ Root  │                   │
│         └───┬───┘                   │
│      ┌──────┴──────┐                │
│   ┌──┴──┐       ┌──┴──┐             │ ← Tree Canvas
│   │ Q1  │       │ Q2  │             │
│   └──┬──┘       └──┬──┘             │
│   ┌──┴──┐       ┌──┴──┐             │
│   │ Q1a │       │ Q2a │             │
│   └─────┘       └─────┘             │
│                                     │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 当前: Q1 → Q1a                  │ │ ← Path Indicator
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ AI: 闭包在Swift中是一种...      │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │ ← Chat Pane
│ ┌─────────────────────────────────┐ │
│ │ 问点什么...                 ➤  │ │ ← Composer
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### 8.3.3 对话详情

```
┌─────────────────────────────────────┐
│ ← 对话                        [⋮]  │
├─────────────────────────────────────┤
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 👤 什么是Swift中的闭包？        │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🤖 闭包(Closure)是自包含的功    │ │
│ │ 能代码块，可以在代码中被传递和  │ │
│ │ 使用。它类似于其他语言中的匿    │ │
│ │ 名函数或 lambda 表达式。        │ │
│ │                                 │ │
│ │ 主要特点：                      │ │
│ │ 1. 可以捕获上下文中的值         │ │
│ │ 2. 可以作为参数传递             │ │
│ │ 3. 可以作为返回值               │ │
│ │                                 │ │
│ │ ```swift                        │ │
│ │ let closure = { (a: Int) in    │ │
│ │     return a * 2               │ │
│ │ }                              │ │
│ │ ```                            │ │
│ └─────────────────────────────────┘ │
│                                     │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 尾随闭包是什么？            ➤  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 8.4 树可视化组件

```swift
// MARK: - Tree Canvas View
struct TreeCanvasView: View {
    let nodes: [QANode]
    @Binding var selectedNodeId: String?
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Draw edges
                ForEach(edges) { edge in
                    EdgeLine(from: edge.from, to: edge.to)
                        .stroke(Color.OMyTree.primary.opacity(0.5), lineWidth: 2)
                }
                
                // Draw nodes
                ForEach(layoutNodes) { node in
                    NodeView(
                        node: node,
                        isSelected: node.id == selectedNodeId
                    )
                    .position(node.position)
                    .onTapGesture {
                        selectedNodeId = node.id
                    }
                }
            }
        }
        .gesture(
            MagnificationGesture()
                .onChanged { scale in
                    // Pinch to zoom
                }
        )
        .gesture(
            DragGesture()
                .onChanged { value in
                    // Pan gesture
                }
        )
    }
}

struct NodeView: View {
    let node: LayoutNode
    let isSelected: Bool
    
    var body: some View {
        VStack(spacing: 4) {
            Circle()
                .fill(nodeColor)
                .frame(width: 40, height: 40)
                .overlay(
                    Text(node.label)
                        .font(.caption2)
                        .foregroundColor(.white)
                )
                .shadow(color: isSelected ? Color.OMyTree.primary : .clear, radius: 4)
            
            if isSelected {
                Text(node.preview)
                    .font(.caption)
                    .lineLimit(2)
                    .frame(maxWidth: 120)
                    .padding(8)
                    .background(Color.OMyTree.secondaryBackground)
                    .cornerRadius(8)
            }
        }
    }
}
```

---

## 9. 开发阶段规划

### 9.1 Phase 0: 准备工作 (1周)

| 任务 | 产出 |
|------|------|
| 搭建 Xcode 项目 | 初始化项目结构 |
| 配置 CI/CD | GitHub Actions / Fastlane |
| 设置开发证书 | Development & Distribution |
| 创建设计规范 | Figma 设计稿 |
| API 文档整理 | OpenAPI → Swift 模型 |

### 9.2 Phase 1: MVP 核心功能 (4-6周)

**Week 1-2: 基础框架**
- [x] 项目架构搭建
- [x] 网络层实现
- [x] 认证模块
- [x] 登录/注册页面

**Week 3-4: 树管理**
- [x] 树列表页面
- [x] 创建/删除树
- [x] 树详情获取
- [x] 基础树可视化

**Week 5-6: 对话功能**
- [x] SSE 客户端
- [x] 对话页面
- [x] 流式响应展示
- [x] 输入组件

### 9.3 Phase 2: 功能完善 (3-4周)

**Week 7-8: 交互增强**
- [ ] 节点导航优化
- [ ] 编辑问题
- [ ] 删除节点/分支
- [ ] 错误处理完善

**Week 9-10: 用户体验**
- [ ] 深色模式
- [ ] 动画过渡
- [ ] 骨架屏加载
- [ ] 离线状态处理

### 9.4 Phase 3: 高级功能 (3-4周)

**Week 11-12: 分享与导出**
- [ ] 生成分享链接
- [ ] JSON/Markdown 导出
- [ ] 分享预览页

**Week 13-14: 附加功能**
- [ ] Google 登录
- [ ] 推送通知
- [ ] 文件上传
- [ ] 设置页面

### 9.5 Phase 4: 发布准备 (2周)

**Week 15-16**
- [ ] 全面测试
- [ ] 性能优化
- [ ] App Store 准备
- [ ] 隐私政策/条款
- [ ] 提交审核

### 9.6 里程碑

| 里程碑 | 目标日期 | 交付物 |
|--------|---------|--------|
| **M1: Alpha** | +6周 | 内部可用版本 |
| **M2: Beta** | +10周 | TestFlight 公测 |
| **M3: RC** | +14周 | 候选发布版 |
| **M4: Launch** | +16周 | App Store 上架 |

---

## 10. 技术栈推荐

### 10.1 核心技术

| 类别 | 技术选型 | 说明 |
|------|---------|------|
| **语言** | Swift 5.9+ | 最新 Swift 特性 |
| **最低版本** | iOS 16.0 | 覆盖 90%+ 设备 |
| **UI 框架** | SwiftUI | 声明式 UI |
| **架构** | MVVM + Coordinator | 清晰的职责分离 |
| **并发** | Swift Concurrency | async/await |
| **网络** | URLSession + SSE | 原生实现 |

### 10.2 推荐依赖

| 库 | 用途 | 备注 |
|----|------|------|
| **KeychainAccess** | Keychain 封装 | 安全存储 |
| **Realm Swift** | 本地数据库 | 离线缓存 (可选) |
| **Lottie** | 动画 | 加载动画 (可选) |
| **Kingfisher** | 图片加载 | 用户头像 (可选) |

### 10.3 开发工具

| 工具 | 用途 |
|------|------|
| **Xcode 15+** | IDE |
| **SwiftLint** | 代码规范 |
| **Fastlane** | 自动化部署 |
| **Charles Proxy** | 网络调试 |
| **Instruments** | 性能分析 |

### 10.4 测试策略

```
┌─────────────────────────────────────────────────────────────┐
│                     Testing Pyramid                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                      ┌─────────────┐                        │
│                      │   UI Tests  │  10%                   │
│                      │ (XCUITest)  │                        │
│                      └──────┬──────┘                        │
│                   ┌─────────┴─────────┐                     │
│                   │  Integration      │  20%                │
│                   │  Tests            │                     │
│                   └─────────┬─────────┘                     │
│            ┌────────────────┴────────────────┐              │
│            │       Unit Tests                │  70%         │
│            │    (XCTest + Quick/Nimble)      │              │
│            └─────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. 风险与挑战

### 11.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **SSE 连接稳定性** | 高 | 重连机制、心跳检测 |
| **大型树渲染性能** | 中 | 虚拟化、懒加载、分页 |
| **离线同步冲突** | 中 | 版本号校验、冲突解决UI |
| **API 变更兼容** | 低 | 版本化 API、降级策略 |

### 11.2 产品风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **App Store 审核** | 中 | 提前准备元数据、隐私政策 |
| **用户留存** | 高 | 推送提醒、Widget、快捷操作 |
| **功能差异感知** | 中 | 清晰说明移动端限制 |

### 11.3 资源风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **开发周期延长** | 高 | 敏捷迭代、MVP 优先 |
| **设计资源不足** | 中 | 使用 SF Symbols、标准组件 |
| **测试覆盖不足** | 中 | 自动化测试优先 |

---

## 12. 附录

### 12.1 API 端点完整清单

```yaml
# 认证
POST   /api/auth/register        # 注册
POST   /api/auth/callback/credentials  # 登录
GET    /api/auth/session         # 获取会话
POST   /api/auth/signout         # 登出

# 树管理
GET    /api/trees                # 树列表
POST   /api/tree                 # 创建树
GET    /api/tree/:id             # 获取树详情
PATCH  /api/tree/:id/rename      # 重命名
DELETE /api/tree/:id             # 删除树

# 对话
POST   /api/turn/stream          # 流式对话
POST   /api/turn/abort           # 中止生成

# 节点操作
POST   /api/node/:id/edit-question/stream  # 编辑问题
DELETE /api/node/:id             # 删除节点
DELETE /api/node/:id/prune       # 删除分支

# 导出分享
GET    /api/tree/:id/export      # JSON 导出
GET    /api/tree/:id/export.md   # Markdown 导出
POST   /api/tree/:id/share       # 启用分享
DELETE /api/tree/:id/share       # 撤销分享
GET    /api/share/:token         # 公开访问

# 用户
GET    /api/me/usage             # 用量统计
GET    /api/me/settings          # 用户设置
PATCH  /api/me/settings          # 更新设置

# 其他
GET    /api/memo/latest          # 最新摘要
POST   /api/memo/generate        # 生成摘要
GET    /healthz                  # 健康检查
```

### 12.2 错误码参考

| Code | HTTP Status | 说明 |
|------|-------------|------|
| `authentication_required` | 401 | 需要登录 |
| `user_not_found` | 401 | 用户不存在 |
| `invalid_credentials` | 401 | 凭证无效 |
| `email_exists` | 409 | 邮箱已注册 |
| `tree_not_found` | 404 | 树不存在 |
| `node_not_found` | 404 | 节点不存在 |
| `access_denied` | 403 | 无访问权限 |
| `quota_exceeded` | 429 | 配额超限 |
| `llm_error` | 503 | LLM 服务错误 |
| `internal_error` | 500 | 服务器内部错误 |

### 12.3 参考资源

- **Apple Developer**: https://developer.apple.com
- **Human Interface Guidelines**: https://developer.apple.com/design/human-interface-guidelines
- **SwiftUI Documentation**: https://developer.apple.com/documentation/swiftui
- **oMyTree Web**: https://www.omytree.com
- **OpenAPI Spec**: [web/openapi/openapi.yaml](../web/openapi/openapi.yaml)

### 12.4 术语表

| 术语 | 说明 |
|------|------|
| **QANode** | 问答节点，包含用户问题和 AI 回答 |
| **Tree** | 知识树，由多个 QANode 组成的树状结构 |
| **Turn** | 一轮对话，包含用户输入和 AI 响应 |
| **Memo** | 学习摘要，由 AI 生成的树内容总结 |
| **Snapshot** | 树快照，某一时刻的完整树状态 |
| **SSE** | Server-Sent Events，服务器推送事件 |
| **BYOK** | Bring Your Own Key，用户自带 API 密钥 |

---

## 结语

本方案基于 oMyTree 现有的 Web 端实现和 API 设计，提出了一套完整的 iOS 原生应用开发规划。通过分阶段的迭代开发，可以在约 16 周内完成从零到 App Store 上架的全流程。

核心建议：
1. **MVP 优先**：先完成核心对话和树浏览功能
2. **原生体验**：充分利用 SwiftUI 和 iOS 平台特性
3. **API 复用**：最大化复用现有后端服务
4. **渐进增强**：根据用户反馈逐步添加高级功能

---

*文档创建于: 2026-01-12*  
*基于 LinZhi (oMyTree) 项目分析*
