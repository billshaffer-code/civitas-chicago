import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CommunityAreaGeoJSON } from '../api/civitas'

interface Props {
  geojson: CommunityAreaGeoJSON
  selectedId: number | null
  selectedBounds: L.LatLngBoundsExpression | null
  onSelect: (id: number) => void
}

/** Map avg_activity_score (0–100) to a blue gradient */
function scoreToColor(score: number): string {
  if (score >= 75) return '#1e3a5f' // blue-900
  if (score >= 50) return '#2563eb' // blue-600
  if (score >= 25) return '#93c5fd' // blue-300
  return '#e2e8f0'                  // slate-200
}

export default function NeighborhoodMap({ geojson, selectedId, selectedBounds, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.GeoJSON | null>(null)

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current) return

    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = L.map(containerRef.current, {
      center: [41.8781, -87.6298],
      zoom: 10,
      zoomControl: false,
      attributionControl: false,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    L.control.zoom({ position: 'topright' }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Render GeoJSON layer
  useEffect(() => {
    const map = mapRef.current
    if (!map || !geojson.features.length) return

    if (layerRef.current) {
      layerRef.current.remove()
    }

    const layer = L.geoJSON(geojson as GeoJSON.FeatureCollection, {
      style: (feature) => {
        const props = feature?.properties
        const score = props?.avg_activity_score ?? 0
        const isSelected = props?.community_area_id === selectedId
        return {
          fillColor: scoreToColor(score),
          fillOpacity: isSelected ? 0.85 : 0.6,
          color: isSelected ? '#111827' : '#fff',
          weight: isSelected ? 2.5 : 1,
        }
      },
      onEachFeature: (feature, featureLayer) => {
        const props = feature.properties
        featureLayer.bindTooltip(
          `<div style="font-family:system-ui;font-size:12px">
            <div style="font-weight:700">${props.community_area_name}</div>
            <div style="color:#6b7280">Score: ${Math.round(props.avg_activity_score)} &middot; ${props.property_count.toLocaleString()} properties</div>
          </div>`,
          { sticky: true, className: 'civitas-tooltip' },
        )
        featureLayer.on('click', () => {
          onSelect(props.community_area_id)
        })
      },
    }).addTo(map)

    layerRef.current = layer

    return () => {
      layer.remove()
    }
  }, [geojson, selectedId, onSelect])

  // Zoom to selected area or reset to full Chicago view
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (selectedBounds) {
      map.fitBounds(selectedBounds, { padding: [20, 20], maxZoom: 13 })
    } else {
      map.setView([41.8781, -87.6298], 10)
    }
  }, [selectedBounds])

  return (
    <div className="bg-white shadow-apple-xs border border-separator rounded-2xl overflow-hidden relative">
      <div ref={containerRef} style={{ height: 500 }} />

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg border border-separator px-3 py-2 shadow-apple-xs">
        <div className="text-[9px] font-semibold text-ink-quaternary uppercase tracking-wider mb-1.5">
          Avg Activity Score
        </div>
        <div className="flex flex-col gap-1">
          {[
            { label: 'Complex (75+)', color: '#1e3a5f' },
            { label: 'Active (50–74)', color: '#2563eb' },
            { label: 'Typical (25–49)', color: '#93c5fd' },
            { label: 'Quiet (0–24)', color: '#e2e8f0' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-3 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-ink-tertiary">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
