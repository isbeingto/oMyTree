package types

// PromptPlaceholder represents a placeholder that can be used in prompt templates
type PromptPlaceholder struct {
	// Name is the placeholder name (without braces), e.g., "query"
	Name string `json:"name"`
	// Label is a short label for the placeholder
	Label string `json:"label"`
	// Description explains what this placeholder represents
	Description string `json:"description"`
}

// PromptFieldType represents the type of prompt field
type PromptFieldType string

const (
	// PromptFieldSystemPrompt is for system prompts (normal mode)
	PromptFieldSystemPrompt PromptFieldType = "system_prompt"
	// PromptFieldAgentSystemPrompt is for agent mode system prompts
	PromptFieldAgentSystemPrompt PromptFieldType = "agent_system_prompt"
	// PromptFieldContextTemplate is for context templates
	PromptFieldContextTemplate PromptFieldType = "context_template"
	// PromptFieldRewriteSystemPrompt is for rewrite system prompts
	PromptFieldRewriteSystemPrompt PromptFieldType = "rewrite_system_prompt"
	// PromptFieldRewritePrompt is for rewrite user prompts
	PromptFieldRewritePrompt PromptFieldType = "rewrite_prompt"
	// PromptFieldFallbackPrompt is for fallback prompts
	PromptFieldFallbackPrompt PromptFieldType = "fallback_prompt"
)

// All available placeholders in the system
var (
	// Common placeholders
	PlaceholderQuery = PromptPlaceholder{
		Name:        "query",
		Label:       "用户问题",
		Description: "用户当前的问题或查询内容",
	}

	PlaceholderContexts = PromptPlaceholder{
		Name:        "contexts",
		Label:       "检索内容",
		Description: "从知识库检索到的相关内容列表",
	}

	PlaceholderCurrentTime = PromptPlaceholder{
		Name:        "current_time",
		Label:       "当前时间",
		Description: "当前系统时间（格式：2006-01-02 15:04:05）",
	}

	PlaceholderCurrentWeek = PromptPlaceholder{
		Name:        "current_week",
		Label:       "当前星期",
		Description: "当前星期几（如：星期一、Monday）",
	}

	// Rewrite prompt placeholders
	PlaceholderConversation = PromptPlaceholder{
		Name:        "conversation",
		Label:       "历史对话",
		Description: "格式化的历史对话内容，用于多轮对话改写",
	}

	PlaceholderYesterday = PromptPlaceholder{
		Name:        "yesterday",
		Label:       "昨天日期",
		Description: "昨天的日期（格式：2006-01-02）",
	}

	PlaceholderAnswer = PromptPlaceholder{
		Name:        "answer",
		Label:       "助手回答",
		Description: "助手的回答内容（用于对话历史格式化）",
	}

	// Agent mode specific placeholders
	PlaceholderKnowledgeBases = PromptPlaceholder{
		Name:        "knowledge_bases",
		Label:       "知识库列表",
		Description: "自动格式化的知识库列表，包含名称、描述、文档数量等信息",
	}

	PlaceholderWebSearchStatus = PromptPlaceholder{
		Name:        "web_search_status",
		Label:       "网络搜索状态",
		Description: "网络搜索工具是否启用的状态（Enabled 或 Disabled）",
	}
)

// PlaceholdersByField returns the available placeholders for a specific prompt field type
func PlaceholdersByField(fieldType PromptFieldType) []PromptPlaceholder {
	switch fieldType {
	case PromptFieldSystemPrompt:
		// Normal mode system prompt
		return []PromptPlaceholder{
			PlaceholderQuery,
			PlaceholderContexts,
			PlaceholderCurrentTime,
			PlaceholderCurrentWeek,
		}
	case PromptFieldAgentSystemPrompt:
		// Agent mode system prompt
		return []PromptPlaceholder{
			PlaceholderKnowledgeBases,
			PlaceholderWebSearchStatus,
			PlaceholderCurrentTime,
		}
	case PromptFieldContextTemplate:
		return []PromptPlaceholder{
			PlaceholderQuery,
			PlaceholderContexts,
			PlaceholderCurrentTime,
			PlaceholderCurrentWeek,
		}
	case PromptFieldRewriteSystemPrompt:
		// Rewrite system prompt supports same placeholders as rewrite user prompt
		return []PromptPlaceholder{
			PlaceholderQuery,
			PlaceholderConversation,
			PlaceholderCurrentTime,
			PlaceholderYesterday,
		}
	case PromptFieldRewritePrompt:
		return []PromptPlaceholder{
			PlaceholderQuery,
			PlaceholderConversation,
			PlaceholderCurrentTime,
			PlaceholderYesterday,
		}
	case PromptFieldFallbackPrompt:
		return []PromptPlaceholder{
			PlaceholderQuery,
		}
	default:
		return []PromptPlaceholder{}
	}
}

// AllPlaceholders returns all available placeholders in the system
func AllPlaceholders() []PromptPlaceholder {
	return []PromptPlaceholder{
		PlaceholderQuery,
		PlaceholderContexts,
		PlaceholderCurrentTime,
		PlaceholderCurrentWeek,
		PlaceholderConversation,
		PlaceholderYesterday,
		PlaceholderAnswer,
		PlaceholderKnowledgeBases,
		PlaceholderWebSearchStatus,
	}
}

// PlaceholderMap returns a map of field types to their available placeholders
func PlaceholderMap() map[PromptFieldType][]PromptPlaceholder {
	return map[PromptFieldType][]PromptPlaceholder{
		PromptFieldSystemPrompt:        PlaceholdersByField(PromptFieldSystemPrompt),
		PromptFieldAgentSystemPrompt:   PlaceholdersByField(PromptFieldAgentSystemPrompt),
		PromptFieldContextTemplate:     PlaceholdersByField(PromptFieldContextTemplate),
		PromptFieldRewriteSystemPrompt: PlaceholdersByField(PromptFieldRewriteSystemPrompt),
		PromptFieldRewritePrompt:       PlaceholdersByField(PromptFieldRewritePrompt),
		PromptFieldFallbackPrompt:      PlaceholdersByField(PromptFieldFallbackPrompt),
	}
}
