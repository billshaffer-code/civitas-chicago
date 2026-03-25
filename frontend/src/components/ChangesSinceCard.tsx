import { useMemo } from 'react'
import type { ReportResponse } from '../api/civitas'
import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'

interface Props {
  current: ReportResponse
  previous: ReportResponse | null
  loading?: boolean
}

const RECORD_LABELS: Record<string, string> = {
  violations: 'Violations',
  inspections: 'Inspections',
  permits: 'Permits',
  tax_liens: 'Liens',
  service_311: '311',
  vacant_buildings: 'Vacant',
}

function relativeTime(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

function mostRecentFreshness(freshness: Record<string, string | null>): string | null {
  let latest: string | null = null
  for (const [key, val] of Object.entries(freshness)) {
    if (key === 'report_generated_at' || !val) continue
    if (!latest || val > latest) latest = val
  }
  return latest
}

export default function ChangesSinceCard({ current, previous, loading }: Props) {
  const diff = useMemo(() => {
    if (!previous) return null

    const scoreDelta = current.activity_score - previous.activity_score
    const levelChanged = current.activity_level !== previous.activity_level

    const prevFlagCodes = new Set(previous.triggered_flags.map(f => f.flag_code))
    const currFlagCodes = new Set(current.triggered_flags.map(f => f.flag_code))
    const newFindings = current.triggered_flags.filter(f => !prevFlagCodes.has(f.flag_code))
    const resolvedFindings = previous.triggered_flags.filter(f => !currFlagCodes.has(f.flag_code))

    const recordKeys = Object.keys(RECORD_LABELS)
    const recordChanges: { key: string; label: string; delta: number }[] = []
    for (const key of recordKeys) {
      const currCount = (current.supporting_records as Record<string, unknown[]>)[key]?.length ?? 0
      const prevCount = (previous.supporting_records as Record<string, unknown[]>)[key]?.length ?? 0
      const delta = currCount - prevCount
      if (delta !== 0) {
        recordChanges.push({ key, label: RECORD_LABELS[key], delta })
      }
    }

    const daysBetween = Math.floor(
      (new Date(current.generated_at).getTime() - new Date(previous.generated_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    return { scoreDelta, levelChanged, newFindings, resolvedFindings, recordChanges, daysBetween }
  }, [current, previous])

  const latestFreshness = mostRecentFreshness(current.data_freshness)

  // Loading skeleton
  if (loading) {
    return (
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg px-5 py-4 animate-apple-fade-in">
        <div className="flex items-center justify-between mb-3">
          <div className="skeleton skeleton-text w-40" />
          <div className="skeleton skeleton-text w-28" />
        </div>
        <div className="flex gap-3">
          <div className="skeleton h-8 w-20 rounded-apple" />
          <div className="skeleton h-8 w-32 rounded-apple" />
          <div className="skeleton h-8 w-24 rounded-apple" />
        </div>
      </div>
    )
  }

  // First report — no previous
  if (!previous || !diff) {
    return (
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg px-5 py-4 animate-apple-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span className="text-[13px] font-medium text-ink-secondary">First report for this property</span>
          </div>
          {latestFreshness && (
            <span className="text-[11px] text-ink-quaternary">
              Data as of {new Date(latestFreshness).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    )
  }

  const { scoreDelta, levelChanged, newFindings, resolvedFindings, recordChanges } = diff
  const hasChanges = scoreDelta !== 0 || newFindings.length > 0 || resolvedFindings.length > 0 || recordChanges.length > 0
  const prevCfg = LEVEL_CONFIG[previous.activity_level as ActivityLevel]
  const currCfg = LEVEL_CONFIG[current.activity_level as ActivityLevel]

  return (
    <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg px-5 py-4 animate-apple-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-surface-sunken flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-ink-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-[13px] font-medium text-ink-secondary">
            Changes since {relativeTime(previous.generated_at)}
          </span>
        </div>
        {latestFreshness && (
          <span className="text-[11px] text-ink-quaternary">
            Data as of {new Date(latestFreshness).toLocaleDateString()}
          </span>
        )}
      </div>

      {!hasChanges ? (
        <p className="text-[12px] text-ink-quaternary">No changes detected since last report.</p>
      ) : (
        <div className="space-y-2.5">
          {/* Score + Level row */}
          {(scoreDelta !== 0 || levelChanged) && (
            <div className="flex items-center gap-3 flex-wrap">
              {scoreDelta !== 0 && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-apple text-[12px] font-semibold ${
                  scoreDelta > 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-500'
                }`}>
                  {scoreDelta > 0 ? '\u25B2' : '\u25BC'} {scoreDelta > 0 ? '+' : ''}{scoreDelta} score
                </span>
              )}
              {levelChanged && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${prevCfg?.pillBg ?? ''} ${prevCfg?.pillText ?? ''}`}>
                    {prevCfg?.label ?? previous.activity_level}
                  </span>
                  <span className="text-ink-quaternary">&rarr;</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${currCfg?.pillBg ?? ''} ${currCfg?.pillText ?? ''}`}>
                    {currCfg?.label ?? current.activity_level}
                  </span>
                </span>
              )}
            </div>
          )}

          {/* New findings */}
          {newFindings.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-ink-quaternary uppercase tracking-wider mb-1">New Findings</p>
              <div className="space-y-0.5">
                {newFindings.map(f => (
                  <div key={f.flag_code} className="flex items-start gap-1.5 text-[12px] text-ink-secondary">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                    <span>{f.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolved findings */}
          {resolvedFindings.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-ink-quaternary uppercase tracking-wider mb-1">Resolved</p>
              <div className="space-y-0.5">
                {resolvedFindings.map(f => (
                  <div key={f.flag_code} className="flex items-start gap-1.5 text-[12px] text-ink-quaternary">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                    <span className="line-through">{f.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Record count changes */}
          {recordChanges.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recordChanges.map(r => (
                <span
                  key={r.key}
                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    r.delta > 0 ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'
                  }`}
                >
                  {r.delta > 0 ? '+' : ''}{r.delta} {r.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
