import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProtectedRoute from '../ProtectedRoute'
import { makeAuthValue, makeUser } from '../../test/helpers'

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../context/AuthContext'

function renderProtected() {
  return render(
    <MemoryRouter>
      <ProtectedRoute>
        <div data-testid="child">Protected Content</div>
      </ProtectedRoute>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('renders spinner when loading=true', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue({ loading: true, user: null }))
    renderProtected()
    // Spinner has the animate-spin class
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
  })

  it('redirects to /login when no user', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue({ user: null }))
    renderProtected()
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue({ user: makeUser() }))
    renderProtected()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })
})
