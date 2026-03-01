import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  lat: number
  lon: number
  address: string
}

export default function PropertyMap({ lat, lon, address }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

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

    // Custom marker with Apple blue
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width: 14px; height: 14px;
        background: #007AFF;
        border: 2px solid #fff;
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(0,122,255,0.4);
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    })

    L.marker([lat, lon], { icon })
      .addTo(map)
      .bindPopup(`<span style="font-size:12px;font-weight:600">${address}</span>`)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [lat, lon, address])

  return (
    <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
      <div ref={containerRef} style={{ height: 250 }} />
    </div>
  )
}
