type Tier = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH'

const tierConfig: Record<Tier, { text: string; bar: string; pillBg: string; pillText: string; label: string }> = {
  LOW:      { text: 'text-emerald-400', bar: 'bg-emerald-500', pillBg: 'bg-emerald-500/15', pillText: 'text-emerald-400', label: 'LOW RISK' },
  MODERATE: { text: 'text-yellow-400',  bar: 'bg-yellow-500',  pillBg: 'bg-yellow-500/15',  pillText: 'text-yellow-400',  label: 'MODERATE RISK' },
  ELEVATED: { text: 'text-orange-400',  bar: 'bg-orange-500',  pillBg: 'bg-orange-500/15',  pillText: 'text-orange-400',  label: 'ELEVATED RISK' },
  HIGH:     { text: 'text-red-400',     bar: 'bg-red-500',     pillBg: 'bg-red-500/15',     pillText: 'text-red-400',     label: 'HIGH RISK' },
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

      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
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
