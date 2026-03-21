import { useState, useEffect } from 'react'
import { getDataHealth } from '../api/civitas'
import type { DatasetHealth, DataHealthResponse } from '../api/civitas'

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatAge(hours: number | null | undefined): string {
  if (hours == null) return '—'
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${Math.round(hours)}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

const STALENESS_CONFIG = {
  fresh:      { dot: 'bg-emerald-400', label: 'Fresh', text: 'text-emerald-600' },
  stale:      { dot: 'bg-amber-400',   label: 'Stale', text: 'text-amber-600' },
  very_stale: { dot: 'bg-red-400',     label: 'Outdated', text: 'text-red-600' },
}

export default function DataHealth({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<DataHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getDataHealth()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load data health'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className={embedded ? '' : 'mx-auto px-4 py-8 max-w-5xl'}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="skeleton w-2.5 h-2.5 rounded-full" />
                <div className="skeleton skeleton-text w-24" />
              </div>
              <div className="skeleton h-5 w-16 mb-2 rounded" />
              <div className="skeleton skeleton-text w-32" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={embedded ? '' : 'mx-auto px-4 py-8 max-w-5xl'}>
        <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-5">
          <p className="text-[13px] text-ink-secondary">{error}</p>
        </div>
      </div>
    )
  }

  const datasets = data?.datasets ?? []
  const alerts = data?.quality_alerts ?? []

  return (
    <div className={embedded ? 'space-y-4' : 'mx-auto px-4 py-8 max-w-5xl space-y-4'}>
      {/* Dataset cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {datasets.map((ds: DatasetHealth) => {
          const staleness = ds.staleness ? STALENESS_CONFIG[ds.staleness] : null
          return (
            <div
              key={ds.key}
              className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-4 transition-all duration-150 hover:shadow-apple-sm"
            >
              <div className="flex items-center gap-2 mb-2">
                {staleness ? (
                  <div className={`w-2.5 h-2.5 rounded-full ${staleness.dot} flex-shrink-0`} />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-300 flex-shrink-0" />
                )}
                <h4 className="text-[13px] font-semibold text-ink-primary truncate">
                  {ds.label ?? ds.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </h4>
              </div>

              <div className="text-[18px] font-bold text-ink-primary tabular-nums mb-1">
                {ds.record_count != null ? ds.record_count.toLocaleString() : '—'}
              </div>
              <p className="text-[10px] text-ink-quaternary">records in Civitas</p>

              <div className="mt-3 pt-3 border-t border-separator space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-ink-quaternary">Last Ingested</span>
                  <span className="text-[10px] font-mono text-ink-secondary">
                    {formatTimestamp(ds.last_ingested)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-ink-quaternary">Portal Updated</span>
                  <span className="text-[10px] font-mono text-ink-secondary">
                    {ds.portal_error
                      ? 'Unavailable'
                      : ds.portal_age_hours != null
                        ? formatAge(ds.portal_age_hours)
                        : '—'}
                  </span>
                </div>
                {staleness && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-ink-quaternary">Status</span>
                    <span className={`text-[10px] font-semibold ${staleness.text}`}>
                      {staleness.label}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Quality alerts */}
      {alerts.length > 0 && (
        <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-4">
          <h4 className="text-[11px] font-semibold text-ink-quaternary uppercase tracking-[0.08em] mb-3">
            Quality Alerts
          </h4>
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 text-[12px] bg-amber-50/50 border border-amber-200/50 rounded-apple px-3 py-2"
              >
                <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-ink-secondary">
                  <span className="font-medium">{String(alert.source_dataset ?? '')}</span>
                  {' — '}
                  {String(alert.message ?? alert.check_name ?? '')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
