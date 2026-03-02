import { render, screen } from '@testing-library/react'
import FlagBadge from '../FlagBadge'
import { makeFlag } from '../../test/helpers'

describe('FlagBadge', () => {
  it('renders flag_code, severity_score, and description', () => {
    render(<FlagBadge flag={makeFlag()} />)
    expect(screen.getByText('ACTIVE_MUNICIPAL_VIOLATION')).toBeInTheDocument()
    expect(screen.getByText('+25 pts')).toBeInTheDocument()
    expect(screen.getByText('Active violation on record')).toBeInTheDocument()
  })

  it('applies correct color class for category A', () => {
    const { container } = render(<FlagBadge flag={makeFlag({ category: 'A' })} />)
    expect(container.firstChild).toHaveClass('border-red-400')
  })

  it('applies correct color class for category D', () => {
    const { container } = render(<FlagBadge flag={makeFlag({ category: 'D' })} />)
    expect(container.firstChild).toHaveClass('border-blue-400')
  })

  it('falls back to gray for unknown category', () => {
    const { container } = render(<FlagBadge flag={makeFlag({ category: 'Z' })} />)
    expect(container.firstChild).toHaveClass('border-gray-300')
  })
})
