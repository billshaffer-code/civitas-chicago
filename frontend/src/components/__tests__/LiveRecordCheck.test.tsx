import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LiveRecordCheck from '../LiveRecordCheck'
import { checkLiveRecords } from '../../api/civitas'

vi.mock('../../api/civitas', () => ({
  checkLiveRecords: vi.fn(),
}))

const defaultProps = {
  datasetKey: 'violations',
  address: '123 N MAIN ST',
  dataFreshness: { violations: '2025-06-01T00:00:00Z' },
}

describe('LiveRecordCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows check button with last ingested date', () => {
    render(<LiveRecordCheck {...defaultProps} />)
    expect(screen.getByText('Check for newer records')).toBeInTheDocument()
    expect(screen.getByText(/Last ingested/)).toBeInTheDocument()
  })

  it('returns null for unsupported dataset', () => {
    const { container } = render(
      <LiveRecordCheck datasetKey="unknown_dataset" address="123 N MAIN ST" dataFreshness={{}} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows loading spinner when checking', async () => {
    vi.mocked(checkLiveRecords).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<LiveRecordCheck {...defaultProps} />)

    await user.click(screen.getByText('Check for newer records'))
    expect(screen.getByText(/Checking/)).toBeInTheDocument()
  })

  it('shows no-new-records message when count is 0', async () => {
    vi.mocked(checkLiveRecords).mockResolvedValue({ records: [], count: 0 })
    const user = userEvent.setup()
    render(<LiveRecordCheck {...defaultProps} />)

    await user.click(screen.getByText('Check for newer records'))

    await waitFor(() => {
      expect(screen.getByText(/No newer records found/)).toBeInTheDocument()
    })
  })

  it('shows found records when count > 0', async () => {
    vi.mocked(checkLiveRecords).mockResolvedValue({
      records: [{ id: '1', description: 'Building violation', date: '2025-06-15' }],
      count: 1,
    })
    const user = userEvent.setup()
    render(<LiveRecordCheck {...defaultProps} />)

    await user.click(screen.getByText('Check for newer records'))

    await waitFor(() => {
      expect(screen.getByText(/1 record on Chicago Data Portal not yet in Civitas/)).toBeInTheDocument()
    })
    expect(screen.getByText('Building violation')).toBeInTheDocument()
  })

  it('shows error message on API failure', async () => {
    vi.mocked(checkLiveRecords).mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()
    render(<LiveRecordCheck {...defaultProps} />)

    await user.click(screen.getByText('Check for newer records'))

    await waitFor(() => {
      expect(screen.getByText('Failed to check portal')).toBeInTheDocument()
    })
  })

  it('shows error message from API response', async () => {
    vi.mocked(checkLiveRecords).mockResolvedValue({
      records: [],
      count: 0,
      error: 'Portal unavailable',
    })
    const user = userEvent.setup()
    render(<LiveRecordCheck {...defaultProps} />)

    await user.click(screen.getByText('Check for newer records'))

    await waitFor(() => {
      expect(screen.getByText('Portal unavailable')).toBeInTheDocument()
    })
  })
})
