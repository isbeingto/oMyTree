package llmcontext

import (
	"context"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

const (
	// Context manager types
	ContextManagerTypeMemory = "memory"
	ContextManagerTypeRedis  = "redis"

	// Default values
	DefaultMaxTokens           = 128 * 1024 // 128K tokens
	DefaultRecentMessageCount  = 20
	DefaultSummarizeThreshold  = 5
	DefaultCompressionStrategy = "sliding_window"
)

// NewContextManagerFromConfig creates a ContextManager based on configuration
func NewContextManagerFromConfig(
	contextCfg *types.ContextConfig,
	storage ContextStorage,
	chatModel chat.Chat,
) interfaces.ContextManager {
	// Use default values if config is nil
	if contextCfg == nil {
		logger.Info(context.TODO(), "ContextManager config not found, using default memory-based context manager")
		strategy := NewSlidingWindowStrategy(DefaultRecentMessageCount)
		storage := NewMemoryStorage()
		return NewContextManager(storage, strategy, DefaultMaxTokens)
	}

	// Set default values if not specified
	maxTokens := contextCfg.MaxTokens
	if maxTokens == 0 {
		maxTokens = DefaultMaxTokens
	}

	recentMessageCount := contextCfg.RecentMessageCount
	if recentMessageCount == 0 {
		recentMessageCount = DefaultRecentMessageCount
	}

	summarizeThreshold := contextCfg.SummarizeThreshold
	if summarizeThreshold == 0 {
		summarizeThreshold = DefaultSummarizeThreshold
	}

	compressionStrategy := contextCfg.CompressionStrategy
	if compressionStrategy == "" {
		compressionStrategy = DefaultCompressionStrategy
	}

	// Create compression strategy
	var strategy interfaces.CompressionStrategy
	switch compressionStrategy {
	case "sliding_window":
		strategy = NewSlidingWindowStrategy(recentMessageCount)
	case "smart":
		if chatModel != nil {
			strategy = NewSmartCompressionStrategy(recentMessageCount, chatModel, summarizeThreshold)
		} else {
			logger.Warn(context.TODO(), "Smart compression requested but no chat model provided, falling back to sliding window")
			strategy = NewSlidingWindowStrategy(recentMessageCount)
		}
	default:
		logger.Warnf(context.TODO(), "Unknown compression strategy '%s', using sliding window", compressionStrategy)
		strategy = NewSlidingWindowStrategy(recentMessageCount)
	}

	// Create context manager with storage and strategy
	return NewContextManager(storage, strategy, maxTokens)
}
