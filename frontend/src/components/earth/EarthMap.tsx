import React, { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import type { V1Incident, EarthquakeItem } from '../../api'
import type { GoogleFloodGauge } from '../../types'
import { formatCause } from '../../utils/formatters'

interface EarthMapProps {
  incidents: V1Incident[]
  selectedIncident: V1Incident | null
  onSelectIncident: (inc: V1Incident) => void
  activeCity: string
  showInfrastructure: boolean
  showRainfall: boolean
  infrastructureData: any
  rainfallData: any
  earthquakes?: EarthquakeItem[]
  showEarthquakes?: boolean
  floodGauges?: GoogleFloodGauge[]
  showFloodGauges?: boolean
  highlightedEventId?: string | null
  onSelectEvent?: (eventId: string) => void
}

function getEventMarkerDetails(type: string): { icon: string; bg: string; border: string } {
  const t = (type || '').toLowerCase()
  if (t.includes('water')) return { icon: '💧', bg: 'bg-cyan-950/95', border: 'border-cyan-400' }
  if (t.includes('road')) return { icon: '🚗', bg: 'bg-amber-950/95', border: 'border-amber-400' }
  if (t.includes('transit')) return { icon: '🚌', bg: 'bg-purple-950/95', border: 'border-purple-400' }
  if (t.includes('call') || t.includes('emergency')) return { icon: '📞', bg: 'bg-rose-950/95', border: 'border-rose-400' }
  if (t.includes('citizen')) return { icon: '👤', bg: 'bg-emerald-950/95', border: 'border-emerald-400' }
  if (t.includes('weather') || t.includes('rain')) return { icon: '🌧', bg: 'bg-sky-950/95', border: 'border-sky-400' }
  return { icon: '📡', bg: 'bg-slate-900/95', border: 'border-slate-400' }
}

// City coordinates & initial camera positions
export const CITY_COORDINATES: Record<string, { center: [number, number]; zoom: number; pitch: number; bearing: number }> = {
  mumbai: {
    center: [72.8512, 19.0112],
    zoom: 13.5,
    pitch: 45,
    bearing: -15,
  },
  'new york': {
    center: [-73.9851, 40.7488],
    zoom: 13.0,
    pitch: 45,
    bearing: 20,
  },
}

export const EarthMap: React.FC<EarthMapProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  activeCity,
  showInfrastructure,
  showRainfall,
  infrastructureData,
  rainfallData,
  earthquakes = [],
  showEarthquakes = false,
  floodGauges = [],
  showFloodGauges = false,
  highlightedEventId,
  onSelectEvent,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const eventMarkersRef = useRef<maplibregl.Marker[]>([])
  const earthquakeMarkersRef = useRef<maplibregl.Marker[]>([])
  const floodMarkersRef = useRef<maplibregl.Marker[]>([])

  // 1. Initialize MapLibre with Globe Projection and Esri World Imagery
  useEffect(() => {
    if (!mapContainerRef.current) return

    const style: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        'esri-imagery': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Esri Satellite',
          maxzoom: 19,
        },
      },
      layers: [
        {
          id: 'esri-imagery-layer',
          type: 'raster',
          source: 'esri-imagery',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: [0, 20],
      zoom: 1.5,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    })

    // Enable 3D Globe Projection
    try {
      map.setProjection({ type: 'globe' })
    } catch {
      // Fallback
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')

    map.on('load', () => {
      // Initial flight to Mumbai
      setTimeout(() => {
        const dest = CITY_COORDINATES['mumbai']
        map.flyTo({
          center: dest.center,
          zoom: dest.zoom,
          pitch: dest.pitch,
          bearing: dest.bearing,
          duration: 3500,
          essential: true,
        })
      }, 800)

      // Add line source for event-to-pin connections
      map.addSource('pin-lines', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Glowing outer line layer
      map.addLayer({
        id: 'pin-lines-glow',
        type: 'line',
        source: 'pin-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#38bdf8',
          'line-width': 5,
          'line-opacity': 0.45,
          'line-blur': 2,
        },
      })

      // Crisp inner core line layer
      map.addLayer({
        id: 'pin-lines-layer',
        type: 'line',
        source: 'pin-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#e0f2fe',
          'line-width': 2,
          'line-opacity': 0.95,
        },
      })

      // Add rainfall layer source
      map.addSource('rainfall-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addLayer({
        id: 'rainfall-layer',
        type: 'circle',
        source: 'rainfall-source',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'rain_mm'], 0, 10, 50, 25, 100, 45],
          'circle-color': '#06b6d4',
          'circle-opacity': 0.45,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#22d3ee',
        },
      })
    })

    mapRef.current = map

    return () => {
      map.remove()
    }
  }, [])

  // 2. Fly to active city
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const key = activeCity.toLowerCase()
    const target = CITY_COORDINATES[key] || CITY_COORDINATES['mumbai']

    map.flyTo({
      center: target.center,
      zoom: target.zoom,
      pitch: target.pitch,
      bearing: target.bearing,
      duration: 2500,
      essential: true,
    })
  }, [activeCity])

  // 3. Render Incident Pins
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    incidents.forEach(inc => {
      const lat = inc.centroid_lat
      const lon = inc.centroid_lon
      if (!lat || !lon) return

      const isSelected = selectedIncident?.incident_id === inc.incident_id
      const sev = (inc.severity_level || 'Medium').toLowerCase()

      const color = sev === 'high' ? '#ef4444' : sev === 'medium' ? '#f59e0b' : '#eab308'
      const pulseColor = sev === 'high' ? 'rgba(239, 68, 68, 0.4)' : sev === 'medium' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(234, 179, 8, 0.4)'

      const el = document.createElement('div')
      el.className = 'cursor-pointer group flex flex-col items-center select-none'
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="absolute -inset-2 rounded-full animate-ping opacity-75" style="background-color: ${pulseColor};"></div>
          <div class="relative w-7 h-7 rounded-full border-2 border-white flex items-center justify-center shadow-lg transition-transform duration-200 group-hover:scale-125 ${isSelected ? 'scale-125 ring-4 ring-cyan-400' : ''}" style="background-color: ${color};">
            <span class="text-white text-[10px] font-black tracking-tight">${inc.incident_id.replace('INCIDENT-', '')}</span>
          </div>
        </div>
        <div class="mt-1 px-2 py-0.5 rounded-full bg-slate-950/90 border border-white/20 text-white text-[10px] font-semibold whitespace-nowrap shadow-md backdrop-blur-sm pointer-events-none group-hover:opacity-100 opacity-90 transition-opacity">
          ${formatCause(inc.primary_cause)}
        </div>
      `

      el.addEventListener('click', () => {
        onSelectIncident(inc)
        map.flyTo({
          center: [lon, lat],
          zoom: 15.5,
          pitch: 45,
          duration: 1800,
          essential: true,
        })
      })

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map)

      markersRef.current.push(marker)
    })
  }, [incidents, selectedIncident, onSelectIncident])

  // 4. Render Event Icon Nodes & Glowing Line to Incident Pin
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    eventMarkersRef.current.forEach(m => m.remove())
    eventMarkersRef.current = []

    const lineSource = map.getSource('pin-lines') as maplibregl.GeoJSONSource | undefined

    if (!selectedIncident || !selectedIncident.events || selectedIncident.events.length === 0) {
      if (lineSource) lineSource.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const pinLon = selectedIncident.centroid_lon
    const pinLat = selectedIncident.centroid_lat
    const lineFeatures: any[] = []

    selectedIncident.events.forEach((evt: any, idx: number) => {
      const eid = String(evt.id || evt.event_id || `E${idx}`)
      let evtLat = evt.lat
      let evtLon = evt.lon

      // Disperse slightly if coordinates overlap with incident centroid
      if (!evtLat || !evtLon || (evtLat === pinLat && evtLon === pinLon)) {
        const angle = (idx * (360 / selectedIncident.events!.length)) * (Math.PI / 180)
        const radius = 0.003
        evtLat = pinLat + Math.sin(angle) * radius
        evtLon = pinLon + Math.cos(angle) * radius
      }

      // Add connecting line for glow effect
      lineFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [pinLon, pinLat],
            [evtLon, evtLat],
          ],
        },
      })

      // Event icon marker
      const { icon, bg, border } = getEventMarkerDetails(evt.type || evt.source_type)
      const isHighlighted = highlightedEventId === eid

      const el = document.createElement('div')
      el.className = 'flex flex-col items-center select-none group cursor-pointer'
      el.innerHTML = `
        <div class="w-6 h-6 rounded-full ${bg} border ${border} flex items-center justify-center text-xs shadow-lg transition-all duration-200 group-hover:scale-125 ${
          isHighlighted ? 'ring-4 ring-cyan-400 scale-125 shadow-cyan-400/80 shadow-xl' : ''
        }">
          ${icon}
        </div>
        <div class="mt-0.5 px-1.5 py-0.2 rounded bg-slate-950/90 text-[9px] font-mono text-cyan-200 border border-cyan-500/40 whitespace-nowrap shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
          ${eid}
        </div>
      `

      // Clicking a node highlights it in the Evidence tab
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelectEvent?.(eid)
      })

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([evtLon, evtLat])
        .addTo(map)

      eventMarkersRef.current.push(marker)
    })

    if (lineSource) {
      lineSource.setData({
        type: 'FeatureCollection',
        features: lineFeatures,
      })
    }
  }, [selectedIncident, highlightedEventId, onSelectEvent])

  // 5. Toggle Rainfall Layer
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const rainSource = map.getSource('rainfall-source') as maplibregl.GeoJSONSource | undefined
    if (rainSource && rainfallData) {
      rainSource.setData(rainfallData)
    }

    if (map.getLayer('rainfall-layer')) {
      map.setLayoutProperty('rainfall-layer', 'visibility', showRainfall ? 'visible' : 'none')
    }
  }, [showRainfall, rainfallData])

  // 6. Toggle Infrastructure Markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const infraMarkers: maplibregl.Marker[] = []

    if (showInfrastructure && infrastructureData?.features) {
      infrastructureData.features.forEach((feat: any) => {
        const [lon, lat] = feat.geometry.coordinates
        const type = feat.properties.type

        const el = document.createElement('div')
        const icon = type === 'hospital' ? '🏥' : type === 'fire_station' ? '🚒' : '🚉'
        el.className = 'w-5 h-5 rounded-full bg-slate-900/80 border border-emerald-400 flex items-center justify-center text-[10px] shadow'
        el.title = `${feat.properties.name} (${type})`
        el.innerText = icon

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lon, lat])
          .addTo(map)
        infraMarkers.push(marker)
      })
    }

    return () => {
      infraMarkers.forEach(m => m.remove())
    }
  }, [showInfrastructure, infrastructureData])

  // 7. Render USGS Earthquakes as Pulsing Circles Sized by Magnitude
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    earthquakeMarkersRef.current.forEach(m => m.remove())
    earthquakeMarkersRef.current = []

    if (showEarthquakes && earthquakes.length > 0) {
      earthquakes.forEach(eq => {
        const lat = eq.lat
        const lon = eq.lon
        if (!lat || !lon) return

        const mag = eq.payload?.magnitude || 3.0
        const place = eq.payload?.place || 'Regional epicentre'
        const depth = eq.payload?.depth_km || 10
        const diameterPx = Math.max(18, Math.min(64, Math.round(mag * 8)))
        const isSevere = mag >= 4.5

        const el = document.createElement('div')
        el.className = 'relative flex items-center justify-center cursor-pointer group select-none'
        el.innerHTML = `
          <div class="absolute rounded-full animate-ping opacity-60" style="width: ${diameterPx + 16}px; height: ${diameterPx + 16}px; background-color: ${isSevere ? '#ef4444' : '#f97316'};"></div>
          <div class="rounded-full border-2 border-white flex items-center justify-center font-black text-white shadow-xl transition-transform group-hover:scale-125" style="width: ${diameterPx}px; height: ${diameterPx}px; background-color: ${isSevere ? '#dc2626' : '#ea580c'}; font-size: ${Math.max(9, Math.min(13, Math.round(mag * 2.2)))}px;">
            M${mag.toFixed(1)}
          </div>
          <div class="absolute bottom-full mb-1 px-2 py-1 rounded-lg bg-slate-950/95 border border-white/20 text-white text-[10px] whitespace-nowrap shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            <div class="font-bold text-orange-400">🌋 Magnitude ${mag.toFixed(1)}</div>
            <div class="text-slate-300">${place}</div>
            <div class="text-slate-400 font-mono text-[9px]">Depth: ${depth} km</div>
          </div>
        `

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lon, lat])
          .addTo(map)

        earthquakeMarkersRef.current.push(marker)
      })
    }

    return () => {
      earthquakeMarkersRef.current.forEach(m => m.remove())
      earthquakeMarkersRef.current = []
    }
  }, [showEarthquakes, earthquakes])

  // 8. Render Google Flood Hub Gauges as Globe Pins
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    floodMarkersRef.current.forEach(m => m.remove())
    floodMarkersRef.current = []

    if (showFloodGauges && floodGauges.length > 0) {
      floodGauges.forEach(gauge => {
        const lat = gauge.lat
        const lon = gauge.lon
        if (!lat || !lon) return

        const el = document.createElement('div')
        el.className = 'relative flex flex-col items-center cursor-pointer group select-none'
        const sevColor = gauge.severity === 'red' ? '#ef4444' : gauge.severity === 'amber' ? '#f59e0b' : '#10b981'

        el.innerHTML = `
          <div class="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shadow-lg text-white text-xs transition-transform group-hover:scale-125" style="background-color: ${sevColor};">
            🌊
          </div>
          <div class="mt-0.5 px-2 py-0.5 rounded-full bg-slate-950/90 border border-white/20 text-white text-[9px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
            ${gauge.name} (${gauge.river})
          </div>
        `

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lon, lat])
          .addTo(map)

        floodMarkersRef.current.push(marker)
      })
    }

    return () => {
      floodMarkersRef.current.forEach(m => m.remove())
      floodMarkersRef.current = []
    }
  }, [showFloodGauges, floodGauges])

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  )
}
