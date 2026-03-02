import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SignupPage from '../SignupPage'
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

function renderSignup() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  )
}

function getNameInput() { return screen.getByPlaceholderText('Jane Smith') }
function getEmailInput() { return screen.getByPlaceholderText('you@company.com') }
function getPasswordInput() { return screen.getByPlaceholderText('At least 8 characters') }
function getConfirmInput() { return screen.getByPlaceholderText('Repeat your password') }

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { name?: string; email?: string; password?: string; confirm?: string } = {},
) {
  const v = {
    name: 'Jane Smith',
    email: 'jane@acme.com',
    password: 'password123',
    confirm: 'password123',
    ...overrides,
  }
  await user.type(getNameInput(), v.name)
  await user.type(getEmailInput(), v.email)
  await user.type(getPasswordInput(), v.password)
  await user.type(getConfirmInput(), v.confirm)
}

describe('SignupPage', () => {
  it('renders all form fields', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    renderSignup()
    expect(getNameInput()).toBeInTheDocument()
    expect(getEmailInput()).toBeInTheDocument()
    expect(getPasswordInput()).toBeInTheDocument()
    expect(getConfirmInput()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('shows error for password < 8 characters', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    renderSignup()
    const user = userEvent.setup()
    await fillForm(user, { password: 'short', confirm: 'short' })
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    })
  })

  it('shows error when passwords don\'t match', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    renderSignup()
    const user = userEvent.setup()
    await fillForm(user, { password: 'password123', confirm: 'different1' })
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    })
  })

  it('calls register() with all fields on valid submit', async () => {
    const auth = makeAuthValue()
    auth.register.mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue(auth)
    renderSignup()
    const user = userEvent.setup()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(auth.register).toHaveBeenCalledWith('jane@acme.com', 'password123', 'Jane Smith', undefined)
  })

  it('navigates to /dashboard on success', async () => {
    const auth = makeAuthValue()
    auth.register.mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue(auth)
    renderSignup()
    const user = userEvent.setup()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('shows duplicate email error on 409', async () => {
    const auth = makeAuthValue()
    auth.register.mockRejectedValue({ response: { status: 409 } })
    vi.mocked(useAuth).mockReturnValue(auth)
    renderSignup()
    const user = userEvent.setup()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    })
  })

  it('shows network error message when server unreachable', async () => {
    const auth = makeAuthValue()
    auth.register.mockRejectedValue(new Error('Unable to reach the server. Please check your connection and try again.'))
    vi.mocked(useAuth).mockReturnValue(auth)
    renderSignup()
    const user = userEvent.setup()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/unable to reach the server/i)).toBeInTheDocument()
    })
  })
})
