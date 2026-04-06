import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

const mockRegister = vi.fn()
const mockSetTokensAndUser = vi.fn()

vi.mock('@/lib/api', () => ({
  authApi: { register: mockRegister },
  setTokens: vi.fn(),
}))

const mockAuthState = { setTokensAndUser: mockSetTokensAndUser, user: null, workspace: null, isAuthenticated: false }
vi.mock('@/lib/stores/auth', () => ({
  useAuthStore: (selector?: (s: typeof mockAuthState) => unknown) =>
    selector ? selector(mockAuthState) : mockAuthState,
}))

import { toast } from 'sonner'

// ── Component ──────────────────────────────────────────────────────────────

let SignupPage: React.ComponentType

beforeEach(async () => {
  vi.clearAllMocks()
  mockPush.mockReset()
  const mod = await import('../../../app/(auth)/signup/page')
  SignupPage = mod.default
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SignupPage', () => {
  it('renders all form fields: name, email, password, workspace name', () => {
    renderWithProviders(<SignupPage />)
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/workspace name/i)).toBeInTheDocument()
  })

  it('shows validation errors for empty required fields on submit', async () => {
    renderWithProviders(<SignupPage />)
    fireEvent.click(screen.getByRole('button', { name: /create free account/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/full name must be at least 2 characters/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/please enter a valid email address/i)
      ).toBeInTheDocument()
    })
  })

  it('shows password strength indicator when password is typed', async () => {
    renderWithProviders(<SignupPage />)
    const passwordInput = screen.getByLabelText(/^password$/i)
    await userEvent.type(passwordInput, 'weak')
    await waitFor(() => {
      // The strength bar contains colored divs that appear when password is typed
      // Check for the strength label text
      expect(screen.getByText(/weak password/i)).toBeInTheDocument()
    })
  })

  it('shows "Medium password" strength label for medium-strength password', async () => {
    renderWithProviders(<SignupPage />)
    const passwordInput = screen.getByLabelText(/^password$/i)
    // Triggers score of 3: length>=8, uppercase, digit — no special char
    await userEvent.type(passwordInput, 'Password1')
    await waitFor(() => {
      expect(screen.getByText(/medium password/i)).toBeInTheDocument()
    })
  })

  it('shows "Strong password" label for a strong password', async () => {
    renderWithProviders(<SignupPage />)
    const passwordInput = screen.getByLabelText(/^password$/i)
    // length>=12, uppercase, digit, special char → score 5
    await userEvent.type(passwordInput, 'Str0ng!Pass#2024')
    await waitFor(() => {
      expect(screen.getByText(/strong password/i)).toBeInTheDocument()
    })
  })

  it('calls authApi.register with correct data on valid submit', async () => {
    mockRegister.mockResolvedValue({
      data: {
        tokens: { accessToken: 'at', refreshToken: 'rt' },
        user: { id: '1', name: 'Jane Smith' },
        workspace: { id: 'ws1', name: 'Acme Corp' },
      },
    })

    renderWithProviders(<SignupPage />)

    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane Smith')
    await userEvent.type(screen.getByLabelText(/work email/i), 'jane@acme.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password1!')
    await userEvent.type(screen.getByLabelText(/workspace name/i), 'Acme Corp')

    fireEvent.click(screen.getByRole('button', { name: /create free account/i }))

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jane Smith',
          email: 'jane@acme.com',
          password: 'Password1!',
          workspaceName: 'Acme Corp',
        })
      )
    })
  })

  it('redirects to /calendar on successful registration', async () => {
    mockRegister.mockResolvedValue({
      data: {
        tokens: { accessToken: 'at', refreshToken: 'rt' },
        user: { id: '1', name: 'Jane Smith' },
        workspace: { id: 'ws1', name: 'Acme Corp' },
      },
    })

    renderWithProviders(<SignupPage />)

    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane Smith')
    await userEvent.type(screen.getByLabelText(/work email/i), 'jane@acme.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password1!')
    await userEvent.type(screen.getByLabelText(/workspace name/i), 'Acme Corp')

    fireEvent.click(screen.getByRole('button', { name: /create free account/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/calendar')
    })
  })

  it('shows error toast when registration fails', async () => {
    mockRegister.mockRejectedValue(new Error('Email already in use'))
    renderWithProviders(<SignupPage />)

    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane Smith')
    await userEvent.type(screen.getByLabelText(/work email/i), 'jane@acme.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password1!')
    await userEvent.type(screen.getByLabelText(/workspace name/i), 'Acme Corp')

    fireEvent.click(screen.getByRole('button', { name: /create free account/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Email already in use')
    })
  })
})
