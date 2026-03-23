import { useState, useEffect, useCallback, useMemo } from 'react'
import L from 'leaflet'
import { getNeighborhoodList, getNeighborhoodGeoJSON } from '../api/civitas'
import type { CommunityAreaSummary, CommunityAreaGeoJSON } from '../api/civitas'
import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'
import NeighborhoodMap from '../components/NeighborhoodMap'
import NeighborhoodDetail from '../components/NeighborhoodDetail'
import MiniActivityBar from '../components/MiniActivityBar'

type SortKey = 'name' | 'score' | 'count'

function activityLevel(score: number): ActivityLevel {
  if (score >= 75) return 'COMPLEX'
  if (score >= 50) return 'ACTIVE'
  if (score >= 25) return 'TYPICAL'
  return 'QUIET'
}

export default function NeighborhoodPage() {
  const [areas, setAreas] = useState<CommunityAreaSummary[]>([])
  const [geojson, setGeojson] = useState<CommunityAreaGeoJSON | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortAsc, setSortAsc] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getNeighborhoodList(), getNeighborhoodGeoJSON()])
      .then(([list, geo]) => {
        if (cancelled) return
        setAreas(list)
        setGeojson(geo)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleSelect = useCallback((id: number) => {
    setSelectedId(prev => prev === id ? null : id)
  }, [])

  // Compute Leaflet bounds for the selected community area
  const selectedBounds = useMemo(() => {
    if (!selectedId || !geojson) return null
    const feature = geojson.features.find(
      f => f.properties?.community_area_id === selectedId,
    )
    if (!feature) return null
    return L.geoJSON(feature as GeoJSON.Feature).getBounds()
  }, [selectedId, geojson])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(key === 'name')
    }
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

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? ' \u2191' : ' \u2193') : ''

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-surface-sunken rounded w-64" />
          <div className="h-[500px] bg-surface-sunken rounded-2xl" />
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-bold text-ink-primary tracking-tight">
          Neighborhood Analytics
        </h1>
        <p className="text-[14px] text-ink-secondary mt-1">
          77 Chicago Community Areas &middot; Activity scores aggregated from {areas.reduce((s, a) => s + a.property_count, 0).toLocaleString()} properties
        </p>
      </div>

      {/* Map + List/Detail split */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Map (3/5 on desktop) */}
        <div className="lg:col-span-3">
          {geojson && (
            <NeighborhoodMap
              geojson={geojson}
              selectedId={selectedId}
              selectedBounds={selectedBounds}
              onSelect={handleSelect}
            />
          )}
        </div>

        {/* Right column (2/5): list or detail */}
        <div className="lg:col-span-2">
          {selectedId ? (
            <div key={selectedId} className="animate-apple-fade-in">
              <NeighborhoodDetail
                communityAreaId={selectedId}
                onClose={() => setSelectedId(null)}
                embedded
              />
            </div>
          ) : (
            <div key="list" className="animate-apple-fade-in bg-white shadow-apple-xs border border-separator rounded-2xl overflow-hidden">
              {/* Sort controls */}
              <div className="px-4 py-3 border-b border-separator flex items-center gap-1 text-[10px] font-semibold text-ink-quaternary uppercase tracking-wider">
                <button onClick={() => toggleSort('name')} className="hover:text-ink-primary transition-colors">
                  Name{arrow('name')}
                </button>
                <span className="mx-1">/</span>
                <button onClick={() => toggleSort('score')} className="hover:text-ink-primary transition-colors">
                  Score{arrow('score')}
                </button>
                <span className="mx-1">/</span>
                <button onClick={() => toggleSort('count')} className="hover:text-ink-primary transition-colors">
                  Properties{arrow('count')}
                </button>
              </div>

              {/* Area rows */}
              <div className="max-h-[452px] overflow-y-auto">
                {sorted.map(area => {
                  const level = activityLevel(area.avg_activity_score)
                  const cfg = LEVEL_CONFIG[level]

                  return (
                    <button
                      key={area.community_area_id}
                      onClick={() => handleSelect(area.community_area_id)}
                      className="w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors border-b border-separator/50 hover:bg-surface-raised"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-ink-primary truncate">
                          {area.community_area_name}
                        </div>
                        <div className="text-[10px] text-ink-tertiary mt-0.5">
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
          )}
        </div>
      </div>
    </main>
  )
}
