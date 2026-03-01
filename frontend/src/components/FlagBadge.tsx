import type { FlagResult } from '../api/civitas'

const catColors: Record<string, { border: string; bg: string; code: string }> = {
  A: { border: 'border-red-400',    bg: 'bg-red-50',    code: 'text-red-600' },
  B: { border: 'border-orange-400', bg: 'bg-orange-50', code: 'text-orange-600' },
  C: { border: 'border-yellow-400', bg: 'bg-yellow-50', code: 'text-yellow-600' },
  D: { border: 'border-blue-400',   bg: 'bg-blue-50',   code: 'text-blue-600' },
}

const fallback = { border: 'border-gray-300', bg: 'bg-gray-50', code: 'text-gray-500' }

export default function FlagBadge({ flag }: { flag: FlagResult }) {
  const c = catColors[flag.category] ?? fallback

  return (
    <div className={`border-l-2 ${c.border} ${c.bg} rounded-r-lg px-3 py-2 mb-2`}>
      <div className="flex justify-between items-center">
        <span className={`font-mono font-bold text-xs ${c.code}`}>
          {flag.flag_code}
        </span>
        <span className="text-[11px] text-gray-400 ml-2 whitespace-nowrap font-mono">
          +{flag.severity_score} pts
        </span>
      </div>
      <p className="text-xs text-gray-600 mt-0.5 leading-snug">{flag.description}</p>
    </div>
  )
}
