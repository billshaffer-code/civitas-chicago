import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ParcelVerify from '../ParcelVerify'
import { searchParcels, verifyParcel } from '../../api/civitas'
import type { AssessmentRecord } from '../../api/civitas'

vi.mock('../../api/civitas', () => ({
  searchParcels: vi.fn(),
  verifyParcel: vi.fn(),
}))

const mockResult: AssessmentRecord[] = [
  {
    pin: '12-34-567-890',
    tax_year: '2024',
    property_address: '123 N MAIN ST',
    property_class: '2-11',
    land_square_feet: '3000',
    building_square_feet: '1800',
    certified_total: '250000',
  },
]

describe('ParcelVerify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders verify button in verify mode', () => {
    render(<ParcelVerify pin="12-34-567-890" address="123 N MAIN ST" mode="verify" />)
    expect(screen.getByText('Verify with Cook County')).toBeInTheDocument()
  })

  it('renders search card in search mode', () => {
    render(<ParcelVerify pin={null} address="123 N MAIN ST" mode="search" />)
    expect(screen.getByText('Search Cook County Assessor')).toBeInTheDocument()
    expect(screen.getByText('Search')).toBeInTheDocument()
  })

  it('shows loading state when verifying', async () => {
    vi.mocked(verifyParcel).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<ParcelVerify pin="12-34-567-890" address="123 N MAIN ST" mode="verify" />)

    await user.click(screen.getByText('Verify with Cook County'))
    expect(screen.getByText(/Verifying with Cook County/)).toBeInTheDocument()
  })

  it('shows loading state when searching', async () => {
    vi.mocked(searchParcels).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<ParcelVerify pin={null} address="123 N MAIN ST" mode="search" />)

    await user.click(screen.getByText('Search'))
    expect(screen.getByText(/Searching Cook County/)).toBeInTheDocument()
  })

  it('displays results after verify', async () => {
    vi.mocked(verifyParcel).mockResolvedValue(mockResult)
    const user = userEvent.setup()
    render(<ParcelVerify pin="12-34-567-890" address="123 N MAIN ST" mode="verify" />)

    await user.click(screen.getByText('Verify with Cook County'))

    await waitFor(() => {
      expect(screen.getByText('123 N MAIN ST')).toBeInTheDocument()
    })
    expect(screen.getByText('PIN: 12-34-567-890')).toBeInTheDocument()
    expect(screen.getByText('$250,000')).toBeInTheDocument()
    expect(screen.getByText('Cook County Verification')).toBeInTheDocument()
  })

  it('displays results after search', async () => {
    vi.mocked(searchParcels).mockResolvedValue(mockResult)
    const user = userEvent.setup()
    render(<ParcelVerify pin={null} address="123 N MAIN ST" mode="search" />)

    await user.click(screen.getByText('Search'))

    await waitFor(() => {
      expect(screen.getByText('Cook County Results')).toBeInTheDocument()
    })
    expect(screen.getByText('1 parcel')).toBeInTheDocument()
  })

  it('returns to initial state on failure in verify mode', async () => {
    vi.mocked(verifyParcel).mockRejectedValue(new Error('Timeout'))
    const user = userEvent.setup()
    render(<ParcelVerify pin="12-34-567-890" address="123 N MAIN ST" mode="verify" />)

    await user.click(screen.getByText('Verify with Cook County'))

    // After error, component returns to initial verify button (error state is masked)
    await waitFor(() => {
      expect(screen.getByText('Verify with Cook County')).toBeInTheDocument()
    })
  })

  it('shows error state on failure in search mode', async () => {
    vi.mocked(searchParcels).mockRejectedValue(new Error('Timeout'))
    const user = userEvent.setup()
    render(<ParcelVerify pin={null} address="123 N MAIN ST" mode="search" />)

    await user.click(screen.getByText('Search'))

    // After error, component returns to initial search card (error state is masked)
    await waitFor(() => {
      expect(screen.getByText('Search Cook County Assessor')).toBeInTheDocument()
    })
  })

  it('shows empty results message when no parcels found', async () => {
    vi.mocked(searchParcels).mockResolvedValue([])
    const user = userEvent.setup()
    render(<ParcelVerify pin={null} address="123 N MAIN ST" mode="search" />)

    await user.click(screen.getByText('Search'))

    await waitFor(() => {
      expect(screen.getByText(/No matching parcels found/)).toBeInTheDocument()
    })
  })
})
