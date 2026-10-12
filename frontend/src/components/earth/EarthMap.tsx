import React, { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import type { V1Incident, EarthquakeItem } from '../../api'
import type { GoogleFloodGauge } from '../../types'
import { CITIES } from '../../utils/cities'
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
  onSelectEvent,
  eventsGeoJSON,
  allIndiaStats,
  onSelectCity,
  tourIncident,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const mapReadyRef = useRef<boolean>(false)
  const earthquakeMarkersRef = useRef<maplibregl.Marker[]>([])
  const floodMarkersRef = useRef<maplibregl.Marker[]>([])

  // Store mutable refs for event listeners
  const activeCityRef = useRef<string>(activeCity)
  const incidentsRef = useRef<V1Incident[]>(incidents)
  const selectedIncidentRef = useRef<V1Incident | null>(selectedIncident)
  const statsRef = useRef<any>(allIndiaStats)
  const onSelectIncidentRef = useRef<(inc: V1Incident) => void>(onSelectIncident)
  const onSelectCityRef = useRef<((city: string) => void) | undefined>(onSelectCity)

  activeCityRef.current = activeCity
  incidentsRef.current = incidents
  selectedIncidentRef.current = selectedIncident
  statsRef.current = allIndiaStats
  onSelectIncidentRef.current = onSelectIncident
  onSelectCityRef.current = onSelectCity

  // 1. Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current) return

    mapReadyRef.current = false

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

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: [79.0, 22.5],
      zoom: 4.6,
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

      // --- REQUIREMENT 1: SINGLE SOURCE OF TRUTH PINS GEOJSON SOURCE & LAYERS ---
      try {
        const initialPinData = getVisiblePins(
          activeCityRef.current,
          map.getZoom(),
          incidentsRef.current,
          selectedIncidentRef.current?.incident_id,
          statsRef.current
        )

        map.addSource('pins-source', {
          type: 'geojson',
          data: initialPinData,
        })
      } catch (err) {
        console.warn('Failed to add pins-source:', err)
      }

      // 1. City Bubbles circle layer (Zoom < 5)
      try {
        map.addLayer({
          id: 'pins-city-bubbles',
          type: 'circle',
          source: 'pins-source',
          filter: ['==', ['get', 'kind'], 'city_bubble'],
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': ['get', 'radius'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
            'circle-opacity': 0.88,
          },
        })
      } catch (err) {
        console.warn('Failed to add pins-city-bubbles layer:', err)
      }

      // 2. City Bubbles label layer
      try {
        map.addLayer({
          id: 'pins-city-bubbles-label',
          type: 'symbol',
          source: 'pins-source',
          filter: ['==', ['get', 'kind'], 'city_bubble'],
          layout: {
            'text-field': ['get', 'label'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#0c1018',
            'text-halo-width': 1.5,
          },
        })
      } catch (err) {
        console.warn('Failed to add pins-city-bubbles-label layer:', err)
      }

      // 3. Small 5px dots (all other incidents of that city)
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

      // 4. Glow: add circle layer 'pins-glow' BELOW 'pins-full' (filter kind == 'pin' and severity == 'High'):
      // radius 16, color ['get','color'], opacity 0.25, circle-blur 0.8.
      try {
        map.addLayer({
          id: 'pins-glow',
          type: 'circle',
          source: 'pins-source',
          filter: ['all', ['==', ['get', 'kind'], 'pin'], ['==', ['get', 'severity'], 'High']],
          paint: {
            'circle-radius': 16,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.25,
            'circle-blur': 0.8,
          },
        })
      } catch (err) {
        console.warn('Failed to add pins-glow layer:', err)
      }

      // 5. Full incident pins (circle-stroke-width 2, white)
      try {
        map.addLayer({
          id: 'pins-full',
          type: 'circle',
          source: 'pins-source',
          filter: ['==', ['get', 'kind'], 'pin'],
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': ['get', 'radius'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.95,
          },
        })
      } catch (err) {
        console.warn('Failed to add pins-full layer:', err)
      }

      // 6. Selected pin glow ring (existing accent ring)
      try {
        map.addLayer({
          id: 'pins-selected-glow',
          type: 'circle',
          source: 'pins-source',
          filter: ['all', ['==', ['get', 'kind'], 'pin'], ['==', ['get', 'is_selected'], true]],
          paint: {
            'circle-radius': 13,
            'circle-color': '#22d3ee',
            'circle-opacity': 0.35,
            'circle-stroke-color': '#22d3ee',
            'circle-stroke-width': 2,
          },
        })
      } catch (err) {
        console.warn('Failed to add pins-selected-glow layer:', err)
      }

      // 7. Label layer: text-allow-overlap false, symbol-sort-key = -severity_score
      try {
        map.addLayer({
          id: 'pins-labels',
          type: 'symbol',
          source: 'pins-source',
          filter: ['all', ['!=', ['get', 'kind'], 'city_bubble'], ['!=', ['get', 'label'], '']],
          layout: {
            'text-field': ['get', 'label'],
            'text-font': ['Noto Sans Regular'],
            'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'severity_score'], 0]],
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'text-size': 11,
            'text-offset': [1.3, 0], // 18px offset right
            'text-anchor': 'left',
          },
          paint: {
            'text-color': '#e6e8eb',
            'text-halo-color': '#0c1018',
            'text-halo-width': 1.5,
          },
        })
      } catch (err) {
        console.warn('Failed to add pins-labels layer:', err)
      }

      // Click on City Bubble -> Fly to city
      map.on('click', 'pins-city-bubbles', e => {
        const feat = e.features?.[0]
        const cityId = feat?.properties?.city_id
        if (cityId && onSelectCityRef.current) {
          onSelectCityRef.current(cityId)
        }
      })

      // Click on full pin or small dot -> select incident
      const handlePinClick = (e: any) => {
        const feat = e.features?.[0]
        const incId = feat?.properties?.incident_id
        if (incId) {
          const match = incidentsRef.current.find(i => i.incident_id === incId)
          if (match && onSelectIncidentRef.current) {
            onSelectIncidentRef.current(match)
          }
        }
      }

      map.on('click', 'pins-full', handlePinClick)
      map.on('click', 'pins-dots', handlePinClick)

      map.on('mouseenter', 'pins-city-bubbles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'pins-city-bubbles', () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'pins-full', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'pins-full', () => { map.getCanvas().style.cursor = '' })
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

      // Immediately set data on pins-source from refs
      try {
        const pSource = map.getSource('pins-source') as maplibregl.GeoJSONSource | undefined
        if (pSource) {
          pSource.setData(
            getVisiblePins(
              activeCityRef.current,
              map.getZoom(),
              incidentsRef.current,
              selectedIncidentRef.current?.incident_id,
              statsRef.current
            )
          )
        }
      } catch (err) {
        console.warn('Failed to set initial pins-source data in load handler:', err)
      }
    })

    // Zoom and moveend listener: update visible pins (city bubbles disappear at zoom 5, dot labels appear at zoom 15)
    const handleMapMovement = () => {
      const source = map.getSource('pins-source') as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(
          getVisiblePins(
            activeCityRef.current,
            map.getZoom(),
            incidentsRef.current,
            selectedIncidentRef.current?.incident_id,
            statsRef.current
          )
        )
      }
    }

    map.on('zoom', handleMapMovement)
    map.on('moveend', handleMapMovement)

    // RequestAnimationFrame loop for pulsing High severity pins-glow opacity between 0.15 and 0.35 over 2s
    let glowRafId: number | null = null
    const animateGlowPulse = (time: number) => {
      if (mapRef.current && mapReadyRef.current) {
        try {
          if (mapRef.current.getLayer('pins-glow')) {
            const progress = (time % 2000) / 2000 // 0 to 1
            const sinVal = (Math.sin(progress * 2 * Math.PI) + 1) / 2 // 0 to 1
            const opacity = 0.15 + sinVal * (0.35 - 0.15) // 0.15 to 0.35
            mapRef.current.setPaintProperty('pins-glow', 'circle-opacity', opacity)
          }
        } catch {
          // ignore
        }
      }
      glowRafId = requestAnimationFrame(animateGlowPulse)
    }
    glowRafId = requestAnimationFrame(animateGlowPulse)

    mapRef.current = map

    return () => {
      if (glowRafId !== null) cancelAnimationFrame(glowRafId)
      mapReadyRef.current = false
      map.remove()
    }
  }, [])

  // 2. Camera Flight when view changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

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

  // 3. Re-set GeoJSON source data whenever view, incidents, or selection changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return

    const source = map.getSource('pins-source') as maplibregl.GeoJSONSource | undefined
    if (source) {
      const data = getVisiblePins(
        activeCity,
        map.getZoom(),
        incidents,
        selectedIncident?.incident_id,
        allIndiaStats
      )
      source.setData(data)
    }
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

        const el = document.createElement('div')
        el.className = 'relative flex items-center justify-center cursor-pointer group select-none'
        el.innerHTML = `
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

        const el = document.createElement('div')
        el.className = 'relative flex flex-col items-center cursor-pointer group select-none'
        const sevColor = gauge.severity === 'red' ? '#ef4444' : gauge.severity === 'amber' ? '#f59e0b' : '#22c55e'

        el.innerHTML = `
          <div class="w-4 h-4 rounded-full border border-white flex items-center justify-center shadow-lg text-white text-[8px] font-bold" style="background-color: ${sevColor};">
            W
          </div>
          <div class="mt-0.5 px-2 py-0.5 rounded-md bg-[rgba(12,16,24,0.92)] border border-[rgba(255,255,255,0.1)] text-[#e6e8eb] text-[9px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
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
    <div className="absolute inset-0 w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  )
}
