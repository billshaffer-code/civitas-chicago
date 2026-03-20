import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AppLayout from '../AppLayout'
import { makeAuthValue, makeUser } from '../../test/helpers'

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../context/AuthContext'

function renderLayout(path = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
          <Route path="/search" element={<div>Search Content</div>} />
          <Route path="/login" element={<div>Login Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppLayout', () => {
  it('renders CIVITAS brand and nav links', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    renderLayout()
    expect(screen.getByText('CIVITAS')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Search')).toBeInTheDocument()
  })

  it('displays user initial avatar', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue({ user: makeUser({ full_name: 'Bob Jones' }) }))
    renderLayout()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('highlights active nav link based on path', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    renderLayout('/dashboard')
    const dashBtn = screen.getByText('Dashboard')
    const searchBtn = screen.getByText('Search')
    expect(dashBtn.className).toContain('text-accent')
    expect(searchBtn.className).not.toContain('text-accent bg-accent-light')
  })

  it('calls logout on Sign Out click', async () => {
    const auth = makeAuthValue()
    vi.mocked(useAuth).mockReturnValue(auth)
    renderLayout()
    const user = userEvent.setup()
    await user.click(screen.getByText('Sign Out'))
    expect(auth.logout).toHaveBeenCalled()
  })
})
