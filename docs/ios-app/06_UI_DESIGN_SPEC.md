# 06 — UI/UX 设计规范

> iOS 26 Liquid Glass 设计语言 · SwiftUI 原生组件  
> 对标 Web 端 oMyTree 功能，适配移动端交互范式

---

## 6.1 设计原则

1. **Liquid Glass 优先**：使用系统标准组件，自动获得 Liquid Glass 效果
2. **单手操作友好**：关键交互元素放在屏幕底部
3. **信息密度适中**：移动端减少信息密度，保持清晰
4. **手势驱动**：滑动返回、长按菜单、下拉刷新
5. **分支可视化**：树状结构是产品核心差异，需有创新的移动端展示方式

---

## 6.2 App 整体布局

### iPhone 布局
```
┌──────────────────────────┐
│      Navigation Bar       │  ← Liquid Glass 背景
│  [≡ sidebar]  Title  [⚙] │
├──────────────────────────┤
│                          │
│     Chat Messages        │  ← ScrollView
│     (当前路径节点)         │
│                          │
│  ┌──────────────────┐    │
│  │ User Message      │    │
│  └──────────────────┘    │
│                          │
│  ┌──────────────────┐    │
│  │ AI Response       │    │
│  │ [Markdown内容]    │    │
│  │                   │    │
│  │ ← → 分支切换      │    │  ← 分支导航指示器
│  └──────────────────┘    │
│                          │
├──────────────────────────┤
│  [Model] [🔖] [📎]      │  ← 工具栏（可选展开）
│  ┌──────────────────┐    │
│  │  输入框...    [↑] │    │  ← ComposerView
│  └──────────────────┘    │
└──────────────────────────┘
```

### iPad 布局 (NavigationSplitView)
```
┌────────────────┬─────────────────────────────────┐
│   Sidebar      │          Detail                  │
│                │                                  │
│  [+ New Tree]  │     Chat Messages               │
│                │                                  │
│  🔍 Search     │     (同 iPhone 布局)              │
│                │                                  │
│  ┌──────────┐  │                                  │
│  │ Tree 1   │← │                                  │
│  ├──────────┤  │                                  │
│  │ Tree 2   │  │                                  │
│  ├──────────┤  │                                  │
│  │ Tree 3   │  │                                  │
│  └──────────┘  │                                  │
│                │                                  │
│  ── Workspaces │                                  │
│  [Personal ▼]  │     ComposerView                │
└────────────────┴─────────────────────────────────┘
```

---

## 6.3 页面详细设计

### 6.3.1 登录页 (LoginView)

```
┌──────────────────────────┐
│                          │
│       🌳 oMyTree         │  ← App Icon + 名称
│    "Explore ideas as     │
│     branching trees"     │
│                          │
│  ┌──────────────────┐    │
│  │ Email            │    │
│  └──────────────────┘    │
│  ┌──────────────────┐    │
│  │ Password         │    │
│  └──────────────────┘    │
│                          │
│  [       Login       ]   │  ← Primary button (Liquid Glass)
│                          │
│  ─── or ───              │
│                          │
│  [  G  Sign in with Google ] │  ← Google OAuth
│                          │
│  Forgot password?        │  ← Link
│  Don't have an account? Register │
│                          │
└──────────────────────────┘
```

**SwiftUI 实现要点：**
- 使用 `Form` 或 `VStack` + `.textFieldStyle(.roundedBorder)`
- 主按钮：`.buttonStyle(.borderedProminent)` → 自动 Liquid Glass
- Google 登录：集成 `GoogleSignIn-iOS` SDK
- 表单验证：邮箱格式、密码最少6字符
- 错误显示：`.alert` 或内联红色文本

---

### 6.3.2 Tree 列表页 (TreeListView)

```
┌──────────────────────────┐
│ [≡]  Conversations  [+] │  ← NavigationBar
├──────────────────────────┤
│ 🔍 Search conversations  │  ← .searchable
├──────────────────────────┤
│                          │
│ ┌──────────────────────┐ │
│ │ 💬 讨论产品定位       │ │  ← 最近一棵树 (高亮卡片)
│ │ 42 nodes · 2h ago    │ │
│ │ standard · branch    │ │
│ └──────────────────────┘ │
│                          │
│ ┌──────────────────────┐ │
│ │ React vs Vue 对比     │ │
│ │ 18 nodes · yesterday │ │
│ └──────────────────────┘ │
│                          │
│ ┌──────────────────────┐ │
│ │ 旅行计划探索          │ │
│ │ 8 nodes · 3 days ago │ │
│ └──────────────────────┘ │
│                          │
│      Load More ↓         │  ← 分页加载
└──────────────────────────┘
```

**交互：**
- 点击 → 进入对话
- 左滑 → 删除（`.swipeActions`）
- 长按 → 上下文菜单（重命名、导出、分享、删除）
- 下拉 → 刷新（`.refreshable`）
- `+` 按钮 → 新建对话

**SwiftUI 实现：**
```swift
List {
    ForEach(trees) { tree in
        TreeListRow(tree: tree)
            .swipeActions(edge: .trailing) {
                Button(role: .destructive) { deleteTree(tree) } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
            .contextMenu {
                Button("Rename") { renameTree(tree) }
                Button("Export JSON") { exportJSON(tree) }
                Button("Share") { shareTree(tree) }
                Divider()
                Button("Delete", role: .destructive) { deleteTree(tree) }
            }
    }
}
.searchable(text: $searchText, prompt: "Search conversations")
.refreshable { await loadTrees() }
```

---

### 6.3.3 对话页 (ChatView) — 最核心的页面

```
┌──────────────────────────┐
│ [←] 产品定位讨论  [⋯]   │  ← 标题 + 更多菜单
├──────────────────────────┤
│                          │
│ ┌─ You ─────────────────┐│
│ │ 帮我分析一下产品定位   ││
│ └───────────────────────┘│
│                          │
│ ┌─ AI ──────────────────┐│
│ │ **产品定位分析**       ││
│ │                       ││
│ │ 1. 目标用户群...      ││
│ │ 2. 核心价值主张...    ││
│ │                       ││
│ │ [🔖 Keyframe] [📎]   ││  ← 节点操作
│ │                       ││
│ │   ← 1/3 →            ││  ← 分支指示器
│ └───────────────────────┘│
│                          │
│ ┌─ You ─────────────────┐│
│ │ 重点说说第2点         ││
│ └───────────────────────┘│
│                          │
│ ┌─ AI (streaming...) ──┐│
│ │ █ ← 光标闪烁         ││  ← 流式渲染中
│ │ 第2点核心价值主张...  ││
│ │                       ││
│ │ [■ Stop Generating]   ││
│ └───────────────────────┘│
│                          │
├──────────────────────────┤
│ [GPT-4o ▼] [🔖] [📎]   │  ← 工具栏
│ ┌───────────────── [↑] ┐ │
│ │ Type a message...    │ │  ← 输入框
│ └──────────────────────┘ │
└──────────────────────────┘
```

**关键交互：**

1. **分支导航**：当节点有多个子节点时，显示 `← 1/3 →` 指示器
   - 左右滑动或点击箭头切换分支
   - 显示当前分支序号/总数

2. **流式渲染**：
   - AI 回复实时逐字显示，带光标动画
   - "Stop Generating" 按钮随时中止
   - 推理过程折叠显示（DeepSeek 模型）

3. **消息操作**（长按/右键菜单）：
   - 复制
   - 添加 Keyframe（书签）
   - 编辑问题（仅用户消息）
   - 从此处分支（在此节点创建新分支）
   - 删除

4. **更多菜单** `[⋯]`：
   - Tree 配置（上下文档位、记忆范围）
   - 生成 Memo
   - 生成 Trail
   - 查看 Keyframes 列表
   - 导出 JSON/Markdown
   - 分享
   - 删除 Tree

---

### 6.3.4 分支可视化 (TreeVisualization) — 差异化功能

考虑两种模式：

**模式 A：内联分支指示器**（默认）
- 在消息流中，有分支的节点底部显示 `← 1/3 →`
- 点击切换到不同分支子节点

**模式 B：小地图/树状图**（可选展开）
```
┌──────────────────────────┐
│ Tree Map                 │
│                          │
│         ○ root           │
│         │                │
│    ○────●────○           │  ← ● = 当前节点
│    │    │                │
│    ○    ○                │
│    │    │                │
│    ○    ● ← you are here│
│                          │
└──────────────────────────┘
```

- 可使用 SwiftUI Canvas 或 Shape 绘制
- 每个节点用圆点表示，连线表示父子关系
- 当前路径高亮
- Keyframe 节点特殊标记（🔖）

---

### 6.3.5 Composer（输入框）

```swift
struct ComposerView: View {
    @Binding var text: String
    var isStreaming: Bool
    var onSend: () -> Void
    var onStop: () -> Void
    var selectedModel: Binding<String?>
    
    var body: some View {
        VStack(spacing: 8) {
            // Toolbar row
            HStack {
                // Model picker
                ModelPickerButton(selectedModel: selectedModel)
                
                Spacer()
                
                // Optional: attachment buttons
                Button(action: {}) {
                    Image(systemName: "paperclip")
                }
                Button(action: {}) {
                    Image(systemName: "book")  // Knowledge
                }
            }
            .font(.callout)
            .foregroundStyle(.secondary)
            
            // Input area
            HStack(alignment: .bottom) {
                TextField("Message", text: $text, axis: .vertical)
                    .lineLimit(1...6)
                    .textFieldStyle(.plain)
                    .padding(12)
                    .background(.regularMaterial)
                    .cornerRadius(20)
                
                if isStreaming {
                    Button(action: onStop) {
                        Image(systemName: "stop.fill")
                            .font(.title3)
                            .foregroundStyle(.red)
                    }
                } else {
                    Button(action: onSend) {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .padding(.horizontal)
        .padding(.bottom, 8)
    }
}
```

---

### 6.3.6 设置页 (SettingsView)

```
┌──────────────────────────┐
│ [←]     Settings         │
├──────────────────────────┤
│                          │
│ 👤 Account               │
│  ├ Email: user@email.com │
│  ├ Plan: Pro             │
│  └ Quota: 50/100 turns   │
│                          │
│ 🤖 LLM Settings          │
│  ├ Default Provider      │
│  ├ BYOK (Bring Your Key) │
│  └ Advanced Context      │
│                          │
│ 🏢 Workspace              │
│  ├ Current: Personal     │
│  └ Switch Workspace      │
│                          │
│ 🌐 Language               │
│  └ English / 中文         │
│                          │
│ 📊 Usage                  │
│                          │
│ 📋 About                  │
│  ├ Version               │
│  └ Terms / Privacy       │
│                          │
│ [     Sign Out      ]    │
└──────────────────────────┘
```

---

## 6.4 组件映射：Web → iOS

| Web 组件 | iOS 实现 | SwiftUI 组件 |
|----------|---------|-------------|
| AppShell (侧边栏+主区域) | NavigationSplitView (iPad) / Sheet (iPhone) | `NavigationSplitView` |
| TreeWorkspace | ChatView | 自定义 View |
| MessageBubble | MessageBubble | `VStack` + `Markdown` |
| ModelPicker | ModelPicker | `Menu` / `Picker` |
| SearchChatsDialog | SearchChatsView | `.searchable` |
| SettingsDialog | SettingsView | `NavigationStack` + `Form` |
| Button (shadcn) | Button | `.buttonStyle(.bordered)` |
| Card (shadcn) | Card | `GroupBox` / `.background(.regularMaterial)` |
| ScrollArea | ScrollView | `ScrollView` |
| Dialog/AlertDialog | Dialog | `.alert()` / `.confirmationDialog()` |
| Sheet (shadcn) | Sheet | `.sheet()` |
| DropdownMenu | Menu | `Menu` / `.contextMenu` |
| Toast | Toast | `.snackbar` 或自定义 |
| Skeleton | Skeleton | `ProgressView()` / `.redacted(reason: .placeholder)` |
| Tabs | TabView | `TabView` (Liquid Glass) |

---

## 6.5 颜色与主题

### 使用系统颜色（自动适配 Light/Dark/Liquid Glass）
```swift
// ✅ 推荐：系统语义颜色
Color.primary        // 主文本
Color.secondary      // 次要文本
Color.accentColor    // 强调色 → 自定义为 oMyTree 品牌绿
Color(.systemBackground)
Color(.secondarySystemBackground)

// ❌ 不推荐：硬编码颜色
Color(hex: "#1a1a1a")  // 不会适配 Dark Mode
```

### 品牌色定义
```swift
// Assets.xcassets 中定义
extension Color {
    static let oMyTreeGreen = Color("OMyTreeGreen")  // #4CAF50 / 动态
    static let oMyTreeAccent = Color("OMyTreeAccent")
}

// App 入口设置 accent color
@main
struct oMyTreeApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .tint(.oMyTreeGreen)  // 全局强调色
        }
    }
}
```

---

## 6.6 动画与转场

```swift
// 消息出现动画
struct MessageBubble: View {
    let node: TreeNode
    @State private var appeared = false
    
    var body: some View {
        HStack {
            if node.role == .user { Spacer() }
            
            VStack(alignment: .leading) {
                Markdown(node.text)
            }
            .padding()
            .background(node.role == .user ? Color.accentColor.opacity(0.1) : Color(.secondarySystemBackground))
            .cornerRadius(16)
            
            if node.role == .assistant { Spacer() }
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 20)
        .onAppear {
            withAnimation(.spring(duration: 0.3)) {
                appeared = true
            }
        }
    }
}

// 流式文本光标动画
struct StreamingCursor: View {
    @State private var visible = true
    
    var body: some View {
        Rectangle()
            .fill(Color.accentColor)
            .frame(width: 2, height: 18)
            .opacity(visible ? 1 : 0)
            .animation(.easeInOut(duration: 0.6).repeatForever(), value: visible)
            .onAppear { visible = false }
    }
}
```

---

## 6.7 无障碍 (Accessibility)

```swift
struct MessageBubble: View {
    let node: TreeNode
    
    var body: some View {
        VStack {
            Markdown(node.text)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(node.role == .user ? "You said" : "AI responded"): \(node.text)")
        .accessibilityHint(node.hasReasoning == true ? "Double tap to show reasoning" : "")
    }
}

struct BranchIndicator: View {
    let current: Int
    let total: Int
    
    var body: some View {
        HStack {
            Button("Previous branch") { /* go prev */ }
                .accessibilityLabel("Previous branch")
            
            Text("\(current)/\(total)")
                .accessibilityLabel("Branch \(current) of \(total)")
            
            Button("Next branch") { /* go next */ }
                .accessibilityLabel("Next branch")
        }
    }
}
```

---

## 6.8 Haptic Feedback

```swift
struct HapticManager {
    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .medium) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
    
    static func notification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        UINotificationFeedbackGenerator().notificationOccurred(type)
    }
    
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }
}

// 使用场景：
// - 发送消息：HapticManager.impact(.light)
// - AI 回复完成：HapticManager.notification(.success)
// - 切换分支：HapticManager.selection()
// - 删除操作：HapticManager.notification(.warning)
// - 错误：HapticManager.notification(.error)
```
