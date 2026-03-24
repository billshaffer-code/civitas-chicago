import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import L from 'leaflet'
import { getMyReports, getMyBatches, autocompleteAddress, getNeighborhoodList, getNeighborhoodGeoJSON } from '../api/civitas'
import type { ReportHistoryItem, BatchListItem, AutocompleteItem, CommunityAreaSummary, CommunityAreaGeoJSON } from '../api/civitas'
import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'
import NeighborhoodMap from '../components/NeighborhoodMap'
import NeighborhoodDetail from '../components/NeighborhoodDetail'
import MiniActivityBar from '../components/MiniActivityBar'
import BatchPage from './BatchPage'
import ComparePage from './ComparePage'
import BrowsePage from './BrowsePage'
import DataHealth from '../components/DataHealth'

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

function activityLevel(score: number): ActivityLevel {
  if (score >= 75) return 'COMPLEX'
  if (score >= 50) return 'ACTIVE'
  if (score >= 25) return 'TYPICAL'
  return 'QUIET'
}

// ── Quick Search ──────────────────────────────────────────────────────────────

function QuickSearch({ inputRef: externalRef, compact }: { inputRef?: React.RefObject<HTMLInputElement>; compact?: boolean }) {
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
      <div className="relative">
        <svg className={`absolute ${compact ? 'left-3 w-4 h-4' : 'left-4 w-5 h-5'} top-1/2 -translate-y-1/2 text-ink-quaternary pointer-events-none`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          className={`w-full ${compact ? 'h-10 pl-9 pr-[80px] text-[13px] rounded-apple' : 'h-[52px] pl-12 pr-[100px] text-[15px] rounded-apple-lg'}
                     bg-white text-ink-primary placeholder:text-ink-placeholder
                     shadow-apple focus:shadow-apple-md focus:outline-none
                     border border-separator focus:border-accent/40
                     transition-all duration-200 ease-apple-decel`}
          autoComplete="off"
        />
        <button
          onClick={submit}
          disabled={!query.trim()}
          className={`absolute right-2 top-1/2 -translate-y-1/2
                     ${compact ? 'h-7 px-3 text-[12px]' : 'h-9 px-4 text-[13px]'}
                     bg-accent hover:bg-accent-hover disabled:bg-surface-sunken disabled:text-ink-quaternary
                     text-white font-semibold rounded-apple
                     transition-all duration-150 ease-apple disabled:cursor-not-allowed`}
        >
          Search
        </button>
      </div>

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

// ── Neighborhood List (right panel default sub-section) ──────────────────────

type SortKey = 'name' | 'score' | 'count'

function NeighborhoodList({
  areas,
  onSelect,
}: {
  areas: CommunityAreaSummary[]
  onSelect: (id: number) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortAsc, setSortAsc] = useState(false)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(key === 'name') }
  }

  const sorted = useMemo(() => {
    const arr = [...areas]
    const dir = sortAsc ? 1 : -1
    arr.sort((a, b) => {
      if (sortKey === 'name') return dir * a.community_area_name.localeCompare(b.community_area_name)
      if (sortKey === 'count') return dir * (a.property_count - b.property_count)
      return dir * (a.avg_activity_score - b.avg_activity_score)
    })
    return arr
  }, [areas, sortKey, sortAsc])

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''

  return (
    <div className="bg-white shadow-apple-xs border border-separator rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-separator flex items-center gap-1 text-[10px] font-semibold text-ink-quaternary uppercase tracking-wider">
        <span className="mr-auto text-[11px] text-ink-secondary font-bold normal-case tracking-normal">
          Neighborhoods
        </span>
        <button onClick={() => toggleSort('name')} className="hover:text-ink-primary transition-colors">
          Name{arrow('name')}
        </button>
        <span className="mx-1">/</span>
        <button onClick={() => toggleSort('score')} className="hover:text-ink-primary transition-colors">
          Score{arrow('score')}
        </button>
        <span className="mx-1">/</span>
        <button onClick={() => toggleSort('count')} className="hover:text-ink-primary transition-colors">
          Prop.{arrow('count')}
        </button>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {sorted.map(area => {
          const level = activityLevel(area.avg_activity_score)
          const cfg = LEVEL_CONFIG[level]
          return (
            <button
              key={area.community_area_id}
              onClick={() => onSelect(area.community_area_id)}
              className="w-full px-4 py-2 flex items-center gap-3 text-left transition-colors border-b border-separator/50 hover:bg-surface-raised"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-ink-primary truncate">
                  {area.community_area_name}
                </div>
                <div className="text-[9px] text-ink-tertiary mt-0.5">
                  {area.property_count.toLocaleString()} properties
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <MiniActivityBar score={area.avg_activity_score} />
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full min-w-[36px] text-center ${cfg.pillBg} ${cfg.pillText}`}>
                  {Math.round(area.avg_activity_score)}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

type RightPanelView =
  | { kind: 'home' }
  | { kind: 'neighborhood'; areaId: number }
  | { kind: 'tool'; tool: 'batch' | 'compare' | 'browse' | 'health' }

export default function DashboardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [reports, setReports] = useState<ReportHistoryItem[]>([])
  const [batches, setBatches] = useState<BatchListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activityTab, setActivityTab] = useState<'reports' | 'batches'>('reports')
  const searchInputRef = useRef<HTMLInputElement>(null!)

  // Neighborhood data
  const [areas, setAreas] = useState<CommunityAreaSummary[]>([])
  const [geojson, setGeojson] = useState<CommunityAreaGeoJSON | null>(null)
  const [mapLoading, setMapLoading] = useState(true)

  // Right panel state
  const [panel, setPanel] = useState<RightPanelView>({ kind: 'home' })

  const selectedId = panel.kind === 'neighborhood' ? panel.areaId : null

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
    setPanel({ kind: 'home' })
  }, [location.key, fetchData])

  // Load neighborhood data
  useEffect(() => {
    let cancelled = false
    setMapLoading(true)
    Promise.all([getNeighborhoodList(), getNeighborhoodGeoJSON()])
      .then(([list, geo]) => {
        if (cancelled) return
        setAreas(list)
        setGeojson(geo)
      })
      .finally(() => { if (!cancelled) setMapLoading(false) })
    return () => { cancelled = true }
  }, [])

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

  const handleMapSelect = useCallback((id: number) => {
    setPanel(prev =>
      prev.kind === 'neighborhood' && prev.areaId === id
        ? { kind: 'home' }
        : { kind: 'neighborhood', areaId: id },
    )
  }, [])

  const selectedBounds = useMemo(() => {
    if (!selectedId || !geojson) return null
    const feature = geojson.features.find(
      f => f.properties?.community_area_id === selectedId,
    )
    if (!feature) return null
    return L.geoJSON(feature as GeoJSON.Feature).getBounds()
  }, [selectedId, geojson])

  const reportGroups = groupReportsByDate(reports)

  const toolDefs: { key: 'batch' | 'compare' | 'browse' | 'health'; label: string; icon: string }[] = [
    { key: 'batch',   label: 'Portfolio',   icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { key: 'compare', label: 'Compare',     icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { key: 'browse',  label: 'Browse Data', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
    { key: 'health',  label: 'Data Health', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  ]

  // ── Tool expanded view (full width, below the split) ──
  if (panel.kind === 'tool') {
    return (
      <main className="mx-auto px-6 py-6 max-w-7xl">
        <button
          onClick={() => setPanel({ kind: 'home' })}
          className="flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent/80 transition-colors mb-4"
        >
          <span>&larr;</span> Back to dashboard
        </button>
        {panel.tool === 'batch'   && <BatchPage embedded />}
        {panel.tool === 'compare' && <ComparePage embedded />}
        {panel.tool === 'browse'  && <BrowsePage embedded />}
        {panel.tool === 'health'  && <DataHealth embedded />}
      </main>
    )
  }

  return (
    <div className="flex h-[calc(100vh-52px)]">
      {/* ── Left: Map ── */}
      <div className="hidden lg:block lg:w-3/5 p-4 pr-2" style={{ height: 'calc(100vh - 52px)' }}>
        {mapLoading || !geojson ? (
          <div className="h-full bg-white shadow-apple-xs border border-separator rounded-2xl animate-pulse" />
        ) : (
          <NeighborhoodMap
            geojson={geojson}
            selectedId={selectedId}
            selectedBounds={selectedBounds}
            onSelect={handleMapSelect}
            height="100%"
          />
        )}
      </div>

      {/* ── Right: Context Panel ── */}
      <div className="w-full lg:w-2/5 overflow-y-auto p-4 pl-2">
        {panel.kind === 'neighborhood' ? (
          <div key={panel.areaId} className="animate-apple-fade-in h-full">
            <NeighborhoodDetail
              communityAreaId={panel.areaId}
              onClose={() => setPanel({ kind: 'home' })}
              embedded
            />
          </div>
        ) : (
          <div className="space-y-4 animate-apple-fade-in">
            {/* Search */}
            <div>
              <QuickSearch inputRef={searchInputRef} compact />
              <div className="flex justify-end mt-1 pr-1">
                <span className="text-[9px] text-ink-quaternary">
                  <kbd className="px-1 py-0.5 bg-surface-sunken border border-separator rounded text-[8px] font-mono">
                    {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}
                  </kbd>
                  {' '}
                  <kbd className="px-1 py-0.5 bg-surface-sunken border border-separator rounded text-[8px] font-mono">K</kbd>
                </span>
              </div>
            </div>

            {/* Stats row */}
            {!loading && reports.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg px-3 py-2.5">
                  <p className="text-[9px] font-semibold text-ink-quaternary uppercase tracking-[0.08em] mb-1">Properties</p>
                  <span className="text-[18px] font-bold text-ink-primary tabular-nums">
                    {new Set(reports.map(r => r.query_address)).size}
                  </span>
                </div>
                <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg px-3 py-2.5">
                  <p className="text-[9px] font-semibold text-ink-quaternary uppercase tracking-[0.08em] mb-1">Avg Score</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[18px] font-bold text-ink-primary tabular-nums">
                      {Math.round(reports.reduce((s, r) => s + r.activity_score, 0) / reports.length)}
                    </span>
                    {(() => {
                      const avg = Math.round(reports.reduce((s, r) => s + r.activity_score, 0) / reports.length)
                      const lev = avg >= 75 ? 'COMPLEX' : avg >= 50 ? 'ACTIVE' : avg >= 25 ? 'TYPICAL' : 'QUIET'
                      const cfg = LEVEL_CONFIG[lev as ActivityLevel]
                      return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfg.bgAccent}`}>{lev}</span>
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Tool shortcuts */}
            <div className="grid grid-cols-4 gap-1.5">
              {toolDefs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setPanel({ kind: 'tool', tool: t.key })}
                  className="group flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-apple-lg bg-white shadow-apple-xs border border-separator
                             hover:border-accent-muted hover:shadow-apple-sm transition-all duration-200"
                >
                  <div className="w-8 h-8 rounded-apple-sm bg-accent-light flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
                    </svg>
                  </div>
                  <span className="text-[10px] font-medium text-ink-secondary group-hover:text-accent transition-colors">{t.label}</span>
                </button>
              ))}
            </div>

            {/* Neighborhood list */}
            {!mapLoading && areas.length > 0 && (
              <NeighborhoodList areas={areas} onSelect={handleMapSelect} />
            )}

            {/* Recent Activity */}
            <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg overflow-hidden">
              <div className="px-4 pt-3 pb-0 border-b border-separator flex items-center justify-between">
                <div className="flex gap-0 bg-surface-raised p-0.5 rounded-apple mb-2.5">
                  <button
                    onClick={() => setActivityTab('reports')}
                    className={`px-3 py-1 rounded-[8px] text-[12px] font-medium transition-all duration-200 ease-apple ${
                      activityTab === 'reports'
                        ? 'bg-white shadow-apple-xs text-ink-primary font-semibold'
                        : 'text-ink-secondary hover:text-ink-primary'
                    }`}
                  >
                    Reports
                    {!loading && (
                      <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                        activityTab === 'reports' ? 'bg-accent-light text-accent' : 'bg-surface-sunken text-ink-quaternary'
                      }`}>
                        {reports.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActivityTab('batches')}
                    className={`px-3 py-1 rounded-[8px] text-[12px] font-medium transition-all duration-200 ease-apple ${
                      activityTab === 'batches'
                        ? 'bg-white shadow-apple-xs text-ink-primary font-semibold'
                        : 'text-ink-secondary hover:text-ink-primary'
                    }`}
                  >
                    Batches
                    {!loading && batches.length > 0 && (
                      <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                        activityTab === 'batches' ? 'bg-accent-light text-accent' : 'bg-surface-sunken text-ink-quaternary'
                      }`}>
                        {batches.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-4">
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
                ) : activityTab === 'reports' ? (
                  reports.length === 0 ? (
                    <div className="text-center py-8">
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
                                  onClick={() => navigate(`/search?report=${r.report_id}`)}
                                  className={`group w-full flex items-center gap-3 bg-white hover:bg-surface-raised
                                             px-3 py-2.5 text-left transition-colors duration-150 ease-apple
                                             ${idx < group.items.length - 1 ? 'border-b border-separator' : ''}`}
                                >
                                  <div className={`w-9 h-9 rounded-apple-sm flex items-center justify-center flex-shrink-0 ${levelCfg?.pillBg ?? 'bg-surface-sunken'}`}>
                                    <span className={`text-[13px] font-bold tabular-nums ${levelCfg?.pillText ?? 'text-ink-secondary'}`}>
                                      {r.activity_score}
                                    </span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-ink-primary truncate">{r.query_address}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] text-ink-quaternary tabular-nums">{relativeTime(r.generated_at)}</span>
                                      {r.flags_count > 0 && (
                                        <span className="text-[9px] text-ink-tertiary bg-surface-raised border border-separator px-1.5 py-0.5 rounded-full tabular-nums">
                                          {r.flags_count} {r.flags_count === 1 ? 'finding' : 'findings'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <svg className="w-3.5 h-3.5 text-ink-quaternary flex-shrink-0 group-hover:text-ink-secondary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <div className="text-center py-8">
                      <p className="text-[13px] text-ink-secondary">No batch analyses yet.</p>
                      <p className="text-[11px] text-ink-quaternary mt-1">Upload a CSV to analyze multiple properties.</p>
                    </div>
                  ) : (
                    <div className="rounded-apple-sm overflow-hidden border border-separator">
                      {batches.map((b, idx) => (
                        <button
                          key={b.batch_id}
                          onClick={() => navigate(`/batch?id=${b.batch_id}`)}
                          className={`group w-full flex items-center gap-3 bg-white hover:bg-surface-raised
                                     px-3 py-2.5 text-left transition-colors duration-150 ease-apple
                                     ${idx < batches.length - 1 ? 'border-b border-separator' : ''}`}
                        >
                          <div className={`w-9 h-9 rounded-apple-sm flex items-center justify-center flex-shrink-0 ${
                            b.status === 'completed' ? 'bg-emerald-50' : b.status === 'failed' ? 'bg-red-50' : 'bg-surface-sunken'
                          }`}>
                            {b.status === 'completed' ? (
                              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : b.status === 'failed' ? (
                              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-ink-quaternary animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-ink-primary truncate">
                              {b.batch_name ?? 'Unnamed Batch'}
                            </p>
                            <p className="text-[10px] text-ink-quaternary mt-0.5 tabular-nums">{relativeTime(b.created_at)}</p>
                          </div>
                          <span className="text-[11px] text-ink-secondary flex-shrink-0 tabular-nums">
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
          </div>
        )}
      </div>
    </div>
  )
}
