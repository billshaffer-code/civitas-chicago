import { render, screen } from '@testing-library/react'
import FindingCard from '../FindingCard'
import { makeFlag } from '../../test/helpers'

describe('FindingCard', () => {
  it('renders flag_code, action_group, and description', () => {
    render(<FindingCard flag={makeFlag()} />)
    expect(screen.getByText('ACTIVE_MUNICIPAL_VIOLATION')).toBeInTheDocument()
    expect(screen.getByText('Review Recommended')).toBeInTheDocument()
    expect(screen.getByText('Active violation on record')).toBeInTheDocument()
  })

  it('applies correct color class for Review Recommended', () => {
    const { container } = render(<FindingCard flag={makeFlag({ action_group: 'Review Recommended' })} />)
    expect(container.firstChild).toHaveClass('border-blue-500')
  })

  it('applies correct color class for Action Required', () => {
    const { container } = render(<FindingCard flag={makeFlag({ action_group: 'Action Required' })} />)
    expect(container.firstChild).toHaveClass('border-amber-400')
  })

  it('falls back to gray for unknown action group', () => {
    const { container } = render(<FindingCard flag={makeFlag({ action_group: 'Unknown' })} />)
    expect(container.firstChild).toHaveClass('border-separator-opaque')
  })
})
