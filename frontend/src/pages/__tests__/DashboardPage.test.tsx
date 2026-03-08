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
  getMyBatches: vi.fn(),
  autocompleteAddress: vi.fn().mockResolvedValue([]),
}))

import { useAuth } from '../../context/AuthContext'
import { getMyReports, getMyBatches } from '../../api/civitas'

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(getMyBatches).mockResolvedValue([])
  })

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
    // Loading skeletons are rendered
    expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
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
      // Report count appears in stats row; '2' is the count of reports
      expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    })
  })

  it('renders report history cards with address, score, level', async () => {
    const reports = [
      makeReportHistoryItem({
        report_id: 'r1',
        query_address: '456 W OAK ST',
        activity_score: 72,
        activity_level: 'ACTIVE',
      }),
    ]
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue(reports)
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('456 W OAK ST')).toBeInTheDocument()
      expect(screen.getAllByText('72').length).toBeGreaterThan(0)
      expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0)
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

  it('shows quick search bar', () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue([])
    renderDashboard()
    expect(screen.getByPlaceholderText(/search by address/i)).toBeInTheDocument()
  })

  it('navigates to search on quick search submit', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue([])
    renderDashboard()

    const user = userEvent.setup()
    const input = screen.getByPlaceholderText(/search by address/i)
    await user.type(input, '123 MAIN ST')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(mockNavigate).toHaveBeenCalledWith('/search?q=123%20MAIN%20ST')
  })

  it('shows activity level distribution when reports exist', async () => {
    const reports = [
      makeReportHistoryItem({ report_id: 'r1', activity_level: 'QUIET' }),
      makeReportHistoryItem({ report_id: 'r2', activity_level: 'ACTIVE' }),
    ]
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue(reports)
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Activity Level Distribution')).toBeInTheDocument()
    })
  })

  it('shows action cards for search, batch, compare, browse', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue([])
    renderDashboard()

    expect(screen.getByText('Property Search')).toBeInTheDocument()
    expect(screen.getByText('Portfolio Analysis')).toBeInTheDocument()
    expect(screen.getByText('Compare Reports')).toBeInTheDocument()
    expect(screen.getByText('Browse Data')).toBeInTheDocument()
  })
})
