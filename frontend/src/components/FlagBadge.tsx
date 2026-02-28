import type { FlagResult } from '../api/civitas'

const catColors: Record<string, { border: string; bg: string; code: string }> = {
  A: { border: 'border-red-500',    bg: 'bg-red-500/10',    code: 'text-red-400' },
  B: { border: 'border-orange-500', bg: 'bg-orange-500/10', code: 'text-orange-400' },
  C: { border: 'border-yellow-500', bg: 'bg-yellow-500/10', code: 'text-yellow-400' },
  D: { border: 'border-blue-500',   bg: 'bg-blue-500/10',   code: 'text-blue-400' },
}

const fallback = { border: 'border-slate-500', bg: 'bg-slate-500/10', code: 'text-slate-400' }

export default function FlagBadge({ flag }: { flag: FlagResult }) {
  const c = catColors[flag.category] ?? fallback

  return (
    <div className={`border-l-2 ${c.border} ${c.bg} rounded-r-lg px-3 py-2 mb-2`}>
      <div className="flex justify-between items-center">
        <span className={`font-mono font-bold text-xs ${c.code}`}>
          {flag.flag_code}
        </span>
        <span className="text-[11px] text-slate-500 ml-2 whitespace-nowrap font-mono">
          +{flag.severity_score} pts
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-0.5 leading-snug">{flag.description}</p>
    </div>
  )
}
