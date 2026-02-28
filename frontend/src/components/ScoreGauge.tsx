type Tier = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH'

const tierConfig: Record<Tier, { color: string; bg: string; label: string }> = {
  LOW:      { color: '#15803d', bg: '#dcfce7', label: 'LOW RISK' },
  MODERATE: { color: '#ca8a04', bg: '#fef9c3', label: 'MODERATE RISK' },
  ELEVATED: { color: '#d97706', bg: '#fef3c7', label: 'ELEVATED RISK' },
  HIGH:     { color: '#b91c1c', bg: '#fee2e2', label: 'HIGH RISK' },
}

interface Props {
  score: number
  tier: Tier
}

export default function ScoreGauge({ score, tier }: Props) {
  const cfg = tierConfig[tier] ?? tierConfig.LOW

  return (
    <div
      className="inline-flex flex-col items-center justify-center rounded-full w-40 h-40 border-4 shadow-md"
      style={{ borderColor: cfg.color, backgroundColor: cfg.bg }}
    >
      <span className="text-5xl font-black" style={{ color: cfg.color }}>
        {score}
      </span>
      <span className="text-xs font-bold mt-1 tracking-wide" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </div>
  )
}
