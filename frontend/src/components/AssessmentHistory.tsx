import { useState, useEffect } from 'react'
import { getAssessmentHistory } from '../api/civitas'
import type { AssessmentRecord } from '../api/civitas'

interface Props {
  pin: string
}

export default function AssessmentHistory({ pin }: Props) {
  const [records, setRecords] = useState<AssessmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pin) return
    setLoading(true)
    setError(null)
    getAssessmentHistory(pin)
      .then(setRecords)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load assessment history'))
      .finally(() => setLoading(false))
  }, [pin])

  if (loading) {
    return (
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-5 animate-apple-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="skeleton w-7 h-7 rounded-apple-sm" />
          <div className="skeleton skeleton-text w-48" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="skeleton skeleton-text w-16 flex-shrink-0" />
              <div className="skeleton skeleton-text w-24 flex-shrink-0" />
              <div className="skeleton skeleton-text flex-1" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-5 animate-apple-fade-in">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-apple-sm bg-amber-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-medium text-ink-primary">Could not load assessment history</p>
            <p className="text-[12px] text-ink-tertiary mt-0.5">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-5 animate-apple-fade-in">
        <p className="text-[13px] text-ink-quaternary">No assessment history found for PIN {pin}.</p>
      </div>
    )
  }

  // Group by tax year (most recent first) and deduplicate
  const byYear = records.reduce<Record<string, AssessmentRecord>>((acc, r) => {
    const year = r.tax_year ?? 'Unknown'
    if (!acc[year]) acc[year] = r
    return acc
  }, {})
  const sorted = Object.values(byYear).sort(
    (a, b) => Number(b.tax_year ?? 0) - Number(a.tax_year ?? 0)
  )

  // Current and previous for change indicator
  const current = sorted[0]
  const previous = sorted[1]
  const currentVal = Number(current?.certified_total ?? 0)
  const prevVal = Number(previous?.certified_total ?? 0)
  const yoyChange = prevVal > 0 ? ((currentVal - prevVal) / prevVal) * 100 : null

  // Bar chart max
  const maxVal = Math.max(...sorted.map(r => Number(r.certified_total ?? 0)), 1)

  return (
    <div className="space-y-3 animate-apple-fade-in">
      {/* Header card with current value */}
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-ink-quaternary uppercase tracking-[0.08em]">
              Assessed Value ({current?.tax_year ?? '—'})
            </p>
            <p className="text-[24px] font-bold text-ink-primary tabular-nums mt-0.5">
              ${currentVal.toLocaleString()}
            </p>
          </div>
          {yoyChange !== null && (
            <div className={`text-right ${yoyChange >= 0 ? 'text-blue-600' : 'text-slate-500'}`}>
              <p className="text-[16px] font-bold tabular-nums">
                {yoyChange >= 0 ? '+' : ''}{yoyChange.toFixed(1)}%
              </p>
              <p className="text-[10px] text-ink-quaternary">vs. {previous?.tax_year}</p>
            </div>
          )}
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg px-5 py-4">
        <h4 className="text-[11px] font-semibold text-ink-quaternary uppercase tracking-[0.08em] mb-3">
          Assessment Trend
        </h4>
        <div className="space-y-2">
          {sorted.slice(0, 10).map((r) => {
            const val = Number(r.certified_total ?? 0)
            const pct = maxVal > 0 ? (val / maxVal) * 100 : 0
            return (
              <div key={r.tax_year} className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-ink-tertiary w-10 flex-shrink-0 tabular-nums">
                  {r.tax_year}
                </span>
                <div className="flex-1 h-5 bg-surface-raised rounded-[4px] overflow-hidden">
                  <div
                    className="h-full bg-blue-500/80 rounded-[4px] transition-all duration-500"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono text-ink-secondary w-20 text-right flex-shrink-0 tabular-nums">
                  ${val.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail table */}
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] bg-surface-raised text-ink-quaternary border-b border-separator">Year</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] bg-surface-raised text-ink-quaternary border-b border-separator">Class</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] bg-surface-raised text-ink-quaternary border-b border-separator">Land SF</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] bg-surface-raised text-ink-quaternary border-b border-separator">Bldg SF</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] bg-surface-raised text-ink-quaternary border-b border-separator">Certified Total</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.tax_year} className={i % 2 === 0 ? 'bg-white' : 'bg-surface-raised/30'}>
                  <td className="px-3 py-2.5 text-[12px] font-mono text-ink-primary">{r.tax_year ?? '—'}</td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-secondary">{r.property_class ?? '—'}</td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-secondary text-right tabular-nums">
                    {r.land_square_feet ? Number(r.land_square_feet).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-secondary text-right tabular-nums">
                    {r.building_square_feet ? Number(r.building_square_feet).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] font-medium text-ink-primary text-right tabular-nums">
                    {r.certified_total ? `$${Number(r.certified_total).toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-ink-quaternary">
        Source: Cook County Assessor. PIN: {pin}
      </p>
    </div>
  )
}
