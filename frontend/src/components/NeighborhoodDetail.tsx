import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'
import { getNeighborhoodDetail, getNeighborhoodProperties, generateReport } from '../api/civitas'
import type { CommunityAreaDetail, NeighborhoodPropertyItem } from '../api/civitas'

interface Props {
  communityAreaId: number
  onClose: () => void
  embedded?: boolean
}

const LEVEL_COLORS: Record<string, string> = {
  QUIET: '#94a3b8',
  TYPICAL: '#60a5fa',
  ACTIVE: '#2563eb',
  COMPLEX: '#1e3a5f',
}

function activityLevel(score: number): ActivityLevel {
  if (score >= 75) return 'COMPLEX'
  if (score >= 50) return 'ACTIVE'
  if (score >= 25) return 'TYPICAL'
  return 'QUIET'
}

export default function NeighborhoodDetail({ communityAreaId, onClose, embedded }: Props) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState<CommunityAreaDetail | null>(null)
  const [properties, setProperties] = useState<NeighborhoodPropertyItem[]>([])
  const [propTotal, setPropTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [detailLoading, setDetailLoading] = useState(true)
  const [propsLoading, setPropsLoading] = useState(true)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Multi-select
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 })

  const fetchProperties = useCallback(
    (pg: number, address?: string, append = false) => {
      if (!append) setPropsLoading(true)
      getNeighborhoodProperties(communityAreaId, {
        page: pg,
        page_size: 25,
        sort_by: 'violations',
        sort_dir: 'desc',
        address: address || undefined,
      })
        .then(p => {
          if (append) {
            setProperties(prev => [...prev, ...p.properties])
          } else {
            setProperties(p.properties)
          }
          setPropTotal(p.total)
        })
        .finally(() => setPropsLoading(false))
    },
    [communityAreaId],
  )

  // Load detail and initial properties
  useEffect(() => {
    let cancelled = false
    setDetailLoading(true)
    setPropsLoading(true)
    setPage(1)
    setProperties([])
    setSearchQuery('')
    setActiveSearch('')
    setSelected(new Set())

    getNeighborhoodDetail(communityAreaId)
      .then(d => { if (!cancelled) setDetail(d) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })

    fetchProperties(1)

    return () => { cancelled = true }
  }, [communityAreaId, fetchProperties])

  // Debounced search
  function handleSearchChange(value: string) {
    setSearchQuery(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setActiveSearch(value)
      setPage(1)
      setSelected(new Set())
      fetchProperties(1, value)
    }, 300)
  }

  function loadMore() {
    const nextPage = page + 1
    setPage(nextPage)
    fetchProperties(nextPage, activeSearch, true)
  }

  function toggleSelect(locationSk: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(locationSk)) next.delete(locationSk)
      else next.add(locationSk)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === properties.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(properties.map(p => p.location_sk)))
    }
  }

  async function handleGenerateReports() {
    if (selected.size === 0) return
    const selectedProps = properties.filter(p => selected.has(p.location_sk))

    setGenerating(true)
    setGenProgress({ done: 0, total: selectedProps.length })
    const reportIds: string[] = []

    for (const p of selectedProps) {
      try {
        const r = await generateReport(p.location_sk, p.full_address_standardized)
        reportIds.push(r.report_id)
      } catch {
        // skip failed
      }
      setGenProgress(prev => ({ ...prev, done: prev.done + 1 }))
    }

    setGenerating(false)
    setSelected(new Set())

    if (reportIds.length === 1) {
      // Single report — navigate directly to it
      navigate(`/search?report=${reportIds[0]}`)
    } else if (reportIds.length > 1) {
      // Multiple reports — navigate to dashboard
      navigate('/dashboard')
    }
  }

  if (detailLoading || !detail) {
    return (
      <div className={`bg-white shadow-apple-xs border border-separator rounded-2xl p-6 ${embedded ? 'h-full' : ''}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-surface-sunken rounded w-48" />
          <div className="h-40 bg-surface-sunken rounded" />
        </div>
      </div>
    )
  }

  const level = activityLevel(detail.avg_activity_score)
  const cfg = LEVEL_CONFIG[level]

  const distData = [
    { name: 'Quiet', count: detail.quiet_count, color: LEVEL_COLORS.QUIET },
    { name: 'Typical', count: detail.typical_count, color: LEVEL_COLORS.TYPICAL },
    { name: 'Active', count: detail.active_count, color: LEVEL_COLORS.ACTIVE },
    { name: 'Complex', count: detail.complex_count, color: LEVEL_COLORS.COMPLEX },
  ]

  const stats = [
    { label: 'Properties', value: detail.property_count.toLocaleString() },
    { label: 'Avg Score', value: Math.round(detail.avg_activity_score) },
    { label: 'Avg Violations', value: detail.avg_violations },
    { label: 'Avg 311 (12mo)', value: detail.avg_311_12mo },
    { label: 'Avg Liens', value: detail.avg_lien_events },
  ]

  return (
    <div className={`bg-white shadow-apple-xs border border-separator rounded-2xl overflow-hidden ${
      embedded ? 'h-full flex flex-col' : ''
    }`}>
      {/* Header */}
      <div className={`border-b border-separator flex-shrink-0 ${embedded ? 'px-4 py-3' : 'px-6 py-5'}`}>
        {embedded ? (
          <>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent/80 transition-colors mb-2"
            >
              <span>&larr;</span> Back to all neighborhoods
            </button>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-ink-primary">
                {detail.community_area_name}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-ink-primary">{Math.round(detail.avg_activity_score)}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.pillBg} ${cfg.pillText}`}>
                  {cfg.label}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink-primary">{detail.community_area_name}</h2>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-2xl font-bold text-ink-primary">{Math.round(detail.avg_activity_score)}</span>
                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${cfg.pillBg} ${cfg.pillText}`}>
                  {cfg.label}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-ink-tertiary hover:text-ink-primary text-lg leading-none p-1"
            >
              &times;
            </button>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className={`grid ${embedded ? 'grid-cols-3' : 'grid-cols-5'} divide-x divide-separator border-b border-separator flex-shrink-0`}>
        {stats.map(s => (
          <div key={s.label} className={`text-center ${embedded ? 'px-2 py-2' : 'px-4 py-3'}`}>
            <div className={`font-bold text-ink-primary ${embedded ? 'text-[15px]' : 'text-[18px]'}`}>{s.value}</div>
            <div className="text-[9px] text-ink-tertiary mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Scrollable body: chart + property list */}
      <div className={embedded ? 'flex-1 overflow-y-auto min-h-0' : ''}>
        {/* Distribution chart */}
        <div className={`border-b border-separator ${embedded ? 'px-4 py-3' : 'px-6 py-5'}`}>
          <h3 className="text-[11px] font-semibold text-ink-quaternary uppercase tracking-wider mb-2">
            Activity Level Distribution
          </h3>
          <ResponsiveContainer width="100%" height={embedded ? 120 : 160}>
            <BarChart data={distData} barSize={embedded ? 28 : 40}>
              <XAxis dataKey="name" tick={{ fontSize: embedded ? 10 : 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value) => [Number(value).toLocaleString(), 'Properties']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {distData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Property list */}
        <div className={embedded ? 'px-4 py-3' : 'px-6 py-4'}>
          {/* Search + header row */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold text-ink-quaternary uppercase tracking-wider">
              Properties ({propTotal.toLocaleString()})
            </h3>
            {!propsLoading && properties.length > 0 && (
              <button
                onClick={toggleSelectAll}
                className="text-[10px] font-medium text-accent hover:text-accent/80 transition-colors"
              >
                {selected.size === properties.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {/* Search box */}
          <div className="relative mb-2">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-quaternary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search by address..."
              className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-surface-sunken border border-separator rounded-lg
                         placeholder:text-ink-quaternary text-ink-primary
                         focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40
                         transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-quaternary hover:text-ink-secondary text-[12px]"
              >
                &times;
              </button>
            )}
          </div>

          {/* Generate reports action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 mb-2 px-2.5 py-1.5 bg-accent/5 border border-accent/20 rounded-lg">
              <span className="text-[11px] font-medium text-ink-secondary flex-1">
                {generating
                  ? `Generating ${genProgress.done}/${genProgress.total}...`
                  : `${selected.size} selected`}
              </span>
              <button
                onClick={handleGenerateReports}
                disabled={generating}
                className="text-[11px] font-semibold text-white bg-accent hover:bg-accent/90
                           disabled:opacity-50 disabled:cursor-not-allowed
                           px-3 py-1 rounded-md transition-colors"
              >
                {generating ? 'Generating...' : `Generate ${selected.size} Report${selected.size > 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {/* Progress bar during generation */}
          {generating && (
            <div className="mb-2 h-1 bg-surface-sunken rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 rounded-full"
                style={{ width: `${genProgress.total > 0 ? (genProgress.done / genProgress.total) * 100 : 0}%` }}
              />
            </div>
          )}

          {propsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 py-1.5 px-2.5">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-surface-sunken rounded w-3/4" />
                    <div className="h-2 bg-surface-sunken rounded w-1/2" />
                  </div>
                  <div className="h-3 bg-surface-sunken rounded w-12" />
                </div>
              ))}
            </div>
          ) : properties.length === 0 ? (
            <div className="text-center py-6 text-[12px] text-ink-tertiary">
              {activeSearch ? 'No properties match your search' : 'No properties found'}
            </div>
          ) : (
            <>
              <div className={`space-y-1 ${embedded ? '' : 'max-h-[320px] overflow-y-auto'}`}>
                {properties.map(p => {
                  const isSelected = selected.has(p.location_sk)
                  return (
                    <div
                      key={p.location_sk}
                      className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer ${
                        isSelected ? 'bg-accent/5 border border-accent/20' : 'hover:bg-surface-raised border border-transparent'
                      }`}
                      onClick={() => toggleSelect(p.location_sk)}
                    >
                      {/* Checkbox */}
                      <div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-accent border-accent'
                          : 'border-separator hover:border-ink-quaternary'
                      }`}>
                        {isSelected && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`font-medium text-ink-primary truncate ${embedded ? 'text-[12px]' : 'text-[13px]'}`}>
                          {p.full_address_standardized}
                        </div>
                        <div className="text-[9px] text-ink-tertiary mt-0.5">
                          {p.total_violations} violations &middot; {p.sr_count_12mo} 311 &middot; {p.total_lien_events} liens
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-2 text-[11px] font-semibold text-ink-secondary tabular-nums">
                        {p.total_violations}
                      </div>
                    </div>
                  )
                })}
              </div>
              {properties.length < propTotal && (
                <button
                  onClick={loadMore}
                  className="w-full mt-2 py-1.5 text-[12px] font-medium text-accent hover:text-accent/80 transition-colors"
                >
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
