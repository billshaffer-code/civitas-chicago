import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'
import { getNeighborhoodDetail, getNeighborhoodProperties } from '../api/civitas'
import type { CommunityAreaDetail, NeighborhoodPropertyItem } from '../api/civitas'
import MiniActivityBar from './MiniActivityBar'

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
  const [detail, setDetail] = useState<CommunityAreaDetail | null>(null)
  const [properties, setProperties] = useState<NeighborhoodPropertyItem[]>([])
  const [propTotal, setPropTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPage(1)

    Promise.all([
      getNeighborhoodDetail(communityAreaId),
      getNeighborhoodProperties(communityAreaId, { page: 1, page_size: 25, sort_by: 'activity_score', sort_dir: 'desc' }),
    ]).then(([d, p]) => {
      if (cancelled) return
      setDetail(d)
      setProperties(p.properties)
      setPropTotal(p.total)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [communityAreaId])

  function loadMore() {
    const nextPage = page + 1
    setPage(nextPage)
    getNeighborhoodProperties(communityAreaId, { page: nextPage, page_size: 25, sort_by: 'activity_score', sort_dir: 'desc' })
      .then(p => {
        setProperties(prev => [...prev, ...p.properties])
      })
  }

  if (loading || !detail) {
    return (
      <div className={`bg-white shadow-apple-xs border border-separator rounded-2xl p-6 ${embedded ? 'lg:max-h-[500px]' : ''}`}>
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
      embedded ? 'lg:max-h-[500px] flex flex-col' : ''
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
              <h2 className={`font-bold text-ink-primary ${embedded ? 'text-[15px]' : 'text-lg'}`}>
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
          <h3 className="text-[11px] font-semibold text-ink-quaternary uppercase tracking-wider mb-2">
            Properties ({propTotal.toLocaleString()})
          </h3>
          <div className={`space-y-1 ${embedded ? '' : 'max-h-[320px] overflow-y-auto'}`}>
            {properties.map(p => (
              <div
                key={p.location_sk}
                className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-surface-raised transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className={`font-medium text-ink-primary truncate ${embedded ? 'text-[12px]' : 'text-[13px]'}`}>
                    {p.full_address_standardized}
                  </div>
                  <div className="text-[9px] text-ink-tertiary mt-0.5">
                    {p.total_violations} violations &middot; {p.sr_count_12mo} 311 &middot; {p.total_lien_events} liens
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <MiniActivityBar score={p.activity_score} />
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${LEVEL_CONFIG[p.activity_level as ActivityLevel]?.pillBg || ''} ${LEVEL_CONFIG[p.activity_level as ActivityLevel]?.pillText || ''}`}>
                    {p.activity_score}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {properties.length < propTotal && (
            <button
              onClick={loadMore}
              className="w-full mt-2 py-1.5 text-[12px] font-medium text-accent hover:text-accent/80 transition-colors"
            >
              Load more
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
