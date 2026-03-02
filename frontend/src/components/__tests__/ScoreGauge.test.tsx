import { render, screen } from '@testing-library/react'
import ScoreGauge from '../ScoreGauge'

describe('ScoreGauge', () => {
  it('renders numeric score', () => {
    render(<ScoreGauge score={45} tier="MODERATE" />)
    expect(screen.getByText('45')).toBeInTheDocument()
  })

  it('renders tier label', () => {
    render(<ScoreGauge score={45} tier="MODERATE" />)
    expect(screen.getByText('MODERATE RISK')).toBeInTheDocument()
  })

  it('sets progress bar width to score percentage', () => {
    const { container } = render(<ScoreGauge score={60} tier="ELEVATED" />)
    const bar = container.querySelector('[style]')
    expect(bar).toHaveStyle({ width: '60%' })
  })

  it('caps progress bar at 100% for scores above 100', () => {
    const { container } = render(<ScoreGauge score={130} tier="HIGH" />)
    const bar = container.querySelector('[style]')
    expect(bar).toHaveStyle({ width: '100%' })
  })
})
