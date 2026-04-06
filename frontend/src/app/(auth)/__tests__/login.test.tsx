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

const mockLogin = vi.fn()
const mockAuthState = { login: mockLogin, user: null, workspace: null, isAuthenticated: false, isLoading: false }
vi.mock('@/lib/stores/auth', () => ({
  useAuthStore: (selector?: (s: typeof mockAuthState) => unknown) =>
    selector ? selector(mockAuthState) : mockAuthState,
}))

// We also need to mock the zustand persist store for checkbox/watch fields
// The actual store import happens inside the component — zustand selectors are called

import { toast } from 'sonner'

// ── Component ──────────────────────────────────────────────────────────────

// Lazy-imported so the mocks are registered before the module resolves
let LoginPage: React.ComponentType

beforeEach(async () => {
  vi.clearAllMocks()
  mockPush.mockReset()
  const mod = await import(
    /* @vite-ignore */ '../../../app/(auth)/login/page'
  )
  LoginPage = mod.default
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  it('renders login form with email and password fields', () => {
    renderWithProviders(<LoginPage />)
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows validation error when email is empty on submit', async () => {
    renderWithProviders(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/please enter a valid email address/i)
      ).toBeInTheDocument()
    })
  })

  it('shows validation error when email is invalid format', async () => {
    renderWithProviders(<LoginPage />)
    await userEvent.type(screen.getByLabelText(/email address/i), 'notanemail')
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/please enter a valid email address/i)
      ).toBeInTheDocument()
    })
  })

  it('shows validation error when password is empty', async () => {
    renderWithProviders(<LoginPage />)
    await userEvent.type(
      screen.getByLabelText(/email address/i),
      'user@example.com'
    )
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByText(/password is required/i)).toBeInTheDocument()
    })
  })

  it('calls login with correct credentials on valid submit', async () => {
    mockLogin.mockResolvedValue(undefined)
    renderWithProviders(<LoginPage />)

    await userEvent.type(
      screen.getByLabelText(/email address/i),
      'user@example.com'
    )
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123')
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          password: 'secret123',
        })
      )
    })
  })

  it('shows error toast when login fails', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'))
    renderWithProviders(<LoginPage />)

    await userEvent.type(
      screen.getByLabelText(/email address/i),
      'user@example.com'
    )
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass')
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid credentials')
    })
  })

  it('redirects to /calendar on successful login', async () => {
    mockLogin.mockResolvedValue(undefined)
    renderWithProviders(<LoginPage />)

    await userEvent.type(
      screen.getByLabelText(/email address/i),
      'user@example.com'
    )
    await userEvent.type(screen.getByLabelText(/password/i), 'correctpass')
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/calendar')
    })
  })

  it('toggles password visibility when eye icon is clicked', async () => {
    renderWithProviders(<LoginPage />)
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement
    expect(passwordInput.type).toBe('password')

    // The toggle button is not labelled, find it by its position near the password field
    const toggleBtn = passwordInput.parentElement?.querySelector('button[tabindex="-1"]')
    expect(toggleBtn).toBeTruthy()

    await userEvent.click(toggleBtn!)
    expect(passwordInput.type).toBe('text')

    await userEvent.click(toggleBtn!)
    expect(passwordInput.type).toBe('password')
  })
})
