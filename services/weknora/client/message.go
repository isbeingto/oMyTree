// Package client provides the implementation for interacting with the WeKnora API
// The Message related interfaces are used to manage messages in a session
// Messages can be created, retrieved, deleted, and queried
package client

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// ToolResult represents the result of a tool execution
type ToolResult struct {
	Success bool                   `json:"success"`         // Whether the tool executed successfully
	Output  string                 `json:"output"`          // Human-readable output
	Data    map[string]interface{} `json:"data,omitempty"`  // Structured data for programmatic use
	Error   string                 `json:"error,omitempty"` // Error message if execution failed
}

// ToolCall represents a single tool invocation within an agent step
type ToolCall struct {
	ID         string                 `json:"id"`                   // Function call ID from LLM
	Name       string                 `json:"name"`                 // Tool name
	Args       map[string]interface{} `json:"args"`                 // Tool arguments
	Result     *ToolResult            `json:"result"`               // Execution result
	Reflection string                 `json:"reflection,omitempty"` // Agent's reflection on this tool call result
	Duration   int64                  `json:"duration"`             // Execution time in milliseconds
}

// AgentStep represents one iteration of the ReAct loop
type AgentStep struct {
	Iteration int        `json:"iteration"`  // Iteration number (0-indexed)
	Thought   string     `json:"thought"`    // LLM's reasoning/thinking (Think phase)
	ToolCalls []ToolCall `json:"tool_calls"` // Tools called in this step (Act phase)
	Timestamp time.Time  `json:"timestamp"`  // When this step occurred
}

// Message message information
type Message struct {
	ID                  string          `json:"id"`
	SessionID           string          `json:"session_id"`
	RequestID           string          `json:"request_id"`
	Content             string          `json:"content"`
	Role                string          `json:"role"`
	KnowledgeReferences []*SearchResult `json:"knowledge_references"`
	AgentSteps          []AgentStep     `json:"agent_steps,omitempty"` // Agent execution steps (only for assistant messages)
	IsCompleted         bool            `json:"is_completed"`
	CreatedAt           time.Time       `json:"created_at"`
	UpdatedAt           time.Time       `json:"updated_at"`
}

// MessageListResponse message list response
type MessageListResponse struct {
	Success bool      `json:"success"`
	Data    []Message `json:"data"`
}

// LoadMessages loads session messages, supports pagination and time filtering
func (c *Client) LoadMessages(
	ctx context.Context,
	sessionID string,
	limit int,
	beforeTime *time.Time,
) ([]Message, error) {
	path := fmt.Sprintf("/api/v1/messages/%s/load", sessionID)

	queryParams := url.Values{}
	queryParams.Add("limit", strconv.Itoa(limit))

	if beforeTime != nil {
		queryParams.Add("before_time", beforeTime.Format(time.RFC3339Nano))
	}

	resp, err := c.doRequest(ctx, http.MethodGet, path, nil, queryParams)
	if err != nil {
		return nil, err
	}

	var response MessageListResponse
	if err := parseResponse(resp, &response); err != nil {
		return nil, err
	}

	return response.Data, nil
}

// GetRecentMessages gets recent messages from a session
func (c *Client) GetRecentMessages(ctx context.Context, sessionID string, limit int) ([]Message, error) {
	return c.LoadMessages(ctx, sessionID, limit, nil)
}

// GetMessagesBefore gets messages before a specified time
func (c *Client) GetMessagesBefore(
	ctx context.Context,
	sessionID string,
	beforeTime time.Time,
	limit int,
) ([]Message, error) {
	return c.LoadMessages(ctx, sessionID, limit, &beforeTime)
}

// DeleteMessage deletes a message
func (c *Client) DeleteMessage(ctx context.Context, sessionID string, messageID string) error {
	path := fmt.Sprintf("/api/v1/messages/%s/%s", sessionID, messageID)
	resp, err := c.doRequest(ctx, http.MethodDelete, path, nil, nil)
	if err != nil {
		return err
	}

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message,omitempty"`
	}

	return parseResponse(resp, &response)
}
