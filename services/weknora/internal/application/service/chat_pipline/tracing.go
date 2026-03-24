package chatpipline

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/event"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/tracing"
	"github.com/Tencent/WeKnora/internal/types"
	"go.opentelemetry.io/otel/attribute"
)

// PluginTracing implements tracing functionality for chat pipeline events
type PluginTracing struct{}

// NewPluginTracing creates a new tracing plugin instance
func NewPluginTracing(eventManager *EventManager) *PluginTracing {
	res := &PluginTracing{}
	eventManager.Register(res)
	return res
}

// ActivationEvents returns the event types this plugin handles
func (p *PluginTracing) ActivationEvents() []types.EventType {
	return []types.EventType{
		types.CHUNK_SEARCH,
		types.CHUNK_RERANK,
		types.CHUNK_MERGE,
		types.INTO_CHAT_MESSAGE,
		types.CHAT_COMPLETION,
		types.CHAT_COMPLETION_STREAM,
		types.FILTER_TOP_K,
		types.REWRITE_QUERY,
		types.CHUNK_SEARCH_PARALLEL,
	}
}

// OnEvent handles incoming events and routes them to the appropriate tracing handler based on event type.
// It acts as the central dispatcher for all tracing-related events in the chat pipeline.
//
// Parameters:
//   - ctx: context.Context for request-scoped values, cancellation signals, and deadlines
//   - eventType: the type of event being processed (e.g., CHUNK_SEARCH, CHAT_COMPLETION)
//   - chatManage: contains all the chat-related data and state for the current request
//   - next: callback function to continue processing in the pipeline
//
// Returns:
//   - *PluginError: error if any occurred during processing, or nil if successful
func (p *PluginTracing) OnEvent(ctx context.Context,
	eventType types.EventType, chatManage *types.ChatManage, next func() *PluginError,
) *PluginError {
	switch eventType {
	case types.CHUNK_SEARCH:
		return p.Search(ctx, eventType, chatManage, next)
	case types.CHUNK_RERANK:
		return p.Rerank(ctx, eventType, chatManage, next)
	case types.CHUNK_MERGE:
		return p.Merge(ctx, eventType, chatManage, next)
	case types.INTO_CHAT_MESSAGE:
		return p.IntoChatMessage(ctx, eventType, chatManage, next)
	case types.CHAT_COMPLETION:
		return p.ChatCompletion(ctx, eventType, chatManage, next)
	case types.CHAT_COMPLETION_STREAM:
		return p.ChatCompletionStream(ctx, eventType, chatManage, next)
	case types.FILTER_TOP_K:
		return p.FilterTopK(ctx, eventType, chatManage, next)
	case types.REWRITE_QUERY:
		return p.RewriteQuery(ctx, eventType, chatManage, next)
	case types.CHUNK_SEARCH_PARALLEL:
		return p.SearchParallel(ctx, eventType, chatManage, next)
	}
	return next()
}

// Search traces search operations in the chat pipeline
func (p *PluginTracing) Search(ctx context.Context,
	eventType types.EventType, chatManage *types.ChatManage, next func() *PluginError,
) *PluginError {
	_, span := tracing.ContextWithSpan(ctx, "PluginTracing.Search")
	defer span.End()
	span.SetAttributes(
		attribute.String("query", chatManage.Query),
		attribute.Float64("vector_threshold", chatManage.VectorThreshold),
		attribute.Float64("keyword_threshold", chatManage.KeywordThreshold),
		attribute.Int("match_count", chatManage.EmbeddingTopK),
	)
	err := next()
	searchResultJson, _ := json.Marshal(chatManage.SearchResult)
	unique := make(map[string]struct{})
	for _, r := range chatManage.SearchResult {
		unique[r.ID] = struct{}{}
	}
	span.SetAttributes(
		attribute.String("hybrid_search", string(searchResultJson)),
		attribute.Int("search_unique_count", len(unique)),
	)
	return err
}

// Rerank traces rerank operations in the chat pipeline
func (p *PluginTracing) Rerank(ctx context.Context,
	eventType types.EventType, chatManage *types.ChatManage, next func() *PluginError,
) *PluginError {
	_, span := tracing.ContextWithSpan(ctx, "PluginTracing.Rerank")
	defer span.End()
	span.SetAttributes(
		attribute.String("query", chatManage.Query),
		attribute.Int("passages_count", len(chatManage.SearchResult)),
		attribute.String("rerank_model_id", chatManage.RerankModelID),
		attribute.Float64("rerank_filter_threshold", chatManage.RerankThreshold),
		attribute.Int("rerank_filter_topk", chatManage.RerankTopK),
	)
	err := next()
	resultJson, _ := json.Marshal(chatManage.RerankResult)
	span.SetAttributes(
		attribute.Int("rerank_resp_count", len(chatManage.RerankResult)),
		attribute.String("rerank_resp_results", string(resultJson)),
	)
	return err
}

// Merge traces merge operations in the chat pipeline
func (p *PluginTracing) Merge(ctx context.Context,
	eventType types.EventType, chatManage *types.ChatManage, next func() *PluginError,
) *PluginError {
	_, span := tracing.ContextWithSpan(ctx, "PluginTracing.Merge")
	defer span.End()
	span.SetAttributes(
		attribute.Int("search_results_count", len(chatManage.SearchResult)),
		attribute.Int("rerank_results_count", len(chatManage.RerankResult)),
	)
	err := next()
	mergeResultJson, _ := json.Marshal(chatManage.MergeResult)
	span.SetAttributes(
		attribute.Int("merge_results_count", len(chatManage.MergeResult)),
		attribute.String("merge_results", string(mergeResultJson)),
	)
	return err
}

// IntoChatMessage traces message conversion operations
func (p *PluginTracing) IntoChatMessage(ctx context.Context,
	eventType types.EventType, chatManage *types.ChatManage, next func() *PluginError,
) *PluginError {
	_, span := tracing.ContextWithSpan(ctx, "PluginTracing.IntoChatMessage")
	defer span.End()
	span.SetAttributes(
		attribute.Int("search_results_count", len(chatManage.SearchResult)),
		attribute.Int("rerank_results_count", len(chatManage.RerankResult)),
		attribute.Int("merge_results_count", len(chatManage.MergeResult)),
	)
	err := next()
	span.SetAttributes(attribute.Int("generated_content_length", len(chatManage.UserContent)))
	return err
}

// ChatCompletion traces chat completion operations
func (p *PluginTracing) ChatCompletion(ctx context.Context,
	eventType types.EventType, chatManage *types.ChatManage, next func() *PluginError,
) *PluginError {
	_, span := tracing.ContextWithSpan(ctx, "PluginTracing.ChatCompletion")
	defer span.End()
	span.SetAttributes(
		attribute.String("model_id", chatManage.ChatModelID),
		attribute.String("system_prompt", chatManage.SummaryConfig.Prompt),
		attribute.String("user_prompt", chatManage.UserContent),
		attribute.Int("total_references", len(chatManage.RerankResult)),
	)
	err := next()
	span.SetAttributes(
		attribute.String("chat_response", chatManage.ChatResponse.Content),
		attribute.Int("chat_response_tokens", chatManage.ChatResponse.Usage.TotalTokens),
		attribute.Int("chat_response_prompt_tokens", chatManage.ChatResponse.Usage.PromptTokens),
		attribute.Int("chat_response_completion_tokens", chatManage.ChatResponse.Usage.CompletionTokens),
	)
	return err
}

// ChatCompletionStream traces streaming chat completion operations
func (p *PluginTracing) ChatCompletionStream(ctx context.Context,
	eventType types.EventType, chatManage *types.ChatManage, next func() *PluginError,
) *PluginError {
	ctx, span := tracing.ContextWithSpan(ctx, "PluginTracing.ChatCompletionStream")
	startTime := time.Now()
	span.SetAttributes(
		attribute.String("model_id", chatManage.ChatModelID),
		attribute.String("system_prompt", chatManage.SummaryConfig.Prompt),
		attribute.String("user_prompt", chatManage.UserContent),
		attribute.Int("total_references", len(chatManage.RerankResult)),
	)

	responseBuilder := &strings.Builder{}

	// EventBus is required
	if chatManage.EventBus == nil {
		logger.Warn(ctx, "Tracing: EventBus not available, skipping metrics collection")
		return next()
	}
	eventBus := chatManage.EventBus

	// Subscribe to events and collect metrics
	logger.Info(ctx, "Tracing: Subscribing to answer events for metrics collection")

	eventBus.On(types.EventType(event.EventAgentFinalAnswer), func(ctx context.Context, evt types.Event) error {
		data, ok := evt.Data.(event.AgentFinalAnswerData)
		if ok {
			responseBuilder.WriteString(data.Content)

			// If this is the final chunk, record metrics
			if data.Done {
				elapsedMS := time.Since(startTime).Milliseconds()
				span.SetAttributes(
					attribute.Bool("chat_completion_success", true),
					attribute.Int64("response_time_ms", elapsedMS),
					attribute.String("chat_response", responseBuilder.String()),
					attribute.Int("final_response_length", responseBuilder.Len()),
					attribute.Float64("tokens_per_second", float64(responseBuilder.Len())/float64(elapsedMS)*1000),
				)
				span.End()
			}
		}
		return nil
	})

	return next()
}

// FilterTopK traces filtering operations in the chat pipeline
func (p *PluginTracing) FilterTopK(ctx context.Context,
	eventType types.EventType, chatManage *types.ChatManage, next func() *PluginError,
) *PluginError {
	_, span := tracing.ContextWithSpan(ctx, "PluginTracing.FilterTopK")
	defer span.End()
	span.SetAttributes(
		attribute.Int("before_filter_search_results_count", len(chatManage.SearchResult)),
		attribute.Int("before_filter_rerank_results_count", len(chatManage.RerankResult)),
		attribute.Int("before_filter_merge_results_count", len(chatManage.MergeResult)),
	)
	err := next()
	span.SetAttributes(
		attribute.Int("after_filter_search_results_count", len(chatManage.SearchResult)),
		attribute.Int("after_filter_rerank_results_count", len(chatManage.RerankResult)),
		attribute.Int("after_filter_merge_results_count", len(chatManage.MergeResult)),
	)
	return err
}

// RewriteQuery traces query rewriting operations
func (p *PluginTracing) RewriteQuery(ctx context.Context,
	eventType types.EventType, chatManage *types.ChatManage, next func() *PluginError,
) *PluginError {
	_, span := tracing.ContextWithSpan(ctx, "PluginTracing.RewriteQuery")
	defer span.End()
	span.SetAttributes(
		attribute.String("query", chatManage.Query),
	)
	err := next()
	span.SetAttributes(
		attribute.String("rewrite_query", chatManage.RewriteQuery),
	)
	return err
}

// SearchParallel traces parallel search operations (chunk + entity)
func (p *PluginTracing) SearchParallel(ctx context.Context,
	eventType types.EventType, chatManage *types.ChatManage, next func() *PluginError,
) *PluginError {
	_, span := tracing.ContextWithSpan(ctx, "PluginTracing.SearchParallel")
	defer span.End()
	span.SetAttributes(
		attribute.String("query", chatManage.Query),
		attribute.String("rewrite_query", chatManage.RewriteQuery),
		attribute.Int("entity_count", len(chatManage.Entity)),
	)
	err := next()
	span.SetAttributes(
		attribute.Int("search_result_count", len(chatManage.SearchResult)),
	)
	return err
}
