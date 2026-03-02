import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PropertySearch from '../PropertySearch'
import type { LookupRequest } from '../../api/civitas'

vi.mock('../../api/civitas', () => ({
  autocompleteAddress: vi.fn(),
}))

import { autocompleteAddress } from '../../api/civitas'

function renderSearch(props: { onSubmit?: (req: LookupRequest) => void; loading?: boolean } = {}) {
  const onSubmit = props.onSubmit ?? vi.fn()
  return render(<PropertySearch onSubmit={onSubmit} loading={props.loading ?? false} />)
}

describe('PropertySearch', () => {
  it('renders address input and submit button', () => {
    renderSearch()
    expect(screen.getByPlaceholderText(/123 N MAIN/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /look up property/i })).toBeInTheDocument()
  })

  it('disables submit when address is empty', () => {
    renderSearch()
    expect(screen.getByRole('button', { name: /look up property/i })).toBeDisabled()
  })

  it('calls onSubmit with address on form submit', async () => {
    const onSubmit = vi.fn()
    renderSearch({ onSubmit })
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/123 N MAIN/i), '456 W OAK ST')
    await user.click(screen.getByRole('button', { name: /look up property/i }))
    expect(onSubmit).toHaveBeenCalledWith({ address: '456 W OAK ST', pin: undefined })
  })

  it('shows autocomplete dropdown after typing (debounced)', async () => {
    const suggestions = [
      { location_sk: 1, full_address: '100 N STATE ST' },
      { location_sk: 2, full_address: '100 N CLARK ST' },
    ]
    vi.mocked(autocompleteAddress).mockResolvedValue(suggestions)

    renderSearch()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/123 N MAIN/i), '100 N')

    // Wait for debounce (300ms) + async resolution
    await waitFor(() => {
      expect(screen.getByText('100 N STATE ST')).toBeInTheDocument()
      expect(screen.getByText('100 N CLARK ST')).toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('selects suggestion on click', async () => {
    vi.mocked(autocompleteAddress).mockResolvedValue([
      { location_sk: 1, full_address: '100 N STATE ST' },
    ])

    renderSearch()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/123 N MAIN/i), '100 N')

    await waitFor(() => {
      expect(screen.getByText('100 N STATE ST')).toBeInTheDocument()
    }, { timeout: 2000 })

    await user.click(screen.getByText('100 N STATE ST'))

    expect(screen.getByPlaceholderText(/123 N MAIN/i)).toHaveValue('100 N STATE ST')
  })

  it('navigates suggestions with arrow keys', async () => {
    vi.mocked(autocompleteAddress).mockResolvedValue([
      { location_sk: 1, full_address: '100 N STATE ST' },
      { location_sk: 2, full_address: '100 N CLARK ST' },
    ])

    renderSearch()
    const user = userEvent.setup()
    const input = screen.getByPlaceholderText(/123 N MAIN/i)
    await user.type(input, '100 N')

    await waitFor(() => {
      expect(screen.getByText('100 N STATE ST')).toBeInTheDocument()
    }, { timeout: 2000 })

    await user.keyboard('{ArrowDown}')
    expect(screen.getByText('100 N STATE ST').className).toContain('bg-blue-50')

    await user.keyboard('{ArrowDown}')
    expect(screen.getByText('100 N CLARK ST').className).toContain('bg-blue-50')
  })
})
