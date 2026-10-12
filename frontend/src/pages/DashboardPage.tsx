import React, { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import {
  Activity, AlertTriangle, ShieldCheck, ShieldAlert, CloudRain, Filter,
  Play, Pause, RotateCcw, ChevronRight, CheckCircle2, XCircle, Search,
  Sliders, Layers, Navigation, Info, Eye, Droplets, Car, Bus, PhoneCall,
  UserCheck, AlertOctagon, RefreshCw, BarChart3, TrendingUp, Maximize2
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, AreaChart, Area
} from 'recharts'
import type { Incident, EventItem, SourceItem, WeatherMetrics, CauseRank } from '../types'
import { fetchIncidents, fetchWeather, fetchSources, runScenario, resetDatabase } from '../api'

// Basemap URLs
const BASEMAPS = {
  cartoLight: {
    name: 'CARTO Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
  esriStreets: {
    name: 'Esri Streets',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  esriSatellite: {
    name: 'Esri Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  cartoDark: {
    name: 'CARTO Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
}

export const DashboardPage: React.FC = () => {
  // State
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [weather, setWeather] = useState<WeatherMetrics | null>(null)
  const [sources, setSources] = useState<SourceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [lastScenarioMsg, setLastScenarioMsg] = useState<string>('')

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCause, setFilterCause] = useState<string>('all')

  // Map state
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const layersGroupRef = useRef<L.LayerGroup | null>(null)
  const [activeBasemap, setActiveBasemap] = useState<keyof typeof BASEMAPS>('cartoLight')

  // Layer toggles
  const [layerFloodPolygon, setLayerFloodPolygon] = useState(true)
  const [layerClusterRadius, setLayerClusterRadius] = useState(true)
  const [layerWaterSensors, setLayerWaterSensors] = useState(true)
  const [layerTrafficSensors, setLayerTrafficSensors] = useState(true)
  const [layerCitizenReports, setLayerCitizenReports] = useState(true)
  const [layerWeatherStations, setLayerWeatherStations] = useState(true)

  // Replay Time Slider state
  const [timelineIndex, setTimelineIndex] = useState<number>(100)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1)
  const playTimerRef = useRef<any>(null)

  // Load Data
  const loadData = async () => {
    try {
      setLoading(true)
      const [incData, wData, sData] = await Promise.all([
        fetchIncidents(),
        fetchWeather(),
        fetchSources(),
      ])
      setIncidents(incData)
      if (incData.length > 0 && !selectedIncident) {
        setSelectedIncident(incData[0])
      } else if (selectedIncident) {
        const updated = incData.find(i => i.id === selectedIncident.id) || incData[0]
        setSelectedIncident(updated)
      }
      setWeather(wData)
      setSources(sData)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return
    if (mapRef.current) return

    // Mumbai default center (around Hindmata)
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

  // Update Map Layers whenever incident, filter, or toggles change
  useEffect(() => {
    if (!mapRef.current || !layersGroupRef.current) return

    const group = layersGroupRef.current
    group.clearLayers()

    // Render all incidents or selected incident
    incidents.forEach((inc) => {
      const isSelected = selectedIncident?.id === inc.id
      const events = inc.events || []

      // 1. Cluster radius circle
      if (layerClusterRadius) {
        L.circle([inc.centroid_lat, inc.centroid_lon], {
          radius: inc.radius_m || 450,
          color: '#0079C1',
          weight: 1.5,
          dashArray: '4, 6',
          fillColor: '#0079C1',
          fillOpacity: 0.06,
        }).addTo(group)
      }

      // 2. Flood Extent Polygon
      if (layerFloodPolygon && inc.flood_polygon && inc.flood_polygon.length > 0) {
        // GeoJSON [lon, lat] converted to Leaflet [lat, lon]
        const latLngs = inc.flood_polygon.map((p: [number, number]) => [p[1], p[0]] as [number, number])
        const polygon = L.polygon(latLngs, {
          color: '#1A73E8',
          weight: 2,
          fillColor: '#1A73E8',
          fillOpacity: 0.35,
        }).addTo(group)

        polygon.bindPopup(`
          <div class="p-3 font-sans">
            <div class="text-xs font-bold text-sky-700 uppercase tracking-wider mb-1">Flood Extent Inundation</div>
            <div class="text-sm font-semibold text-slate-800">${inc.neighborhood || 'Hindmata Zone'}</div>
            <div class="text-xs text-slate-600 mt-1">Waterlogging depth: 40-78cm above street datum. Storm culverts overflowing.</div>
          </div>
        `)
      }

      // 3. Incident centroid pulsing marker
      const pulseClass = inc.severity_level === 'critical' ? 'pulse-critical' : 'pulse-amber'
      const centroidIcon = L.divIcon({
        className: 'custom-centroid-marker',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="w-8 h-8 rounded-full bg-red-600 border-2 border-white shadow-xl flex items-center justify-center text-white font-bold text-xs ${pulseClass}">
              !
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
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

      // 4. Events markers
      events.forEach((ev) => {
        let shouldRender = false
        if (ev.source_type === 'water_level' && layerWaterSensors) shouldRender = true
        if ((ev.source_type === 'road_sensor' || ev.source_type === 'transit') && layerTrafficSensors) shouldRender = true
        if ((ev.source_type === 'citizen_report' || ev.source_type === 'emergency_call') && layerCitizenReports) shouldRender = true
        if (ev.source_type === 'weather' && layerWeatherStations) shouldRender = true

        if (!shouldRender) return

        let color = '#0079C1'
        let label = 'EV'
        let valText = ''

        if (ev.source_type === 'water_level') {
          color = '#1A73E8'
          label = '💧'
          valText = `${ev.payload?.value || 0}cm`
        } else if (ev.source_type === 'road_sensor') {
          color = '#D93025'
          label = '🚗'
          valText = ev.payload?.status || 'alert'
        } else if (ev.source_type === 'transit') {
          color = '#FBBC04'
          label = '🚌'
          valText = `${ev.payload?.value || 0}km/h`
        } else if (ev.source_type === 'citizen_report') {
          color = '#9333ea'
          label = '📢'
          valText = '311'
        } else if (ev.source_type === 'emergency_call') {
          color = '#e11d48'
          label = '🚨'
          valText = '911'
        } else if (ev.source_type === 'weather') {
          color = '#0284c7'
          label = '🌧️'
          valText = `${ev.payload?.value || 0}mm`
        }

        const evIcon = L.divIcon({
          className: 'custom-event-marker',
          html: `
            <div class="px-2 py-1 rounded-full shadow-md border border-white text-white font-bold text-[10px] flex items-center space-x-1 whitespace-nowrap" style="background-color: ${color}">
              <span>${label}</span>
              <span>${valText}</span>
            </div>
          `,
          iconSize: [40, 20],
          iconAnchor: [20, 10],
        })

        const marker = L.marker([ev.lat, ev.lon], { icon: evIcon }).addTo(group)
        marker.bindPopup(`
          <div class="p-3 font-sans min-w-[220px]">
            <div class="flex items-center justify-between border-b pb-1.5 mb-1.5">
              <span class="text-xs font-bold uppercase text-slate-700">${ev.source_type.replace('_', ' ')}</span>
              <span class="text-[11px] px-1.5 py-0.5 rounded font-mono ${ev.signature_verified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                ${ev.signature_verified ? 'HMAC OK' : 'NO HMAC'}
              </span>
            </div>
            <div class="text-xs text-slate-800 mb-1"><strong>Device:</strong> ${ev.device_id || 'Unknown'}</div>
            <div class="text-xs text-slate-800 mb-1"><strong>Trust Score:</strong> ${(ev.trust * 100).toFixed(0)}%</div>
            ${ev.payload?.description ? `<div class="text-xs text-slate-600 bg-slate-50 p-1.5 rounded mt-1 italic">"${ev.payload.description}"</div>` : ''}
            ${ev.payload?.text ? `<div class="text-xs text-slate-600 bg-slate-50 p-1.5 rounded mt-1 italic">"${ev.payload.text}"</div>` : ''}
          </div>
        `)
      })
    })

    // Auto-fit bounds if selected incident changes
    if (selectedIncident && mapRef.current) {
      mapRef.current.setView([selectedIncident.centroid_lat, selectedIncident.centroid_lon], 15, { animate: true })
    }
  }, [
    incidents, selectedIncident, layerFloodPolygon, layerClusterRadius,
    layerWaterSensors, layerTrafficSensors, layerCitizenReports, layerWeatherStations
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

  // Run a named scenario
  const handleTriggerScenario = async (name: string) => {
    try {
      setScenarioLoading(true)
      const res = await runScenario(name)
      setLastScenarioMsg(res?.message || `Triggered scenario: ${name}`)
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

  // Calculate Indicator Widgets
  const totalEvents = selectedIncident?.events?.length || 0
  const avgConfidence = selectedIncident ? Math.round(selectedIncident.cause_confidence * 100) : 85
  const untrustedCount = selectedIncident?.events?.filter(e => e.trust < 0.5).length || 0
  const duplicatesCount = selectedIncident?.events?.filter(e => e.is_duplicate).length || 0

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#F5F7FA] dark:bg-slate-950 overflow-hidden font-sans">
      
      {/* ── 1. Top Indicator Row (Esri ArcGIS Dashboards Style) ──────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs shrink-0 z-20">
        
        {/* Indicators Bar */}
        <div className="flex items-center space-x-2 sm:space-x-4 overflow-x-auto py-0.5">
          {/* Active Incidents */}
          <div className="flex items-center space-x-2.5 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 leading-none">Active Incidents</div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">{incidents.length} Critical</div>
            </div>
          </div>

          {/* Ingestion Rate */}
          <div className="flex items-center space-x-2.5 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <Activity className="w-4 h-4 text-sky-600" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 leading-none">Ingestion Velocity</div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">18 events / min</div>
            </div>
          </div>

          {/* Average Confidence */}
          <div className="flex items-center space-x-2.5 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 leading-none">Inference Confidence</div>
              <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 leading-tight">{avgConfidence}% Noisy-OR</div>
            </div>
          </div>

          {/* Untrusted Sources Flagged */}
          <div className="flex items-center space-x-2.5 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 leading-none">Untrusted / Tampered</div>
              <div className="text-sm font-extrabold text-amber-600 dark:text-amber-400 leading-tight">{untrustedCount} Gated</div>
            </div>
          </div>

          {/* Duplicates Dropped */}
          <div className="hidden lg:flex items-center space-x-2.5 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <CheckCircle2 className="w-4 h-4 text-slate-400" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 leading-none">Deduplicated</div>
              <div className="text-sm font-extrabold text-slate-700 dark:text-slate-300 leading-tight">3 Packets</div>
            </div>
          </div>
        </div>

        {/* Scenario Injection Action Controls */}
        <div className="flex items-center space-x-2">
          <div className="text-xs font-semibold text-slate-500 hidden xl:block">Test Scenarios:</div>
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
            <option value="" disabled>Select Injection Scenario...</option>
            <option value="drainage_failure">Standard Drainage Failure</option>
            <option value="heavy_rain">🌧️ Heavy Rain Spike (120mm/hr)</option>
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

      {/* Scenario Feedback banner */}
      {lastScenarioMsg && (
        <div className="bg-sky-50 dark:bg-sky-950/70 border-b border-sky-200 dark:border-sky-800 px-4 py-1.5 text-xs text-sky-800 dark:text-sky-200 flex items-center justify-between">
          <span className="flex items-center space-x-2">
            <Info className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span>{lastScenarioMsg}</span>
          </span>
          <button onClick={() => setLastScenarioMsg('')} className="text-sky-500 hover:text-sky-700 font-bold ml-2">×</button>
        </div>
      )}

      {/* ── 2. Main Dashboard Layout (Full Bleed Map + Left/Right Floating Panels) ── */}
      <div className="relative flex-1 flex overflow-hidden">
        
        {/* ── Left Floating Panel (Google Flood Hub style) ─────────────── */}
        <div className="absolute top-4 left-4 bottom-24 w-80 sm:w-96 z-30 pointer-events-none flex flex-col">
          <div className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 flex flex-col h-full overflow-hidden transition-all">
            
            {/* Header & Search */}
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Fused Incidents ({filteredIncidents.length})
                </span>
                <span className="text-[11px] font-semibold text-[#0079C1] bg-sky-50 dark:bg-sky-950 px-2 py-0.5 rounded-full">
                  Real-time GIS
                </span>
              </div>

              {/* Search Bar */}
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search incidents, streets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:border-[#0079C1]"
                />
              </div>

              {/* Filter Chips */}
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5">
                {['all', 'drainage_failure', 'road_blockage', 'road_accident'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilterCause(f)}
                    className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap transition-colors ${
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
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {filteredIncidents.map((inc) => {
                const isSelected = selectedIncident?.id === inc.id
                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedIncident(inc)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-sky-50/90 dark:bg-sky-950/40 border-[#0079C1] shadow-md ring-1 ring-[#0079C1]'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                        {inc.title}
                      </span>
                      <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded shrink-0 ml-2 ${
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

                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 dark:border-slate-700/60 text-slate-600 dark:text-slate-300">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold text-[#0079C1] dark:text-sky-400">
                          {Math.round(inc.cause_confidence * 100)}% Conf.
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <span>{inc.events?.length || 0} signals</span>
                      </div>
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

        {/* ── Floating Map Toolbars (Basemap Gallery & Layer Toggles) ─── */}
        <div className="absolute top-4 right-4 z-30 flex flex-col space-y-2 pointer-events-auto">
          
          {/* Basemap Switcher Widget */}
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl p-2 shadow-lg border border-slate-200 dark:border-slate-800 text-xs flex items-center space-x-1">
            <Layers className="w-4 h-4 text-slate-500 ml-1" />
            <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">Basemap:</span>
            {(Object.keys(BASEMAPS) as Array<keyof typeof BASEMAPS>).map((key) => (
              <button
                key={key}
                onClick={() => setActiveBasemap(key)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  activeBasemap === key
                    ? 'bg-[#0079C1] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {BASEMAPS[key].name}
              </button>
            ))}
          </div>

          {/* Layer Visibility Toggles */}
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl p-3 shadow-lg border border-slate-200 dark:border-slate-800 text-xs w-52">
            <div className="font-bold uppercase tracking-wider text-[10px] text-slate-400 mb-2 flex items-center justify-between">
              <span>GIS Layers</span>
              <Eye className="w-3 h-3 text-slate-400" />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center space-x-2 cursor-pointer text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={layerFloodPolygon}
                  onChange={(e) => setLayerFloodPolygon(e.target.checked)}
                  className="rounded text-[#1A73E8]"
                />
                <span className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded-xs bg-[#1A73E8]/40 border border-[#1A73E8]" />
                  <span>Flood Extent Polygon</span>
                </span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={layerWaterSensors}
                  onChange={(e) => setLayerWaterSensors(e.target.checked)}
                  className="rounded text-[#0079C1]"
                />
                <span className="flex items-center space-x-1.5">
                  <Droplets className="w-3.5 h-3.5 text-blue-500" />
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
                  <Car className="w-3.5 h-3.5 text-red-500" />
                  <span>Traffic & Transit</span>
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
                  <PhoneCall className="w-3.5 h-3.5 text-purple-500" />
                  <span>311 Citizen & Calls</span>
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
                  <CloudRain className="w-3.5 h-3.5 text-sky-500" />
                  <span>Open-Meteo Stations</span>
                </span>
              </label>
            </div>
          </div>

        </div>

        {/* ── Right Details Panel (ArcGIS Online Details Widget) ───────── */}
        {selectedIncident && (
          <div className="absolute top-20 right-4 bottom-24 w-80 sm:w-96 z-30 pointer-events-none flex flex-col">
            <div className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 flex flex-col h-full overflow-hidden">
              
              {/* Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Incident Root-Cause Diagnostic
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
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

              {/* Scrollable details */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {/* 1. Plain-Language Operator Briefing */}
                <div className="bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-800/60 rounded-xl p-3">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-sky-800 dark:text-sky-300 mb-1">
                    <Info className="w-4 h-4" />
                    <span>Plain-Language Operator Briefing</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {selectedIncident.explanation}
                  </p>
                </div>

                {/* 2. Probable-Cause Ranking (Horizontal Bars) */}
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
                          <div className="flex items-center justify-between mb-1">
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
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                        <CloudRain className="w-4 h-4 text-sky-500" />
                        <span>Open-Meteo Radar Corroboration</span>
                      </div>
                      <span className="text-[10px] bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded font-bold">
                        {weather.flood_risk_level} Risk
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <div>Past 24h: <strong>{weather.past_24h_rainfall_mm} mm</strong></div>
                      <div>Current Rate: <strong>{weather.current_precip_mm} mm/h</strong></div>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 italic">
                      "{weather.advisory}"
                    </p>
                  </div>
                )}

                {/* 4. Evidence Trace & Cryptographic Verification */}
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Evidence Signals & Signature Audit ({selectedIncident.events?.length || 0})
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
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
                            Trust: {(ev.trust * 100).toFixed(0)}% • {ev.payload?.value ? `${ev.payload.value} ${ev.payload?.unit || ''}` : ev.payload?.description || 'Signal registered'}
                          </div>
                        </div>

                        <div>
                          {ev.signature_verified ? (
                            <span className="inline-flex items-center space-x-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                              <ShieldCheck className="w-3 h-3" />
                              <span>HMAC</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
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

        {/* ── 3. Bottom Flood-Hub Time Slider & Serial Charts ─────────── */}
        <div className="absolute bottom-3 left-4 right-4 z-30 pointer-events-none">
          <div className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 p-3 max-w-4xl mx-auto flex flex-col space-y-2">
            
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-7 h-7 rounded-lg bg-[#0079C1] hover:bg-sky-600 text-white flex items-center justify-center transition-colors shadow-xs"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                </button>
                <span>Incident Evolution Scrub</span>
                <span className="text-[11px] text-slate-400 font-mono">[{timelineIndex}% timestamp]</span>
              </div>

              <div className="flex items-center space-x-3 text-xs">
                <span>Speed:</span>
                {[1, 2, 5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
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

            {/* Slider track */}
            <input
              type="range"
              min="0"
              max="100"
              value={timelineIndex}
              onChange={(e) => setTimelineIndex(Number(e.target.value))}
              className="w-full accent-[#0079C1] cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
            />

            {/* Serial mini-chart: Confidence Over Time */}
            {selectedIncident?.confidence_history && (
              <div className="h-14 w-full pt-1">
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

    </div>
  )
}
