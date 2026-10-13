import React, { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

import type { V1Incident, EarthquakeItem } from '../../api'
import type { GoogleFloodGauge } from '../../types'
import { CITIES } from '../../utils/cities'
import { formatCause } from '../../utils/formatters'
import { getVisiblePins } from './getVisiblePins'

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
  eventsGeoJSON?: any
  allIndiaStats?: any
  onSelectCity?: (city: string) => void
  tourIncident?: V1Incident | null
  isIntro?: boolean
  onMapIdle?: () => void
  isIntroExiting?: boolean
  onFlyToIndiaComplete?: () => void
}

const STYLE_ID = 'earth-map-pin-pulse-keyframes'
function injectPinKeyframes() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.innerHTML = `
    @keyframes earthMapPulseHigh {
      0% {
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
      }
      100% {
        box-shadow: 0 0 0 12px rgba(239, 68, 68, 0);
      }
    }
    .earth-pin-high-pulse {
      animation: earthMapPulseHigh 2s ease-out infinite;
    }
    @keyframes earthPinFadeIn {
      0% {
        opacity: 0;
        transform: scale(0.6);
      }
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }
    .earth-pin-fade-in {
      animation: earthPinFadeIn 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
  `
  document.head.appendChild(style)
}

function spreadClosePins(features: any[]) {
  const pinFeatures = features.filter(f => f.properties?.kind === 'pin')
  const otherFeatures = features.filter(f => f.properties?.kind !== 'pin')

  const visited = new Set<number>()
  const groups: any[][] = []

  for (let i = 0; i < pinFeatures.length; i++) {
    if (visited.has(i)) continue
    const group = [pinFeatures[i]]
    visited.add(i)
    const coords1 = pinFeatures[i].geometry?.coordinates || [0, 0]

    for (let j = i + 1; j < pinFeatures.length; j++) {
      if (visited.has(j)) continue
      const coords2 = pinFeatures[j].geometry?.coordinates || [0, 0]
      const dist = Math.hypot(coords1[0] - coords2[0], coords1[1] - coords2[1])
      if (dist < 0.02) {
        group.push(pinFeatures[j])
        visited.add(j)
      }
    }
    groups.push(group)
  }

  const adjustedPins: any[] = []
  for (const grp of groups) {
    if (grp.length === 1) {
      adjustedPins.push(grp[0])
    } else {
      const avgLon = grp.reduce((s, f) => s + f.geometry.coordinates[0], 0) / grp.length
      const avgLat = grp.reduce((s, f) => s + f.geometry.coordinates[1], 0) / grp.length
      const r = 0.012
      grp.forEach((feat, idx) => {
        const angle = (2 * Math.PI * idx) / grp.length
        adjustedPins.push({
          ...feat,
          geometry: {
            ...feat.geometry,
            coordinates: [
              avgLon + r * Math.cos(angle),
              avgLat + r * Math.sin(angle),
            ],
          },
        })
      })
    }
  }

  return [...otherFeatures, ...adjustedPins]
}

export const EarthMap: React.FC<EarthMapProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  activeCity,
  showInfrastructure: _showInfrastructure,
  showRainfall,
  infrastructureData: _infrastructureData,
  rainfallData,
  earthquakes = [],
  showEarthquakes = false,
  floodGauges = [],
  showFloodGauges = false,
  onSelectEvent,
  eventsGeoJSON,
  allIndiaStats,
  onSelectCity,
  tourIncident,
  isIntro = false,
  onMapIdle,
  isIntroExiting = false,
  onFlyToIndiaComplete,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const mapReadyRef = useRef<boolean>(false)
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const earthquakeMarkersRef = useRef<maplibregl.Marker[]>([])
  const floodMarkersRef = useRef<maplibregl.Marker[]>([])
  const rotatingRef = useRef<boolean>(false)
  const rotRafRef = useRef<number | null>(null)

  const stopRotation = () => {
    rotatingRef.current = false
    if (rotRafRef.current !== null) {
      cancelAnimationFrame(rotRafRef.current)
      rotRafRef.current = null
    }
  }

  // Store mutable refs for event listeners and functions
  const activeCityRef = useRef<string>(activeCity)
  const incidentsRef = useRef<V1Incident[]>(incidents)
  const selectedIncidentRef = useRef<V1Incident | null>(selectedIncident)
  const statsRef = useRef<any>(allIndiaStats)
  const onSelectIncidentRef = useRef<(inc: V1Incident) => void>(onSelectIncident)
  const onSelectCityRef = useRef<((city: string) => void) | undefined>(onSelectCity)
  const isIntroRef = useRef<boolean>(isIntro)
  const isIntroExitingRef = useRef<boolean>(isIntroExiting)
  const onMapIdleRef = useRef<(() => void) | undefined>(onMapIdle)
  const onFlyToIndiaCompleteRef = useRef<(() => void) | undefined>(onFlyToIndiaComplete)

  activeCityRef.current = activeCity
  incidentsRef.current = incidents
  selectedIncidentRef.current = selectedIncident
  statsRef.current = allIndiaStats
  onSelectIncidentRef.current = onSelectIncident
  onSelectCityRef.current = onSelectCity
  isIntroRef.current = isIntro
  isIntroExitingRef.current = isIntroExiting
  onMapIdleRef.current = onMapIdle
  onFlyToIndiaCompleteRef.current = onFlyToIndiaComplete

  function createPinElement(feat: any, zoom: number, selectedId?: string | null): HTMLElement {
    const root = document.createElement('div')
    root.className = 'earth-pin-marker'
    root.style.width = '28px'
    root.style.height = '28px'
    root.style.cursor = 'pointer'

    const inner = document.createElement('div')
    inner.className = 'earth-pin-inner earth-pin-fade-in'
    inner.style.position = 'relative'
    inner.style.width = '100%'
    inner.style.height = '100%'
    inner.style.display = 'flex'
    inner.style.alignItems = 'center'
    inner.style.justifyContent = 'center'
    inner.style.userSelect = 'none'
    inner.style.transition = 'transform 0.15s ease'

    const core = document.createElement('div')
    core.className = 'earth-pin-core'

    const label = document.createElement('div')
    label.className = 'earth-pin-label'
    label.style.position = 'absolute'
    label.style.left = '100%'
    label.style.top = '50%'
    label.style.transform = 'translateY(-50%)'
    label.style.marginLeft = '6px'
    label.style.whiteSpace = 'nowrap'
    label.style.maxWidth = '160px'
    label.style.overflow = 'hidden'
    label.style.textOverflow = 'ellipsis'
    label.style.fontFamily = 'Inter, sans-serif'
    label.style.fontSize = '11px'
    label.style.color = '#ffffff'
    label.style.textShadow = '0 1px 3px #000000'
    label.style.pointerEvents = 'none'

    inner.appendChild(core)
    inner.appendChild(label)
    root.appendChild(inner)

    root.addEventListener('click', e => {
      e.stopPropagation()
      const incId = feat.properties?.incident_id
      const inc = incidentsRef.current.find(i => i.incident_id === incId)
      if (inc && onSelectIncidentRef.current) {
        onSelectIncidentRef.current(inc)
      }
    })

    updatePinElement(root, feat, zoom, selectedId)
    return root
  }

  function updatePinElement(root: HTMLElement, feat: any, zoom: number, selectedId?: string | null) {
    const sev = (feat.properties?.severity || 'Medium').toLowerCase()
    const isHigh = sev === 'high'
    const isMed = sev === 'medium'
    const color = isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#eab308'
    const isSelected = feat.properties?.incident_id === selectedId

    // Apply scale to the INNER wrapper only, NEVER root!
    const inner = root.querySelector('.earth-pin-inner') as HTMLElement | null
    if (inner) {
      inner.style.transform = isSelected ? 'scale(1.25)' : 'scale(1)'
    }

    const core = root.querySelector('.earth-pin-core') as HTMLElement | null
    if (core) {
      const size = isHigh ? 14 : 12
      let glow = ''
      if (isHigh) {
        core.className = 'earth-pin-core earth-pin-high-pulse'
      } else if (isMed) {
        core.className = 'earth-pin-core'
        glow = 'box-shadow: 0 0 8px #f59e0b;'
      } else {
        core.className = 'earth-pin-core'
      }

      const ring = isSelected ? 'outline: 2px solid #22d3ee; outline-offset: 2px;' : 'outline: none;'

      core.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background-color: ${color};
        border: 2px solid #ffffff;
        box-sizing: border-box;
        ${glow}
        ${ring}
      `
    }

    const label = root.querySelector('.earth-pin-label') as HTMLElement | null
    if (label) {
      const showLabel = isHigh ? true : zoom >= 8
      if (!showLabel) {
        label.style.display = 'none'
      } else {
        label.style.display = 'block'
        const inc = incidentsRef.current.find(i => i.incident_id === feat.properties?.incident_id)
        const causeRaw = inc?.primary_cause || (inc as any)?.cause || feat.properties?.title || 'Incident'
        const causePart = formatCause(causeRaw).split(/[/—]/)[0].trim() || 'Incident'

        const rawPlace = inc?.neighborhood || ''
        const placePart =
          rawPlace && !rawPlace.startsWith('SYN-') && !rawPlace.startsWith('REAL-EV-')
            ? rawPlace
            : (inc?.city || 'Alert')

        label.textContent = `${causePart} · ${placePart}`
      }
    }
  }

  function createBubbleElement(feat: any): HTMLElement {
    const count = feat.properties?.count || 0
    const size = Math.max(28, Math.min(44, 28 + Math.round(count / 15)))

    const root = document.createElement('div')
    root.className = 'earth-bubble-marker'
    root.style.width = `${size}px`
    root.style.height = `${size}px`
    root.style.cursor = 'pointer'

    const inner = document.createElement('div')
    inner.className = 'earth-bubble-inner earth-pin-fade-in'
    inner.style.position = 'relative'
    inner.style.width = '100%'
    inner.style.height = '100%'
    inner.style.display = 'flex'
    inner.style.flexDirection = 'column'
    inner.style.alignItems = 'center'
    inner.style.justifyContent = 'center'
    inner.style.userSelect = 'none'

    const circle = document.createElement('div')
    circle.className = 'earth-bubble-circle'
    circle.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background-color: ${feat.properties?.color === '#ef4444' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)'};
      border: 1px solid rgba(255, 255, 255, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      backdrop-filter: blur(4px);
    `

    const countSpan = document.createElement('span')
    countSpan.style.cssText = `
      font-family: Inter, sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: #ffffff;
      line-height: 1;
    `
    countSpan.textContent = String(count)
    circle.appendChild(countSpan)

    const cityLabel = document.createElement('div')
    cityLabel.style.cssText = `
      position: absolute;
      top: calc(100% + 2px);
      left: 50%;
      transform: translateX(-50%);
      font-family: Inter, sans-serif;
      font-size: 11px;
      color: #8b93a1;
      white-space: nowrap;
      pointer-events: none;
    `
    cityLabel.textContent = feat.properties?.city_name || feat.properties?.city_id || ''

    inner.appendChild(circle)
    inner.appendChild(cityLabel)
    root.appendChild(inner)

    root.addEventListener('click', e => {
      e.stopPropagation()
      const cityId = feat.properties?.city_id
      if (cityId && onSelectCityRef.current) {
        onSelectCityRef.current(cityId)
      }
    })

    return root
  }

  const syncMarkers = () => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return

    if (isIntroRef.current && !isIntroExitingRef.current) {
      for (const marker of markersRef.current.values()) {
        marker.remove()
      }
      markersRef.current.clear()
      return
    }

    const zoom = map.getZoom()
    const norm = (activeCityRef.current || 'all').toLowerCase().trim()
    const isAllIndia = norm === 'all' || norm === 'all-india' || norm === 'all india'

    const pinData = getVisiblePins(
      activeCityRef.current,
      zoom,
      incidentsRef.current,
      selectedIncidentRef.current?.incident_id,
      statsRef.current
    )

    // - City bubble element: Only at zoom < 4.
    // - Top-4 pins only at zoom >= 4 (in All India view).
    const eligibleFeatures = (pinData.features || []).filter(feat => {
      const kind = feat.properties?.kind
      if (kind === 'city_bubble') {
        return zoom < 4
      }
      if (kind === 'pin') {
        if (isAllIndia) {
          return zoom >= 4
        }
        return true
      }
      return false
    })

    // Max 60 markers
    const sliced = eligibleFeatures.slice(0, 60)
    const spread = spreadClosePins(sliced)
    const activeKeys = new Set<string>()

    spread.forEach(feat => {
      const kind = feat.properties?.kind
      const key = kind === 'city_bubble' ? `bubble-${feat.properties.city_id}` : `pin-${feat.properties.incident_id}`
      activeKeys.add(key)

      const coords = feat.geometry.coordinates as [number, number]
      const existing = markersRef.current.get(key)

      if (existing) {
        existing.setLngLat(coords)
        if (kind === 'pin') {
          updatePinElement(existing.getElement(), feat, zoom, selectedIncidentRef.current?.incident_id)
        }
      } else {
        let el: HTMLElement
        if (kind === 'city_bubble') {
          el = createBubbleElement(feat)
        } else {
          el = createPinElement(feat, zoom, selectedIncidentRef.current?.incident_id)
        }
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(coords)
          .addTo(map)
        markersRef.current.set(key, marker)
      }
    })

    for (const [key, marker] of markersRef.current.entries()) {
      if (!activeKeys.has(key)) {
        marker.remove()
        markersRef.current.delete(key)
      }
    }

    // Keep 'pins-dots' as GeoJSON: update pins-source
    try {
      const source = map.getSource('pins-source') as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(pinData)
      }
    } catch (err) {
      console.warn('Failed to update pins-dots source:', err)
    }
  }

  // 1. Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current) return

    mapReadyRef.current = false
    injectPinKeyframes()

    const style: maplibregl.StyleSpecification = {
      version: 8,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
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

    const initialCenter: [number, number] = isIntro ? [60.0, 20.0] : [79.0, 22.5]
    const initialZoom = isIntro ? 1.6 : 4.6

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: initialCenter,
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    })

    try {
      map.setProjection({ type: 'globe' })
    } catch {
      // Fallback
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')

    map.on('load', () => {
      // Atmospheric sky styling
      try {
        map.setSky({
          'sky-color': '#050811',
          'sky-horizon-blend': 0.8,
          'horizon-color': '#0e243a',
          'horizon-fog-blend': 0.5,
          'fog-color': '#050811',
          'fog-ground-blend': 0.7,
        })
      } catch {
        // Fallback
      }

      // Wait for map idle before triggering onMapIdle
      let idleTriggered = false
      const triggerIdle = () => {
        if (idleTriggered) return
        idleTriggered = true
        onMapIdleRef.current?.()
      }
      map.once('idle', triggerIdle)
      setTimeout(triggerIdle, 1800)
      // Dashed outline icon for approximate locations
      try {
        const size = 36
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.arc(size / 2, size / 2, 11, 0, Math.PI * 2)
          ctx.stroke()
          map.addImage('dashed-ring', ctx.getImageData(0, 0, size, size))
        }
      } catch (err) {
        console.warn('Failed to add dashed-ring icon:', err)
      }

      // --- EVENTS GEOJSON SOURCE & LAYERS ---
      try {
        map.addSource('events-geojson', {
          type: 'geojson',
          data: eventsGeoJSON || { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 13,
          clusterRadius: 50,
        })
      } catch (err) {
        console.warn('Failed to add events-geojson source:', err)
      }

      // Heatmap layer (zoom 0 to 12)
      try {
        map.addLayer({
          id: 'events-heat',
          type: 'heatmap',
          source: 'events-geojson',
          maxzoom: 12,
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 12, 3],
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(0, 0, 0, 0)',
              0.2, 'rgba(6, 182, 212, 0.4)',
              0.4, 'rgba(59, 130, 246, 0.65)',
              0.6, 'rgba(234, 179, 8, 0.8)',
              0.8, 'rgba(249, 115, 22, 0.9)',
              1.0, 'rgba(239, 68, 68, 1)',
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 12, 25],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.85, 12, 0],
          },
        })
      } catch (err) {
        console.warn('Failed to add events-heat layer:', err)
      }

      // Cluster bubbles
      try {
        map.addLayer({
          id: 'events-clusters',
          type: 'circle',
          source: 'events-geojson',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#06b6d4',
              20, '#3b82f6',
              50, '#8b5cf6',
              100, '#f97316',
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              16,
              20, 20,
              50, 25,
              100, 32,
            ],
            'circle-opacity': 0.88,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.95,
          },
        })
      } catch (err) {
        console.warn('Failed to add events-clusters layer:', err)
      }

      try {
        map.addLayer({
          id: 'events-cluster-count',
          type: 'symbol',
          source: 'events-geojson',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
          },
          paint: {
            'text-color': '#ffffff',
          },
        })
      } catch (err) {
        console.warn('Failed to add events-cluster-count layer:', err)
      }

      // Individual event dots (unclustered): colored by category
      try {
        map.addLayer({
          id: 'events-unclustered-dots',
          type: 'circle',
          source: 'events-geojson',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'case',
              ['any', ['==', ['get', 'type'], 'water_level'], ['in', 'FLOOD', ['get', 'taxonomy_code']], ['in', 'WATER', ['get', 'taxonomy_code']]],
              '#3b82f6', // blue flood
              ['any', ['==', ['get', 'type'], 'road_sensor'], ['in', 'TRAFFIC', ['get', 'taxonomy_code']]],
              '#f97316', // orange traffic
              ['in', 'POWER', ['get', 'taxonomy_code']],
              '#eab308', // yellow power
              ['any', ['==', ['get', 'type'], 'transit'], ['in', 'TRANSIT', ['get', 'taxonomy_code']]],
              '#a855f7', // purple transit
              ['any', ['==', ['get', 'type'], 'emergency_call'], ['in', 'EMERGENCY', ['get', 'taxonomy_code']]],
              '#ef4444', // red emergency
              '#22c55e',
            ],
            'circle-radius': 6,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.9,
            'circle-opacity': 0.95,
          },
        })
      } catch (err) {
        console.warn('Failed to add events-unclustered-dots layer:', err)
      }

      // Dashed outline for events with location_approx
      try {
        map.addLayer({
          id: 'events-unclustered-approx',
          type: 'symbol',
          source: 'events-geojson',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'location_approx'], true]],
          layout: {
            'icon-image': 'dashed-ring',
            'text-font': ['Noto Sans Regular'],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-size': 0.9,
          },
        })
      } catch (err) {
        console.warn('Failed to add events-unclustered-approx layer:', err)
      }

      // Cluster click -> Zoom
      map.on('click', 'events-clusters', async e => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['events-clusters'] })
        const clusterId = features[0]?.properties?.cluster_id
        const source = map.getSource('events-geojson') as maplibregl.GeoJSONSource
        if (source && clusterId !== undefined) {
          try {
            const zoom = await source.getClusterExpansionZoom(clusterId)
            const geom = features[0].geometry as any
            map.easeTo({
              center: geom.coordinates,
              zoom: zoom ?? 12,
              duration: 600,
            })
          } catch {
            // ignore
          }
        }
      })

      // Event dot click
      map.on('click', 'events-unclustered-dots', e => {
        const f = e.features?.[0]
        if (!f) return
        const geom = f.geometry as any
        const p = f.properties || {}
        const eid = p.id || ''
        if (onSelectEvent) onSelectEvent(eid)

        new maplibregl.Popup({ className: 'custom-map-popup', offset: 12 })
          .setLngLat(geom.coordinates)
          .setHTML(`
            <div style="font-family: sans-serif; font-size: 11px; padding: 6px; color: #e6e8eb; background: rgba(12,16,24,0.92); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); max-width: 220px;">
              <div style="font-weight: 600; color: #22d3ee;">${p.id}</div>
              <div style="margin-top: 3px; font-weight: 500; color: #e6e8eb;">${p.taxonomy_code}</div>
              <div style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;">
                <span style="background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 4px; font-size: 10px;">${p.type}</span>
                <span style="background: ${p.is_synthetic ? 'rgba(168,85,247,0.2)' : 'rgba(34,197,94,0.2)'}; color: ${p.is_synthetic ? '#c084fc' : '#22c55e'}; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 500;">${p.is_synthetic ? 'SYNTHETIC' : 'REAL'}</span>
                ${p.location_approx ? '<span style="background: rgba(245,158,11,0.2); color: #f59e0b; padding: 1px 5px; border-radius: 4px; font-size: 10px;">Approx Coord</span>' : ''}
              </div>
              <div style="margin-top: 4px; color: #8b93a1; font-size: 10px;">${p.time || ''}</div>
            </div>
          `)
          .addTo(map)
      })

      // --- PINS GEOJSON SOURCE: KEEP ONLY 'pins-dots' AS GEOJSON ---
      try {
        map.addSource('pins-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
      } catch (err) {
        console.warn('Failed to add pins-source:', err)
      }

      // Small 5px dots (all other incidents of that city)
      try {
        map.addLayer({
          id: 'pins-dots',
          type: 'circle',
          source: 'pins-source',
          filter: ['==', ['get', 'kind'], 'dot'],
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': 5,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
            'circle-opacity': 0.85,
          },
        })
      } catch (err) {
        console.warn('Failed to add pins-dots layer:', err)
      }

      // Click on small dot -> select incident
      map.on('click', 'pins-dots', (e: any) => {
        const feat = e.features?.[0]
        const incId = feat?.properties?.incident_id
        if (incId) {
          const match = incidentsRef.current.find(i => i.incident_id === incId)
          if (match && onSelectIncidentRef.current) {
            onSelectIncidentRef.current(match)
          }
        }
      })

      map.on('mouseenter', 'pins-dots', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'pins-dots', () => { map.getCanvas().style.cursor = '' })

      // Rainfall GeoJSON
      try {
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
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#22d3ee',
          },
        })
      } catch (err) {
        console.warn('Failed to add rainfall source/layer:', err)
      }

      // Mark map as ready at the END of load handler
      mapReadyRef.current = true

      // Synchronize markers
      syncMarkers()
    })

    // Start rotation loop only when isIntro is true
    const prefersReducedMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (isIntro && !prefersReducedMotion) {
      rotatingRef.current = true
      let lastTime = performance.now()
      const speed = 1.0

      const rotateStep = (now: number) => {
        if (!mapRef.current || !rotatingRef.current) return
        const dt = (now - lastTime) / 1000
        lastTime = now

        const currCenter = mapRef.current.getCenter()
        mapRef.current.setCenter([currCenter.lng - speed * dt, currCenter.lat])

        if (rotatingRef.current) {
          rotRafRef.current = requestAnimationFrame(rotateStep)
        }
      }
      rotRafRef.current = requestAnimationFrame(rotateStep)
    }

    // Stop rotation on user interaction
    map.on('mousedown', stopRotation)
    map.on('touchstart', stopRotation)
    map.on('wheel', stopRotation)
    map.on('dragstart', stopRotation)

    // Zoom and move listeners
    map.on('zoomend', syncMarkers)
    map.on('moveend', syncMarkers)

    mapRef.current = map

    return () => {
      stopRotation()
      markersRef.current.forEach(m => m.remove())
      markersRef.current.clear()
      mapReadyRef.current = false
      map.remove()
    }
  }, [])

  // Stop rotation when isIntro becomes false
  useEffect(() => {
    if (!isIntro) {
      stopRotation()
    }
  }, [isIntro])

  // Intro Exit Sequence
  useEffect(() => {
    if (!isIntroExiting || !mapRef.current || !mapReadyRef.current) return
    const map = mapRef.current
    stopRotation()

    const prefersReducedMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const duration = prefersReducedMotion ? 0 : 3000
    map.flyTo({
      center: [79.0, 22.5],
      zoom: 4.3,
      pitch: prefersReducedMotion ? 0 : 35,
      bearing: 0,
      duration,
      curve: 1.4,
      essential: true,
    })

    const onFlightDone = () => {
      onFlyToIndiaCompleteRef.current?.()
      syncMarkers()
    }

    map.once('moveend', onFlightDone)
  }, [isIntroExiting])

  // 2. Camera Flight when view changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    stopRotation()

    const norm = activeCity.toLowerCase().trim()
    const isAll = norm === 'all' || norm === 'all-india' || norm === 'all india'

    if (isAll) {
      map.flyTo({
        center: [79.0, 22.5],
        zoom: 4.6,
        pitch: 0,
        bearing: 0,
        duration: 2000,
        essential: true,
      })
    } else {
      const cityConfig = CITIES[norm]
      if (cityConfig) {
        map.flyTo({
          center: [cityConfig.lon, cityConfig.lat],
          zoom: 11,
          pitch: 45,
          duration: 2000,
          essential: true,
        })
      }
    }
  }, [activeCity])

  // 3. Update markers whenever view, incidents, or selection changes
  useEffect(() => {
    syncMarkers()
  }, [activeCity, incidents, selectedIncident, allIndiaStats])

  // 4. Update events GeoJSON
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return

    const source = map.getSource('events-geojson') as maplibregl.GeoJSONSource | undefined
    if (source && eventsGeoJSON) {
      source.setData(eventsGeoJSON)
    }
  }, [eventsGeoJSON])

  // 5. Tour camera control
  useEffect(() => {
    const map = mapRef.current
    if (!map || !tourIncident) return

    stopRotation()

    const lat = tourIncident.centroid_lat
    const lon = tourIncident.centroid_lon
    if (!lat || !lon) return

    map.flyTo({
      center: [lon, lat],
      zoom: 15,
      pitch: 50,
      duration: 1500,
      essential: true,
    })

    const rotateTimer = setTimeout(() => {
      if (map) {
        map.easeTo({
          bearing: map.getBearing() + 12,
          duration: 3800,
          easing: t => t,
        })
      }
    }, 1500)

    return () => clearTimeout(rotateTimer)
  }, [tourIncident])

  // 6. Rainfall Layer
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return

    const rainSource = map.getSource('rainfall-source') as maplibregl.GeoJSONSource | undefined
    if (rainSource && rainfallData) {
      rainSource.setData(rainfallData)
    }

    if (map.getLayer('rainfall-layer')) {
      map.setLayoutProperty('rainfall-layer', 'visibility', showRainfall ? 'visible' : 'none')
    }
  }, [showRainfall, rainfallData])

  // 7. Earthquakes Markers
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
        const diameterPx = Math.max(16, Math.min(50, Math.round(mag * 7)))
        const isSevere = mag >= 4.5
        const root = document.createElement('div')
        root.style.width = `${diameterPx}px`
        root.style.height = `${diameterPx}px`
        root.style.cursor = 'pointer'

        const inner = document.createElement('div')
        inner.style.position = 'relative'
        inner.style.width = '100%'
        inner.style.height = '100%'
        inner.className = 'flex items-center justify-center group select-none'
        inner.innerHTML = `
          <div class="absolute rounded-full animate-ping opacity-50" style="width: ${diameterPx + 12}px; height: ${diameterPx + 12}px; background-color: ${isSevere ? '#ef4444' : '#f97316'};"></div>
          <div class="rounded-full border border-white flex items-center justify-center font-bold text-white shadow-xl" style="width: ${diameterPx}px; height: ${diameterPx}px; background-color: ${isSevere ? '#dc2626' : '#ea580c'}; font-size: ${Math.max(9, Math.min(12, Math.round(mag * 2)))}px;">
            M${mag.toFixed(1)}
          </div>
          <div class="absolute bottom-full mb-1 px-2 py-1 rounded-lg bg-[rgba(12,16,24,0.95)] border border-[rgba(255,255,255,0.1)] text-[#e6e8eb] text-[10px] whitespace-nowrap shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            <div class="font-semibold text-orange-400">Magnitude ${mag.toFixed(1)}</div>
            <div class="text-[#8b93a1]">${place}</div>
            <div class="text-[#8b93a1] text-[9px]">Depth: ${depth} km</div>
          </div>
        `
        root.appendChild(inner)

        const marker = new maplibregl.Marker({ element: root, anchor: 'center' })
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

  // 8. Flood Gauges
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

        const root = document.createElement('div')
        root.style.width = '16px'
        root.style.height = '16px'
        root.style.cursor = 'pointer'

        const inner = document.createElement('div')
        inner.style.position = 'relative'
        inner.style.width = '100%'
        inner.style.height = '100%'
        inner.className = 'flex flex-col items-center group select-none'
        const sevColor = gauge.severity === 'red' ? '#ef4444' : gauge.severity === 'amber' ? '#f59e0b' : '#22c55e'

        inner.innerHTML = `
          <div class="w-4 h-4 rounded-full border border-white flex items-center justify-center shadow-lg text-white text-[8px] font-bold" style="background-color: ${sevColor};">
            W
          </div>
          <div class="mt-0.5 px-2 py-0.5 rounded-md bg-[rgba(12,16,24,0.92)] border border-[rgba(255,255,255,0.1)] text-[#e6e8eb] text-[9px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            ${gauge.name} (${gauge.river})
          </div>
        `
        root.appendChild(inner)

        const marker = new maplibregl.Marker({ element: root, anchor: 'center' })
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
    <div className="absolute inset-0 w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  )
}
