import { render, screen } from '@testing-library/react'
import ActivityBar from '../ActivityBar'

describe('ActivityBar', () => {
  it('renders numeric score', () => {
    render(<ActivityBar score={45} level="TYPICAL" />)
    expect(screen.getByText('45')).toBeInTheDocument()
  })

  it('renders activity level label', () => {
    render(<ActivityBar score={45} level="TYPICAL" />)
    expect(screen.getByText('TYPICAL')).toBeInTheDocument()
  })

  it('renders COMPLEX level', () => {
    render(<ActivityBar score={85} level="COMPLEX" />)
    expect(screen.getByText('COMPLEX')).toBeInTheDocument()
    expect(screen.getByText('85')).toBeInTheDocument()
  })

  it('renders QUIET level', () => {
    render(<ActivityBar score={10} level="QUIET" />)
    expect(screen.getByText('QUIET')).toBeInTheDocument()
  })
})
