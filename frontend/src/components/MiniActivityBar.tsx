/** Compact horizontal score bar for use in lists and tables. */
export default function MiniActivityBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score))

  function color() {
    if (pct >= 75) return '#1e3a5f'
    if (pct >= 50) return '#2563eb'
    if (pct >= 25) return '#60a5fa'
    return '#94a3b8'
  }

  return (
    <div className="w-16 h-1.5 rounded-full bg-separator-opaque overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: color() }}
      />
    </div>
  )
}
