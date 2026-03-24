package llmcontext

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/redis/go-redis/v9"
)

// redisStorage implements ContextStorage using Redis
type redisStorage struct {
	client *redis.Client
	ttl    time.Duration
	prefix string
}

// NewRedisStorage creates a new Redis-based storage
func NewRedisStorage(client *redis.Client, ttl time.Duration, prefix string) (ContextStorage, error) {
	// Validate connection
	_, err := client.Ping(context.Background()).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	if ttl == 0 {
		ttl = 24 * time.Hour // Default TTL 24 hours
	}

	if prefix == "" {
		prefix = "context:" // Default prefix
	}

	return &redisStorage{
		client: client,
		ttl:    ttl,
		prefix: prefix,
	}, nil
}

// buildKey builds the Redis key for a session
func (rs *redisStorage) buildKey(sessionID string) string {
	return fmt.Sprintf("%s%s", rs.prefix, sessionID)
}

// Save saves messages for a session to Redis
func (rs *redisStorage) Save(ctx context.Context, sessionID string, messages []chat.Message) error {
	key := rs.buildKey(sessionID)

	// Marshal messages to JSON
	data, err := json.Marshal(messages)
	if err != nil {
		logger.Errorf(ctx, "[RedisStorage][Session-%s] Failed to marshal messages: %v", sessionID, err)
		return fmt.Errorf("failed to marshal messages: %w", err)
	}

	// Save to Redis with TTL
	err = rs.client.Set(ctx, key, data, rs.ttl).Err()
	if err != nil {
		logger.Errorf(ctx, "[RedisStorage][Session-%s] Failed to save to Redis: %v", sessionID, err)
		return fmt.Errorf("failed to save to Redis: %w", err)
	}

	logger.Debugf(ctx, "[RedisStorage][Session-%s] Saved %d messages to Redis (TTL: %s)",
		sessionID, len(messages), rs.ttl)
	return nil
}

// Load loads messages for a session from Redis
func (rs *redisStorage) Load(ctx context.Context, sessionID string) ([]chat.Message, error) {
	key := rs.buildKey(sessionID)

	// Get from Redis
	data, err := rs.client.Get(ctx, key).Bytes()
	if err != nil {
		if err == redis.Nil {
			// No context exists yet, return empty slice
			logger.Debugf(ctx, "[RedisStorage][Session-%s] No context found in Redis", sessionID)
			return []chat.Message{}, nil
		}
		logger.Errorf(ctx, "[RedisStorage][Session-%s] Failed to get from Redis: %v", sessionID, err)
		return nil, fmt.Errorf("failed to get from Redis: %w", err)
	}

	// Unmarshal messages
	var messages []chat.Message
	err = json.Unmarshal(data, &messages)
	if err != nil {
		logger.Errorf(ctx, "[RedisStorage][Session-%s] Failed to unmarshal messages: %v", sessionID, err)
		return nil, fmt.Errorf("failed to unmarshal messages: %w", err)
	}

	logger.Debugf(ctx, "[RedisStorage][Session-%s] Loaded %d messages from Redis", sessionID, len(messages))
	return messages, nil
}

// Delete deletes all messages for a session from Redis
func (rs *redisStorage) Delete(ctx context.Context, sessionID string) error {
	key := rs.buildKey(sessionID)

	err := rs.client.Del(ctx, key).Err()
	if err != nil {
		logger.Errorf(ctx, "[RedisStorage][Session-%s] Failed to delete from Redis: %v", sessionID, err)
		return fmt.Errorf("failed to delete from Redis: %w", err)
	}

	logger.Debugf(ctx, "[RedisStorage][Session-%s] Deleted context from Redis", sessionID)
	return nil
}
