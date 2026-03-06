import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'

interface Props {
  score: number
  level: ActivityLevel
}

const segments: { key: ActivityLevel; label: string; min: number; max: number }[] = [
  { key: 'QUIET',   label: 'Quiet',   min: 0,  max: 24 },
  { key: 'TYPICAL', label: 'Typical', min: 25, max: 49 },
  { key: 'ACTIVE',  label: 'Active',  min: 50, max: 74 },
  { key: 'COMPLEX', label: 'Complex', min: 75, max: 100 },
]

export default function ActivityBar({ score, level }: Props) {
  const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.QUIET
  const pct = Math.min(Math.max(score, 0), 100)

  return (
    <div className="flex flex-col items-center gap-3">
      <span className={`text-7xl font-black leading-none ${cfg.text}`}>
        {score}
      </span>

      {/* Segmented bar */}
      <div className="w-full flex gap-0.5 h-2.5 rounded-full overflow-hidden">
        {segments.map(seg => {
          const isActive = level === seg.key
          const bgClass = isActive ? LEVEL_CONFIG[seg.key].bar : 'bg-gray-200'
          return (
            <div
              key={seg.key}
              className={`flex-1 ${bgClass} transition-colors duration-300`}
            />
          )
        })}
      </div>

      {/* Marker position */}
      <div className="w-full relative h-0">
        <div
          className={`absolute -top-1 w-2.5 h-2.5 rounded-full border-2 border-white shadow ${cfg.bar}`}
          style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
        />
      </div>

      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wider ${cfg.pillBg} ${cfg.pillText}`}>
        {cfg.label}
      </span>
    </div>
  )
}
