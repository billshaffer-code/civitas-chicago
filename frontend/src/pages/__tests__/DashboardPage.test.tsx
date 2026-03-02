import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '../DashboardPage'
import { makeAuthValue, makeUser, makeReportHistoryItem } from '../../test/helpers'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../api/civitas', () => ({
  getMyReports: vi.fn(),
}))

import { useAuth } from '../../context/AuthContext'
import { getMyReports } from '../../api/civitas'

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

describe('DashboardPage', () => {
  it('displays welcome message with user first name', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue({ user: makeUser({ full_name: 'Jane Smith' }) }))
    vi.mocked(getMyReports).mockResolvedValue([])
    renderDashboard()
    expect(screen.getByText(/welcome back, jane/i)).toBeInTheDocument()
  })

  it('shows loading state while fetching reports', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockReturnValue(new Promise(() => {}))
    renderDashboard()
    // Reports count shows '--' while loading
    expect(screen.getByText('--')).toBeInTheDocument()
  })

  it('displays report count after loading', async () => {
    const reports = [
      makeReportHistoryItem({ report_id: 'r1' }),
      makeReportHistoryItem({ report_id: 'r2' }),
    ]
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue(reports)
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  it('renders report history cards with address, score, tier', async () => {
    const reports = [
      makeReportHistoryItem({
        report_id: 'r1',
        query_address: '456 W OAK ST',
        risk_score: 72,
        risk_tier: 'ELEVATED',
      }),
    ]
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue(reports)
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('456 W OAK ST')).toBeInTheDocument()
      expect(screen.getByText('Score: 72')).toBeInTheDocument()
      expect(screen.getByText('ELEVATED')).toBeInTheDocument()
    })
  })

  it('shows empty state when no reports exist', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue([])
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText(/no reports yet/i)).toBeInTheDocument()
    })
  })

  it('navigates to /search?report=ID on report card click', async () => {
    const reports = [makeReportHistoryItem({ report_id: 'rpt-99' })]
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue(reports)
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('123 N MAIN ST')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByText('123 N MAIN ST'))

    expect(mockNavigate).toHaveBeenCalledWith('/search?report=rpt-99')
  })
})
