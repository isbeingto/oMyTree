package llmcontext

import (
	"context"
	"sync"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/models/chat"
)

// memoryStorage implements ContextStorage using in-memory storage
type memoryStorage struct {
	sessions map[string][]chat.Message
	mu       sync.RWMutex
}

// NewMemoryStorage creates a new memory-based storage
func NewMemoryStorage() ContextStorage {
	return &memoryStorage{
		sessions: make(map[string][]chat.Message),
	}
}

// Save saves messages for a session to memory
func (ms *memoryStorage) Save(ctx context.Context, sessionID string, messages []chat.Message) error {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	// Make a copy to avoid external modifications
	messageCopy := make([]chat.Message, len(messages))
	copy(messageCopy, messages)

	ms.sessions[sessionID] = messageCopy
	logger.Debugf(ctx, "[MemoryStorage][Session-%s] Saved %d messages to memory", sessionID, len(messages))
	return nil
}

// Load loads messages for a session from memory
func (ms *memoryStorage) Load(ctx context.Context, sessionID string) ([]chat.Message, error) {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	messages, exists := ms.sessions[sessionID]
	if !exists {
		logger.Debugf(ctx, "[MemoryStorage][Session-%s] No context found in memory", sessionID)
		return []chat.Message{}, nil
	}

	// Return a copy to avoid external modifications
	messageCopy := make([]chat.Message, len(messages))
	copy(messageCopy, messages)

	logger.Debugf(ctx, "[MemoryStorage][Session-%s] Loaded %d messages from memory", sessionID, len(messages))
	return messageCopy, nil
}

// Delete deletes all messages for a session from memory
func (ms *memoryStorage) Delete(ctx context.Context, sessionID string) error {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	delete(ms.sessions, sessionID)
	logger.Debugf(ctx, "[MemoryStorage][Session-%s] Deleted context from memory", sessionID)
	return nil
}
