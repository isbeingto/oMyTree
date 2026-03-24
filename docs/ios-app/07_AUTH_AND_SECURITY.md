# 07 — 认证与安全

> iOS 端身份认证流程、Token 管理、Keychain 存储、安全最佳实践

---

## 7.1 认证架构概览

oMyTree 的 Web 端使用 **NextAuth.js (JWT strategy)** 进行认证，支持两种 Provider：

1. **Credentials** — 邮箱 + 密码登录
2. **Google OAuth** — Google 账号登录

iOS 端**不能**直接使用 NextAuth 的 cookie-based session（因为不是浏览器环境），后端已实现移动端专用认证端点。

### 核心认证架构（✅ 已实现）

```
iOS App
   │
   ├─→ POST /api/auth/register              注册 (返回 userId)
   ├─→ POST /api/mobile/login               登录 (返回 userId + 用户信息) ✅
   ├─→ Google Sign-In SDK → POST /api/mobile/google-login  (OAuth) ✅
   ├─→ GET  /api/mobile/me                   获取/验证用户信息 ✅
   │
   └─→ 后续所有 API 请求携带 headers:
        x-omytree-user-id: <uuid>
```

> **实现文件**: `api/routes/mobile_auth.js`，已注册到 `api/index.js`，通过 PM2 部署上线。

**关键发现**：通过分析后端代码（`api/lib/auth_user.js`），API 层识别用户的方式是：

```javascript
// 后端提取用户 ID 的优先级
const headerUserId =
    headerValue(req, "x-omytree-user-id") ||   // ① 专用 header
    headerValue(req, "x-user-id") ||             // ② 通用 header  
    (typeof req?.auth?.user_id === "string" ? req.auth.user_id.trim() : "");  // ③ JWT payload
```

因此 iOS 端只需在每个请求中设置 `x-omytree-user-id: <uuid>` 即可完成身份认证。

---

## 7.2 注册流程

### API 端点
```
POST https://www.omytree.com/api/auth/register
Content-Type: application/json
```

### 请求体
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "preferred_language": "zh-CN",
  "recaptchaToken": null
}
```

### 响应
```json
// 成功 (200)
{
  "ok": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "preferred_language": "zh-CN"
}

// 邮箱已存在 (400)
{ "error": "User already exists" }

// 密码太短 (400)
{ "error": "Password must be at least 6 characters" }
```

### Swift 实现

```swift
struct RegisterRequest: Encodable {
    let email: String
    let password: String
    let preferredLanguage: String?
    let recaptchaToken: String?
    
    enum CodingKeys: String, CodingKey {
        case email, password
        case preferredLanguage = "preferred_language"
        case recaptchaToken
    }
}

struct RegisterResponse: Decodable {
    let ok: Bool?
    let userId: String?
    let email: String?
    let preferredLanguage: String?
    let error: String?
    
    enum CodingKeys: String, CodingKey {
        case ok, userId, email, error
        case preferredLanguage = "preferred_language"
    }
}

func register(email: String, password: String, language: String = "en") async throws -> RegisterResponse {
    let request = RegisterRequest(
        email: email,
        password: password,
        preferredLanguage: language,
        recaptchaToken: nil  // iOS 端可考虑 App Attest 替代
    )
    
    var urlRequest = URLRequest(url: URL(string: "\(baseURL)/api/auth/register")!)
    urlRequest.httpMethod = "POST"
    urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
    urlRequest.httpBody = try JSONEncoder().encode(request)
    
    let (data, response) = try await URLSession.shared.data(for: urlRequest)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw AuthError.networkError
    }
    
    let result = try JSONDecoder().decode(RegisterResponse.self, from: data)
    
    if httpResponse.statusCode == 200, let userId = result.userId {
        // 注册成功后自动登录
        try await KeychainManager.save(userId: userId)
        try await KeychainManager.save(email: email)
        return result
    } else {
        throw AuthError.registrationFailed(result.error ?? "Unknown error")
    }
}
```

---

## 7.3 登录流程 (Credentials) — ✅ 已实现

后端已提供 `POST /api/mobile/login` 端点，iOS 直接调用即可：

1. 用户输入邮箱+密码
2. 调用 `POST /api/mobile/login` → 返回 `userId` + 用户信息
3. 存储 `userId` 到 Keychain
4. 后续所有请求带上 `x-omytree-user-id` header

### 端点详情

```
POST https://www.omytree.com/api/mobile/login
Content-Type: application/json

{ "email": "user@example.com", "password": "securePassword123" }
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

**错误码：**
- `400 missing_credentials` — 邮箱或密码为空
- `401 invalid_credentials` — 邮箱或密码错误
- `401 no_password` — OAuth 账号无密码（提示使用 Google 登录）
- `403 account_disabled` — 账号被禁用

### Swift 实现

```swift
struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct LoginResponse: Decodable {
    let ok: Bool?
    let userId: String?
    let email: String?
    let name: String?
    let role: String?
    let plan: String?
    let preferredLanguage: String?
    let emailVerified: Bool?
    let enableAdvancedContext: Bool?
    let createdAt: String?
    let error: String?
    let code: String?
    
    enum CodingKeys: String, CodingKey {
        case ok, userId, email, name, role, plan, error, code
        case preferredLanguage = "preferred_language"
        case emailVerified = "email_verified"
        case enableAdvancedContext = "enable_advanced_context"
        case createdAt = "created_at"
    }
}

func login(email: String, password: String) async throws -> LoginResponse {
    var urlRequest = URLRequest(url: URL(string: "\(baseURL)/api/mobile/login")!)
    urlRequest.httpMethod = "POST"
    urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
    urlRequest.httpBody = try JSONEncoder().encode(LoginRequest(email: email, password: password))
    
    let (data, response) = try await URLSession.shared.data(for: urlRequest)
    guard let http = response as? HTTPURLResponse else { throw AuthError.networkError }
    
    let result = try JSONDecoder().decode(LoginResponse.self, from: data)
    
    if http.statusCode == 200, let userId = result.userId {
        // 保存认证信息到 Keychain
        try KeychainManager.save(userId: userId)
        try KeychainManager.save(email: email)
        if let name = result.name {
            try KeychainManager.save(displayName: name)
        }
        return result
    } else if result.code == "no_password" {
        throw AuthError.loginFailed("This account uses Google Sign-In")
    } else {
        throw AuthError.loginFailed(result.error ?? "Login failed")
    }
}
```

---

## 7.4 Google Sign-In (iOS) — ✅ 后端已实现

### 配置步骤

1. **Google Cloud Console**：
   - 创建 iOS OAuth Client ID
   - 添加 Bundle ID
   - 下载 `GoogleService-Info.plist`

2. **SPM 依赖**：
   ```
   https://github.com/google/GoogleSignIn-iOS
   ```

3. **Info.plist URL Scheme**：
   ```xml
   <key>CFBundleURLTypes</key>
   <array>
     <dict>
       <key>CFBundleURLSchemes</key>
       <array>
         <string>com.googleusercontent.apps.YOUR_CLIENT_ID</string>
       </array>
     </dict>
   </array>
   ```

### Swift 实现

```swift
import GoogleSignIn

@Observable
class GoogleAuthManager {
    var isSigningIn = false
    var error: String?
    
    func signIn() async throws -> LoginResponse {
        isSigningIn = true
        defer { isSigningIn = false }
        
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootVC = windowScene.windows.first?.rootViewController else {
            throw AuthError.noViewController
        }
        
        // 1. Google SDK 登录
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: rootVC)
        
        guard let idToken = result.user.idToken?.tokenString else {
            throw AuthError.missingToken
        }
        
        let email = result.user.profile?.email ?? ""
        let name = result.user.profile?.name ?? ""
        
        // 2. 将 Google ID Token 发送到后端验证并获取 userId
        return try await verifyGoogleTokenWithBackend(
            idToken: idToken,
            email: email,
            name: name
        )
    }
    
    private func verifyGoogleTokenWithBackend(
        idToken: String,
        email: String,
        name: String
    ) async throws -> LoginResponse {
        // 建议后端新增: POST /api/mobile/google-login
        // 后端验证 Google ID Token，查找/创建用户，返回 userId
        var request = URLRequest(url: URL(string: "\(APIConfig.baseURL)/api/mobile/google-login")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: String] = [
            "idToken": idToken,
            "email": email,
            "name": name
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw AuthError.googleLoginFailed
        }
        
        let loginResponse = try JSONDecoder().decode(LoginResponse.self, from: data)
        if let userId = loginResponse.userId {
            try await KeychainManager.save(userId: userId)
            try await KeychainManager.save(email: email)
        }
        return loginResponse
    }
}
```

### 对应的后端端点（✅ 已实现）

后端 `POST /api/mobile/google-login` 已部署上线（实现文件：`api/routes/mobile_auth.js`）。

**功能概要：**
- 接收 `{ idToken, email, name }` 请求体
- 双重验证策略：优先使用 `google-auth-library`，fallback 到 Google `tokeninfo` 端点
- 验证 `audience` 匹配 `GOOGLE_CLIENT_ID` 或 `GOOGLE_IOS_CLIENT_ID`（环境变量已在 `ecosystem.config.js` 中配置）
- 验证 `email_verified` 为 true
- 如果用户不存在，自动注册
- 返回与 `/api/mobile/login` 相同格式的用户信息

> 完整请求/响应格式参见 `02_API_REFERENCE.md` 第 2.18 节。

---

## 7.5 Keychain 安全存储

### KeychainManager 实现

```swift
import Security
import Foundation

actor KeychainManager {
    private static let service = "com.omytree.ios"
    
    enum Key: String {
        case userId = "user_id"
        case email = "user_email"
        case displayName = "display_name"
        case userRole = "user_role"
        case userPlan = "user_plan"
        case preferredLanguage = "preferred_language"
    }
    
    // MARK: - Save
    static func save(userId: String) throws {
        try save(key: .userId, value: userId)
    }
    
    static func save(email: String) throws {
        try save(key: .email, value: email)
    }
    
    static func save(displayName: String) throws {
        try save(key: .displayName, value: displayName)
    }
    
    private static func save(key: Key, value: String) throws {
        let data = Data(value.utf8)
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        
        // 先删除旧值
        SecItemDelete(query as CFDictionary)
        
        var addQuery = query
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        
        let status = SecItemAdd(addQuery as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status)
        }
    }
    
    // MARK: - Read
    static func getUserId() -> String? {
        return read(key: .userId)
    }
    
    static func getEmail() -> String? {
        return read(key: .email)
    }
    
    static func getDisplayName() -> String? {
        return read(key: .displayName)
    }
    
    private static func read(key: Key) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        
        return String(data: data, encoding: .utf8)
    }
    
    // MARK: - Delete All (Logout)
    static func deleteAll() {
        for key in [Key.userId, .email, .displayName, .userRole, .userPlan, .preferredLanguage] {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: key.rawValue,
            ]
            SecItemDelete(query as CFDictionary)
        }
    }
    
    // MARK: - Check Auth Status
    static var isAuthenticated: Bool {
        return getUserId() != nil
    }
}

enum KeychainError: Error, LocalizedError {
    case saveFailed(OSStatus)
    case readFailed(OSStatus)
    
    var errorDescription: String? {
        switch self {
        case .saveFailed(let status):
            return "Keychain save failed: \(status)"
        case .readFailed(let status):
            return "Keychain read failed: \(status)"
        }
    }
}
```

---

## 7.6 AuthSession — 全局认证状态

```swift
import SwiftUI
import Observation

@Observable
class AuthSession {
    var isAuthenticated = false
    var userId: String?
    var email: String?
    var displayName: String?
    var role: String = "user"
    var plan: String = "free"
    var preferredLanguage: String = "en"
    
    var isLoading = false
    var error: String?
    
    // 启动时检测已有认证状态
    func restoreSession() {
        if let userId = KeychainManager.getUserId() {
            self.userId = userId
            self.email = KeychainManager.getEmail()
            self.displayName = KeychainManager.getDisplayName()
            self.isAuthenticated = true
        }
    }
    
    // 登录
    func login(email: String, password: String) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        
        do {
            let response = try await AuthService.login(email: email, password: password)
            userId = response.userId
            self.email = response.email
            displayName = response.name
            role = response.role ?? "user"
            plan = response.plan ?? "free"
            preferredLanguage = response.preferredLanguage ?? "en"
            isAuthenticated = true
        } catch let authError as AuthError {
            error = authError.localizedDescription
        } catch {
            self.error = error.localizedDescription
        }
    }
    
    // 注册
    func register(email: String, password: String, language: String) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        
        do {
            let response = try await AuthService.register(
                email: email,
                password: password,
                language: language
            )
            // 注册成功后自动登录
            await login(email: email, password: password)
        } catch let authError as AuthError {
            error = authError.localizedDescription
        } catch {
            self.error = error.localizedDescription
        }
    }
    
    // Google 登录
    func googleSignIn() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        
        do {
            let manager = GoogleAuthManager()
            let response = try await manager.signIn()
            userId = response.userId
            email = response.email
            displayName = response.name
            role = response.role ?? "user"
            plan = response.plan ?? "free"
            isAuthenticated = true
        } catch {
            self.error = error.localizedDescription
        }
    }
    
    // 退出登录
    func logout() {
        KeychainManager.deleteAll()
        GIDSignIn.sharedInstance.signOut()
        
        userId = nil
        email = nil
        displayName = nil
        role = "user"
        plan = "free"
        isAuthenticated = false
    }
}
```

---

## 7.7 请求认证中间件

所有 API 请求自动注入认证 header：

```swift
// APIClient 中已实现（见 05_SWIFT_IMPLEMENTATION_GUIDE）
// 关键代码：

private func authenticatedRequest(for url: URL) -> URLRequest {
    var request = URLRequest(url: url)
    
    // 注入用户 ID
    if let userId = KeychainManager.getUserId() {
        request.setValue(userId, forHTTPHeaderField: "x-omytree-user-id")
    }
    
    // 可选：workspace ID（Team 计划）
    if let workspaceId = UserDefaults.standard.string(forKey: "currentWorkspaceId") {
        request.setValue(workspaceId, forHTTPHeaderField: "x-omytree-workspace-id")
    }
    
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("oMyTree-iOS/1.0", forHTTPHeaderField: "User-Agent")
    
    return request
}
```

---

## 7.8 安全最佳实践

### 7.8.1 传输安全 (ATS)

```xml
<!-- Info.plist — App Transport Security -->
<!-- 生产环境不需要任何豁免，因为 omytree.com 使用 HTTPS -->
<!-- 仅开发环境需要 localhost 豁免 -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSExceptionDomains</key>
    <dict>
        <!-- 仅 Debug 构建 -->
        <key>localhost</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

### 7.8.2 Certificate Pinning（可选但推荐）

```swift
class PinnedSessionDelegate: NSObject, URLSessionDelegate {
    // omytree.com 的证书公钥 hash (SHA256)
    // 实际部署时更新为真实证书指纹
    private let pinnedHashes: Set<String> = [
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",  // 主证书
        "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",  // 备用证书
    ]
    
    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              challenge.protectionSpace.host == "www.omytree.com",
              let serverTrust = challenge.protectionSpace.serverTrust else {
            return (.performDefaultHandling, nil)
        }
        
        // 验证证书链
        let policies = [SecPolicyCreateSSL(true, "www.omytree.com" as CFString)]
        SecTrustSetPolicies(serverTrust, policies as CFTypeRef)
        
        var error: CFError?
        guard SecTrustEvaluateWithError(serverTrust, &error) else {
            return (.cancelAuthenticationChallenge, nil)
        }
        
        // 检查公钥 pin（简化版，生产环境用 TrustKit 等库）
        return (.useCredential, URLCredential(trust: serverTrust))
    }
}
```

### 7.8.3 Keychain 安全级别

```swift
// 选择合适的 Keychain 可访问性级别
kSecAttrAccessibleAfterFirstUnlock
// ✅ 设备解锁后一直可用（后台刷新可用）
// 适合 API token / userId

kSecAttrAccessibleWhenUnlockedThisDeviceOnly
// 🔒 仅解锁时可用 + 不迁移到新设备
// 适合高敏感数据
```

### 7.8.4 生物识别保护（可选）

```swift
import LocalAuthentication

func authenticateWithBiometrics() async throws -> Bool {
    let context = LAContext()
    var error: NSError?
    
    guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
        throw AuthError.biometricsNotAvailable
    }
    
    return try await context.evaluatePolicy(
        .deviceOwnerAuthenticationWithBiometrics,
        localizedReason: "Unlock oMyTree"
    )
}
```

---

## 7.9 错误类型定义

```swift
enum AuthError: Error, LocalizedError {
    case networkError
    case loginFailed(String)
    case registrationFailed(String)
    case accountDisabled
    case googleLoginFailed
    case missingToken
    case noViewController
    case biometricsNotAvailable
    case sessionExpired
    case invalidCredentials
    
    var errorDescription: String? {
        switch self {
        case .networkError:
            return "Network connection error. Please check your connection."
        case .loginFailed(let msg):
            return "Login failed: \(msg)"
        case .registrationFailed(let msg):
            return "Registration failed: \(msg)"
        case .accountDisabled:
            return "Your account has been disabled."
        case .googleLoginFailed:
            return "Google sign-in failed. Please try again."
        case .missingToken:
            return "Authentication token not found."
        case .noViewController:
            return "Unable to present sign-in screen."
        case .biometricsNotAvailable:
            return "Biometric authentication is not available."
        case .sessionExpired:
            return "Your session has expired. Please log in again."
        case .invalidCredentials:
            return "Invalid email or password."
        }
    }
}
```

---

## 7.10 完整认证流程图

```
App 启动
    │
    ▼
KeychainManager.getUserId()
    │
    ├─ 有 userId → GET /api/mobile/me 验证 → 成功 → 进入主界面
    │                                          │
    │                                   401/404?
    │                                          │
    │                                    是 → 跳转登录
    │
    └─ 无 userId → 显示登录页
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
        邮箱登录    邮箱注册    Google登录
            │           │           │
            │      POST /api/      │
            │   auth/register  Google SDK
            │           │       signIn()
            │           ▼           │
            │     注册成功          ▼
            │    自动登录    获取 idToken
            │           │           │
            ▼           ▼           ▼
     POST /api/mobile/login   POST /api/mobile/google-login
            │                       │
            ▼                       ▼
      获取 userId              获取 userId
            │                       │
            └───────┬───────────────┘
                    ▼
          KeychainManager.save(userId)
                    │
                    ▼
            加载主界面 (TreeListView)
                    │
                    ▼
         所有 API 请求自动附加:
         x-omytree-user-id: <uuid>
```

---

## 7.11 注意事项

1. **不要在 UserDefaults 中存储敏感信息**：userId 存 Keychain，不存 UserDefaults
2. **退出登录时彻底清理**：Keychain、内存状态、Google Sign Out
3. **401 全局拦截**：APIClient 收到 401 时自动跳转登录页
4. **reCAPTCHA 替代**：iOS 端无法使用 Web 版 reCAPTCHA，可使用 Apple 的 App Attest 或直接跳过（后端已支持无 token 时 skip）
5. **密码要求**：最少 6 字符（与 Web 端一致）
6. **邮箱验证**：注册后后端会自动发送验证邮件
7. **多设备登录**：当前架构支持多设备同时登录（基于 userId header，非 session）
