import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SharedTreesPanel } from '../SharedTreesPanel';

vi.mock('../useUserShares', () => {
  return {
    useUserShares: () => ({
      sharedTrees: [
        {
          tree_id: 't1',
          topic: 'Topic 1',
          display_title: 'Tree One',
          share_token: 'token-1',
          share_enabled_at: '2024-01-01T00:00:00.000Z',
          share_view_count: 3,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      revokeShare: vi.fn(),
      isRevoking: false,
    }),
  };
});

describe('SharedTreesPanel', () => {
  it('renders shared tree entries', () => {
    render(<SharedTreesPanel userId="user-1" lang="en" />);
    expect(screen.getByText(/Shared trees/i)).toBeInTheDocument();
    expect(screen.getByText(/Tree One/i)).toBeInTheDocument();
    expect(screen.getByText(/Views: 3/i)).toBeInTheDocument();
  });
});
