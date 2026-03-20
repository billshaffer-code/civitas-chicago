import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getMyReports, getMyBatches, autocompleteAddress } from '../api/civitas'
import type { ReportHistoryItem, BatchListItem, AutocompleteItem } from '../api/civitas'
import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'
import BatchPage from './BatchPage'
import ComparePage from './ComparePage'
import BrowsePage from './BrowsePage'

// ── Utilities ─────────────────────────────────────────────────────────────────

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

// ── Quick Search ──────────────────────────────────────────────────────────────

function QuickSearch({ inputRef: externalRef }: { inputRef?: React.RefObject<HTMLInputElement> }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([])
  const [showDrop, setShowDrop] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const internalRef = useRef<HTMLInputElement>(null)
  const inputRef = externalRef ?? internalRef
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
      {/* Unified search bar */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-quaternary pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDrop(true)}
          onKeyDown={handleKey}
          placeholder="Search by address or PIN…"
          className="w-full h-[52px] pl-12 pr-[100px] bg-white rounded-apple-lg text-[15px]
                     text-ink-primary placeholder:text-ink-placeholder
                     shadow-apple focus:shadow-apple-md focus:outline-none
                     border border-separator focus:border-accent/40
                     transition-all duration-200 ease-apple-decel"
          autoComplete="off"
        />
        <button
          onClick={submit}
          disabled={!query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2
                     h-9 px-4 bg-accent hover:bg-accent-hover disabled:bg-surface-sunken disabled:text-ink-quaternary
                     text-white text-[13px] font-semibold rounded-apple
                     transition-all duration-150 ease-apple disabled:cursor-not-allowed"
        >
          Search
        </button>
      </div>

      {/* Autocomplete dropdown */}
      {showDrop && suggestions.length > 0 && (
        <div ref={dropRef} className="absolute z-50 left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl rounded-apple-lg shadow-apple-md border border-separator max-h-72 overflow-y-auto animate-apple-scale-in">
          {suggestions.map((item, i) => (
            <button
              key={item.location_sk}
              type="button"
              onClick={() => {
                setQuery(item.full_address)
                setShowDrop(false)
                navigate(`/search?q=${encodeURIComponent(item.full_address)}`)
              }}
              className={`w-full text-left px-4 py-3 text-[14px] transition-colors ${
                i === activeIdx ? 'bg-accent-light text-accent' : 'text-ink-primary hover:bg-surface-raised'
              } ${i < suggestions.length - 1 ? 'border-b border-separator' : ''}`}
            >
              {item.full_address}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Welcome Hero (empty state) ────────────────────────────────────────────────

function WelcomeHero() {
  const navigate = useNavigate()

  const steps = [
    {
      icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
      title: 'Search',
      desc: 'Look up any Chicago address or parcel ID',
    },
    {
      icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
      title: 'Analyze',
      desc: 'Violations, permits, 311 requests, tax liens',
    },
    {
      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      title: 'Report',
      desc: 'Structured findings with AI-powered narrative',
    },
  ]

  return (
    <div className="text-center py-12 animate-apple-fade-in">
      <p className="font-brand text-[12px] font-black tracking-[0.3em] text-accent mb-3">CIVITAS</p>
      <h2 className="text-[28px] font-bold text-ink-primary tracking-tight leading-[1.1] mb-2">
        Welcome to your dashboard
      </h2>
      <p className="text-[15px] text-ink-secondary mb-10 max-w-md mx-auto">
        Chicago municipal intelligence for real estate professionals.
      </p>

      <div className="grid grid-cols-3 gap-5 max-w-xl mx-auto mb-10">
        {steps.map((s, i) => (
          <div key={s.title} className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-accent-light flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={s.icon} />
                </svg>
              </div>
              {i < 2 && (
                <div className="absolute top-6 left-full w-[calc(100%+8px)] h-px bg-separator-opaque hidden sm:block" />
              )}
            </div>
            <h3 className="text-[14px] font-semibold text-ink-primary mb-1">{s.title}</h3>
            <p className="text-[12px] text-ink-tertiary leading-snug">{s.desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate('/search')}
        className="h-[44px] px-7 bg-accent hover:bg-accent-hover text-white text-[14px]
                   font-semibold rounded-apple shadow-[0_1px_3px_rgba(0,113,227,0.4)]
                   transition-all duration-150 ease-apple active:scale-[0.99]
                   inline-flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Search Your First Property
      </button>
    </div>
  )
}

// ── Stats Strip ───────────────────────────────────────────────────────────────

function StatsStrip({ reports }: { reports: ReportHistoryItem[] }) {
  const uniqueAddresses = new Set(reports.map(r => r.query_address)).size
  const avgScore = reports.length ? Math.round(reports.reduce((s, r) => s + r.activity_score, 0) / reports.length) : 0

  // Mode level
  const levelCounts: Record<string, number> = {}
  for (const r of reports) levelCounts[r.activity_level] = (levelCounts[r.activity_level] || 0) + 1
  let modeLevel = 'QUIET'
  let modeMax = 0
  for (const [lev, cnt] of Object.entries(levelCounts)) {
    if (cnt > modeMax) { modeMax = cnt; modeLevel = lev }
  }
  const modeCfg = LEVEL_CONFIG[modeLevel as ActivityLevel] ?? LEVEL_CONFIG.QUIET

  const latest = reports[0]

  const stats = [
    {
      label: 'Properties Analyzed',
      value: String(uniqueAddresses),
      sub: uniqueAddresses === 1 ? 'unique address' : 'unique addresses',
    },
    {
      label: 'Avg Activity Score',
      value: String(avgScore),
      sub: null as React.ReactNode,
      pill: (() => {
        const lev = avgScore >= 75 ? 'COMPLEX' : avgScore >= 50 ? 'ACTIVE' : avgScore >= 25 ? 'TYPICAL' : 'QUIET'
        const cfg = LEVEL_CONFIG[lev as ActivityLevel]
        return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfg.bgAccent}`}>{lev}</span>
      })(),
    },
    {
      label: 'Most Common Level',
      value: modeCfg.label,
      sub: <span className={`inline-block w-2 h-2 rounded-full ${modeCfg.bar} mr-1`} />,
      valueClass: modeCfg.text,
    },
    {
      label: 'Latest Report',
      value: latest ? relativeTime(latest.generated_at) : '—',
      sub: latest ? latest.query_address : null,
      truncateSub: true,
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-3 animate-apple-fade-in">
      {stats.map(s => (
        <div key={s.label} className="bg-white shadow-apple-xs border border-separator rounded-apple-lg px-4 py-3">
          <p className="text-[10px] font-semibold text-ink-quaternary uppercase tracking-[0.08em] mb-1.5">{s.label}</p>
          <div className="flex items-center gap-2">
            {'sub' in s && s.sub && typeof s.sub !== 'string' && !('truncateSub' in s) ? s.sub : null}
            <span className={`text-[20px] font-bold tabular-nums ${'valueClass' in s ? s.valueClass : 'text-ink-primary'}`}>
              {s.value}
            </span>
            {'pill' in s && s.pill}
          </div>
          {typeof s.sub === 'string' && (
            <p className={`text-[11px] text-ink-quaternary mt-0.5 ${'truncateSub' in s ? 'truncate' : ''}`}>{s.sub}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Level Distribution ────────────────────────────────────────────────────────

const LEVELS: ActivityLevel[] = ['QUIET', 'TYPICAL', 'ACTIVE', 'COMPLEX']

function LevelDistribution({ reports }: { reports: ReportHistoryItem[] }) {
  const counts: Record<string, number> = { QUIET: 0, TYPICAL: 0, ACTIVE: 0, COMPLEX: 0 }
  for (const r of reports) counts[r.activity_level] = (counts[r.activity_level] || 0) + 1
  const total = reports.length || 1

  return (
    <div>
      <div className="flex gap-[3px] h-3 rounded-full overflow-hidden mb-3">
        {LEVELS.map(level => {
          const pct = (counts[level] / total) * 100
          if (pct === 0) return null
          return (
            <div
              key={level}
              className={`${LEVEL_CONFIG[level].bar} transition-all duration-500 relative group cursor-default`}
              style={{ width: `${pct}%` }}
              title={`${LEVEL_CONFIG[level].label}: ${counts[level]}`}
            >
              {pct >= 15 && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90">
                  {Math.round(pct)}%
                </span>
              )}
            </div>
          )
        })}
        {reports.length === 0 && <div className="flex-1 bg-separator-opaque" />}
      </div>
      <div className="flex gap-4 flex-wrap">
        {LEVELS.map(level => (
          <div key={level} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${LEVEL_CONFIG[level].bar}`} />
            <span className="text-[11px] text-ink-secondary">{LEVEL_CONFIG[level].label}</span>
            <span className="text-[11px] font-bold text-ink-primary tabular-nums">{counts[level]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

type ActivityTab = 'reports' | 'batches'
type ExpandedCard = 'batch' | 'compare' | 'browse' | null

export default function DashboardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [reports, setReports] = useState<ReportHistoryItem[]>([])
  const [batches, setBatches] = useState<BatchListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activityTab, setActivityTab] = useState<ActivityTab>('reports')
  const [expandedCard, setExpandedCard] = useState<ExpandedCard>(null)
  const searchInputRef = useRef<HTMLInputElement>(null!)

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      getMyReports().catch(() => [] as ReportHistoryItem[]),
      getMyBatches(5).catch(() => [] as BatchListItem[]),
    ])
      .then(([r, b]) => { setReports(r); setBatches(b) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
    setExpandedCard(null)
  }, [location.key, fetchData])

  // Auto-focus search on mount
  useEffect(() => {
    if (searchInputRef.current) searchInputRef.current.focus()
  }, [])

  // ⌘K / Ctrl+K to focus search
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const reportGroups = groupReportsByDate(reports)
  const isEmpty = !loading && reports.length === 0 && batches.length === 0

  const cardDefs: { key: ExpandedCard & string; label: string; desc: string; icon: string; count?: number }[] = [
    { key: 'batch',   label: 'Portfolio Analysis', desc: 'Upload CSV of addresses',  icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', count: batches.length },
    { key: 'compare', label: 'Compare Reports',    desc: 'Side-by-side view',        icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', count: reports.length },
    { key: 'browse',  label: 'Browse Data',        desc: 'Explore raw datasets',     icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  ]

  return (
    <main className="mx-auto px-6 py-8 max-w-7xl">

      {/* ── Search ── */}
      <div className="mb-5">
        <QuickSearch inputRef={searchInputRef} />
        {/* Keyboard hint */}
        <div className="flex justify-end mt-1.5 pr-1">
          <span className="text-[10px] text-ink-quaternary">
            <kbd className="px-1 py-0.5 bg-surface-sunken border border-separator rounded text-[9px] font-mono">
              {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}
            </kbd>
            {' '}
            <kbd className="px-1 py-0.5 bg-surface-sunken border border-separator rounded text-[9px] font-mono">K</kbd>
            {' '}to focus
          </span>
        </div>
      </div>

      {/* ── Empty state hero ── */}
      {isEmpty && <WelcomeHero />}

      {/* ── Stats strip (when we have data) ── */}
      {!loading && reports.length > 0 && !expandedCard && (
        <div className="mb-5">
          <StatsStrip reports={reports} />
        </div>
      )}

      {/* ── Action Cards ── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {cardDefs.map(c => {
          const isActive = expandedCard === c.key
          return (
            <button
              key={c.key}
              onClick={() => setExpandedCard(isActive ? null : c.key as ExpandedCard)}
              className={`group rounded-apple-lg px-5 py-4 text-left transition-all duration-200 ease-apple ${
                isActive
                  ? 'bg-accent shadow-apple-sm border border-accent/20'
                  : expandedCard
                    ? 'bg-white shadow-apple-xs border border-separator hover:border-accent-muted hover:shadow-apple-sm opacity-70 hover:opacity-100'
                    : 'bg-white shadow-apple-xs border border-separator hover:border-accent-muted hover:shadow-apple-sm'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-apple-sm flex items-center justify-center flex-shrink-0 ${
                  isActive ? 'bg-white/20' : 'bg-accent-light'
                }`}>
                  <svg className={`w-4 h-4 ${isActive ? 'text-white' : 'text-accent'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={c.icon} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold text-[14px] transition-colors ${
                      isActive ? 'text-white' : 'text-ink-primary group-hover:text-accent'
                    }`}>
                      {c.label}
                    </h3>
                    {!loading && c.count !== undefined && c.count > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-accent-light text-accent'
                      }`}>
                        {c.count}
                      </span>
                    )}
                  </div>
                  {!expandedCard && (
                    <p className={`text-[11px] mt-0.5 ${isActive ? 'text-white/70' : 'text-ink-quaternary'}`}>
                      {c.desc}
                    </p>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Expanded Panel ── */}
      {expandedCard === 'batch'   && <BatchPage embedded />}
      {expandedCard === 'compare' && <ComparePage embedded />}
      {expandedCard === 'browse'  && <BrowsePage embedded />}

      {/* ── Portfolio at a Glance ── */}
      {!expandedCard && !loading && reports.length > 0 && (
        <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-5 mb-5">
          <h3 className="text-[11px] font-semibold text-ink-quaternary uppercase tracking-[0.1em] mb-4">
            Portfolio at a Glance
          </h3>
          <LevelDistribution reports={reports} />
        </div>
      )}

      {/* ── Recent Activity ── */}
      {!expandedCard && (
        <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg overflow-hidden">

          {/* Segment control tabs */}
          <div className="px-5 pt-4 pb-0 border-b border-separator flex items-center justify-between">
            <div className="flex gap-0 bg-surface-raised p-1 rounded-apple mb-3">
              <button
                onClick={() => setActivityTab('reports')}
                className={`px-4 py-1.5 rounded-[9px] text-[13px] font-medium transition-all duration-200 ease-apple ${
                  activityTab === 'reports'
                    ? 'bg-white shadow-apple-xs text-ink-primary font-semibold'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                Reports
                {!loading && (
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    activityTab === 'reports' ? 'bg-accent-light text-accent' : 'bg-surface-sunken text-ink-quaternary'
                  }`}>
                    {reports.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActivityTab('batches')}
                className={`px-4 py-1.5 rounded-[9px] text-[13px] font-medium transition-all duration-200 ease-apple ${
                  activityTab === 'batches'
                    ? 'bg-white shadow-apple-xs text-ink-primary font-semibold'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                Batches
                {!loading && batches.length > 0 && (
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    activityTab === 'batches' ? 'bg-accent-light text-accent' : 'bg-surface-sunken text-ink-quaternary'
                  }`}>
                    {batches.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="p-5">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="skeleton w-11 h-11 rounded-apple-sm flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton skeleton-text w-48" />
                      <div className="skeleton skeleton-text w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activityTab === 'reports' ? (
              reports.length === 0 ? (
                <div className="text-center py-10">
                  <svg className="w-10 h-10 text-ink-quaternary mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-[14px] text-ink-secondary">No reports yet.</p>
                  <p className="text-[12px] text-ink-quaternary mt-1">Search for a property to generate your first report.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {reportGroups.map(group => (
                    <div key={group.label}>
                      <h4 className="text-[11px] font-semibold text-ink-quaternary uppercase tracking-[0.08em] mb-2">
                        {group.label}
                      </h4>
                      <div className="rounded-apple-sm overflow-hidden border border-separator">
                        {group.items.map((r, idx) => {
                          const levelCfg = LEVEL_CONFIG[r.activity_level as ActivityLevel]
                          return (
                            <button
                              key={r.report_id}
                              onClick={() => navigate(`/search?report=${r.report_id}`)}
                              className={`group w-full flex items-center gap-4 bg-white hover:bg-surface-raised
                                         px-4 py-3 text-left transition-colors duration-150 ease-apple
                                         ${idx < group.items.length - 1 ? 'border-b border-separator' : ''}`}
                            >
                              <div className={`w-11 h-11 rounded-apple-sm flex items-center justify-center flex-shrink-0 ${levelCfg?.pillBg ?? 'bg-surface-sunken'}`}>
                                <span className={`text-[15px] font-bold tabular-nums ${levelCfg?.pillText ?? 'text-ink-secondary'}`}>
                                  {r.activity_score}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-medium text-ink-primary truncate">{r.query_address}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[11px] text-ink-quaternary tabular-nums">{relativeTime(r.generated_at)}</span>
                                  {r.flags_count > 0 && (
                                    <span className="text-[10px] text-ink-tertiary bg-surface-raised border border-separator px-1.5 py-0.5 rounded-full tabular-nums">
                                      {r.flags_count} {r.flags_count === 1 ? 'finding' : 'findings'}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${levelCfg?.bgAccent ?? 'bg-surface-raised text-ink-secondary'}`}>
                                {r.activity_level}
                              </span>
                              <svg className="w-4 h-4 text-ink-quaternary flex-shrink-0 group-hover:text-ink-secondary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <svg className="w-10 h-10 text-ink-quaternary mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p className="text-[14px] text-ink-secondary">No batch analyses yet.</p>
                  <p className="text-[12px] text-ink-quaternary mt-1">Upload a CSV to analyze multiple properties at once.</p>
                </div>
              ) : (
                <div className="rounded-apple-sm overflow-hidden border border-separator">
                  {batches.map((b, idx) => (
                    <button
                      key={b.batch_id}
                      onClick={() => navigate(`/batch?id=${b.batch_id}`)}
                      className={`group w-full flex items-center gap-4 bg-white hover:bg-surface-raised
                                 px-4 py-3 text-left transition-colors duration-150 ease-apple
                                 ${idx < batches.length - 1 ? 'border-b border-separator' : ''}`}
                    >
                      <div className={`w-11 h-11 rounded-apple-sm flex items-center justify-center flex-shrink-0 ${
                        b.status === 'completed' ? 'bg-emerald-50' : b.status === 'failed' ? 'bg-red-50' : 'bg-surface-sunken'
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
                          <svg className="w-5 h-5 text-ink-quaternary animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-ink-primary truncate">
                          {b.batch_name ?? 'Unnamed Batch'}
                        </p>
                        <p className="text-[11px] text-ink-quaternary mt-0.5 tabular-nums">{relativeTime(b.created_at)}</p>
                      </div>
                      <span className="text-[12px] text-ink-secondary flex-shrink-0 tabular-nums">
                        {b.completed_count}/{b.total_count}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        b.status === 'completed' ? 'bg-emerald-50 text-emerald-600'
                          : b.status === 'failed' ? 'bg-red-50 text-red-600'
                          : 'bg-surface-sunken text-ink-quaternary'
                      }`}>
                        {b.status}
                      </span>
                      <svg className="w-4 h-4 text-ink-quaternary flex-shrink-0 group-hover:text-ink-secondary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* ── Quick Actions Footer ── */}
      {!expandedCard && !loading && reports.length > 0 && (
        <div className="flex items-center justify-center gap-4 mt-5 pt-4">
          <button
            onClick={() => navigate('/browse')}
            className="text-[12px] text-ink-tertiary hover:text-accent transition-colors duration-150 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Browse Raw Data
          </button>
          <span className="w-px h-3 bg-separator-opaque" />
          <button
            onClick={() => setExpandedCard('compare')}
            className="text-[12px] text-ink-tertiary hover:text-accent transition-colors duration-150 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Compare Reports
          </button>
          <span className="w-px h-3 bg-separator-opaque" />
          <button
            onClick={() => setExpandedCard('batch')}
            className="text-[12px] text-ink-tertiary hover:text-accent transition-colors duration-150 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Portfolio Analysis
          </button>
        </div>
      )}
    </main>
  )
}
