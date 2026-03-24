# 03 — 数据模型与 Swift Codable 结构体

> 本文档定义 iOS App 中所有与后端对应的数据模型。  
> 所有模型均实现 `Codable`、`Identifiable`、`Hashable`。  
> 使用 `snake_case` JSON key 通过 `CodingKeys` 映射到 Swift `camelCase`。

---

## 3.1 全局配置

```swift
import Foundation

// MARK: - JSON Decoder Configuration
extension JSONDecoder {
    static let api: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            // ISO 8601 with fractional seconds
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: dateString) {
                return date
            }
            // Fallback without fractional seconds
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: dateString) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date: \(dateString)"
            )
        }
        return decoder
    }()
}

extension JSONEncoder {
    static let api: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}
```

---

## 3.2 核心模型 — Tree

```swift
// MARK: - Tree

struct Tree: Codable, Identifiable, Hashable {
    let id: String
    var topic: String?
    var title: String?
    let userId: String?
    let createdAt: Date?
    var updatedAt: Date?
    var nodeCount: Int?
    var context: TreeContext?

    // Deprecated flat fields (for older trees)
    var contextProfile: ContextProfile?
    var memoryScope: MemoryScope?
}

struct TreeContext: Codable, Hashable {
    var contextProfile: ContextProfile?
    var memoryScope: MemoryScope?
    var treeSummary: AnyCodable?
    var treeSummaryText: String?
    var treeSummaryUpdatedAt: Date?
    var treeSummaryLastError: String?
    var treeSummaryLastErrorAt: Date?
}

enum ContextProfile: String, Codable, CaseIterable {
    case lite
    case standard
    case max
}

enum MemoryScope: String, Codable, CaseIterable {
    case branch
    case tree
}

/// Tree list item (lighter than full Tree)
struct TreeListItem: Codable, Identifiable, Hashable {
    let id: String
    var topic: String?
    var title: String?
    let createdAt: Date?
    var updatedAt: Date?
    var nodeCount: Int?
    var contextProfile: ContextProfile?
    var memoryScope: MemoryScope?
}
```

---

## 3.3 核心模型 — Node

```swift
// MARK: - Node

struct TreeNode: Codable, Identifiable, Hashable {
    let id: String
    var parentId: String?
    var role: NodeRole
    var text: String
    let createdAt: Date?
    var provider: String?
    var model: String?
    var reasoningContent: String?
    var hasReasoning: Bool?
    var thoughtSignature: String?
    var turnId: String?
    var childrenCount: Int?
    var seq: Int?
    var children: [String]?  // child node IDs
    
    /// Display label: topic or first N chars of text
    var displayTitle: String {
        let preview = text.prefix(80)
        return preview.isEmpty ? "(empty)" : String(preview)
    }
}

enum NodeRole: String, Codable {
    case user
    case assistant
    case system
}
```

---

## 3.4 核心模型 — Turn

```swift
// MARK: - Turn

struct Turn: Codable, Identifiable, Hashable {
    let id: String?
    let treeId: String?
    let parentNodeId: String?
    var userNodeId: String?
    var aiNodeId: String?
    let provider: String?
    let model: String?
    let isByok: Bool?
    var usageJson: TurnUsage?
    let createdAt: Date?
}

struct TurnUsage: Codable, Hashable {
    let promptTokens: Int?
    let completionTokens: Int?
    let totalTokens: Int?
}
```

---

## 3.5 SSE 事件模型

```swift
// MARK: - SSE Events

/// Raw SSE event parsed from stream
struct SSEEvent {
    let type: String?     // from "event:" line (optional)
    let data: String      // from "data:" line(s)
    let id: String?       // from "id:" line (optional)
}

/// Parsed SSE payload types from oMyTree API
enum TurnStreamEvent {
    case connected
    case ping
    case treeCreated(Tree)
    case start(TurnStartPayload)
    case reasoning(text: String)
    case delta(text: String)
    case done(TurnDonePayload)
    case error(TurnErrorPayload)
    case unknown(String)
}

struct TurnStartPayload: Codable {
    let type: String  // "start"
    let traceId: String?
    let provider: String?
    let model: String?
    let turnId: String?
}

struct TurnDonePayload: Codable {
    let type: String  // "done"
    let turn: Turn?
    let userNode: TreeNode?
    let aiNode: TreeNode?
    let rootNode: TreeNode?     // Only in start-root response
    let tree: Tree?             // Only in start-root response
    let citations: [Citation]?
    let hasReasoning: Bool?
    let reasoningLength: Int?
    let usage: TurnUsage?
    let provider: String?
    let model: String?
    let isByok: Bool?
    let traceId: String?
}

struct TurnErrorPayload: Codable {
    let type: String  // "error"
    let error: TurnError
    let traceId: String?
}

struct TurnError: Codable, Hashable {
    let code: String
    let provider: String?
    let message: String?
}

struct Citation: Codable, Hashable {
    let title: String?
    let url: String?
    let snippet: String?
}
```

---

## 3.6 Keyframe

```swift
// MARK: - Keyframe

struct Keyframe: Codable, Identifiable, Hashable {
    let id: String
    let nodeId: String
    let treeId: String
    var annotation: String?
    let createdAt: Date?
}
```

---

## 3.7 Memo

```swift
// MARK: - Memo

struct Memo: Codable, Identifiable, Hashable {
    let memoId: String
    let createdAt: Date?
    var scope: MemoScope?
    var bullets: [MemoBullet]
    var coverage: MemoCoverage?
    var basedOnMemoId: String?
    var lang: String?
    
    var id: String { memoId }
}

struct MemoScope: Codable, Hashable {
    let type: String?
    let rootNodeId: String?
}

struct MemoBullet: Codable, Hashable {
    let text: String
    var anchors: [MemoAnchor]?
}

struct MemoAnchor: Codable, Hashable {
    let type: String?
    let id: String?
}

struct MemoCoverage: Codable, Hashable {
    let nodeCount: Int?
    let deltaCount: Int?
}

struct MemoHistoryItem: Codable, Identifiable, Hashable {
    let memoId: String
    let createdAt: Date?
    let lang: String?
    let toNodeSeq: Int?
    let title: String?
    let firstBulletPreview: String?
    
    var id: String { memoId }
}
```

---

## 3.8 Outcome (v2)

```swift
// MARK: - Outcome

struct Outcome: Codable, Identifiable, Hashable {
    let id: String
    let userId: String?
    let treeId: String
    let anchorNodeId: String
    var title: String?
    var conclusion: String?
    var reportJson: AnyCodable?
    var derivedFromOutcomeId: String?
    var status: OutcomeStatus?
    var promptVersion: String?
    var generationInput: AnyCodable?
    let createdAt: Date?
    var updatedAt: Date?
    var assetPublished: Bool?
}

enum OutcomeStatus: String, Codable {
    case generating
    case generated
    case edited
}

struct OutcomeHighlight: Codable, Hashable {
    let mainPathNodeIds: [String]?
    let keyframeNodeIds: [String]?
}
```

---

## 3.9 Trail

```swift
// MARK: - Trail

struct TrailVersion: Codable, Identifiable, Hashable {
    let id: String
    let createdAt: Date?
    let promptVersion: String?
    let provider: String?
    let model: String?
    var input: TrailInput?
    var validationMetrics: TrailValidationMetrics?
}

struct TrailInput: Codable, Hashable {
    let keyframeIds: [String]?
    let stepCount: Int?
}

struct TrailValidationMetrics: Codable, Hashable {
    let stepHeadersFound: Int?
    let jumpLinksFound: Int?
    let matchedNodeIds: Int?
    let hasKeyTakeaways: Bool?
}

struct TrailGenerateResponse: Codable {
    let ok: Bool
    let version: TrailVersion?
    let contentMarkdown: String?
    let keyframesCount: Int?
    let stepsProcessed: Int?
    let durationMs: Int?
}
```

---

## 3.10 PathSnapshot

```swift
// MARK: - PathSnapshot

struct PathSnapshot: Codable, Identifiable, Hashable {
    let id: String
    let createdAt: Date?
    let promptVersion: String?
    var title: String?
    let keyframeCount: Int?
    let nodeCount: Int?
}

struct PathSnapshotStep: Codable, Hashable {
    let stepIndex: Int
    let keyframeId: String?
    let nodeId: String
    var parentId: String?
    let level: Int?
    let role: String?
    var annotation: String?
    let createdAt: Date?
    var textPreview: String?
}
```

---

## 3.11 BranchDiff

```swift
// MARK: - BranchDiff

struct BranchDiffPoint: Codable, Hashable {
    let summary: String
    let nodeIdsA: [String]?
    let nodeIdsB: [String]?
    let rationale: String?
}

struct BranchDiffResult: Codable {
    let ok: Bool
    let diff: BranchDiffArtifact?
    let diffPoints: [BranchDiffPoint]?
    let contentMarkdown: String?
}

struct BranchDiffArtifact: Codable, Identifiable, Hashable {
    let id: String
    let createdAt: Date?
    let promptVersion: String?
}
```

---

## 3.12 Evidence

```swift
// MARK: - Evidence

struct EvidenceItem: Codable, Identifiable, Hashable {
    let id: String
    let treeId: String?
    let type: EvidenceType?
    var title: String
    var summary: String?
    var sourceUrl: String?
    var storedPath: String?
    var textContent: String?
    var fileName: String?
    var fileSize: Int?
    var mimeType: String?
    var tags: [String]?
    var attachedNodeCount: Int?
    let createdAt: Date?
    var updatedAt: Date?
}

enum EvidenceType: String, Codable {
    case url
    case file
    case text
}
```

---

## 3.13 Knowledge

```swift
// MARK: - Knowledge

struct KnowledgeBase: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var description: String?
    let documentCount: Int?
    let createdAt: Date?
    var updatedAt: Date?
}

struct KnowledgeDocument: Codable, Identifiable, Hashable {
    let id: String
    let baseId: String?
    var title: String?
    var fileName: String?
    let fileSize: Int?
    let mimeType: String?
    var status: String?
    let createdAt: Date?
}

struct KnowledgeSearchChunk: Codable, Hashable {
    let documentId: String?
    let content: String
    let score: Double?
    let metadata: AnyCodable?
}
```

---

## 3.14 Account & Quota

```swift
// MARK: - Account

struct User: Codable, Identifiable, Hashable {
    let id: String
    var email: String?
    var name: String?
    var preferredLanguage: String?
    var emailVerified: Date?
    let createdAt: Date?
}

struct QuotaStatus: Codable {
    let ok: Bool
    let plan: UserPlan?
    let quota: QuotaDetail?
    let isByok: Bool?
    let hasActiveProviders: Bool?
}

struct QuotaDetail: Codable, Hashable {
    let turnsUsed: Int?
    let turnsLimit: Int?
    let resetsAt: Date?
}

enum UserPlan: String, Codable {
    case free
    case pro
    case team
}

struct LLMSettings: Codable {
    var enableAdvancedContext: Bool?
    var preferredLlmProvider: String?
}

struct EnabledModel: Codable, Identifiable, Hashable {
    var id: String { "\(provider)_\(model)" }
    let provider: String
    let model: String
    let label: String?
    let enabled: Bool
    let mode: String?
}

struct UserProvider: Codable, Identifiable, Hashable {
    let id: String
    let kind: String
    let name: String?
    var apiKey: String?
    var baseUrl: String?
    let isActive: Bool?
    let createdAt: Date?
}
```

---

## 3.15 Workspace

```swift
// MARK: - Workspace

struct WorkspaceSummary: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var isActive: Bool?
    var role: String?
    var memberCount: Int?
}
```

---

## 3.16 API 响应包装

```swift
// MARK: - API Response Wrappers

struct APIResponse<T: Codable>: Codable {
    let ok: Bool?
    let data: T?
    let error: String?
    let code: String?
    let message: String?
    let hint: String?
    let detail: String?
    let traceId: String?
}

struct PaginatedResponse<T: Codable>: Codable {
    let ok: Bool?
    let total: Int?
    let hasMore: Bool?
    let limit: Int?
    let offset: Int?
    // The actual data field name varies per endpoint
}

// Tree list response
struct TreeListResponse: Codable {
    let ok: Bool?
    let trees: [TreeListItem]?
    let total: Int?
    let hasMore: Bool?
}

// Memo generate response
struct MemoGenerateResponse: Codable {
    let ok: Bool?
    let memo: Memo?
}

// Outcome create response
struct OutcomeCreateResponse: Codable {
    let ok: Bool?
    let outcome: Outcome?
    let titleCandidates: [String]?
    let warning: String?
}

// Quota status response
struct QuotaStatusResponse: Codable {
    let ok: Bool?
    let plan: String?
    let quota: QuotaDetail?
    let isByok: Bool?
    let hasActiveProviders: Bool?
}
```

---

## 3.17 工具类型 — AnyCodable

```swift
// MARK: - AnyCodable (for dynamic JSON)

/// A type-erased Codable value for arbitrary JSON
struct AnyCodable: Codable, Hashable {
    let value: Any
    
    init(_ value: Any) {
        self.value = value
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "AnyCodable: unsupported type")
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            throw EncodingError.invalidValue(value, .init(codingPath: [], debugDescription: "AnyCodable: unsupported type"))
        }
    }
    
    static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        String(describing: lhs.value) == String(describing: rhs.value)
    }
    
    func hash(into hasher: inout Hasher) {
        hasher.combine(String(describing: value))
    }
}
```

---

## 3.18 请求模型

```swift
// MARK: - Request Models

struct StartRootRequest: Codable {
    let userText: String
    var routeMode: String? = "auto"
    var contextProfile: ContextProfile? = .standard
    var memoryScope: MemoryScope? = .branch
    var provider: String?
    var providerMode: String?
    var model: String?
    var uploadIds: [String]?
    var knowledgeBaseIds: [String]?
    var knowledge: KnowledgeAttachment?
    var enableGrounding: Bool? = false
}

struct TurnStreamRequest: Codable {
    let treeId: String
    let nodeId: String
    let userText: String
    var withAi: Bool = true
    var who: String = "ios_app"
    var routeMode: String? = "auto"
    var provider: String?
    var providerMode: String?
    var model: String?
    var uploadIds: [String]?
    var knowledgeBaseIds: [String]?
    var knowledge: KnowledgeAttachment?
    var enableGrounding: Bool? = false
}

struct KnowledgeAttachment: Codable {
    let baseId: String?
    let documentIds: [String]?
}

struct EditQuestionRequest: Codable {
    let newText: String
    var provider: String?
    var model: String?
    var isByok: Bool?
    var uploadIds: [String]?
}

struct EvidenceCreateRequest: Codable {
    let treeId: String
    let type: EvidenceType
    let title: String
    var summary: String?
    var sourceUrl: String?
    var textContent: String?
    var tags: [String]?
}

struct MemoGenerateRequest: Codable {
    let treeId: String
    var focusNodeId: String?
    var limitN: Int?
    var basedOnMemoId: String?
    var provider: String?
    var model: String?
    var lang: String?
}

struct OutcomeCreateRequest: Codable {
    let anchorNodeId: String
    var title: String?
    var conclusion: String?
    var provider: String?
    var model: String?
}
```
