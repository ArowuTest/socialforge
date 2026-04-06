import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function AllProviders({ children }: { children: ReactNode }) {
  const qc = createTestQueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

// Helper: create a mock post
export function mockPost(overrides = {}) {
  return {
    id: 'post-123',
    workspaceId: 'ws-123',
    title: 'Test Post',
    content: 'Test content',
    status: 'draft' as const,
    platforms: ['instagram'],
    mediaUrls: [],
    scheduledAt: null,
    publishedAt: null,
    aiGenerated: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// Helper: create a mock social account
export function mockAccount(overrides = {}) {
  return {
    id: 'account-123',
    workspaceId: 'ws-123',
    platform: 'instagram' as const,
    accountId: '12345',
    accountName: 'Test Account',
    accountHandle: '@testaccount',
    avatarUrl: '',
    isActive: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}
