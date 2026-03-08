import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getNeighbors } from '../api/civitas'
import type { NeighborProperty } from '../api/civitas'
import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'

interface Props {
  lat: number
  lon: number
  address: string
  locationSk: number
}

const LEVEL_COLORS: Record<string, string> = {
  QUIET: '#94a3b8',
  TYPICAL: '#60a5fa',
  ACTIVE: '#2563eb',
  COMPLEX: '#1e3a5f',
}

export default function PropertyMap({ lat, lon, address, locationSk }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [neighbors, setNeighbors] = useState<NeighborProperty[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch neighbors
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getNeighbors(locationSk, 500)
      .then(data => { if (!cancelled) setNeighbors(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [locationSk])

  // Render map
  useEffect(() => {
    if (!containerRef.current) return

    // Clean up previous map
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = L.map(containerRef.current, {
      center: [lat, lon],
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    L.control.zoom({ position: 'topright' }).addTo(map)

    // Neighbor markers
    neighbors.forEach(n => {
      const color = LEVEL_COLORS[n.activity_level] || LEVEL_COLORS.QUIET
      const cfg = LEVEL_CONFIG[n.activity_level as ActivityLevel] || LEVEL_CONFIG.QUIET

      const marker = L.circleMarker([n.lat, n.lon], {
        radius: 6,
        fillColor: color,
        fillOpacity: 0.8,
        color: '#fff',
        weight: 1.5,
      }).addTo(map)

      const findingHtml = n.top_finding
        ? `<div style="font-size:10px;color:#6b7280;margin-top:4px">${n.top_finding}</div>`
        : ''

      marker.bindPopup(`
        <div style="font-family:Calibri,sans-serif;min-width:160px">
          <div style="font-size:12px;font-weight:600;color:#111827;margin-bottom:4px">${n.full_address}</div>
          <div style="display:inline-flex;align-items:center;gap:6px">
            <span style="font-size:18px;font-weight:700;color:#111827">${n.activity_score}</span>
            <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:9999px;background:${cfg.pillBg ? '#e5e7eb' : '#e5e7eb'};color:${color}">${cfg.label}</span>
          </div>
          ${findingHtml}
        </div>
      `, { closeButton: false, className: 'civitas-popup' })
    })

    // Subject property marker (larger, prominent)
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width: 16px; height: 16px;
        background: #111827;
        border: 3px solid #fff;
        border-radius: 50%;
        box-shadow: 0 0 0 2px #111827, 0 2px 8px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })

    L.marker([lat, lon], { icon, zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup(`<span style="font-size:12px;font-weight:700;color:#111827">${address}</span>`, {
        closeButton: false,
      })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [lat, lon, address, neighbors])

  return (
    <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden relative">
      <div ref={containerRef} style={{ height: 280 }} />

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg border border-gray-200 px-3 py-2 shadow-sm">
        <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Activity Level</div>
        <div className="flex flex-col gap-1">
          {(['QUIET', 'TYPICAL', 'ACTIVE', 'COMPLEX'] as const).map(level => (
            <div key={level} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: LEVEL_COLORS[level] }}
              />
              <span className="text-[10px] text-gray-500">{LEVEL_CONFIG[level].label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="absolute top-3 left-3 z-[1000] bg-white/90 rounded-lg px-3 py-1.5 text-[10px] text-gray-400 shadow-sm">
          Loading neighbors...
        </div>
      )}

      {/* Neighbor count */}
      {!loading && neighbors.length > 0 && (
        <div className="absolute top-3 left-3 z-[1000] bg-white/90 rounded-lg px-3 py-1.5 text-[10px] text-gray-500 shadow-sm">
          {neighbors.length} nearby {neighbors.length === 1 ? 'property' : 'properties'}
        </div>
      )}
    </div>
  )
}
