package interfaces

import (
	"context"

	"github.com/Tencent/WeKnora/internal/types"
)

// MCPServiceRepository defines the interface for MCP service data access
type MCPServiceRepository interface {
	// Create creates a new MCP service
	Create(ctx context.Context, service *types.MCPService) error

	// GetByID retrieves an MCP service by ID and tenant ID
	GetByID(ctx context.Context, tenantID uint64, id string) (*types.MCPService, error)

	// List retrieves all MCP services for a tenant
	List(ctx context.Context, tenantID uint64) ([]*types.MCPService, error)

	// ListEnabled retrieves all enabled MCP services for a tenant
	ListEnabled(ctx context.Context, tenantID uint64) ([]*types.MCPService, error)

	// ListByIDs retrieves MCP services by multiple IDs for a tenant
	ListByIDs(ctx context.Context, tenantID uint64, ids []string) ([]*types.MCPService, error)

	// Update updates an MCP service
	Update(ctx context.Context, service *types.MCPService) error

	// Delete deletes an MCP service (soft delete)
	Delete(ctx context.Context, tenantID uint64, id string) error
}

// MCPServiceService defines the interface for MCP service business logic
type MCPServiceService interface {
	// CreateMCPService creates a new MCP service
	CreateMCPService(ctx context.Context, service *types.MCPService) error

	// GetMCPServiceByID retrieves an MCP service by ID
	GetMCPServiceByID(ctx context.Context, tenantID uint64, id string) (*types.MCPService, error)

	// ListMCPServices lists all MCP services for a tenant
	ListMCPServices(ctx context.Context, tenantID uint64) ([]*types.MCPService, error)

	// ListMCPServicesByIDs retrieves multiple MCP services by IDs
	ListMCPServicesByIDs(ctx context.Context, tenantID uint64, ids []string) ([]*types.MCPService, error)

	// UpdateMCPService updates an MCP service
	UpdateMCPService(ctx context.Context, service *types.MCPService) error

	// DeleteMCPService deletes an MCP service
	DeleteMCPService(ctx context.Context, tenantID uint64, id string) error

	// TestMCPService tests the connection to an MCP service and returns available tools/resources
	TestMCPService(ctx context.Context, tenantID uint64, id string) (*types.MCPTestResult, error)

	// GetMCPServiceTools retrieves the list of tools from an MCP service
	GetMCPServiceTools(ctx context.Context, tenantID uint64, id string) ([]*types.MCPTool, error)

	// GetMCPServiceResources retrieves the list of resources from an MCP service
	GetMCPServiceResources(ctx context.Context, tenantID uint64, id string) ([]*types.MCPResource, error)
}
