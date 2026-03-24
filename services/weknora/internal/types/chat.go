package types

import (
	"database/sql/driver"
	"encoding/json"
)

// LLMToolCall represents a function/tool call from the LLM
type LLMToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"` // "function"
	Function FunctionCall `json:"function"`
}

// FunctionCall represents the function details
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // JSON string
}

// ChatResponse chat response
type ChatResponse struct {
	Content string `json:"content"`
	// Tool calls requested by the model
	ToolCalls []LLMToolCall `json:"tool_calls,omitempty"`
	// Finish reason
	FinishReason string `json:"finish_reason,omitempty"` // "stop", "tool_calls", "length", etc.
	// Usage information
	Usage struct {
		// Prompt tokens
		PromptTokens int `json:"prompt_tokens"`
		// Completion tokens
		CompletionTokens int `json:"completion_tokens"`
		// Total tokens
		TotalTokens int `json:"total_tokens"`
	} `json:"usage"`
}

// Response type
type ResponseType string

const (
	// Answer response type
	ResponseTypeAnswer ResponseType = "answer"
	// References response type
	ResponseTypeReferences ResponseType = "references"
	// Thinking response type (for agent thought process)
	ResponseTypeThinking ResponseType = "thinking"
	// Tool call response type (for agent tool invocations)
	ResponseTypeToolCall ResponseType = "tool_call"
	// Tool result response type (for agent tool results)
	ResponseTypeToolResult ResponseType = "tool_result"
	// Error response type
	ResponseTypeError ResponseType = "error"
	// Reflection response type (for agent reflection)
	ResponseTypeReflection ResponseType = "reflection"
	// Session title response type
	ResponseTypeSessionTitle ResponseType = "session_title"
	// Agent query response type (query received and processing started)
	ResponseTypeAgentQuery ResponseType = "agent_query"
	// Complete response type (agent complete)
	ResponseTypeComplete ResponseType = "complete"
)

// StreamResponse stream response
type StreamResponse struct {
	// Unique identifier
	ID string `json:"id"`
	// Response type
	ResponseType ResponseType `json:"response_type"`
	// Current fragment content
	Content string `json:"content"`
	// Whether the response is complete
	Done bool `json:"done"`
	// Knowledge references
	KnowledgeReferences References `json:"knowledge_references,omitempty"`
	// Session ID (for agent_query event)
	SessionID string `json:"session_id,omitempty"`
	// Assistant Message ID (for agent_query event)
	AssistantMessageID string `json:"assistant_message_id,omitempty"`
	// Tool calls for streaming (partial)
	ToolCalls []LLMToolCall `json:"tool_calls,omitempty"`
	// Additional metadata for enhanced display
	Data map[string]interface{} `json:"data,omitempty"`
}

// References references
type References []*SearchResult

// Value implements the driver.Valuer interface, used to convert References to database values
func (c References) Value() (driver.Value, error) {
	return json.Marshal(c)
}

// Scan implements the sql.Scanner interface, used to convert database values to References
func (c *References) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	b, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(b, c)
}
