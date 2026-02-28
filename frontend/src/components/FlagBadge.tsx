import type { FlagResult } from '../api/civitas'

const catColors: Record<string, string> = {
  A: 'border-red-600 bg-red-50',
  B: 'border-orange-500 bg-orange-50',
  C: 'border-yellow-600 bg-yellow-50',
  D: 'border-blue-700 bg-blue-50',
}

const catLabel: Record<string, string> = {
  A: 'text-red-700',
  B: 'text-orange-700',
  C: 'text-yellow-700',
  D: 'text-blue-700',
}

export default function FlagBadge({ flag }: { flag: FlagResult }) {
  const color = catColors[flag.category] ?? 'border-gray-400 bg-gray-50'
  const label = catLabel[flag.category] ?? 'text-gray-700'

  return (
    <div className={`border-l-4 p-3 mb-2 rounded-r ${color}`}>
      <div className="flex justify-between items-start">
        <span className={`font-mono font-bold text-sm ${label}`}>
          {flag.flag_code}
        </span>
        <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
          Cat {flag.category} · +{flag.severity_score} pts
        </span>
      </div>
      <p className="text-xs text-gray-600 mt-0.5">{flag.description}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        Supporting count: <strong>{flag.supporting_count}</strong>
      </p>
    </div>
  )
}
