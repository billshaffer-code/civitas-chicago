import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'

interface Props {
  score: number
  level: ActivityLevel
}

const segments: { key: ActivityLevel; label: string }[] = [
  { key: 'QUIET',   label: 'Quiet'   },
  { key: 'TYPICAL', label: 'Typical' },
  { key: 'ACTIVE',  label: 'Active'  },
  { key: 'COMPLEX', label: 'Complex' },
]

export default function ActivityBar({ score, level }: Props) {
  const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.QUIET

  return (
    <div className="flex flex-col items-center gap-3">
      <span className={`text-7xl font-black leading-none tabular-nums tracking-tight ${cfg.text}`}>
        {score}
      </span>

      {/* Segmented bar */}
      <div className="w-full flex gap-[3px] h-2 rounded-full overflow-hidden">
        {segments.map(seg => (
          <div
            key={seg.key}
            className={`flex-1 ${level === seg.key ? LEVEL_CONFIG[seg.key].bar : 'bg-separator-opaque'} transition-colors duration-300`}
          />
        ))}
      </div>

      <span className={`inline-block px-3.5 py-1 rounded-full text-[11px] font-bold tracking-[0.08em] ${cfg.pillBg} ${cfg.pillText}`}>
        {cfg.label}
      </span>
    </div>
  )
}
