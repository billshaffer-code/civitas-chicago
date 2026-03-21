import { render, screen, waitFor } from '@testing-library/react'
import AssessmentHistory from '../AssessmentHistory'
import { getAssessmentHistory } from '../../api/civitas'
import type { AssessmentRecord } from '../../api/civitas'

vi.mock('../../api/civitas', () => ({
  getAssessmentHistory: vi.fn(),
}))

const mockRecords: AssessmentRecord[] = [
  {
    pin: '12-34-567-890',
    tax_year: '2024',
    property_address: '123 N MAIN ST',
    property_class: '2-11',
    land_square_feet: '3000',
    building_square_feet: '1800',
    certified_total: '250000',
  },
  {
    pin: '12-34-567-890',
    tax_year: '2023',
    property_address: '123 N MAIN ST',
    property_class: '2-11',
    land_square_feet: '3000',
    building_square_feet: '1800',
    certified_total: '200000',
  },
]

describe('AssessmentHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading skeleton initially', () => {
    vi.mocked(getAssessmentHistory).mockReturnValue(new Promise(() => {}))
    const { container } = render(<AssessmentHistory pin="12-34-567-890" />)
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
  })

  it('renders assessment data after loading', async () => {
    vi.mocked(getAssessmentHistory).mockResolvedValue(mockRecords)
    render(<AssessmentHistory pin="12-34-567-890" />)

    await waitFor(() => {
      expect(screen.getAllByText(/\$250,?000/).length).toBeGreaterThan(0)
    })

    expect(screen.getByText('Assessment Trend')).toBeInTheDocument()
    expect(screen.getAllByText('2024').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2023').length).toBeGreaterThan(0)
    expect(screen.getByText(/\+25\.0%/)).toBeInTheDocument()
  })

  it('shows error message on API failure', async () => {
    vi.mocked(getAssessmentHistory).mockRejectedValue(new Error('Network error'))
    render(<AssessmentHistory pin="12-34-567-890" />)

    await waitFor(() => {
      expect(screen.getByText('Could not load assessment history')).toBeInTheDocument()
    })
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('shows empty state when no records returned', async () => {
    vi.mocked(getAssessmentHistory).mockResolvedValue([])
    render(<AssessmentHistory pin="12-34-567-890" />)

    await waitFor(() => {
      expect(screen.getByText(/No assessment history found/)).toBeInTheDocument()
    })
  })
})
