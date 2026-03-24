package llmcontext

import (
	"context"

	"github.com/Tencent/WeKnora/internal/models/chat"
)

// ContextStorage defines the interface for storing and retrieving conversation context
// This separates storage implementation from business logic
type ContextStorage interface {
	// Save saves messages for a session
	Save(ctx context.Context, sessionID string, messages []chat.Message) error

	// Load loads messages for a session
	Load(ctx context.Context, sessionID string) ([]chat.Message, error)

	// Delete deletes all messages for a session
	Delete(ctx context.Context, sessionID string) error
}
