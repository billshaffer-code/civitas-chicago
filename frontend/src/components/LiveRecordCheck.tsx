import { useState } from 'react'
import { checkLiveRecords } from '../api/civitas'
import type { LiveCheckResponse } from '../api/civitas'

interface Props {
  datasetKey: string
  address: string
  dataFreshness: Record<string, string | null>
}

function formatSourceName(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function LiveRecordCheck({ datasetKey, address, dataFreshness }: Props) {
  const [result, setResult] = useState<LiveCheckResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  // Determine "since" from data freshness
  const sinceIso = dataFreshness[datasetKey] ?? dataFreshness[datasetKey.replace('311', 'service_311')] ?? null

  // Only show for datasets we support
  const supported = ['violations', 'inspections', 'permits', '311', 'vacant_buildings']
  if (!supported.includes(datasetKey)) return null

  async function handleCheck() {
    if (!sinceIso) return
    setLoading(true)
    try {
      const res = await checkLiveRecords(datasetKey, address, sinceIso)
      setResult(res)
      setChecked(true)
    } catch {
      setResult({ records: [], count: 0, error: 'Failed to check portal' })
      setChecked(true)
    } finally {
      setLoading(false)
    }
  }

  // Not yet checked — show button
  if (!checked) {
    return (
      <div className="flex items-center justify-between bg-surface-raised/50 border border-separator rounded-apple px-4 py-2.5">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-ink-quaternary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-[11px] text-ink-tertiary">
            Last ingested: {sinceIso ? new Date(sinceIso).toLocaleDateString() : 'Unknown'}
          </span>
        </div>
        <button
          onClick={handleCheck}
          disabled={loading || !sinceIso}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-accent-hover
                     disabled:text-ink-quaternary disabled:cursor-not-allowed transition-colors duration-150"
        >
          {loading ? (
            <>
              <span className="w-3 h-3 rounded-full border-[1.5px] border-separator border-t-accent animate-spin" />
              Checking…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Check for newer records
            </>
          )}
        </button>
      </div>
    )
  }

  // Error
  if (result?.error) {
    return (
      <div className="flex items-center gap-2 bg-amber-50/50 border border-amber-200/50 rounded-apple px-4 py-2.5">
        <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span className="text-[11px] text-amber-700">{result.error}</span>
      </div>
    )
  }

  // No new records
  if (!result || result.count === 0) {
    return (
      <div className="flex items-center gap-2 bg-emerald-50/50 border border-emerald-200/50 rounded-apple px-4 py-2.5">
        <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-[11px] text-emerald-700">No newer records found on Chicago Data Portal</span>
      </div>
    )
  }

  // Found newer records
  return (
    <div className="bg-blue-50/50 border border-blue-200/50 rounded-apple-lg overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-[11px] font-semibold text-blue-700">
          {result.count} record{result.count !== 1 ? 's' : ''} on Chicago Data Portal not yet in Civitas
        </span>
      </div>
      {result.records.length > 0 && (
        <div className="border-t border-blue-200/50 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                {Object.keys(result.records[0]).slice(0, 5).map(col => (
                  <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em] bg-blue-50 text-blue-600/80 border-b border-blue-200/30">
                    {formatSourceName(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.records.slice(0, 10).map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white/60' : 'bg-blue-50/30'}>
                  {Object.keys(result.records[0]).slice(0, 5).map(col => (
                    <td key={col} className="px-3 py-2 text-[11px] text-ink-primary max-w-[200px] truncate">
                      {row[col] != null ? String(row[col]) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {result.count > 10 && (
            <div className="px-4 py-2 text-[10px] text-blue-600 border-t border-blue-200/30">
              Showing 10 of {result.count} records
            </div>
          )}
        </div>
      )}
    </div>
  )
}
