type Tier = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH'

const tierConfig: Record<Tier, { text: string; bar: string; pillBg: string; pillText: string; label: string }> = {
  LOW:      { text: 'text-emerald-600', bar: 'bg-emerald-500', pillBg: 'bg-emerald-50', pillText: 'text-emerald-700', label: 'LOW RISK' },
  MODERATE: { text: 'text-yellow-600',  bar: 'bg-yellow-500',  pillBg: 'bg-yellow-50',  pillText: 'text-yellow-700',  label: 'MODERATE RISK' },
  ELEVATED: { text: 'text-orange-600',  bar: 'bg-orange-500',  pillBg: 'bg-orange-50',  pillText: 'text-orange-700',  label: 'ELEVATED RISK' },
  HIGH:     { text: 'text-red-600',     bar: 'bg-red-500',     pillBg: 'bg-red-50',     pillText: 'text-red-700',     label: 'HIGH RISK' },
}

interface Props {
  score: number
  tier: Tier
}

export default function ScoreGauge({ score, tier }: Props) {
  const cfg = tierConfig[tier] ?? tierConfig.LOW
  const pct = Math.min(score, 100)

  return (
    <div className="flex flex-col items-center gap-3">
      <span className={`text-7xl font-black leading-none ${cfg.text}`}>
        {score}
      </span>

      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wider ${cfg.pillBg} ${cfg.pillText}`}>
        {cfg.label}
      </span>
    </div>
  )
}
