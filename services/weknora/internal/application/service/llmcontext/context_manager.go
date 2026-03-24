package llmcontext

import (
	"context"
	"fmt"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// contextManager implements the ContextManager interface
// It handles business logic (compression, token management) and delegates storage to ContextStorage
type contextManager struct {
	storage             ContextStorage                 // Storage backend (Redis, Memory, etc.)
	compressionStrategy interfaces.CompressionStrategy // Compression strategy
	maxTokens           int                            // Maximum tokens allowed in context
}

// NewContextManager creates a new context manager with the specified storage and compression strategy
func NewContextManager(
	storage ContextStorage,
	compressionStrategy interfaces.CompressionStrategy,
	maxTokens int,
) interfaces.ContextManager {
	return &contextManager{
		storage:             storage,
		compressionStrategy: compressionStrategy,
		maxTokens:           maxTokens,
	}
}

// NewContextManagerWithMemory creates a context manager with in-memory storage (for backward compatibility)
func NewContextManagerWithMemory(
	compressionStrategy interfaces.CompressionStrategy,
	maxTokens int,
) interfaces.ContextManager {
	return &contextManager{
		storage:             NewMemoryStorage(),
		compressionStrategy: compressionStrategy,
		maxTokens:           maxTokens,
	}
}

// AddMessage adds a message to the session context
// This method handles the business logic: loading, appending, compression, and saving
func (cm *contextManager) AddMessage(ctx context.Context, sessionID string, message chat.Message) error {
	logger.Infof(ctx, "[ContextManager][Session-%s] Adding message: role=%s, content_length=%d",
		sessionID, message.Role, len(message.Content))

	// Log message content preview
	contentPreview := message.Content
	if len(contentPreview) > 200 {
		contentPreview = contentPreview[:200] + "..."
	}
	logger.Debugf(ctx, "[ContextManager][Session-%s] Message content preview: %s", sessionID, contentPreview)

	// Load existing messages from storage
	messages, err := cm.storage.Load(ctx, sessionID)
	if err != nil {
		logger.Errorf(ctx, "[ContextManager][Session-%s] Failed to load context: %v", sessionID, err)
		return fmt.Errorf("failed to load context: %w", err)
	}

	// Add new message
	beforeCount := len(messages)
	messages = append(messages, message)
	logger.Debugf(ctx, "[ContextManager][Session-%s] Messages count: %d -> %d", sessionID, beforeCount, len(messages))

	// Check if compression is needed
	tokenCount := cm.compressionStrategy.EstimateTokens(messages)
	logger.Debugf(ctx, "[ContextManager][Session-%s] Current token count: %d (max: %d)",
		sessionID, tokenCount, cm.maxTokens)

	if tokenCount > cm.maxTokens {
		logger.Infof(ctx, "[ContextManager][Session-%s] Context exceeds max tokens (%d > %d), applying compression",
			sessionID, tokenCount, cm.maxTokens)
		beforeCompressionCount := len(messages)
		compressed, err := cm.compressionStrategy.Compress(ctx, messages, cm.maxTokens)
		if err != nil {
			logger.Errorf(ctx, "[ContextManager][Session-%s] Failed to compress context: %v", sessionID, err)
			return fmt.Errorf("failed to compress context: %w", err)
		}
		messages = compressed
		afterTokenCount := cm.compressionStrategy.EstimateTokens(messages)
		logger.Infof(ctx, "[ContextManager][Session-%s] Context compressed: %d -> %d messages, %d -> %d tokens",
			sessionID, beforeCompressionCount, len(compressed), tokenCount, afterTokenCount)
	}

	// Save updated messages to storage
	if err := cm.storage.Save(ctx, sessionID, messages); err != nil {
		logger.Errorf(ctx, "[ContextManager][Session-%s] Failed to save context: %v", sessionID, err)
		return fmt.Errorf("failed to save context: %w", err)
	}

	logger.Infof(
		ctx,
		"[ContextManager][Session-%s] Successfully added message (total: %d messages)",
		sessionID,
		len(messages),
	)
	return nil
}

// GetContext retrieves the current context for a session from storage
func (cm *contextManager) GetContext(ctx context.Context, sessionID string) ([]chat.Message, error) {
	logger.Infof(ctx, "[ContextManager][Session-%s] Getting context", sessionID)

	// Load messages from storage
	messages, err := cm.storage.Load(ctx, sessionID)
	if err != nil {
		logger.Errorf(ctx, "[ContextManager][Session-%s] Failed to load context: %v", sessionID, err)
		return nil, fmt.Errorf("failed to load context: %w", err)
	}

	// Calculate token estimate
	tokenCount := cm.compressionStrategy.EstimateTokens(messages)

	logger.Infof(ctx, "[ContextManager][Session-%s] Retrieved %d messages (~%d tokens)",
		sessionID, len(messages), tokenCount)

	// Log message role distribution
	roleCount := make(map[string]int)
	for _, msg := range messages {
		roleCount[msg.Role]++
	}
	logger.Debugf(ctx, "[ContextManager][Session-%s] Message distribution: %v", sessionID, roleCount)

	return messages, nil
}

// ClearContext clears all context for a session from storage
func (cm *contextManager) ClearContext(ctx context.Context, sessionID string) error {
	logger.Infof(ctx, "[ContextManager][Session-%s] Clearing context", sessionID)

	// Delete from storage
	if err := cm.storage.Delete(ctx, sessionID); err != nil {
		logger.Errorf(ctx, "[ContextManager][Session-%s] Failed to clear context: %v", sessionID, err)
		return fmt.Errorf("failed to clear context: %w", err)
	}

	logger.Infof(ctx, "[ContextManager][Session-%s] Context cleared successfully", sessionID)
	return nil
}

// GetContextStats returns statistics about the context
func (cm *contextManager) GetContextStats(ctx context.Context, sessionID string) (*interfaces.ContextStats, error) {
	// Load messages from storage
	messages, err := cm.storage.Load(ctx, sessionID)
	if err != nil {
		logger.Errorf(ctx, "[ContextManager][Session-%s] Failed to load context for stats: %v", sessionID, err)
		return nil, fmt.Errorf("failed to load context: %w", err)
	}

	tokenCount := cm.compressionStrategy.EstimateTokens(messages)

	stats := &interfaces.ContextStats{
		MessageCount:         len(messages),
		TokenCount:           tokenCount,
		IsCompressed:         false, // We'd need to track this explicitly for accurate reporting
		OriginalMessageCount: len(messages),
	}

	logger.Debugf(ctx, "[ContextManager][Session-%s] Context stats: %d messages, ~%d tokens",
		sessionID, stats.MessageCount, stats.TokenCount)

	return stats, nil
}

// SetSystemPrompt sets or updates the system prompt for a session
// If a system message exists, it will be replaced; otherwise, a new one will be added at the beginning
func (cm *contextManager) SetSystemPrompt(ctx context.Context, sessionID string, systemPrompt string) error {
	logger.Infof(ctx, "[ContextManager][Session-%s] Setting system prompt, length=%d", sessionID, len(systemPrompt))

	// Load existing messages from storage
	messages, err := cm.storage.Load(ctx, sessionID)
	if err != nil {
		logger.Errorf(ctx, "[ContextManager][Session-%s] Failed to load context: %v", sessionID, err)
		return fmt.Errorf("failed to load context: %w", err)
	}

	// Create new system message
	systemMessage := chat.Message{
		Role:    "system",
		Content: systemPrompt,
	}

	// Check if first message is a system message
	if len(messages) > 0 && messages[0].Role == "system" {
		// Replace existing system message
		logger.Debugf(ctx, "[ContextManager][Session-%s] Replacing existing system prompt", sessionID)
		messages[0] = systemMessage
	} else {
		// Insert system message at the beginning
		logger.Debugf(ctx, "[ContextManager][Session-%s] Inserting new system prompt at beginning", sessionID)
		messages = append([]chat.Message{systemMessage}, messages...)
	}

	// Save updated messages to storage
	if err := cm.storage.Save(ctx, sessionID, messages); err != nil {
		logger.Errorf(ctx, "[ContextManager][Session-%s] Failed to save context: %v", sessionID, err)
		return fmt.Errorf("failed to save context: %w", err)
	}

	logger.Infof(ctx, "[ContextManager][Session-%s] System prompt set successfully", sessionID)
	return nil
}
