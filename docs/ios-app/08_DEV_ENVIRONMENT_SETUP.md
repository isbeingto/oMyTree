# 08 — 开发环境搭建指南

> Xcode 26 · Swift 6.2 · SwiftUI · SPM 依赖 · 构建配置

---

## 8.1 前置条件

| 工具 | 版本要求 | 说明 |
|------|---------|------|
| macOS | 26 (Tahoe) 或更新 | Xcode 26 需要 macOS 26 |
| Xcode | 26.0+ | 支持 iOS 26 SDK、Swift 6.2 |
| iOS 设备/模拟器 | iOS 26+ | Liquid Glass 仅 iOS 26 可用 |
| Apple 开发者账号 | 付费 ($99/yr) | App Store 发布需要；模拟器开发免费 |

---

## 8.2 创建 Xcode 项目

### 步骤

1. 打开 Xcode 26 → **Create New Project**
2. 选择 **iOS** → **App**
3. 填写：
   - **Product Name**: `oMyTree`
   - **Team**: 你的 Apple Developer Team
   - **Organization Identifier**: `com.omytree`（Bundle ID = `com.omytree.ios`）
   - **Interface**: **SwiftUI**
   - **Language**: **Swift**
   - **Storage**: **None**（我们用自己的 API）
   - **Testing System**: **Swift Testing**

4. 选择保存位置，创建项目

---

## 8.3 项目目录结构

创建以下文件夹结构（Xcode 中 New Group）：

```
oMyTree/
├── oMyTreeApp.swift              # @main 入口
├── ContentView.swift             # 路由分发（登录/主界面）
│
├── Core/                         # 核心基础设施
│   ├── Network/
│   │   ├── APIClient.swift       # 通用 API 客户端
│   │   ├── APIConfig.swift       # URL 配置
│   │   ├── APIError.swift        # 网络错误类型
│   │   └── SSEClient.swift       # SSE 流解析
│   ├── Auth/
│   │   ├── AuthSession.swift     # 全局认证状态
│   │   ├── AuthService.swift     # 认证 API 调用
│   │   ├── KeychainManager.swift # Keychain 存储
│   │   └── GoogleAuthManager.swift
│   ├── Storage/
│   │   └── CacheManager.swift    # 本地缓存
│   └── Utilities/
│       ├── HapticManager.swift   # 触觉反馈
│       └── Extensions.swift      # 通用扩展
│
├── Models/                       # 数据模型（Codable structs）
│   ├── Tree.swift
│   ├── TreeNode.swift
│   ├── Turn.swift
│   ├── SSEEvent.swift
│   ├── Keyframe.swift
│   ├── Memo.swift
│   ├── Outcome.swift
│   ├── Trail.swift
│   ├── PathSnapshot.swift
│   ├── Evidence.swift
│   ├── Knowledge.swift
│   ├── User.swift
│   └── Workspace.swift
│
├── Services/                     # API 服务层
│   ├── TreeService.swift
│   ├── TurnService.swift
│   ├── NodeService.swift
│   ├── KeyframeService.swift
│   ├── MemoService.swift
│   ├── OutcomeService.swift
│   ├── TrailService.swift
│   ├── KnowledgeService.swift
│   ├── AccountService.swift
│   └── WorkspaceService.swift
│
├── ViewModels/                   # 复杂页面的 ViewModel
│   ├── ChatViewModel.swift
│   └── TreeListViewModel.swift
│
├── Views/                        # SwiftUI 视图
│   ├── Auth/
│   │   ├── LoginView.swift
│   │   └── RegisterView.swift
│   ├── TreeList/
│   │   ├── TreeListView.swift
│   │   └── TreeListRow.swift
│   ├── Chat/
│   │   ├── ChatView.swift
│   │   ├── MessageBubble.swift
│   │   ├── ComposerView.swift
│   │   ├── BranchIndicator.swift
│   │   ├── StreamingCursor.swift
│   │   └── ReasoningView.swift
│   ├── TreeVis/
│   │   └── TreeMapView.swift
│   ├── Artifacts/
│   │   ├── MemoView.swift
│   │   ├── OutcomeView.swift
│   │   └── TrailView.swift
│   ├── Knowledge/
│   │   └── KnowledgeListView.swift
│   ├── Settings/
│   │   ├── SettingsView.swift
│   │   └── AccountView.swift
│   └── Shared/
│       ├── LoadingView.swift
│       ├── ErrorView.swift
│       ├── EmptyStateView.swift
│       └── ModelPickerButton.swift
│
├── Localization/
│   ├── Localizable.xcstrings     # String Catalog (en + zh-Hans)
│   └── InfoPlist.xcstrings
│
├── Resources/
│   ├── Assets.xcassets/          # 图标、颜色
│   └── GoogleService-Info.plist  # Google Sign-In 配置
│
└── oMyTreeTests/                 # 单元测试
    ├── APIClientTests.swift
    ├── SSEClientTests.swift
    └── ChatViewModelTests.swift
```

---

## 8.4 Swift Package Manager 依赖

在 Xcode 中：**File → Add Package Dependencies**

| 包 | URL | 用途 |
|----|-----|------|
| swift-markdown-ui | `https://github.com/gonzalezreal/swift-markdown-ui` | Markdown 渲染 |
| GoogleSignIn-iOS | `https://github.com/google/GoogleSignIn-iOS` | Google 登录 |

> **最小依赖原则**：仅添加必要的第三方库。Keychain 操作使用原生 Security framework，不引入 KeychainAccess。网络请求使用原生 URLSession，不引入 Alamofire。

---

## 8.5 构建配置

### 8.5.1 APIConfig — 环境切换

```swift
// Core/Network/APIConfig.swift

import Foundation

enum APIEnvironment {
    case production
    case development
    
    var baseURL: String {
        switch self {
        case .production:
            return "https://www.omytree.com"
        case .development:
            return "http://127.0.0.1:8000"
        }
    }
}

struct APIConfig {
    #if DEBUG
    static var environment: APIEnvironment = .development
    #else
    static var environment: APIEnvironment = .production
    #endif
    
    static var baseURL: String { environment.baseURL }
    
    // API 版本
    static let apiPrefix = "/api"
    
    // 超时设置
    static let requestTimeout: TimeInterval = 30
    static let sseTimeout: TimeInterval = 300  // SSE 长连接 5 分钟
    
    // 重试配置
    static let maxRetries = 3
    static let retryBaseDelay: TimeInterval = 1.0
}
```

### 8.5.2 Xcode Build Configurations

在 **Build Settings** 中设置：

| Configuration | Swift Flags | 用途 |
|--------------|-------------|------|
| Debug | `-DDEBUG` | 开发模式，使用本地 API |
| Release | (无) | 生产模式，使用线上 API |

### 8.5.3 Info.plist 关键配置

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- App Transport Security -->
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSExceptionDomains</key>
        <dict>
            <!-- 仅 Debug 构建需要 localhost 豁免 -->
            <key>localhost</key>
            <dict>
                <key>NSExceptionAllowsInsecureHTTPLoads</key>
                <true/>
            </dict>
            <key>127.0.0.1</key>
            <dict>
                <key>NSExceptionAllowsInsecureHTTPLoads</key>
                <true/>
            </dict>
        </dict>
    </dict>
    
    <!-- Google Sign-In URL Scheme -->
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleTypeRole</key>
            <string>Editor</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>com.googleusercontent.apps.YOUR_IOS_CLIENT_ID</string>
            </array>
        </dict>
    </array>
    
    <!-- Support opening omytree.com links -->
    <key>CFBundleDocumentTypes</key>
    <array/>
</dict>
</plist>
```

### 8.5.4 Associated Domains (Universal Links)

在 **Signing & Capabilities** → **Associated Domains** 中添加：
```
applinks:www.omytree.com
```

在服务器端 `https://www.omytree.com/.well-known/apple-app-site-association` 中配置：
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.omytree.ios",
        "paths": ["/tree/*", "/shared/*"]
      }
    ]
  }
}
```

---

## 8.6 App 入口

```swift
// oMyTreeApp.swift
import SwiftUI
import GoogleSignIn

@main
struct oMyTreeApp: App {
    @State private var authSession = AuthSession()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authSession)
                .tint(.oMyTreeGreen)
                .onOpenURL { url in
                    // Handle Google Sign-In callback
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}

// ContentView.swift
import SwiftUI

struct ContentView: View {
    @Environment(AuthSession.self) private var auth
    
    var body: some View {
        Group {
            if auth.isAuthenticated {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .onAppear {
            auth.restoreSession()
        }
    }
}
```

---

## 8.7 本地调试后端

开发时需要连接 oMyTree 后端 API。有两种方式：

### 方式 A：连接远程服务器（推荐开始时使用）

直接使用生产 API：
```swift
// APIConfig.swift
static var environment: APIEnvironment = .production
// baseURL = "https://www.omytree.com"
```

### 方式 B：本地运行后端

1. 克隆 oMyTree 仓库到 Mac
2. 安装依赖：
   ```bash
   cd /path/to/oMyTree
   corepack enable && pnpm install --frozen-lockfile
   ```
3. 使用 Docker 启动数据库和服务：
   ```bash
   sudo docker compose -f docker/compose.yaml up -d --build
   ```
4. 或用 PM2 启动 API：
   ```bash
   pm2 start ecosystem.config.js --only omytree-api
   ```
5. API 运行在 `http://127.0.0.1:8000`

> **注意**：模拟器可以访问 `localhost`，但真机需要使用 Mac 的局域网 IP 地址 (`192.168.x.x:8000`)，并确保防火墙允许入站。

---

## 8.8 调试工具

### Xcode 控制台日志

```swift
import os

extension Logger {
    static let api = Logger(subsystem: "com.omytree.ios", category: "API")
    static let sse = Logger(subsystem: "com.omytree.ios", category: "SSE")
    static let auth = Logger(subsystem: "com.omytree.ios", category: "Auth")
    static let ui = Logger(subsystem: "com.omytree.ios", category: "UI")
}

// 使用
Logger.api.info("Fetching trees...")
Logger.sse.debug("SSE event: \(eventType)")
Logger.auth.error("Login failed: \(error)")
```

### 网络调试

- **Instruments → Network**: 查看 HTTP 请求详情
- **Charles Proxy / Proxyman**: 抓包调试 API 请求
- **Xcode Console**: 过滤 `com.omytree.ios` 查看分类日志

---

## 8.9 测试配置

### 单元测试 (Swift Testing)

```swift
// oMyTreeTests/APIClientTests.swift
import Testing
@testable import oMyTree

@Suite("APIClient Tests")
struct APIClientTests {
    @Test("Build authenticated request with user ID")
    func authenticatedRequest() async throws {
        // 测试请求构建
        let client = APIClient()
        // ...
    }
    
    @Test("Parse SSE events correctly")
    func parseSSEEvents() async throws {
        let raw = "data: {\"type\":\"delta\",\"content\":\"Hello\"}\n\n"
        // 测试 SSE 解析
    }
}
```

### UI 测试

```swift
// oMyTreeUITests/LoginUITests.swift
import XCTest

final class LoginUITests: XCTestCase {
    let app = XCUIApplication()
    
    override func setUp() {
        continueAfterFailure = false
        app.launchArguments.append("--uitesting")
        app.launch()
    }
    
    func testLoginFlow() throws {
        let emailField = app.textFields["Email"]
        XCTAssertTrue(emailField.exists)
        emailField.tap()
        emailField.typeText("test@example.com")
        
        let passwordField = app.secureTextFields["Password"]
        passwordField.tap()
        passwordField.typeText("password123")
        
        app.buttons["Login"].tap()
        
        // 等待主界面出现
        let treeList = app.navigationBars["Conversations"]
        XCTAssertTrue(treeList.waitForExistence(timeout: 10))
    }
}
```

---

## 8.10 CI/CD（可选）

### GitHub Actions 示例

```yaml
# .github/workflows/ios.yml
name: iOS Build & Test

on:
  push:
    branches: [main]
    paths: ['ios/**']
  pull_request:
    paths: ['ios/**']

jobs:
  build:
    runs-on: macos-15  # macOS 26 runner
    steps:
      - uses: actions/checkout@v4
      
      - name: Select Xcode
        run: sudo xcode-select -s /Applications/Xcode_26.app
      
      - name: Build
        run: |
          xcodebuild build \
            -project ios/oMyTree.xcodeproj \
            -scheme oMyTree \
            -destination 'platform=iOS Simulator,name=iPhone 17' \
            -configuration Debug
      
      - name: Test
        run: |
          xcodebuild test \
            -project ios/oMyTree.xcodeproj \
            -scheme oMyTree \
            -destination 'platform=iOS Simulator,name=iPhone 17' \
            -configuration Debug
```

---

## 8.11 快速开始清单

- [ ] 安装 Xcode 26
- [ ] 创建 Xcode 项目 (com.omytree.ios)
- [ ] 添加 SPM 依赖 (swift-markdown-ui, GoogleSignIn-iOS)
- [ ] 创建文件夹结构 (Core, Models, Services, Views, ViewModels)
- [ ] 配置 APIConfig (Debug → localhost, Release → production)
- [ ] 配置 Info.plist (ATS 豁免, Google URL Scheme)
- [ ] 实现 KeychainManager
- [ ] 实现 APIClient + SSEClient
- [ ] 实现 AuthSession + LoginView
- [ ] 实现 TreeListView (GET /api/trees)
- [ ] 实现 ChatView + ChatViewModel (SSE streaming)
- [ ] 配置 Localizable.xcstrings (en + zh-Hans)
- [ ] 集成 Google Sign-In
- [ ] 测试所有核心流程
