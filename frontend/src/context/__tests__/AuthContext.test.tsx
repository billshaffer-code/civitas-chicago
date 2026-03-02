import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'

vi.mock('../../api/civitas', () => ({
  login: vi.fn(),
  register: vi.fn(),
  getMe: vi.fn(),
}))

import { login as apiLogin, register as apiRegister, getMe } from '../../api/civitas'

/** Simple consumer that exposes auth state for assertions. */
function AuthConsumer() {
  const { user, loading, login, register, logout } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.full_name : 'null'}</span>
      <button onClick={() => login('a@b.com', 'pass')}>login</button>
      <button onClick={() => register('a@b.com', 'pass', 'Test', 'Co')}>register</button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

function renderConsumer() {
  return render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>,
  )
}

const mockUser = {
  user_id: 'u1',
  email: 'a@b.com',
  full_name: 'Test User',
  company_name: null,
  created_at: '2025-01-01T00:00:00Z',
}

beforeEach(() => {
  localStorage.clear()
})

describe('AuthContext', () => {
  it('starts with loading=true then resolves to false with no user when no token', async () => {
    renderConsumer()
    // With no token, loading goes false and user stays null
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false')
    })
    expect(screen.getByTestId('user').textContent).toBe('null')
  })

  it('restores user from localStorage token on mount', async () => {
    localStorage.setItem('civitas_access_token', 'tok')
    vi.mocked(getMe).mockResolvedValue(mockUser)
    renderConsumer()
    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('Test User')
    })
    expect(getMe).toHaveBeenCalled()
  })

  it('clears tokens if getMe() fails on mount', async () => {
    localStorage.setItem('civitas_access_token', 'tok')
    localStorage.setItem('civitas_refresh_token', 'rtok')
    vi.mocked(getMe).mockRejectedValue(new Error('fail'))
    renderConsumer()
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false')
    })
    expect(localStorage.getItem('civitas_access_token')).toBeNull()
    expect(localStorage.getItem('civitas_refresh_token')).toBeNull()
  })

  it('login() stores tokens and fetches user', async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      access_token: 'at',
      refresh_token: 'rt',
      token_type: 'bearer',
    })
    vi.mocked(getMe).mockResolvedValue(mockUser)
    renderConsumer()
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))

    await act(async () => {
      screen.getByText('login').click()
    })

    expect(localStorage.getItem('civitas_access_token')).toBe('at')
    expect(screen.getByTestId('user').textContent).toBe('Test User')
  })

  it('login() rethrows HTTP errors as-is', async () => {
    const axiosError = { response: { status: 401 }, isAxiosError: true }
    vi.mocked(apiLogin).mockRejectedValue(axiosError)

    let auth!: ReturnType<typeof useAuth>
    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumerCapture onCapture={(a) => { auth = a }} />
        </AuthProvider>,
      )
    })

    let caught: unknown
    try {
      await auth.login('a@b.com', 'pass')
    } catch (e) {
      caught = e
    }
    expect(caught).toBe(axiosError)
  })

  it('login() wraps network errors in friendly message', async () => {
    vi.mocked(apiLogin).mockRejectedValue(new TypeError('Network error'))

    let auth!: ReturnType<typeof useAuth>
    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumerCapture onCapture={(a) => { auth = a }} />
        </AuthProvider>,
      )
    })

    let caught: unknown
    try {
      await auth.login('a@b.com', 'pass')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('Unable to reach the server')
  })

  it('register() calls apiRegister then auto-logs in', async () => {
    vi.mocked(apiRegister).mockResolvedValue(mockUser)
    vi.mocked(apiLogin).mockResolvedValue({
      access_token: 'at2',
      refresh_token: 'rt2',
      token_type: 'bearer',
    })
    vi.mocked(getMe).mockResolvedValue(mockUser)

    let auth!: ReturnType<typeof useAuth>
    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumerCapture onCapture={(a) => { auth = a }} />
        </AuthProvider>,
      )
    })

    await act(async () => {
      await auth.register('a@b.com', 'pass', 'Test', 'Co')
    })

    expect(apiRegister).toHaveBeenCalledWith('a@b.com', 'pass', 'Test', 'Co')
    expect(apiLogin).toHaveBeenCalledWith('a@b.com', 'pass')
    expect(localStorage.getItem('civitas_access_token')).toBe('at2')
  })

  it('logout() clears tokens and sets user to null', async () => {
    localStorage.setItem('civitas_access_token', 'tok')
    vi.mocked(getMe).mockResolvedValue(mockUser)
    renderConsumer()
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('Test User'))

    await act(async () => {
      screen.getByText('logout').click()
    })

    expect(screen.getByTestId('user').textContent).toBe('null')
    expect(localStorage.getItem('civitas_access_token')).toBeNull()
  })
})

// ── Helper ──────────────────────────────────────────────────────────────────

function AuthConsumerCapture({
  onCapture,
}: {
  onCapture: (auth: ReturnType<typeof useAuth>) => void
}) {
  const auth = useAuth()
  onCapture(auth)
  return null
}
