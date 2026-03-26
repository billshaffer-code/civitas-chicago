import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '../DashboardPage'
import { makeAuthValue, makeReportHistoryItem } from '../../test/helpers'

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
  autocompleteAddress: vi.fn().mockResolvedValue([]),
  getNeighborhoodList: vi.fn().mockResolvedValue([]),
  getNeighborhoodGeoJSON: vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
}))

// Mock leaflet to avoid DOM issues in tests
vi.mock('leaflet', () => ({
  default: {
    map: () => ({
      remove: vi.fn(),
      setView: vi.fn(),
      fitBounds: vi.fn(),
      invalidateSize: vi.fn(),
    }),
    tileLayer: () => ({ addTo: vi.fn() }),
    control: { zoom: () => ({ addTo: vi.fn() }) },
    geoJSON: () => ({ addTo: vi.fn(), remove: vi.fn(), getBounds: vi.fn() }),
  },
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
  it('displays quick search bar', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue([])
    renderDashboard()
    expect(screen.getByPlaceholderText(/search by address/i)).toBeInTheDocument()
  })

  it('shows stats cards when reports exist', async () => {
    const reports = [
      makeReportHistoryItem({ report_id: 'r1', activity_score: 40 }),
      makeReportHistoryItem({ report_id: 'r2', activity_score: 60 }),
    ]
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue(reports)
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Properties')).toBeInTheDocument()
      expect(screen.getByText('Avg Score')).toBeInTheDocument()
    })
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

  it('shows tool shortcut buttons', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue([])
    renderDashboard()

    expect(screen.getByText('Portfolio')).toBeInTheDocument()
    expect(screen.getByText('Compare')).toBeInTheDocument()
    expect(screen.getByText('Browse Data')).toBeInTheDocument()
    expect(screen.getByText('Data Health')).toBeInTheDocument()
  })

  it('shows neighborhoods section when areas load', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuthValue())
    vi.mocked(getMyReports).mockResolvedValue([])

    const { getNeighborhoodList } = await import('../../api/civitas')
    vi.mocked(getNeighborhoodList).mockResolvedValue([
      { community_area_id: 1, community_area_name: 'Rogers Park', property_count: 100, avg_activity_score: 30 } as any,
    ])

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Neighborhoods')).toBeInTheDocument()
      expect(screen.getByText('Rogers Park')).toBeInTheDocument()
    })
  })
})
