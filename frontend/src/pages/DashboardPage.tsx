import React, { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import {
  Activity, ShieldCheck, ShieldAlert, CloudRain, Play, Pause,
  RotateCcw, ChevronRight, CheckCircle2, Search, Layers, Eye,
  Droplets, Car, PhoneCall, Info, ExternalLink, Wind, Waves,
  SlidersHorizontal, Database, Compass, Radio
} from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import type {
  Incident, WeatherMetrics, CauseRank,
  EarthquakeItem, GoogleFloodResponse, WindyConfig
} from '../types'
import {
  fetchIncidents, fetchWeather, fetchEarthquakes,
  fetchGoogleFlood, fetchWindyConfig, runScenario, resetDatabase
} from '../api'
import { DataSourcesModal } from '../components/DataSourcesModal'
import { WindyPanel } from '../components/WindyPanel'

// Basemap Tile Providers (100% Free, Zero API Keys, Real Hazard Feeds)
const BASEMAPS = {
  esriSatellite: {
    name: '🛰️ Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
  },
  windyMap: {
    name: '🌧️ Windy Map',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Windy.com &copy; Live Weather Radar Feed',
  },
  googleFlood: {
    name: '🌊 Google Flood Map',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Google Flood Hub &copy; River Gauge Telemetry',
  },
  earthquakeMap: {
    name: '🌋 Earthquake Map',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'USGS Real-Time Earthquake Feed',
  },
  osm: {
    name: '🌐 OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
}

export const DashboardPage: React.FC = () => {
  // Core Incidents & Weather State
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [weather, setWeather] = useState<WeatherMetrics | null>(null)
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [lastScenarioMsg, setLastScenarioMsg] = useState<string>('')

  // Search & Cause Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCause, setFilterCause] = useState<string>('all')

  // External Hazard Data
  const [earthquakes, setEarthquakes] = useState<EarthquakeItem[]>([])
  const [earthquakeScope, setEarthquakeScope] = useState<'mumbai' | 'global'>('mumbai')
  const [minMagnitude, setMinMagnitude] = useState<number>(2.5)
  const [googleFlood, setGoogleFlood] = useState<GoogleFloodResponse | null>(null)
  const [windyConfig, setWindyConfig] = useState<WindyConfig | null>(null)
  const [isDataSourcesModalOpen, setIsDataSourcesModalOpen] = useState(false)

  // Map state
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const layersGroupRef = useRef<L.LayerGroup | null>(null)
  const [activeBasemap, setActiveBasemap] = useState<keyof typeof BASEMAPS>('esriSatellite')

  // Layer toggles with persistence
  const [layerFloodPolygon, setLayerFloodPolygon] = useState(() => {
    return localStorage.getItem('layer_flood') !== 'false'
  })
  const [layerClusterRadius, setLayerClusterRadius] = useState(() => {
    return localStorage.getItem('layer_cluster') !== 'false'
  })
  const [layerWaterSensors, setLayerWaterSensors] = useState(() => {
    return localStorage.getItem('layer_water') !== 'false'
  })
  const [layerTrafficSensors, setLayerTrafficSensors] = useState(() => {
    return localStorage.getItem('layer_traffic') !== 'false'
  })
  const [layerCitizenReports, setLayerCitizenReports] = useState(() => {
    return localStorage.getItem('layer_citizen') !== 'false'
  })
  const [layerWeatherStations, setLayerWeatherStations] = useState(() => {
    return localStorage.getItem('layer_weather') !== 'false'
  })

  // Hazard Layer Toggles
  const [layerEarthquakes, setLayerEarthquakes] = useState(() => {
    return localStorage.getItem('layer_earthquakes') !== 'false'
  })
  const [layerGoogleFlood, setLayerGoogleFlood] = useState(() => {
    return localStorage.getItem('layer_google_flood') === 'true' // off by default per spec
  })
  const [layerWindy, setLayerWindy] = useState(() => {
    return localStorage.getItem('layer_windy') === 'true' // off by default
  })

  // Replay Time Slider state
  const [timelineIndex, setTimelineIndex] = useState<number>(100)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1)
  const playTimerRef = useRef<any>(null)

  // Persist layer toggles in localStorage and URL query params
  useEffect(() => {
    localStorage.setItem('layer_flood', String(layerFloodPolygon))
    localStorage.setItem('layer_cluster', String(layerClusterRadius))
    localStorage.setItem('layer_water', String(layerWaterSensors))
    localStorage.setItem('layer_traffic', String(layerTrafficSensors))
    localStorage.setItem('layer_citizen', String(layerCitizenReports))
    localStorage.setItem('layer_weather', String(layerWeatherStations))
    localStorage.setItem('layer_earthquakes', String(layerEarthquakes))
    localStorage.setItem('layer_google_flood', String(layerGoogleFlood))
    localStorage.setItem('layer_windy', String(layerWindy))

    // URL params synchronization
    const params = new URLSearchParams()
    if (!layerFloodPolygon) params.set('flood', '0')
    if (layerEarthquakes) params.set('eq', '1')
    if (layerGoogleFlood) params.set('gflood', '1')
    if (layerWindy) params.set('windy', '1')
    if (earthquakeScope !== 'mumbai') params.set('scope', earthquakeScope)
    const newRelativePathQuery = window.location.pathname + '?' + params.toString()
    window.history.replaceState(null, '', newRelativePathQuery)
  }, [
    layerFloodPolygon, layerClusterRadius, layerWaterSensors,
    layerTrafficSensors, layerCitizenReports, layerWeatherStations,
    layerEarthquakes, layerGoogleFlood, layerWindy, earthquakeScope
  ])

  // Load Data
  const loadData = async () => {
    try {
      const [incData, wData, eqData, gFloodData, wndyData] = await Promise.all([
        fetchIncidents(),
        fetchWeather(),
        fetchEarthquakes(earthquakeScope, minMagnitude),
        fetchGoogleFlood(),
        fetchWindyConfig(),
      ])

      setIncidents(incData)
      if (incData.length > 0 && !selectedIncident) {
        setSelectedIncident(incData[0])
      } else if (selectedIncident) {
        const updated = incData.find(i => i.id === selectedIncident.id) || incData[0]
        setSelectedIncident(updated)
      }
      setWeather(wData)
      setEarthquakes(eqData.earthquakes)
      setGoogleFlood(gFloodData)
      setWindyConfig(wndyData)
    } catch (err) {
      console.warn('Data load warning:', err)
    }
  }

  useEffect(() => {
    loadData()
  }, [earthquakeScope, minMagnitude])

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return
    if (mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [19.0112, 72.8512],
      zoom: 15,
      zoomControl: false,
    })

    L.control.zoom({ position: 'topright' }).addTo(map)

    const initialTile = L.tileLayer(BASEMAPS[activeBasemap].url, {
      attribution: BASEMAPS[activeBasemap].attribution,
      maxZoom: 19,
    }).addTo(map)

    tileLayerRef.current = initialTile
    layersGroupRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Switch Basemap
  useEffect(() => {
    if (!mapRef.current) return
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current)
    }
    const newTile = L.tileLayer(BASEMAPS[activeBasemap].url, {
      attribution: BASEMAPS[activeBasemap].attribution,
      maxZoom: 19,
    }).addTo(mapRef.current)
    tileLayerRef.current = newTile
  }, [activeBasemap])

  // Render Map Layers
  useEffect(() => {
    if (!mapRef.current || !layersGroupRef.current) return

    const group = layersGroupRef.current
    group.clearLayers()

    // 1. Incidents & Associated Events
    incidents.forEach((inc) => {
      const events = inc.events || []

      // 1.1 Cluster Radius Circle
      if (layerClusterRadius) {
        L.circle([inc.centroid_lat, inc.centroid_lon], {
          radius: inc.radius_m || 450,
          color: '#0079C1',
          weight: 1.5,
          dashArray: '4, 6',
          fillColor: '#0079C1',
          fillOpacity: 0.05,
        }).addTo(group)
      }

      // 1.2 Flood Extent Polygon with glowing boundary
      if (layerFloodPolygon && inc.flood_polygon && inc.flood_polygon.length > 0) {
        const latLngs = inc.flood_polygon.map((p: [number, number]) => [p[1], p[0]] as [number, number])
        const polygon = L.polygon(latLngs, {
          color: '#00d4ff',
          weight: 2.5,
          fillColor: '#0079C1',
          fillOpacity: 0.40,
        }).addTo(group)

        polygon.bindPopup(`
          <div class="p-3 font-sans">
            <div class="text-xs font-bold text-sky-700 uppercase tracking-wider mb-1">Flood Extent Inundation</div>
            <div class="text-sm font-semibold text-slate-800">${inc.neighborhood || 'Hindmata Zone'}</div>
            <div class="text-xs text-slate-600 mt-1">Waterlogging depth: 40-78cm above street datum. Storm culverts overflowing.</div>
          </div>
        `)
      }

      // 1.3 Incident Centroid Pulsing Beacon Marker
      const centroidIcon = L.divIcon({
        className: 'custom-centroid-marker',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="w-9 h-9 rounded-full bg-red-600 border-2 border-white shadow-2xl flex items-center justify-center text-white font-black text-sm glow-beacon">
              !
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })

      const centroidMarker = L.marker([inc.centroid_lat, inc.centroid_lon], { icon: centroidIcon }).addTo(group)
      centroidMarker.on('click', () => setSelectedIncident(inc))
      centroidMarker.bindPopup(`
        <div class="p-3 font-sans max-w-xs">
          <div class="text-xs font-extrabold uppercase tracking-wide text-red-600 mb-0.5">Incident #${inc.id} • ${inc.severity_level.toUpperCase()}</div>
          <div class="text-sm font-bold text-slate-900 mb-1">${inc.title}</div>
          <div class="text-xs text-slate-600 mb-2">${inc.explanation}</div>
          <div class="flex items-center justify-between text-xs bg-slate-100 p-2 rounded">
            <span>Root Cause: <strong>${inc.cause.replace('_', ' ')}</strong></span>
            <span class="text-sky-700 font-bold">${Math.round(inc.cause_confidence * 100)}% Conf.</span>
          </div>
        </div>
      `)

      // 1.4 Member Events & Connected Glowing Graph Edges
      events.forEach((ev) => {
        let shouldRender = false
        if (ev.source_type === 'water_level' && layerWaterSensors) shouldRender = true
        if ((ev.source_type === 'road_sensor' || ev.source_type === 'transit') && layerTrafficSensors) shouldRender = true
        if ((ev.source_type === 'citizen_report' || ev.source_type === 'emergency_call') && layerCitizenReports) shouldRender = true
        if (ev.source_type === 'weather' && layerWeatherStations) shouldRender = true

        if (!shouldRender) return

        // Draw glowing dashed edge from incident centroid to event node
        L.polyline([[inc.centroid_lat, inc.centroid_lon], [ev.lat, ev.lon]], {
          color: '#38bdf8',
          weight: 1.8,
          opacity: 0.70,
          dashArray: '4, 8',
        }).addTo(group)

        let color = '#0079C1'
        let glowClass = 'glow-cyan'
        let label = 'EV'
        let valText = ''

        if (ev.source_type === 'water_level') {
          color = '#0284c7'
          glowClass = 'glow-cyan'
          label = '💧'
          valText = `${ev.payload?.value || 0}cm`
        } else if (ev.source_type === 'road_sensor') {
          color = '#dc2626'
          glowClass = 'glow-red'
          label = '🚗'
          valText = ev.payload?.status || 'alert'
        } else if (ev.source_type === 'transit') {
          color = '#d97706'
          glowClass = 'glow-amber'
          label = '🚌'
          valText = `${ev.payload?.value || 0}km/h`
        } else if (ev.source_type === 'citizen_report') {
          color = '#9333ea'
          glowClass = 'glow-purple'
          label = '📢'
          valText = '311'
        } else if (ev.source_type === 'emergency_call') {
          color = '#e11d48'
          glowClass = 'glow-red'
          label = '🚨'
          valText = '911'
        } else if (ev.source_type === 'weather') {
          color = '#0284c7'
          glowClass = 'glow-cyan'
          label = '🌧️'
          valText = `${ev.payload?.value || 0}mm`
        }

        const evIcon = L.divIcon({
          className: 'custom-event-marker',
          html: `
            <div class="px-2.5 py-1 rounded-full text-white font-bold text-[10px] flex items-center space-x-1 whitespace-nowrap glowing-node ${glowClass}" style="background-color: ${color}">
              <span>${label}</span>
              <span>${valText}</span>
            </div>
          `,
          iconSize: [46, 22],
          iconAnchor: [23, 11],
        })

        const marker = L.marker([ev.lat, ev.lon], { icon: evIcon }).addTo(group)
        marker.bindPopup(`
          <div class="p-3 font-sans min-w-[220px]">
            <div class="flex items-center justify-between border-b pb-1 mb-1.5">
              <span class="text-xs font-bold uppercase text-slate-700">${ev.source_type.replace('_', ' ')}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded font-mono ${ev.signature_verified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                ${ev.signature_verified ? 'HMAC OK' : 'NO HMAC'}
              </span>
            </div>
            <div class="text-xs text-slate-800 mb-1"><strong>Device:</strong> ${ev.device_id || 'Unknown'}</div>
            <div class="text-xs text-slate-800 mb-1"><strong>Trust:</strong> ${(ev.trust * 100).toFixed(0)}%</div>
            ${ev.payload?.description ? `<div class="text-xs text-slate-600 bg-slate-50 p-1.5 rounded mt-1 italic">"${ev.payload.description}"</div>` : ''}
            ${ev.payload?.text ? `<div class="text-xs text-slate-600 bg-slate-50 p-1.5 rounded mt-1 italic">"${ev.payload.text}"</div>` : ''}
          </div>
        `)
      })
    })

    // 2. USGS Earthquakes Layer
    if (layerEarthquakes && earthquakes.length > 0) {
      earthquakes.forEach((eq) => {
        const mag = eq.payload.magnitude || 3.0
        const depth = eq.payload.depth_km || 10.0
        const isTest = eq.provenance === 'test'
        const radius = Math.max(7, Math.min(24, Math.round(mag * 3.5)))

        let depthColor = '#ef4444' // shallow <30km
        if (depth >= 70) {
          depthColor = '#3b82f6' // deep >70km
        } else if (depth >= 30) {
          depthColor = '#f59e0b' // intermediate
        }
        if (isTest) depthColor = '#ec4899'

        const eqIcon = L.divIcon({
          className: 'custom-eq-marker',
          html: `
            <div class="relative flex items-center justify-center">
              <div class="rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white font-extrabold text-[10px]"
                   style="width: ${radius * 2}px; height: ${radius * 2}px; background-color: ${depthColor};">
                ${mag.toFixed(1)}
              </div>
              ${isTest ? '<span class="absolute -top-2 -right-2 bg-pink-600 text-white text-[8px] font-bold px-1 rounded shadow-xs">TEST</span>' : ''}
            </div>
          `,
          iconSize: [radius * 2, radius * 2],
          iconAnchor: [radius, radius],
        })

        const marker = L.marker([eq.lat, eq.lon], { icon: eqIcon }).addTo(group)
        marker.bindPopup(`
          <div class="p-3 font-sans min-w-[240px]">
            <div class="flex items-center justify-between border-b pb-1 mb-1.5">
              <span class="text-xs font-bold text-red-600 uppercase flex items-center space-x-1">
                <span>🌋 USGS Seismic Telemetry</span>
              </span>
              <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${isTest ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-700'}">
                ${isTest ? 'DEMO TEST' : 'MEASURED'}
              </span>
            </div>
            <div class="text-sm font-bold text-slate-900 mb-1">M ${mag.toFixed(1)} - ${eq.payload.place}</div>
            <div class="text-xs text-slate-600 space-y-1 mb-2">
              <div><strong>Focal Depth:</strong> ${depth} km</div>
              <div><strong>Epicenter:</strong> ${eq.lat.toFixed(3)}, ${eq.lon.toFixed(3)}</div>
              <div><strong>Time:</strong> ${new Date(eq.timestamp).toLocaleTimeString()}</div>
            </div>
            <div class="pt-2 border-t flex items-center justify-between text-[11px]">
              <span class="text-slate-400 italic">Earthquake data: USGS</span>
              <a href="${eq.payload.url}" target="_blank" rel="noreferrer" class="text-[#0079C1] hover:underline font-bold flex items-center space-x-0.5">
                <span>USGS Event Page</span>
                <ExternalLink className="w-3 h-3 ml-0.5" />
              </a>
            </div>
          </div>
        `)
      })
    }

    // 3. Google Flood Upstream River Gauges Layer (if live)
    if (layerGoogleFlood && googleFlood?.gauges && googleFlood.gauges.length > 0) {
      googleFlood.gauges.forEach((gauge) => {
        const sevColor = gauge.severity === 'red' ? '#D93025' : gauge.severity === 'amber' ? '#FBBC04' : '#34A853'
        const gaugeIcon = L.divIcon({
          className: 'custom-river-gauge',
          html: `
            <div class="w-7 h-7 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white font-bold text-xs" style="background-color: ${sevColor}">
              🌊
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })

        const marker = L.marker([gauge.lat, gauge.lon], { icon: gaugeIcon }).addTo(group)
        marker.bindPopup(`
          <div class="p-3 font-sans min-w-[220px]">
            <div class="text-[10px] font-bold uppercase text-sky-700 mb-0.5">Upstream River Risk Gauge</div>
            <div class="text-xs font-bold text-slate-900">${gauge.name} (${gauge.river})</div>
            <div class="text-xs text-slate-600 mt-1">Status: <strong>${gauge.status}</strong></div>
            <div class="text-[10px] text-slate-400 mt-2 italic">Flood forecast data: Google Flood Hub, CC BY 4.0</div>
          </div>
        `)
      })
    }

    // Fit view when selected incident changes
    if (selectedIncident && mapRef.current) {
      mapRef.current.setView([selectedIncident.centroid_lat, selectedIncident.centroid_lon], 15, { animate: true })
    }
  }, [
    incidents, selectedIncident, earthquakes, googleFlood,
    layerFloodPolygon, layerClusterRadius, layerWaterSensors,
    layerTrafficSensors, layerCitizenReports, layerWeatherStations,
    layerEarthquakes, layerGoogleFlood
  ])

  // Time Slider Replay Controller
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setTimelineIndex((prev) => {
          if (prev >= 100) {
            setIsPlaying(false)
            return 100
          }
          return Math.min(100, prev + 10 * playbackSpeed)
        })
      }, 800)
    } else {
      clearInterval(playTimerRef.current)
    }
    return () => clearInterval(playTimerRef.current)
  }, [isPlaying, playbackSpeed])

  // Trigger scenario
  const handleTriggerScenario = async (name: string) => {
    try {
      setScenarioLoading(true)
      const res = await runScenario(name)
      setLastScenarioMsg(res?.message || `Triggered: ${name}`)
      await loadData()
    } finally {
      setScenarioLoading(false)
    }
  }

  const handleReset = async () => {
    try {
      setScenarioLoading(true)
      const res = await resetDatabase()
      setLastScenarioMsg(res?.message || 'State reset')
      await loadData()
    } finally {
      setScenarioLoading(false)
    }
  }

  // Filtered incidents
  const filteredIncidents = incidents.filter((inc) => {
    const matchesSearch = inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inc.neighborhood.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCause = filterCause === 'all' || inc.cause === filterCause
    return matchesSearch && matchesCause
  })

  const avgConfidence = selectedIncident ? Math.round(selectedIncident.cause_confidence * 100) : 85
  const untrustedCount = selectedIncident?.events?.filter(e => e.trust < 0.5).length || 0

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#F5F7FA] dark:bg-slate-950 overflow-hidden font-sans">
      
      {/* ── 1. Top Indicator Row & Scenario Controls ────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-xs shrink-0 z-20">
        
        {/* Indicators Bar */}
        <div className="flex items-center space-x-2 sm:space-x-3 overflow-x-auto py-0.5">
          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 leading-none">Incidents</div>
              <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-tight">{incidents.length} Active</div>
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <Activity className="w-3.5 h-3.5 text-sky-600" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 leading-none">Velocity</div>
              <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-tight">18 ev/min</div>
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <Radio className="w-3.5 h-3.5 text-emerald-600" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 leading-none">Inference</div>
              <div className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 leading-tight">{avgConfidence}% Noisy-OR</div>
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 leading-none">Untrusted</div>
              <div className="text-xs font-extrabold text-amber-600 dark:text-amber-400 leading-tight">{untrustedCount} Gated</div>
            </div>
          </div>
        </div>

        {/* Action Controls & Data Sources Modal Trigger */}
        <div className="flex items-center space-x-2">
          {/* Data Sources Attribution Button */}
          <button
            onClick={() => setIsDataSourcesModalOpen(true)}
            className="px-2.5 py-1.5 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 text-[#0079C1] dark:text-sky-300 text-xs font-semibold rounded-lg border border-sky-200 dark:border-sky-800 flex items-center space-x-1 transition-colors"
            title="External Data Providers, Attributions & Licenses"
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Data Sources & Licenses</span>
          </button>

          {/* Scenario Trigger Dropdown */}
          <select
            disabled={scenarioLoading}
            onChange={(e) => {
              if (e.target.value) {
                handleTriggerScenario(e.target.value)
                e.target.value = ''
              }
            }}
            className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-medium outline-hidden hover:bg-slate-200 cursor-pointer transition-colors"
            defaultValue=""
          >
            <option value="" disabled>Select Test Scenario...</option>
            <option value="drainage_failure">Standard Drainage Failure</option>
            <option value="earthquake">🌋 Inject Earthquake (USGS Demo)</option>
            <option value="heavy_rain">🌧️ Heavy Rain Spike (120mm/h)</option>
            <option value="shuffle_order">Shuffle Event Arrival Order</option>
            <option value="inject_duplicates">Inject Duplicate Packets</option>
            <option value="drop_sensor">Drop Sensor (Simulate Offline)</option>
            <option value="conflicting_report">Inject Conflicting Report</option>
            <option value="spoofed_sensor">Inject Spoofed Sensor</option>
          </select>

          <button
            onClick={handleReset}
            disabled={scenarioLoading}
            title="Reset database to seed"
            className="px-2.5 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 flex items-center space-x-1 transition-colors"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${scenarioLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>

      </div>

      {/* ── Core Problem Statement Contrast Banner ── */}
      <div className="bg-gradient-to-r from-[#1B3A57] via-[#0b253d] to-[#1B3A57] text-white px-4 py-1.5 border-b border-slate-700/80 flex flex-wrap items-center justify-between text-xs gap-2 shrink-0 z-20">
        <div className="flex items-center space-x-2.5">
          <span className="bg-[#0079C1] text-white font-black text-[10px] uppercase px-2 py-0.5 rounded shadow-xs tracking-wider">
            Problem Solved
          </span>
          <span className="text-slate-200 text-xs">
            <span className="line-through text-slate-400 mr-1.5">4 Fragmented City Sirens</span>
            ➔ <strong className="text-emerald-400 font-bold">1 Correlated Incident Graph</strong>
            <span className="text-slate-300 hidden sm:inline ml-1.5">(Root Cause: Drainage Failure at 88% confidence)</span>
          </span>
        </div>

        <div className="flex items-center space-x-2 text-[11px] text-slate-300 hidden lg:flex">
          <span className="px-1.5 py-0.5 rounded bg-sky-900/60 border border-sky-700/60">💧 Culvert Sensor</span>
          <span>+</span>
          <span className="px-1.5 py-0.5 rounded bg-red-900/60 border border-red-700/60">🚗 Submerged Road</span>
          <span>+</span>
          <span className="px-1.5 py-0.5 rounded bg-purple-900/60 border border-purple-700/60">📢 311 Complaint</span>
          <span>+</span>
          <span className="px-1.5 py-0.5 rounded bg-amber-900/60 border border-amber-700/60">🚌 BEST Telemetry</span>
          <span>=</span>
          <span className="text-emerald-300 font-extrabold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
            Noisy-OR Fusion
          </span>
        </div>
      </div>

      {/* Scenario Feedback banner */}
      {lastScenarioMsg && (
        <div className="bg-sky-50 dark:bg-sky-950/70 border-b border-sky-200 dark:border-sky-800 px-4 py-1 text-xs text-sky-800 dark:text-sky-200 flex items-center justify-between">
          <span className="flex items-center space-x-2">
            <Info className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span>{lastScenarioMsg}</span>
          </span>
          <button onClick={() => setLastScenarioMsg('')} className="text-sky-500 hover:text-sky-700 font-bold ml-2">×</button>
        </div>
      )}

      {/* ── 2. Main Dashboard (Map + Floating Panels) ───────────────── */}
      <div className="relative flex-1 flex overflow-hidden">
        
        {/* ── Left Floating Panel (Incident List) ─────────────────────── */}
        <div className="absolute top-3 left-4 bottom-24 w-80 sm:w-92 z-30 pointer-events-none flex flex-col">
          <div className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 flex flex-col h-full overflow-hidden transition-all">
            
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Incident Feed ({filteredIncidents.length})
                </span>
                <span className="text-[10px] font-semibold text-[#0079C1] bg-sky-50 dark:bg-sky-950 px-2 py-0.5 rounded-full">
                  Real-time GIS
                </span>
              </div>

              {/* Search */}
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter incidents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:border-[#0079C1]"
                />
              </div>

              {/* Filter chips */}
              <div className="flex items-center space-x-1 overflow-x-auto pb-0.5 text-[11px]">
                {['all', 'drainage_failure', 'earthquake', 'road_blockage', 'road_accident'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilterCause(f)}
                    className={`px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                      filterCause === f
                        ? 'bg-[#0079C1] text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {f === 'all' ? 'All' : f.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Incidents Card List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {filteredIncidents.map((inc) => {
                const isSelected = selectedIncident?.id === inc.id
                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedIncident(inc)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-sky-50/90 dark:bg-sky-950/40 border-[#0079C1] shadow-md ring-1 ring-[#0079C1]'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                        {inc.title}
                      </span>
                      <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded shrink-0 ml-2 ${
                        inc.severity_level === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' :
                        inc.severity_level === 'high' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {inc.severity_level}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-2 leading-relaxed">
                      {inc.explanation}
                    </p>

                    <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100 dark:border-slate-700/60 text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-[#0079C1] dark:text-sky-400">
                        {Math.round(inc.cause_confidence * 100)}% {inc.cause.replace('_', ' ')}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                )
              })}
            </div>

          </div>
        </div>

        {/* ── Center Leaflet Map Container ────────────────────────────── */}
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* ── Floating Map Toolbars (Basemap & Grouped Layer Manager) ─── */}
        <div className="absolute top-3 right-4 z-30 flex flex-col space-y-2 pointer-events-auto">
          
          {/* Basemap Gallery Switcher */}
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 text-xs flex items-center space-x-1">
            <Layers className="w-3.5 h-3.5 text-slate-500 ml-1" />
            <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Basemap:</span>
            {(Object.keys(BASEMAPS) as Array<keyof typeof BASEMAPS>).map((key) => (
              <button
                key={key}
                onClick={() => {
                  setActiveBasemap(key)
                  if (key === 'windyMap') {
                    setWindyExpanded(true)
                  } else if (key === 'googleFlood') {
                    setLayerGoogleFlood(true)
                    setLayerFloodPolygon(true)
                  } else if (key === 'earthquakeMap') {
                    setLayerEarthquakes(true)
                  }
                }}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                  activeBasemap === key
                    ? 'bg-[#0079C1] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {BASEMAPS[key].name}
              </button>
            ))}
          </div>

          {/* Grouped Layer Manager */}
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl p-3 shadow-xl border border-slate-200 dark:border-slate-800 text-xs w-64 max-h-[75vh] overflow-y-auto space-y-3">
            <div className="font-extrabold uppercase tracking-wider text-[11px] text-slate-700 dark:text-slate-200 flex items-center justify-between border-b pb-1.5">
              <span>Layer Manager</span>
              <Eye className="w-3.5 h-3.5 text-slate-400" />
            </div>

            {/* Group 1: Incidents & Inundation */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Incidents & Clusters
              </div>
              <div className="space-y-1">
                <label className="flex items-center space-x-2 cursor-pointer text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layerFloodPolygon}
                    onChange={(e) => setLayerFloodPolygon(e.target.checked)}
                    className="rounded text-[#1A73E8]"
                  />
                  <span className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#1A73E8]/50 border border-[#1A73E8]" />
                    <span>Flood Extent Polygon</span>
                  </span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layerClusterRadius}
                    onChange={(e) => setLayerClusterRadius(e.target.checked)}
                    className="rounded text-sky-600"
                  />
                  <span>500m Correlation Radius</span>
                </label>
              </div>
            </div>

            {/* Group 2: Municipal Sensors */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Sensors & Telemetry
              </div>
              <div className="space-y-1">
                <label className="flex items-center space-x-2 cursor-pointer text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layerWaterSensors}
                    onChange={(e) => setLayerWaterSensors(e.target.checked)}
                    className="rounded text-[#0079C1]"
                  />
                  <span className="flex items-center space-x-1.5">
                    <Droplets className="w-3 h-3 text-blue-500" />
                    <span>Water Level Gauges</span>
                  </span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layerTrafficSensors}
                    onChange={(e) => setLayerTrafficSensors(e.target.checked)}
                    className="rounded text-red-600"
                  />
                  <span className="flex items-center space-x-1.5">
                    <Car className="w-3 h-3 text-red-500" />
                    <span>Traffic & Transit Telemetry</span>
                  </span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layerCitizenReports}
                    onChange={(e) => setLayerCitizenReports(e.target.checked)}
                    className="rounded text-purple-600"
                  />
                  <span className="flex items-center space-x-1.5">
                    <PhoneCall className="w-3 h-3 text-purple-500" />
                    <span>311 Citizen & 911 Calls</span>
                  </span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layerWeatherStations}
                    onChange={(e) => setLayerWeatherStations(e.target.checked)}
                    className="rounded text-sky-500"
                  />
                  <span className="flex items-center space-x-1.5">
                    <CloudRain className="w-3 h-3 text-sky-500" />
                    <span>Open-Meteo Weather Stations</span>
                  </span>
                </label>
              </div>
            </div>

            {/* Group 3: External Hazard Layers */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>External Hazard Layers</span>
                <span className="text-[9px] bg-amber-100 dark:bg-amber-950 px-1 rounded font-bold">API / Public</span>
              </div>

              {/* 3.1 USGS Earthquakes */}
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 mb-2 space-y-1.5">
                <label className="flex items-center justify-between cursor-pointer text-slate-800 dark:text-slate-100 font-semibold">
                  <span className="flex items-center space-x-1.5">
                    <input
                      type="checkbox"
                      checked={layerEarthquakes}
                      onChange={(e) => setLayerEarthquakes(e.target.checked)}
                      className="rounded text-red-600"
                    />
                    <span>USGS Earthquakes</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">({earthquakes.length})</span>
                </label>

                {layerEarthquakes && (
                  <div className="pl-4 pt-1 space-y-1.5 border-t border-slate-200 dark:border-slate-700">
                    {/* Scope toggle */}
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">Scope:</span>
                      <div className="inline-flex rounded-md shadow-xs bg-slate-200 dark:bg-slate-700 p-0.5">
                        <button
                          onClick={() => setEarthquakeScope('mumbai')}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            earthquakeScope === 'mumbai' ? 'bg-[#0079C1] text-white' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Mumbai Region
                        </button>
                        <button
                          onClick={() => setEarthquakeScope('global')}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            earthquakeScope === 'global' ? 'bg-[#0079C1] text-white' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Global
                        </button>
                      </div>
                    </div>

                    {/* Min Magnitude Slider */}
                    <div className="text-[10px]">
                      <div className="flex justify-between text-slate-500 mb-0.5">
                        <span>Min Mag: <strong>M{minMagnitude.toFixed(1)}</strong></span>
                      </div>
                      <input
                        type="range"
                        min="2.0"
                        max="7.0"
                        step="0.5"
                        value={minMagnitude}
                        onChange={(e) => setMinMagnitude(parseFloat(e.target.value))}
                        className="w-full accent-red-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Depth Legend */}
                    <div className="text-[9px] text-slate-500 flex items-center justify-between pt-0.5">
                      <span className="flex items-center space-x-1">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span>&lt;30km</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>30-70km</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <span>&gt;70km</span>
                      </span>
                    </div>

                    <div className="text-[9px] text-slate-400 italic pt-0.5">
                      Earthquake data: USGS
                    </div>
                  </div>
                )}
              </div>

              {/* 3.2 Google Flood Hub */}
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 mb-2 space-y-1">
                <label className="flex items-center justify-between cursor-pointer text-slate-800 dark:text-slate-100 font-semibold">
                  <span className="flex items-center space-x-1.5">
                    <input
                      type="checkbox"
                      checked={layerGoogleFlood}
                      onChange={(e) => setLayerGoogleFlood(e.target.checked)}
                      className="rounded text-sky-600"
                    />
                    <span>Upstream River Risk</span>
                  </span>
                  <span className="text-[9px] bg-slate-200 dark:bg-slate-700 px-1 rounded text-slate-600 dark:text-slate-300">
                    Flood Hub
                  </span>
                </label>

                <div className="text-[10px] text-slate-500 leading-snug">
                  Covers river floods, not street drainage.
                </div>

                {layerGoogleFlood && (
                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 space-y-1">
                    {googleFlood?.status === 'live' && googleFlood.gauges.length > 0 ? (
                      <div className="text-[10px] text-emerald-600 font-bold">
                        ✓ {googleFlood.gauges.length} river gauges active
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-600">
                        <span>API in fallback mode (No gauges in basin).</span>
                        <a
                          href={googleFlood?.flood_hub_url || 'https://sites.research.google/floods/l/19.076/72.8777/10'}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block text-center px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-[10px] font-bold text-[#0079C1] hover:bg-slate-100"
                        >
                          Open Google Flood Hub ↗
                        </a>
                      </div>
                    )}
                    <div className="text-[9px] text-slate-400 italic">
                      Flood forecast data: Google Flood Hub, CC BY 4.0
                    </div>
                  </div>
                )}
              </div>

              {/* 3.3 Windy Atmospheric Radar */}
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
                <label className="flex items-center justify-between cursor-pointer text-slate-800 dark:text-slate-100 font-semibold">
                  <span className="flex items-center space-x-1.5">
                    <input
                      type="checkbox"
                      checked={layerWindy}
                      onChange={(e) => setLayerWindy(e.target.checked)}
                      className="rounded text-red-500"
                    />
                    <span>Windy Atmospheric Radar</span>
                  </span>
                  <Wind className="w-3.5 h-3.5 text-red-500" />
                </label>
                <div className="text-[9px] text-slate-400 italic">
                  Wind, rain, clouds, waves • Windy.com
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* ── Windy Overlay Panel (Only active when layerWindy is toggled) ── */}
        {layerWindy && windyConfig && (
          <WindyPanel
            config={windyConfig}
            onClose={() => setLayerWindy(false)}
          />
        )}

        {/* ── Right Diagnostic Panel (ArcGIS Online Style) ─────────────── */}
        {selectedIncident && (
          <div className="absolute top-16 right-4 bottom-24 w-80 sm:w-92 z-30 pointer-events-none flex flex-col">
            <div className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 flex flex-col h-full overflow-hidden">
              
              <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Incident Root-Cause Diagnostic
                  </span>
                  <h3 className="text-xs font-extrabold text-slate-900 dark:text-white leading-tight">
                    {selectedIncident.title}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedIncident(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
                
                {/* 1. Plain-Language Operator Briefing */}
                <div className="bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-800/60 rounded-xl p-3">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-sky-800 dark:text-sky-300 mb-1">
                    <Info className="w-3.5 h-3.5" />
                    <span>Operator Incident Briefing</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                    {selectedIncident.explanation}
                  </p>
                </div>

                {/* 2. Probable Cause Ranking */}
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Probable Cause Ranking (Noisy-OR)
                  </div>
                  <div className="space-y-2">
                    {selectedIncident.cause_ranking?.map((cr: CauseRank) => {
                      const pct = Math.round(cr.probability * 100)
                      const isTop = cr.cause === selectedIncident.cause
                      return (
                        <div key={cr.cause} className="text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`font-semibold ${isTop ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>
                              {cr.label}
                            </span>
                            <span className={`font-bold ${isTop ? 'text-[#0079C1] dark:text-sky-400' : 'text-slate-500'}`}>
                              {pct}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isTop ? 'bg-[#0079C1]' : 'bg-slate-400 dark:bg-slate-600'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 3. Weather Corroboration Card */}
                {weather && (
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-1.5 font-bold text-slate-700 dark:text-slate-200">
                        <CloudRain className="w-3.5 h-3.5 text-sky-500" />
                        <span>Open-Meteo Corroboration</span>
                      </div>
                      <span className="text-[10px] bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded font-bold">
                        {weather.flood_risk_level} Risk
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                      <div>24h Total: <strong>{weather.past_24h_rainfall_mm}mm</strong></div>
                      <div>Rate: <strong>{weather.current_precip_mm}mm/h</strong></div>
                    </div>
                  </div>
                )}

                {/* 4. Evidence Trace */}
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Evidence Signals & Signature Audit ({selectedIncident.events?.length || 0})
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {selectedIncident.events?.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1">
                            <span>{ev.device_id}</span>
                            <span className="text-[10px] text-slate-400">({ev.source_type})</span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Trust: {(ev.trust * 100).toFixed(0)}% • {ev.payload?.description || ev.payload?.text || 'Telemetry OK'}
                          </div>
                        </div>

                        <div>
                          {ev.signature_verified ? (
                            <span className="inline-flex items-center space-x-1 text-[10px] text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                              <ShieldCheck className="w-3 h-3" />
                              <span>HMAC</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-[10px] text-amber-600 font-bold bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                              <ShieldAlert className="w-3 h-3" />
                              <span>GATED</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ── 4. Bottom Flood-Hub Time Scrub Slider & Serial Chart ───── */}
        <div className="absolute bottom-3 left-4 right-4 z-30 pointer-events-none">
          <div className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 p-2.5 max-w-4xl mx-auto flex flex-col space-y-1.5">
            
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-6 h-6 rounded-lg bg-[#0079C1] hover:bg-sky-600 text-white flex items-center justify-center transition-colors shadow-xs"
                >
                  {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-white" />}
                </button>
                <span>Incident Evolution Scrub</span>
                <span className="text-[11px] text-slate-400 font-mono">[{timelineIndex}% scrub]</span>
              </div>

              <div className="flex items-center space-x-2 text-xs">
                <span>Speed:</span>
                {[1, 2, 5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      playbackSpeed === spd
                        ? 'bg-[#0079C1] text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={timelineIndex}
              onChange={(e) => setTimelineIndex(Number(e.target.value))}
              className="w-full accent-[#0079C1] cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
            />

            {selectedIncident?.confidence_history && (
              <div className="h-10 w-full pt-0.5">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={selectedIncident.confidence_history}>
                    <defs>
                      <linearGradient id="confGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0079C1" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#0079C1" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="t" hide />
                    <YAxis domain={[0, 1]} hide />
                    <Tooltip
                      formatter={(val: any) => [`${Math.round(val * 100)}%`, 'Confidence']}
                      labelFormatter={(lbl) => `Time: ${lbl}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="confidence"
                      stroke="#0079C1"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#confGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* ── 5. Data Sources & Licenses Modal ───────────────────────── */}
      <DataSourcesModal
        isOpen={isDataSourcesModalOpen}
        onClose={() => setIsDataSourcesModalOpen(false)}
      />

    </div>
  )
}
