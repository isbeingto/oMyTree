// Package chatpipline provides chat pipeline processing capabilities
package chatpipline

import (
	"context"
	"regexp"
	"slices"
	"sort"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// PluginLoadHistory is a plugin for loading conversation history without query rewriting
// It loads historical dialog context for multi-turn conversations
type PluginLoadHistory struct {
	messageService interfaces.MessageService // Message service for retrieving historical messages
	config         *config.Config            // System configuration
}

// regThink is a regular expression used to match and remove content between <think></think> tags
var regThink = regexp.MustCompile(`(?s)<think>.*?</think>`)

// NewPluginLoadHistory creates a new history loading plugin instance
// Also registers the plugin with the event manager
func NewPluginLoadHistory(eventManager *EventManager,
	messageService interfaces.MessageService,
	config *config.Config,
) *PluginLoadHistory {
	res := &PluginLoadHistory{
		messageService: messageService,
		config:         config,
	}
	eventManager.Register(res)
	return res
}

// ActivationEvents returns the list of event types this plugin responds to
// This plugin only responds to LOAD_HISTORY events
func (p *PluginLoadHistory) ActivationEvents() []types.EventType {
	return []types.EventType{types.LOAD_HISTORY}
}

// OnEvent processes triggered events
// When receiving a LOAD_HISTORY event, it loads conversation history without rewriting the query
func (p *PluginLoadHistory) OnEvent(ctx context.Context,
	eventType types.EventType, chatManage *types.ChatManage, next func() *PluginError,
) *PluginError {
	// Determine max rounds from config or request
	maxRounds := p.config.Conversation.MaxRounds
	if chatManage.MaxRounds > 0 {
		maxRounds = chatManage.MaxRounds
	}

	pipelineInfo(ctx, "LoadHistory", "input", map[string]interface{}{
		"session_id": chatManage.SessionID,
		"max_rounds": maxRounds,
	})

	// Get conversation history (fetch more to account for incomplete pairs)
	history, err := p.messageService.GetRecentMessagesBySession(ctx, chatManage.SessionID, maxRounds*2+10)
	if err != nil {
		pipelineWarn(ctx, "LoadHistory", "history_fetch", map[string]interface{}{
			"session_id": chatManage.SessionID,
			"error":      err.Error(),
		})
		return next()
	}

	pipelineInfo(ctx, "LoadHistory", "fetched", map[string]interface{}{
		"session_id":    chatManage.SessionID,
		"message_count": len(history),
	})

	// Convert historical messages to conversation history structure
	historyMap := make(map[string]*types.History)

	// Process historical messages, grouped by requestID
	for _, message := range history {
		h, ok := historyMap[message.RequestID]
		if !ok {
			h = &types.History{}
		}
		if message.Role == "user" {
			// User message as query
			h.Query = message.Content
			h.CreateAt = message.CreatedAt
		} else {
			// System message as answer, while removing thinking process
			h.Answer = regThink.ReplaceAllString(message.Content, "")
			h.KnowledgeReferences = message.KnowledgeReferences
		}
		historyMap[message.RequestID] = h
	}

	// Convert to list and filter incomplete conversations
	historyList := make([]*types.History, 0)
	for _, h := range historyMap {
		if h.Answer != "" && h.Query != "" {
			historyList = append(historyList, h)
		}
	}

	// Sort by time, keep the most recent conversations
	sort.Slice(historyList, func(i, j int) bool {
		return historyList[i].CreateAt.After(historyList[j].CreateAt)
	})

	// Limit the number of historical records
	if len(historyList) > maxRounds {
		historyList = historyList[:maxRounds]
	}

	// Reverse to chronological order
	slices.Reverse(historyList)
	chatManage.History = historyList

	pipelineInfo(ctx, "LoadHistory", "output", map[string]interface{}{
		"session_id":     chatManage.SessionID,
		"history_rounds": len(historyList),
		"max_rounds":     maxRounds,
	})

	return next()
}
