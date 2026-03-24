# 05 — Swift 核心实现指南

> 覆盖：网络层、SSE 客户端、并发模式、状态管理  
> Swift 6.2 · iOS 26 · URLSession async/await

---

## 5.1 网络层 — APIClient

```swift
import Foundation

// MARK: - API Error

enum APIError: LocalizedError {
    case invalidURL
    case httpError(status: Int, code: String?, message: String?, hint: String?)
    case decodingError(Error)
    case networkError(Error)
    case unauthorized
    case quotaExceeded(resetsAt: Date?)
    case serverError(String)
    case cancelled
    
    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .httpError(let status, _, let message, _):
            return message ?? "HTTP \(status)"
        case .decodingError(let error): return "Decoding error: \(error.localizedDescription)"
        case .networkError(let error): return error.localizedDescription
        case .unauthorized: return "Authentication required"
        case .quotaExceeded: return "Quota exceeded"
        case .serverError(let msg): return msg
        case .cancelled: return "Request cancelled"
        }
    }
    
    var isUnauthorized: Bool {
        if case .unauthorized = self { return true }
        if case .httpError(let status, _, _, _) = self, status == 401 { return true }
        return false
    }
}

// MARK: - HTTP Method

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

// MARK: - API Endpoint

struct APIEndpoint {
    let method: HTTPMethod
    let path: String
    var queryItems: [URLQueryItem]?
    var body: Encodable?
    var contentType: String = "application/json"
    
    static func get(_ path: String, query: [String: String]? = nil) -> APIEndpoint {
        APIEndpoint(
            method: .get,
            path: path,
            queryItems: query?.map { URLQueryItem(name: $0.key, value: $0.value) }
        )
    }
    
    static func post(_ path: String, body: Encodable? = nil) -> APIEndpoint {
        APIEndpoint(method: .post, path: path, body: body)
    }
    
    static func put(_ path: String, body: Encodable? = nil) -> APIEndpoint {
        APIEndpoint(method: .put, path: path, body: body)
    }
    
    static func patch(_ path: String, body: Encodable? = nil) -> APIEndpoint {
        APIEndpoint(method: .patch, path: path, body: body)
    }
    
    static func delete(_ path: String) -> APIEndpoint {
        APIEndpoint(method: .delete, path: path)
    }
}

// MARK: - API Client

actor APIClient {
    static let shared = APIClient()
    
    private let session: URLSession
    private let decoder = JSONDecoder.api
    private let encoder = JSONEncoder.api
    
    #if DEBUG
    // 开发环境可切换
    var baseURL = URL(string: "http://127.0.0.1:8000")!
    #else
    var baseURL = URL(string: "https://www.omytree.com")!
    #endif
    
    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 600  // LLM 请求可能很耗时
        config.waitsForConnectivity = true
        config.httpAdditionalHeaders = [
            "Accept": "application/json",
        ]
        self.session = URLSession(configuration: config)
    }
    
    // MARK: - Build Request
    
    private func buildRequest(_ endpoint: APIEndpoint) throws -> URLRequest {
        var components = URLComponents(url: baseURL.appendingPathComponent("/api" + endpoint.path), resolvingAgainstBaseURL: false)
        
        if let queryItems = endpoint.queryItems {
            components?.queryItems = queryItems
        }
        
        guard let url = components?.url else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        
        // Auth headers
        if let userId = AuthManager.shared.userId {
            request.setValue(userId, forHTTPHeaderField: "x-omytree-user-id")
        }
        if let workspaceId = WorkspaceManager.shared.activeWorkspaceId {
            request.setValue(workspaceId, forHTTPHeaderField: "x-omytree-workspace-id")
        }
        if let token = AuthManager.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        // Body
        if let body = endpoint.body {
            request.setValue(endpoint.contentType, forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        
        return request
    }
    
    // MARK: - Generic Request
    
    func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> T {
        let request = try buildRequest(endpoint)
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }
        
        // Handle error status codes
        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }
        
        if httpResponse.statusCode == 429 {
            // Parse retry-after or quota reset time
            throw APIError.quotaExceeded(resetsAt: nil)
        }
        
        if httpResponse.statusCode >= 400 {
            // Try to parse error response
            if let errorBody = try? decoder.decode(APIErrorResponse.self, from: data) {
                throw APIError.httpError(
                    status: httpResponse.statusCode,
                    code: errorBody.code ?? errorBody.error,
                    message: errorBody.message ?? errorBody.error,
                    hint: errorBody.hint
                )
            }
            throw APIError.httpError(
                status: httpResponse.statusCode,
                code: nil,
                message: "Request failed with status \(httpResponse.statusCode)",
                hint: nil
            )
        }
        
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
    
    // MARK: - Void Request (no response body expected)
    
    func requestVoid(_ endpoint: APIEndpoint) async throws {
        let _: EmptyResponse = try await request(endpoint)
    }
    
    // MARK: - Multipart Upload
    
    func upload<T: Decodable>(
        path: String,
        fileData: Data,
        fileName: String,
        mimeType: String,
        fields: [String: String] = [:]
    ) async throws -> T {
        let boundary = UUID().uuidString
        var request = try buildRequest(.post(path))
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        
        // Text fields
        for (key, value) in fields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        
        // File
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = body
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.serverError("Upload failed")
        }
        
        return try decoder.decode(T.self, from: data)
    }
}

// MARK: - Support Types

struct APIErrorResponse: Codable {
    let ok: Bool?
    let error: String?
    let code: String?
    let message: String?
    let hint: String?
    let detail: String?
}

struct EmptyResponse: Codable {
    let ok: Bool?
}

struct AnyEncodable: Encodable {
    private let encode: (Encoder) throws -> Void
    
    init(_ value: Encodable) {
        self.encode = { encoder in try value.encode(to: encoder) }
    }
    
    func encode(to encoder: Encoder) throws {
        try encode(encoder)
    }
}
```

---

## 5.2 SSE 客户端 — 核心实现

```swift
import Foundation

// MARK: - SSE Client

/// Parses Server-Sent Events from a URLSession bytes stream.
/// Handles oMyTree's SSE protocol: comments (: ping), data lines, empty line delimiters.
actor SSEClient {
    
    /// Stream turn events from the given SSE endpoint.
    /// Returns an AsyncThrowingStream of TurnStreamEvent.
    static func stream(
        url: URL,
        body: Encodable,
        userId: String?,
        workspaceId: String? = nil
    ) -> AsyncThrowingStream<TurnStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.timeoutInterval = 600 // 10 minutes for LLM
                    
                    if let userId {
                        request.setValue(userId, forHTTPHeaderField: "x-omytree-user-id")
                    }
                    if let workspaceId {
                        request.setValue(workspaceId, forHTTPHeaderField: "x-omytree-workspace-id")
                    }
                    if let token = await AuthManager.shared.accessToken {
                        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                    }
                    
                    request.httpBody = try JSONEncoder.api.encode(AnyEncodable(body))
                    
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    
                    guard let httpResponse = response as? HTTPURLResponse else {
                        continuation.finish(throwing: APIError.networkError(URLError(.badServerResponse)))
                        return
                    }
                    
                    guard httpResponse.statusCode == 200 else {
                        // Try to read error body
                        var errorData = Data()
                        for try await byte in bytes {
                            errorData.append(byte)
                            if errorData.count > 4096 { break }
                        }
                        let errorMsg = String(data: errorData, encoding: .utf8) ?? "Unknown error"
                        continuation.finish(throwing: APIError.httpError(
                            status: httpResponse.statusCode,
                            code: nil,
                            message: errorMsg,
                            hint: nil
                        ))
                        return
                    }
                    
                    var dataBuffer = ""
                    
                    for try await line in bytes.lines {
                        // Check cancellation
                        try Task.checkCancellation()
                        
                        // Comment lines (heartbeat or connection signal)
                        if line.hasPrefix(":") {
                            let comment = String(line.dropFirst()).trimmingCharacters(in: .whitespaces)
                            if comment == "connected" {
                                continuation.yield(.connected)
                            }
                            // ": ping" → heartbeat, ignore but keeps connection alive
                            continue
                        }
                        
                        // Empty line → event boundary
                        if line.isEmpty {
                            if !dataBuffer.isEmpty {
                                let event = parseDataPayload(dataBuffer)
                                continuation.yield(event)
                                dataBuffer = ""
                            }
                            continue
                        }
                        
                        // Data line
                        if line.hasPrefix("data:") {
                            let payload = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                            if dataBuffer.isEmpty {
                                dataBuffer = payload
                            } else {
                                dataBuffer += "\n" + payload
                            }
                            continue
                        }
                        
                        // event: line (oMyTree doesn't use this, but handle gracefully)
                        // id: line (not used by oMyTree)
                    }
                    
                    // Process any remaining buffer
                    if !dataBuffer.isEmpty {
                        let event = parseDataPayload(dataBuffer)
                        continuation.yield(event)
                    }
                    
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish(throwing: APIError.cancelled)
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            
            continuation.onTermination = { @Sendable _ in
                task.cancel()
            }
        }
    }
    
    /// Parse a JSON data payload into a TurnStreamEvent
    private static func parseDataPayload(_ jsonString: String) -> TurnStreamEvent {
        guard let data = jsonString.data(using: .utf8) else {
            return .unknown(jsonString)
        }
        
        // First, peek at the "type" field
        struct TypePeek: Codable { let type: String }
        
        guard let peek = try? JSONDecoder.api.decode(TypePeek.self, from: data) else {
            return .unknown(jsonString)
        }
        
        switch peek.type {
        case "tree":
            // start-root: tree created
            struct TreePayload: Codable { let tree: Tree }
            if let payload = try? JSONDecoder.api.decode(TreePayload.self, from: data) {
                return .treeCreated(payload.tree)
            }
            
        case "start":
            if let payload = try? JSONDecoder.api.decode(TurnStartPayload.self, from: data) {
                return .start(payload)
            }
            
        case "reasoning":
            struct ReasoningPayload: Codable { let text: String }
            if let payload = try? JSONDecoder.api.decode(ReasoningPayload.self, from: data) {
                return .reasoning(text: payload.text)
            }
            
        case "delta":
            struct DeltaPayload: Codable { let text: String }
            if let payload = try? JSONDecoder.api.decode(DeltaPayload.self, from: data) {
                return .delta(text: payload.text)
            }
            
        case "done":
            if let payload = try? JSONDecoder.api.decode(TurnDonePayload.self, from: data) {
                return .done(payload)
            }
            
        case "error":
            if let payload = try? JSONDecoder.api.decode(TurnErrorPayload.self, from: data) {
                return .error(payload)
            }
            
        default:
            break
        }
        
        return .unknown(jsonString)
    }
}
```

---

## 5.3 Service 层示例 — TurnService

```swift
import Foundation

// MARK: - Turn Service

struct TurnService {
    static let shared = TurnService()
    private let api = APIClient.shared
    
    /// Stream a new turn (continue conversation)
    func streamTurn(
        treeId: String,
        nodeId: String,
        text: String,
        provider: String? = nil,
        model: String? = nil,
        uploadIds: [String]? = nil,
        knowledgeBaseIds: [String]? = nil
    ) -> AsyncThrowingStream<TurnStreamEvent, Error> {
        let body = TurnStreamRequest(
            treeId: treeId,
            nodeId: nodeId,
            userText: text,
            provider: provider,
            model: model,
            uploadIds: uploadIds,
            knowledgeBaseIds: knowledgeBaseIds
        )
        
        #if DEBUG
        let baseURL = URL(string: "http://127.0.0.1:8000")!
        #else
        let baseURL = URL(string: "https://www.omytree.com")!
        #endif
        
        let url = baseURL.appendingPathComponent("/api/turn/stream")
        
        return SSEClient.stream(
            url: url,
            body: body,
            userId: AuthManager.shared.userId,
            workspaceId: WorkspaceManager.shared.activeWorkspaceId
        )
    }
    
    /// Start a new tree with first message (SSE)
    func startNewTree(
        text: String,
        contextProfile: ContextProfile = .standard,
        memoryScope: MemoryScope = .branch,
        provider: String? = nil,
        model: String? = nil,
        uploadIds: [String]? = nil,
        knowledgeBaseIds: [String]? = nil
    ) -> AsyncThrowingStream<TurnStreamEvent, Error> {
        let body = StartRootRequest(
            userText: text,
            contextProfile: contextProfile,
            memoryScope: memoryScope,
            provider: provider,
            model: model,
            uploadIds: uploadIds,
            knowledgeBaseIds: knowledgeBaseIds
        )
        
        #if DEBUG
        let baseURL = URL(string: "http://127.0.0.1:8000")!
        #else
        let baseURL = URL(string: "https://www.omytree.com")!
        #endif
        
        let url = baseURL.appendingPathComponent("/api/tree/start-root")
        
        return SSEClient.stream(
            url: url,
            body: body,
            userId: AuthManager.shared.userId,
            workspaceId: WorkspaceManager.shared.activeWorkspaceId
        )
    }
    
    /// Abort a running turn
    func abortTurn(turnId: String) async throws {
        struct AbortBody: Codable { let turnId: String }
        let _: EmptyResponse = try await api.request(
            .post("/turn/abort", body: AbortBody(turnId: turnId))
        )
    }
}
```

---

## 5.4 ChatViewModel — 完整实现骨架

```swift
import Foundation
import SwiftUI

@Observable
class ChatViewModel {
    // MARK: - State
    
    var currentTree: Tree?
    var nodes: [TreeNode] = []
    var currentNodeId: String?
    var currentPath: [String] = []  // 当前路径上的 node IDs
    
    // Streaming state
    var isStreaming = false
    var streamingText = ""
    var reasoningText = ""
    var currentTurnId: String?
    var streamingProvider: String?
    var streamingModel: String?
    
    // UI state
    var isLoading = false
    var error: APIError?
    var inputText = ""
    
    // Model selection
    var selectedProvider: String?
    var selectedModel: String?
    
    // Services
    private let treeService = TreeService.shared
    private let turnService = TurnService.shared
    private let nodeService = NodeService.shared
    
    // Stream task reference (for cancellation)
    private var streamTask: Task<Void, Never>?
    
    // MARK: - Tree Loading
    
    func loadTree(id: String) async {
        isLoading = true
        defer { isLoading = false }
        
        do {
            let tree = try await treeService.getTree(id: id)
            await MainActor.run {
                self.currentTree = tree
                self.nodes = tree.nodes ?? []
                // Navigate to the deepest node on the main branch
                self.navigateToDeepest()
            }
        } catch {
            await MainActor.run {
                self.error = error as? APIError ?? .networkError(error)
            }
        }
    }
    
    // MARK: - Send Message (SSE)
    
    func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard !isStreaming else { return }
        
        let savedText = text
        inputText = ""
        
        streamTask = Task { @MainActor in
            isStreaming = true
            streamingText = ""
            reasoningText = ""
            
            do {
                let stream: AsyncThrowingStream<TurnStreamEvent, Error>
                
                if currentTree == nil {
                    // New tree
                    stream = turnService.startNewTree(
                        text: savedText,
                        provider: selectedProvider,
                        model: selectedModel
                    )
                } else {
                    // Continue existing tree
                    guard let nodeId = currentNodeId else { return }
                    stream = turnService.streamTurn(
                        treeId: currentTree!.id,
                        nodeId: nodeId,
                        text: savedText,
                        provider: selectedProvider,
                        model: selectedModel
                    )
                }
                
                for try await event in stream {
                    try Task.checkCancellation()
                    
                    switch event {
                    case .connected:
                        break  // Connection established
                        
                    case .treeCreated(let tree):
                        self.currentTree = tree
                        
                    case .start(let payload):
                        self.currentTurnId = payload.turnId
                        self.streamingProvider = payload.provider
                        self.streamingModel = payload.model
                        
                    case .reasoning(let text):
                        self.reasoningText += text
                        
                    case .delta(let text):
                        self.streamingText += text
                        
                    case .done(let payload):
                        self.finalizeTurn(payload)
                        
                    case .error(let payload):
                        self.error = .httpError(
                            status: 500,
                            code: payload.error.code,
                            message: payload.error.message,
                            hint: nil
                        )
                        
                    case .ping:
                        break  // Heartbeat
                        
                    case .unknown(let raw):
                        print("[ChatVM] Unknown SSE event: \(raw.prefix(100))")
                    }
                }
            } catch is CancellationError {
                // User cancelled
            } catch {
                self.error = error as? APIError ?? .networkError(error)
            }
            
            isStreaming = false
            streamingText = ""
            reasoningText = ""
            currentTurnId = nil
        }
    }
    
    // MARK: - Stop Generation
    
    func stopGeneration() {
        guard isStreaming, let turnId = currentTurnId else { return }
        
        // Cancel the stream task (closes connection → server aborts LLM)
        streamTask?.cancel()
        
        // Also explicitly call abort endpoint
        Task {
            try? await turnService.abortTurn(turnId: turnId)
        }
    }
    
    // MARK: - Finalize Turn
    
    private func finalizeTurn(_ payload: TurnDonePayload) {
        if let userNode = payload.userNode {
            nodes.append(userNode)
        }
        if let aiNode = payload.aiNode {
            // Apply reasoning content if available
            var node = aiNode
            if !reasoningText.isEmpty {
                node.reasoningContent = reasoningText
                node.hasReasoning = true
            }
            nodes.append(node)
            currentNodeId = node.id
        }
        if let rootNode = payload.rootNode {
            // For start-root: the root node
            if nodes.isEmpty || !nodes.contains(where: { $0.id == rootNode.id }) {
                nodes.insert(rootNode, at: 0)
            }
        }
        if let tree = payload.tree {
            currentTree = tree
        }
        
        rebuildCurrentPath()
    }
    
    // MARK: - Navigation
    
    /// Navigate to a specific node (for branch switching)
    func navigateToNode(_ nodeId: String) {
        currentNodeId = nodeId
        rebuildCurrentPath()
    }
    
    /// Find and navigate to the deepest node on the current branch
    private func navigateToDeepest() {
        guard let rootNode = nodes.first(where: { $0.parentId == nil }) else { return }
        
        var current = rootNode
        while true {
            let children = nodes.filter { $0.parentId == current.id }
            guard let firstChild = children.first else { break }
            current = firstChild
        }
        currentNodeId = current.id
        rebuildCurrentPath()
    }
    
    /// Rebuild current path from root to current node
    private func rebuildCurrentPath() {
        guard let nodeId = currentNodeId else {
            currentPath = []
            return
        }
        
        var path: [String] = []
        var current: String? = nodeId
        
        while let id = current {
            path.insert(id, at: 0)
            current = nodes.first(where: { $0.id == id })?.parentId
        }
        
        currentPath = path
    }
    
    /// Get children of a node (for branch indicator)
    func childrenOf(_ nodeId: String) -> [TreeNode] {
        nodes.filter { $0.parentId == nodeId }
    }
    
    /// Get messages on the current path (for chat display)
    var currentPathMessages: [TreeNode] {
        currentPath.compactMap { id in
            nodes.first(where: { $0.id == id })
        }
    }
    
    // MARK: - Branch Operations
    
    /// Get branching points (nodes with multiple children)
    var branchPoints: [String] {
        let parentIds = Dictionary(grouping: nodes, by: { $0.parentId ?? "ROOT" })
        return parentIds.filter { $0.value.count > 1 }.map(\.key)
    }
}
```

---

## 5.5 Swift Concurrency 最佳实践

### Task 生命周期管理
```swift
struct ChatView: View {
    @State private var viewModel = ChatViewModel()
    
    var body: some View {
        VStack {
            // ...
        }
        .task {
            // Automatically cancelled when view disappears
            await viewModel.loadTree(id: treeId)
        }
        .onDisappear {
            // Explicitly stop streaming if active
            viewModel.stopGeneration()
        }
    }
}
```

### 并行请求
```swift
// 同时加载多个独立数据
func loadDashboardData() async {
    async let trees = treeService.listTrees()
    async let quota = accountService.getQuotaStatus()
    async let workspace = workspaceService.listWorkspaces()
    
    do {
        let (treesResult, quotaResult, workspaceResult) = try await (trees, quota, workspace)
        await MainActor.run {
            self.trees = treesResult.trees ?? []
            self.quota = quotaResult
            self.workspaces = workspaceResult
        }
    } catch {
        // Handle error
    }
}
```

### @MainActor UI 更新
```swift
// Swift 6.2: 默认 MainActor，需要后台处理时用 @concurrent
@concurrent
func processLargeData(_ data: Data) -> [TreeNode] {
    // Heavy computation runs off main thread
    let decoder = JSONDecoder.api
    return (try? decoder.decode([TreeNode].self, from: data)) ?? []
}
```

---

## 5.6 Markdown 渲染

```swift
import MarkdownUI

struct MarkdownMessageView: View {
    let content: String
    
    var body: some View {
        Markdown(content)
            .markdownTheme(.oMyTree)
            .textSelection(.enabled)
    }
}

// Custom theme
extension MarkdownUI.Theme {
    static let oMyTree = Theme()
        .text {
            FontSize(16)
            ForegroundColor(.primary)
        }
        .code {
            FontFamilyVariant(.monospaced)
            FontSize(14)
            BackgroundColor(.secondary.opacity(0.1))
        }
        .codeBlock { configuration in
            ScrollView(.horizontal, showsIndicators: false) {
                configuration.label
                    .markdownTextStyle {
                        FontFamilyVariant(.monospaced)
                        FontSize(13)
                    }
                    .padding(12)
            }
            .background(Color(.systemGray6))
            .cornerRadius(8)
        }
}
```

---

## 5.7 错误重试与网络恢复

```swift
extension APIClient {
    /// Retry a request with exponential backoff
    func requestWithRetry<T: Decodable>(
        _ endpoint: APIEndpoint,
        maxRetries: Int = 3,
        initialDelay: TimeInterval = 1.0
    ) async throws -> T {
        var lastError: Error?
        var delay = initialDelay
        
        for attempt in 0..<maxRetries {
            do {
                return try await request(endpoint)
            } catch let error as APIError {
                lastError = error
                
                // Don't retry auth errors or client errors
                if error.isUnauthorized { throw error }
                if case .httpError(let status, _, _, _) = error,
                   (400..<500).contains(status) && status != 429 {
                    throw error
                }
                
                // Wait before retrying
                if attempt < maxRetries - 1 {
                    try await Task.sleep(for: .seconds(delay))
                    delay *= 2  // Exponential backoff
                }
            } catch {
                lastError = error
                if attempt < maxRetries - 1 {
                    try await Task.sleep(for: .seconds(delay))
                    delay *= 2
                }
            }
        }
        
        throw lastError ?? APIError.networkError(URLError(.timedOut))
    }
}
```

---

## 5.8 推理过程展示 (DeepSeek)

```swift
struct ReasoningView: View {
    let text: String
    @State private var isExpanded = false
    
    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            ScrollView {
                Text(text)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
            .frame(maxHeight: 200)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "brain.head.profile")
                Text("Thinking Process")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal)
    }
}
```
