import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyReports, getMyBatches } from '../api/civitas'
import type { ReportHistoryItem, BatchListItem } from '../api/civitas'
import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function groupReportsByDate(reports: ReportHistoryItem[]): { label: string; items: ReportHistoryItem[] }[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const weekStart = todayStart - 6 * 86_400_000
  const today: ReportHistoryItem[] = []
  const thisWeek: ReportHistoryItem[] = []
  const older: ReportHistoryItem[] = []
  for (const r of reports) {
    const t = new Date(r.generated_at).getTime()
    if (t >= todayStart) today.push(r)
    else if (t >= weekStart) thisWeek.push(r)
    else older.push(r)
  }
  const groups: { label: string; items: ReportHistoryItem[] }[] = []
  if (today.length) groups.push({ label: 'Today', items: today })
  if (thisWeek.length) groups.push({ label: 'This Week', items: thisWeek })
  if (older.length) groups.push({ label: 'Earlier', items: older })
  return groups
}

export default function RecentActivityDropdown() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'reports' | 'batches'>('reports')
  const [reports, setReports] = useState<ReportHistoryItem[]>([])
  const [batches, setBatches] = useState<BatchListItem[]>([])
  const [loading, setLoading] = useState(true)
  const dropRef = useRef<HTMLDivElement>(null)
  const hasFetched = useRef(false)

  // Fetch on first open
  useEffect(() => {
    if (!open || hasFetched.current) return
    hasFetched.current = true
    setLoading(true)
    Promise.all([
      getMyReports().catch(() => [] as ReportHistoryItem[]),
      getMyBatches(5).catch(() => [] as BatchListItem[]),
    ])
      .then(([r, b]) => { setReports(r); setBatches(b) })
      .finally(() => setLoading(false))
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function handleNavigate(path: string) {
    setOpen(false)
    navigate(path)
  }

  const reportGroups = groupReportsByDate(reports)

  return (
    <div ref={dropRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-150 ${
          open ? 'bg-accent-light text-accent' : 'bg-surface-sunken text-ink-secondary hover:text-ink-primary hover:bg-surface-raised'
        }`}
        title="Recent reports & batches"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {!loading && reports.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent rounded-full" />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] bg-white/95 backdrop-blur-xl rounded-apple-lg shadow-apple-md border border-separator overflow-hidden animate-apple-scale-in z-50">
          {/* Tab bar */}
          <div className="px-3 pt-3 pb-0 border-b border-separator">
            <div className="flex gap-0 bg-surface-raised p-0.5 rounded-apple mb-2.5">
              <button
                onClick={() => setTab('reports')}
                className={`flex-1 px-3 py-1 rounded-[8px] text-[12px] font-medium transition-all duration-200 ease-apple ${
                  tab === 'reports'
                    ? 'bg-white shadow-apple-xs text-ink-primary font-semibold'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                Reports
                {!loading && (
                  <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                    tab === 'reports' ? 'bg-accent-light text-accent' : 'bg-surface-sunken text-ink-quaternary'
                  }`}>
                    {reports.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab('batches')}
                className={`flex-1 px-3 py-1 rounded-[8px] text-[12px] font-medium transition-all duration-200 ease-apple ${
                  tab === 'batches'
                    ? 'bg-white shadow-apple-xs text-ink-primary font-semibold'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                Batches
                {!loading && batches.length > 0 && (
                  <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                    tab === 'batches' ? 'bg-accent-light text-accent' : 'bg-surface-sunken text-ink-quaternary'
                  }`}>
                    {batches.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[400px] overflow-y-auto p-3">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="skeleton w-9 h-9 rounded-apple-sm flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton skeleton-text w-36" />
                      <div className="skeleton skeleton-text w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : tab === 'reports' ? (
              reports.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-[13px] text-ink-secondary">No reports yet.</p>
                  <p className="text-[11px] text-ink-quaternary mt-1">Search for a property to generate your first report.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reportGroups.map(group => (
                    <div key={group.label}>
                      <h4 className="text-[10px] font-semibold text-ink-quaternary uppercase tracking-[0.08em] mb-1.5">
                        {group.label}
                      </h4>
                      <div className="rounded-apple-sm overflow-hidden border border-separator">
                        {group.items.map((r, idx) => {
                          const levelCfg = LEVEL_CONFIG[r.activity_level as ActivityLevel]
                          return (
                            <button
                              key={r.report_id}
                              onClick={() => handleNavigate(`/search?report=${r.report_id}`)}
                              className={`group w-full flex items-center gap-3 bg-white hover:bg-surface-raised
                                         px-3 py-2 text-left transition-colors duration-150 ease-apple
                                         ${idx < group.items.length - 1 ? 'border-b border-separator' : ''}`}
                            >
                              <div className={`w-8 h-8 rounded-apple-sm flex items-center justify-center flex-shrink-0 ${levelCfg?.pillBg ?? 'bg-surface-sunken'}`}>
                                <span className={`text-[12px] font-bold tabular-nums ${levelCfg?.pillText ?? 'text-ink-secondary'}`}>
                                  {r.activity_score}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-medium text-ink-primary truncate">{r.query_address}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-ink-quaternary tabular-nums">{relativeTime(r.generated_at)}</span>
                                  {r.flags_count > 0 && (
                                    <span className="text-[9px] text-ink-tertiary bg-surface-raised border border-separator px-1.5 py-0.5 rounded-full tabular-nums">
                                      {r.flags_count} {r.flags_count === 1 ? 'finding' : 'findings'}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <svg className="w-3 h-3 text-ink-quaternary flex-shrink-0 group-hover:text-ink-secondary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              batches.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-[13px] text-ink-secondary">No batch analyses yet.</p>
                  <p className="text-[11px] text-ink-quaternary mt-1">Upload a CSV to analyze multiple properties.</p>
                </div>
              ) : (
                <div className="rounded-apple-sm overflow-hidden border border-separator">
                  {batches.map((b, idx) => (
                    <button
                      key={b.batch_id}
                      onClick={() => handleNavigate(`/batch?id=${b.batch_id}`)}
                      className={`group w-full flex items-center gap-3 bg-white hover:bg-surface-raised
                                 px-3 py-2 text-left transition-colors duration-150 ease-apple
                                 ${idx < batches.length - 1 ? 'border-b border-separator' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-apple-sm flex items-center justify-center flex-shrink-0 ${
                        b.status === 'completed' ? 'bg-emerald-50' : b.status === 'failed' ? 'bg-red-50' : 'bg-surface-sunken'
                      }`}>
                        {b.status === 'completed' ? (
                          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : b.status === 'failed' ? (
                          <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 text-ink-quaternary animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-ink-primary truncate">
                          {b.batch_name ?? 'Unnamed Batch'}
                        </p>
                        <p className="text-[10px] text-ink-quaternary mt-0.5 tabular-nums">{relativeTime(b.created_at)}</p>
                      </div>
                      <span className="text-[10px] text-ink-secondary flex-shrink-0 tabular-nums">
                        {b.completed_count}/{b.total_count}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        b.status === 'completed' ? 'bg-emerald-50 text-emerald-600'
                          : b.status === 'failed' ? 'bg-red-50 text-red-600'
                          : 'bg-surface-sunken text-ink-quaternary'
                      }`}>
                        {b.status}
                      </span>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
