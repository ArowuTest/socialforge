import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/compose',
  useSearchParams: () => new URLSearchParams(),
}))

const mockCreatePost = vi.fn()
const mockGenerateCaption = vi.fn()
const mockGetJobStatus = vi.fn()
const mockAddHashtags = vi.fn()

vi.mock('@/lib/api', () => ({
  postsApi: { create: mockCreatePost },
  aiApi: {
    generateCaption: mockGenerateCaption,
    getJobStatus: mockGetJobStatus,
    addHashtags: mockAddHashtags,
  },
}))

// Compose store is real (zustand in-memory) — reset between tests
import { useComposeStore } from '@/lib/stores/compose'

import { toast } from 'sonner'

// ── Component ──────────────────────────────────────────────────────────────

let ComposePage: React.ComponentType

beforeEach(async () => {
  vi.clearAllMocks()
  // Reset compose store to default state
  useComposeStore.getState().reset()

  const mod = await import('../../../app/(dashboard)/compose/page')
  ComposePage = mod.default
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ComposePage', () => {
  it('renders platform selector with all 8 platforms', () => {
    renderWithProviders(<ComposePage />)
    const platformNames = [
      'Instagram',
      'TikTok',
      'YouTube',
      'LinkedIn',
      'Twitter',
      'Facebook',
      'Pinterest',
      'Threads',
    ]
    platformNames.forEach((name) => {
      expect(screen.getByTitle(new RegExp(name, 'i'))).toBeInTheDocument()
    })
  })

  it('selecting a platform highlights it (adds violet border class)', async () => {
    renderWithProviders(<ComposePage />)
    const instagramBtn = screen.getByTitle(/instagram/i)
    expect(instagramBtn.className).not.toMatch(/border-violet-500/)

    await userEvent.click(instagramBtn)
    expect(instagramBtn.className).toMatch(/border-violet-500/)
  })

  it('shows character count for twitter (280 limit) after selecting twitter', async () => {
    renderWithProviders(<ComposePage />)
    await userEvent.click(screen.getByTitle(/twitter/i))

    // The character counter renders "Twitter:" label in a span
    await waitFor(() => {
      // Multiple "Twitter" elements exist (button, counter label); any match is sufficient
      expect(screen.getAllByText(/^Twitter/).length).toBeGreaterThan(0)
    })
    // At 0 chars typed the counter shows 280
    expect(screen.getByText('280')).toBeInTheDocument()
  })

  it('character count turns red when over twitter limit', async () => {
    renderWithProviders(<ComposePage />)
    await userEvent.click(screen.getByTitle(/twitter/i))

    const textarea = screen.getByPlaceholderText(/write your caption/i)
    // type 281 characters
    await userEvent.type(textarea, 'a'.repeat(281))

    await waitFor(() => {
      // The counter shows negative remaining, styled red
      const counter = screen.getByText(/-1/)
      expect(counter.className).toMatch(/text-red-500/)
    })
  })

  it('media drop zone is present in the document', () => {
    renderWithProviders(<ComposePage />)
    expect(screen.getByText(/drag & drop images or videos/i)).toBeInTheDocument()
  })

  it('AI generate caption button is rendered and opens modal on click', async () => {
    renderWithProviders(<ComposePage />)
    const aiBtn = screen.getByRole('button', { name: /generate caption/i })
    expect(aiBtn).toBeInTheDocument()

    await userEvent.click(aiBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/AI Caption Generator/i)).toBeInTheDocument()
    })
  })

  it('post now button calls postsApi.create with correct payload', async () => {
    mockCreatePost.mockResolvedValue({ data: { id: 'p1' } })
    renderWithProviders(<ComposePage />)

    // Select platform
    await userEvent.click(screen.getByTitle(/instagram/i))

    // Write caption
    const textarea = screen.getByPlaceholderText(/write your caption/i)
    await userEvent.type(textarea, 'Hello world!')

    await userEvent.click(screen.getByRole('button', { name: /post now/i }))

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          caption: 'Hello world!',
          platforms: expect.arrayContaining(['instagram']),
        })
      )
    })
  })

  it('post now button shows error toast when no platform selected', async () => {
    renderWithProviders(<ComposePage />)

    const textarea = screen.getByPlaceholderText(/write your caption/i)
    await userEvent.type(textarea, 'A caption')

    await userEvent.click(screen.getByRole('button', { name: /post now/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/select at least one platform/i)
      )
    })
    expect(mockCreatePost).not.toHaveBeenCalled()
  })

  it('schedule button shows error toast when no scheduledAt date is provided', async () => {
    renderWithProviders(<ComposePage />)

    await userEvent.click(screen.getByTitle(/instagram/i))
    const textarea = screen.getByPlaceholderText(/write your caption/i)
    await userEvent.type(textarea, 'Scheduled post')

    await userEvent.click(screen.getByRole('button', { name: /^schedule$/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/select a time|next free slot/i)
      )
    })
    expect(mockCreatePost).not.toHaveBeenCalled()
  })

  it('schedule button calls postsApi.create when scheduledAt is provided', async () => {
    mockCreatePost.mockResolvedValue({ data: { id: 'p2' } })
    renderWithProviders(<ComposePage />)

    await userEvent.click(screen.getByTitle(/instagram/i))
    const textarea = screen.getByPlaceholderText(/write your caption/i)
    await userEvent.type(textarea, 'Future post')

    // Set scheduledAt via datetime-local input
    const dtInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement
    fireEvent.change(dtInput, { target: { value: '2025-01-01T10:00' } })

    await userEvent.click(screen.getByRole('button', { name: /^schedule$/i }))

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledAt: '2025-01-01T10:00',
        })
      )
    })
  })
})
