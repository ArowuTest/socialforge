import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { PlanType } from '@/types'

// ── Mock auth store ──────────────────────────────────────────────────────────

// We keep a mutable reference so individual tests can override the workspace
let mockWorkspaceValue: { workspace: { id: string; plan: PlanType } | null } = {
  workspace: null,
}

vi.mock('@/lib/stores/auth', () => ({
  useAuthStore: (selector: (s: typeof mockWorkspaceValue) => unknown) =>
    selector(mockWorkspaceValue),
}))

// ── Import hook AFTER mock is registered ────────────────────────────────────
import { useWorkspace } from '@/hooks/use-workspace'

// Helper that builds a minimal Workspace-compatible object
function makeWorkspace(plan: PlanType) {
  return {
    id: 'ws-test',
    name: 'Test Workspace',
    slug: 'test-workspace',
    timezone: 'UTC',
    plan,
    ownerId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isAgency: plan === PlanType.AGENCY,
    whitelabelEnabled: false,
  }
}

describe('useWorkspace()', () => {
  beforeEach(() => {
    // Reset to no workspace before each test
    mockWorkspaceValue = { workspace: null }
  })

  // ── Null / empty states ─────────────────────────────────────────────────

  it('returns null workspace when no workspace is set in the store', () => {
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.workspace).toBeNull()
  })

  it('returns null workspaceId when no workspace is set', () => {
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.workspaceId).toBeNull()
  })

  it('isPlanAtLeast returns false for any plan when workspace is null', () => {
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.FREE)).toBe(false)
    expect(result.current.isPlanAtLeast(PlanType.STARTER)).toBe(false)
    expect(result.current.isPlanAtLeast(PlanType.AGENCY)).toBe(false)
  })

  // ── Workspace present ───────────────────────────────────────────────────

  it('returns workspaceId when workspace is set', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.STARTER) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.workspaceId).toBe('ws-test')
  })

  it('returns the workspace object when workspace is set', () => {
    const ws = makeWorkspace(PlanType.PRO)
    mockWorkspaceValue = { workspace: ws }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.workspace).toEqual(ws)
  })

  // ── isPlanAtLeast — free plan ───────────────────────────────────────────

  it('isPlanAtLeast("free") returns true for free plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.FREE) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.FREE)).toBe(true)
  })

  it('isPlanAtLeast("starter") returns false for free plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.FREE) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.STARTER)).toBe(false)
  })

  it('isPlanAtLeast("pro") returns false for free plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.FREE) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.PRO)).toBe(false)
  })

  // ── isPlanAtLeast — starter plan ────────────────────────────────────────

  it('isPlanAtLeast("free") returns true for starter plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.STARTER) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.FREE)).toBe(true)
  })

  it('isPlanAtLeast("starter") returns true for starter plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.STARTER) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.STARTER)).toBe(true)
  })

  it('isPlanAtLeast("pro") returns false for starter plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.STARTER) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.PRO)).toBe(false)
  })

  it('isPlanAtLeast("agency") returns false for starter plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.STARTER) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.AGENCY)).toBe(false)
  })

  // ── isPlanAtLeast — pro plan ────────────────────────────────────────────

  it('isPlanAtLeast("starter") returns true for pro plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.PRO) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.STARTER)).toBe(true)
  })

  it('isPlanAtLeast("pro") returns true for pro plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.PRO) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.PRO)).toBe(true)
  })

  it('isPlanAtLeast("agency") returns false for pro plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.PRO) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.AGENCY)).toBe(false)
  })

  // ── isPlanAtLeast — agency plan ─────────────────────────────────────────

  it('isPlanAtLeast("agency") returns true for agency plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.AGENCY) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.AGENCY)).toBe(true)
  })

  it('isPlanAtLeast("pro") returns true for agency plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.AGENCY) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.PRO)).toBe(true)
  })

  it('isPlanAtLeast("starter") returns true for agency plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.AGENCY) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.STARTER)).toBe(true)
  })

  it('isPlanAtLeast("enterprise") returns false for agency plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.AGENCY) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.ENTERPRISE)).toBe(false)
  })

  // ── isPlanAtLeast — enterprise plan ─────────────────────────────────────

  it('isPlanAtLeast("agency") returns true for enterprise plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.ENTERPRISE) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.AGENCY)).toBe(true)
  })

  it('isPlanAtLeast("enterprise") returns true for enterprise plan', () => {
    mockWorkspaceValue = { workspace: makeWorkspace(PlanType.ENTERPRISE) }
    const { result } = renderHook(() => useWorkspace())
    expect(result.current.isPlanAtLeast(PlanType.ENTERPRISE)).toBe(true)
  })
})
