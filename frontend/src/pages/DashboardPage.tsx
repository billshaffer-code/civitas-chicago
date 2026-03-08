import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMyReports, getMyBatches, autocompleteAddress } from '../api/civitas'
import type { ReportHistoryItem, BatchListItem, AutocompleteItem } from '../api/civitas'
import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'
import SearchPage from './SearchPage'
import BatchPage from './BatchPage'
import ComparePage from './ComparePage'
import BrowsePage from './BrowsePage'

// ── Utilities ────────────────────────────────────────────────────────────────

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

// ── Quick Search ─────────────────────────────────────────────────────────────

function QuickSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([])
  const [showDrop, setShowDrop] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return }
    const timer = setTimeout(async () => {
      try {
        const items = await autocompleteAddress(query.trim())
        setSuggestions(items)
        setShowDrop(items.length > 0)
        setActiveIdx(-1)
      } catch { setSuggestions([]) }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function submit() {
    if (!query.trim()) return
    setShowDrop(false)
    navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!showDrop || !suggestions.length) {
      if (e.key === 'Enter') { e.preventDefault(); submit() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      setQuery(suggestions[activeIdx].full_address)
      setShowDrop(false)
      navigate(`/search?q=${encodeURIComponent(suggestions[activeIdx].full_address)}`)
    } else if (e.key === 'Enter') { e.preventDefault(); submit() }
    else if (e.key === 'Escape') { setShowDrop(false) }
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowDrop(true)}
            onKeyDown={handleKey}
            placeholder="Search by address or PIN..."
            className="w-full pl-9 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 shadow-sm transition-shadow"
            autoComplete="off"
          />
        </div>
        <button
          onClick={submit}
          disabled={!query.trim()}
          className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Search
        </button>
      </div>

      {showDrop && suggestions.length > 0 && (
        <div ref={dropRef} className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((item, i) => (
            <button
              key={item.location_sk}
              type="button"
              onClick={() => {
                setQuery(item.full_address)
                setShowDrop(false)
                navigate(`/search?q=${encodeURIComponent(item.full_address)}`)
              }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                i === activeIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
              } ${i < suggestions.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              {item.full_address}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Level Distribution Bar ───────────────────────────────────────────────────

const LEVELS: ActivityLevel[] = ['QUIET', 'TYPICAL', 'ACTIVE', 'COMPLEX']

function LevelDistribution({ reports }: { reports: ReportHistoryItem[] }) {
  const counts: Record<string, number> = { QUIET: 0, TYPICAL: 0, ACTIVE: 0, COMPLEX: 0 }
  for (const r of reports) counts[r.activity_level] = (counts[r.activity_level] || 0) + 1
  const total = reports.length || 1

  return (
    <div>
      <div className="flex gap-0.5 h-3 rounded-full overflow-hidden mb-2">
        {LEVELS.map(level => {
          const pct = (counts[level] / total) * 100
          if (pct === 0) return null
          return (
            <div
              key={level}
              className={`${LEVEL_CONFIG[level].bar} transition-all duration-500`}
              style={{ width: `${pct}%` }}
              title={`${LEVEL_CONFIG[level].label}: ${counts[level]}`}
            />
          )
        })}
        {reports.length === 0 && <div className="flex-1 bg-gray-200" />}
      </div>
      <div className="flex gap-3 flex-wrap">
        {LEVELS.map(level => (
          <div key={level} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${LEVEL_CONFIG[level].bar}`} />
            <span className="text-[11px] text-gray-500">{LEVEL_CONFIG[level].label}</span>
            <span className="text-[11px] font-bold text-gray-700">{counts[level]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

type ActivityTab = 'reports' | 'batches'
type ExpandedCard = 'search' | 'batch' | 'compare' | 'browse' | null

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [reports, setReports] = useState<ReportHistoryItem[]>([])
  const [batches, setBatches] = useState<BatchListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activityTab, setActivityTab] = useState<ActivityTab>('reports')
  const [expandedCard, setExpandedCard] = useState<ExpandedCard>(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      getMyReports().catch(() => [] as ReportHistoryItem[]),
      getMyBatches(5).catch(() => [] as BatchListItem[]),
    ])
      .then(([r, b]) => {
        setReports(r)
        setBatches(b)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
  }, [location.key, fetchData])

  const reportGroups = groupReportsByDate(reports)

  const cardDefs: { key: ExpandedCard & string; label: string; desc: string; icon: string }[] = [
    { key: 'search',  label: 'Property Search',   desc: 'Address or PIN lookup',       icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
    { key: 'batch',   label: 'Portfolio Analysis', desc: 'Upload CSV of addresses',     icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { key: 'compare', label: 'Compare Reports',   desc: 'Side-by-side view',           icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { key: 'browse',  label: 'Browse Data',        desc: 'Explore raw datasets',        icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  ]

  return (
    <main className={`mx-auto px-4 py-8 ${expandedCard ? 'max-w-7xl' : 'max-w-5xl'} transition-all`}>

      {/* ── Welcome + Quick Search ──────────────────────────────── */}
      {!expandedCard && (
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-gray-500 mt-1 mb-5">
            CIVITAS Municipal Intelligence
          </p>
          <QuickSearch />
        </div>
      )}

      {/* ── Action Cards ────────────────────────────────────────── */}
      <div className={`grid gap-3 mb-6 ${expandedCard ? 'grid-cols-4' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {cardDefs.map(c => {
          const isActive = expandedCard === c.key
          return (
            <button
              key={c.key}
              onClick={() => setExpandedCard(isActive ? null : c.key as ExpandedCard)}
              className={`rounded-xl px-4 py-4 text-left transition-all group ${
                isActive
                  ? 'bg-blue-600 shadow-md border border-blue-600'
                  : expandedCard
                    ? 'bg-white shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md opacity-60 hover:opacity-100'
                    : 'bg-white shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isActive ? 'bg-blue-500' : 'bg-blue-50'
                }`}>
                  <svg className={`w-4.5 h-4.5 ${isActive ? 'text-white' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={c.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className={`font-semibold text-sm transition-colors ${
                    isActive ? 'text-white' : 'text-gray-900 group-hover:text-blue-600'
                  }`}>
                    {c.label}
                  </h3>
                  {!expandedCard && (
                    <p className="text-[11px] text-gray-400">{c.desc}</p>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Expanded Panel ──────────────────────────────────────── */}
      {expandedCard === 'search' && <SearchPage embedded />}
      {expandedCard === 'batch' && <BatchPage embedded />}
      {expandedCard === 'compare' && <ComparePage embedded />}
      {expandedCard === 'browse' && <BrowsePage embedded />}

      {/* ── Activity Level Distribution ─────────────────────────── */}
      {!expandedCard && !loading && reports.length > 0 && (
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 mb-6">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Activity Level Distribution
          </h3>
          <LevelDistribution reports={reports} />
        </div>
      )}

      {/* ── Recent Activity (tabbed: Reports / Batches) ─────────── */}
      {!expandedCard && (
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 pt-4 pb-0">
            <div className="flex gap-1">
              <button
                onClick={() => setActivityTab('reports')}
                className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
                  activityTab === 'reports'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Reports
                {!loading && (
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    activityTab === 'reports' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {reports.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActivityTab('batches')}
                className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
                  activityTab === 'batches'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Batches
                {!loading && batches.length > 0 && (
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    activityTab === 'batches' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {batches.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="p-5">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="skeleton h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : activityTab === 'reports' ? (
              reports.length === 0 ? (
                <div className="text-center py-10">
                  <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm text-gray-400">No reports yet.</p>
                  <p className="text-xs text-gray-400 mt-1">Search for a property to generate your first report.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {reportGroups.map(group => (
                    <div key={group.label}>
                      <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        {group.label}
                      </h4>
                      <div className="space-y-1.5">
                        {group.items.map(r => {
                          const levelCfg = LEVEL_CONFIG[r.activity_level as ActivityLevel]
                          return (
                            <button
                              key={r.report_id}
                              onClick={() => navigate(`/search?report=${r.report_id}`)}
                              className="w-full flex items-center gap-4 bg-gray-50 hover:bg-gray-100
                                         border border-gray-200 rounded-lg px-4 py-3 text-left transition-colors"
                            >
                              <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${levelCfg?.pillBg ?? 'bg-gray-100'}`}>
                                <span className={`text-base font-bold ${levelCfg?.pillText ?? 'text-gray-500'}`}>
                                  {r.activity_score}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{r.query_address}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">{relativeTime(r.generated_at)}</p>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${levelCfg?.bgAccent ?? 'bg-gray-100 text-gray-500'}`}>
                                {r.activity_level}
                              </span>
                              <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <div className="text-center py-10">
                  <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p className="text-sm text-gray-400">No batch analyses yet.</p>
                  <p className="text-xs text-gray-400 mt-1">Upload a CSV to analyze multiple properties at once.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {batches.map(b => (
                    <button
                      key={b.batch_id}
                      onClick={() => navigate(`/batch?id=${b.batch_id}`)}
                      className="w-full flex items-center gap-4 bg-gray-50 hover:bg-gray-100
                                 border border-gray-200 rounded-lg px-4 py-3 text-left transition-colors"
                    >
                      <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        b.status === 'completed' ? 'bg-emerald-50' : b.status === 'failed' ? 'bg-red-50' : 'bg-gray-100'
                      }`}>
                        {b.status === 'completed' ? (
                          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : b.status === 'failed' ? (
                          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {b.batch_name ?? 'Unnamed Batch'}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{relativeTime(b.created_at)}</p>
                      </div>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {b.completed_count}/{b.total_count}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        b.status === 'completed' ? 'bg-emerald-50 text-emerald-600'
                          : b.status === 'failed' ? 'bg-red-50 text-red-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {b.status}
                      </span>
                      <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </main>
  )
}
