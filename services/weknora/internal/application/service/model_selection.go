package service

import (
	"net"
	"net/url"
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
)

// isUsableEmbeddingModel returns whether an embedding model is likely usable for outbound API calls.
//
// Rationale: In production we sometimes have multiple active embedding models, but the default one can
// be misconfigured (e.g. missing API key), which later fails as 401 during ingestion. We prefer to
// fail fast and/or pick a usable fallback model.
func isUsableEmbeddingModel(m *types.Model) bool {
	if m == nil {
		return false
	}

	// Local models generally don't need API keys.
	if m.Source == types.ModelSourceLocal {
		return true
	}

	apiKey := strings.TrimSpace(m.Parameters.APIKey)
	if apiKey != "" {
		return true
	}

	baseURL := strings.TrimSpace(m.Parameters.BaseURL)
	if baseURL == "" {
		// If BaseURL is empty we assume it points to a public default endpoint.
		return false
	}

	u, err := url.Parse(baseURL)
	if err != nil {
		return false
	}

	host := u.Hostname()
	if host == "" {
		return false
	}

	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		// Common local deployments that may not require auth.
		return true
	}

	if ip := net.ParseIP(host); ip != nil {
		// Private/loopback endpoints are often internal services where auth can be optional.
		if ip.IsLoopback() || ip.IsPrivate() {
			return true
		}
	}

	// Otherwise treat it as public and require an API key.
	return false
}
