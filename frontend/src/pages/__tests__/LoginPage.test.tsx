import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../LoginPage'
import { makeAuthValue } from '../../test/helpers'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../context/AuthContext'

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

function getEmailInput() {
  return screen.getByPlaceholderText('you@company.com')
}

function getPasswordInput() {
  return screen.getByPlaceholderText('Enter your password')
}

describe('LoginPage', () => {
  it('renders email and password fields and submit button', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    renderLogin()
    expect(getEmailInput()).toBeInTheDocument()
    expect(getPasswordInput()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('calls login() with email and password on submit', async () => {
    const auth = makeAuthValue()
    auth.login.mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue(auth)
    renderLogin()

    const user = userEvent.setup()
    await user.type(getEmailInput(), 'a@b.com')
    await user.type(getPasswordInput(), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(auth.login).toHaveBeenCalledWith('a@b.com', 'secret123')
  })

  it('navigates to /dashboard on successful login', async () => {
    const auth = makeAuthValue()
    auth.login.mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue(auth)
    renderLogin()

    const user = userEvent.setup()
    await user.type(getEmailInput(), 'a@b.com')
    await user.type(getPasswordInput(), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('shows "Invalid email or password" on 401', async () => {
    const auth = makeAuthValue()
    auth.login.mockRejectedValue({ response: { status: 401 } })
    vi.mocked(useAuth).mockReturnValue(auth)
    renderLogin()

    const user = userEvent.setup()
    await user.type(getEmailInput(), 'a@b.com')
    await user.type(getPasswordInput(), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    })
  })

  it('shows "Unable to reach the server" on network error', async () => {
    const auth = makeAuthValue()
    auth.login.mockRejectedValue(new Error('Unable to reach the server. Please check your connection and try again.'))
    vi.mocked(useAuth).mockReturnValue(auth)
    renderLogin()

    const user = userEvent.setup()
    await user.type(getEmailInput(), 'a@b.com')
    await user.type(getPasswordInput(), 'pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/unable to reach the server/i)).toBeInTheDocument()
    })
  })

  it('disables button and shows "Signing in..." while loading', async () => {
    const auth = makeAuthValue()
    auth.login.mockReturnValue(new Promise(() => {}))
    vi.mocked(useAuth).mockReturnValue(auth)
    renderLogin()

    const user = userEvent.setup()
    await user.type(getEmailInput(), 'a@b.com')
    await user.type(getPasswordInput(), 'pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /signing in/i })
      expect(btn).toBeDisabled()
    })
  })
})
