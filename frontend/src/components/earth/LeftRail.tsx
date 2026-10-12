import React, { useState, useEffect } from 'react'
import {
  AlertTriangle,
  CloudRain,
  Waves,
  Activity,
  FlaskConical,
  FileText,
  Layers,
  X,
  ExternalLink,
  RotateCcw,
  Wind,
  Cloud,
  CheckCircle2,
  Maximize2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { V1Incident, EarthquakeItem } from '../../api'
import type { GoogleFloodResponse, DataSourceItem } from '../../types'
import {
  fetchGoogleFlood,
  fetchEarthquakes,
  fetchDataSources,
  runScenario,
  resetDatabase,
} from '../../api'
import { formatCause } from '../../utils/formatters'

interface LeftRailProps {
  incidents: V1Incident[]
  selectedIncident: V1Incident | null
  onSelectIncident: (inc: V1Incident) => void
  activeCity: string
  onSelectCity: (city: string) => void
  showInfrastructure: boolean
  onToggleInfrastructure: () => void
  showRainfall: boolean
  onToggleRainfall: () => void
  showEarthquakes: boolean
  onToggleEarthquakes: () => void
  showFloodGauges: boolean
  onToggleFloodGauges: () => void
  earthquakes: EarthquakeItem[]
  floodData: GoogleFloodResponse | null
  onRefreshIncidents?: () => void
}

type PanelType = 'incidents' | 'weather' | 'flood' | 'earthquakes' | 'scenarios' | 'sources' | 'layers' | null

export const LeftRail: React.FC<LeftRailProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  activeCity,
  onSelectCity,
  showInfrastructure,
  onToggleInfrastructure,
  showRainfall,
  onToggleRainfall,
  showEarthquakes,
  onToggleEarthquakes,
  showFloodGauges,
  onToggleFloodGauges,
  earthquakes,
  floodData,
  onRefreshIncidents,
}) => {
  const [activePanel, setActivePanel] = useState<PanelType>(null)
  const [severityFilter, setSeverityFilter] = useState<string>('all')

  // Weather overlay state
  const [weatherOverlay, setWeatherOverlay] = useState<'rain' | 'wind' | 'clouds'>('rain')
  const [isWeatherFullscreen, setIsWeatherFullscreen] = useState<boolean>(false)

  // Sources state
  const [sources, setSources] = useState<DataSourceItem[]>([])
  const [sourcesLoading, setSourcesLoading] = useState<boolean>(false)

  // Scenario execution status feedback
  const [scenarioStatus, setScenarioStatus] = useState<string | null>(null)
  const [isRunningScenario, setIsRunningScenario] = useState<boolean>(false)

  const togglePanel = (panel: PanelType) => {
    setActivePanel(prev => (prev === panel ? null : panel))
  }

  // Load sources when sources panel opened
  useEffect(() => {
    if (activePanel === 'sources' && sources.length === 0) {
      setSourcesLoading(true)
      fetchDataSources()
        .then(data => setSources(data))
        .catch(() => {})
        .finally(() => setSourcesLoading(false))
    }
  }, [activePanel, sources.length])

  // City coordinates for Windy iframe
  const cityCoords = activeCity.toLowerCase() === 'new york'
    ? { lat: 40.7128, lon: -74.0060 }
    : { lat: 19.0760, lon: 72.8777 }

  const windyUrl = `https://embed.windy.com/embed2.html?lat=${cityCoords.lat}&lon=${cityCoords.lon}&detailLat=${cityCoords.lat}&detailLon=${cityCoords.lon}&width=650&height=850&zoom=10&level=surface&overlay=${weatherOverlay}&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`

  const windyFullscreenUrl = `https://embed.windy.com/embed2.html?lat=${cityCoords.lat}&lon=${cityCoords.lon}&detailLat=${cityCoords.lat}&detailLon=${cityCoords.lon}&width=1920&height=1080&zoom=10&level=surface&overlay=${weatherOverlay}&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`

  // Scenario trigger handler
  const handleRunScenario = async (name: string, label: string) => {
    setIsRunningScenario(true)
    setScenarioStatus(`Running ${label}...`)
    try {
      await runScenario(name)
      setScenarioStatus(`Activated: ${label}`)
      if (onRefreshIncidents) onRefreshIncidents()
    } catch {
      setScenarioStatus(`Simulated: ${label}`)
    } finally {
      setIsRunningScenario(false)
      setTimeout(() => setScenarioStatus(null), 3500)
    }
  }

  const handleReset = async () => {
    setIsRunningScenario(true)
    setScenarioStatus('Resetting database...')
    try {
      await resetDatabase()
      setScenarioStatus('Database restored to default state')
      if (onRefreshIncidents) onRefreshIncidents()
    } catch {
      setScenarioStatus('Database reset simulated')
    } finally {
      setIsRunningScenario(false)
      setTimeout(() => setScenarioStatus(null), 3500)
    }
  }

  const filteredIncidents = incidents.filter(inc => {
    if (severityFilter === 'all') return true
    return (inc.severity_level || '').toLowerCase() === severityFilter.toLowerCase()
  })

  const testScenarios = [
    { id: 'drainage_failure', label: 'Drainage Failure', icon: '🌊', tooltip: 'Drainage Failure: Overwhelmed culverts & waterlogging' },
    { id: 'heavy_rain', label: 'Heavy Rain Cloudburst', icon: '🌧️', tooltip: 'Heavy Rain: Extreme cloudburst spike' },
    { id: 'shuffle_order', label: 'Shuffle Event Order', icon: '🔀', tooltip: 'Shuffle Order: Ingest telemetry out-of-order' },
    { id: 'inject_duplicates', label: 'Inject Duplicates', icon: '📋', tooltip: 'Inject Duplicates: Replicated sensor telemetry' },
    { id: 'drop_sensor', label: 'Drop / Quarantine Sensor', icon: '⚠️', tooltip: 'Drop Sensor: Flag culvert gauge as offline' },
    { id: 'conflicting_report', label: 'Conflicting Report', icon: '🗣️', tooltip: 'Conflicting Report: Contradictory eyewitness report' },
    { id: 'spoofed_sensor', label: 'Spoofed Sensor', icon: '🚫', tooltip: 'Spoofed Sensor: Invalid cryptographic signature quarantined' },
    { id: 'earthquake', label: 'Simulated Earthquake', icon: '🌋', tooltip: 'Simulated Earthquake: Seismic alert telemetry' },
  ]

  return (
    <div className="absolute top-20 left-4 z-20 flex items-start gap-3 pointer-events-auto">
      {/* 1. Thin Icon Rail */}
      <div className="flex flex-col items-center gap-2 p-2 bg-slate-950/85 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
        <button
          onClick={() => togglePanel('incidents')}
          title="Active Incidents"
          className={`p-2.5 rounded-xl transition-all duration-200 ${
            activePanel === 'incidents'
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-lg shadow-rose-950/50'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
        </button>

        <button
          onClick={() => togglePanel('weather')}
          title="Weather Radar (Windy.com)"
          className={`p-2.5 rounded-xl transition-all duration-200 ${
            activePanel === 'weather'
              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-lg shadow-sky-950/50'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <CloudRain className="w-5 h-5" />
        </button>

        <button
          onClick={() => togglePanel('flood')}
          title="Google Flood Hub"
          className={`p-2.5 rounded-xl transition-all duration-200 ${
            activePanel === 'flood'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-lg shadow-blue-950/50'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <Waves className="w-5 h-5" />
        </button>

        <button
          onClick={() => togglePanel('earthquakes')}
          title="USGS Earthquakes"
          className={`p-2.5 rounded-xl transition-all duration-200 ${
            activePanel === 'earthquakes'
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-lg shadow-orange-950/50'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <Activity className="w-5 h-5" />
        </button>

        <button
          onClick={() => togglePanel('scenarios')}
          title="Test Scenarios"
          className={`p-2.5 rounded-xl transition-all duration-200 ${
            activePanel === 'scenarios'
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-lg shadow-purple-950/50'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <FlaskConical className="w-5 h-5" />
        </button>

        <button
          onClick={() => togglePanel('sources')}
          title="Data Sources & Licenses"
          className={`p-2.5 rounded-xl transition-all duration-200 ${
            activePanel === 'sources'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-950/50'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <FileText className="w-5 h-5" />
        </button>

        <div className="w-5 h-[1px] bg-white/10 my-1" />

        <button
          onClick={() => togglePanel('layers')}
          title="Map Layers"
          className={`p-2.5 rounded-xl transition-all duration-200 ${
            activePanel === 'layers'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-lg shadow-cyan-950/50'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <Layers className="w-5 h-5" />
        </button>
      </div>

      {/* 2. Expandable Glass Panel with Framer-Motion Fade/Slide */}
      <AnimatePresence mode="wait">
        {activePanel && (
          <motion.div
            key={activePanel}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
            className={`bg-slate-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-4 text-white flex flex-col ${
              activePanel === 'weather'
                ? 'w-84 sm:w-[460px] h-[calc(100vh-6rem)]'
                : 'w-84 sm:w-96 max-h-[85vh]'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 flex-shrink-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                {activePanel === 'incidents' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
                {activePanel === 'weather' && <CloudRain className="w-4 h-4 text-sky-400" />}
                {activePanel === 'flood' && <Waves className="w-4 h-4 text-blue-400" />}
                {activePanel === 'earthquakes' && <Activity className="w-4 h-4 text-orange-400" />}
                {activePanel === 'scenarios' && <FlaskConical className="w-4 h-4 text-purple-400" />}
                {activePanel === 'sources' && <FileText className="w-4 h-4 text-emerald-400" />}
                {activePanel === 'layers' && <Layers className="w-4 h-4 text-cyan-400" />}
                <span>
                  {activePanel === 'weather' && 'Weather Radar'}
                  {activePanel === 'flood' && 'Google Flood Hub'}
                  {activePanel === 'earthquakes' && 'USGS Earthquakes'}
                  {activePanel === 'scenarios' && 'Diagnostic Scenarios'}
                  {activePanel === 'sources' && 'Data Sources & Licenses'}
                  {activePanel === 'incidents' && 'Incidents'}
                  {activePanel === 'layers' && 'Map Overlays'}
                </span>
              </h3>
              <div className="flex items-center gap-1.5">
                {activePanel === 'weather' && (
                  <button
                    onClick={() => setIsWeatherFullscreen(true)}
                    title="Expand to Fullscreen"
                    className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-[11px] font-semibold border border-white/10"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>⛶ Expand</span>
                  </button>
                )}
                <button
                  onClick={() => setActivePanel(null)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── PANEL 1: WEATHER (Windy Embed) ── */}
            {activePanel === 'weather' && (
              <div className="space-y-3 flex-1 flex flex-col min-h-0 h-full">
                {/* Overlay Toggle Buttons */}
                <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-xl text-xs font-medium flex-shrink-0">
                  <button
                    onClick={() => setWeatherOverlay('rain')}
                    className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                      weatherOverlay === 'rain'
                        ? 'bg-sky-500 text-white font-bold shadow-md shadow-sky-950/50'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <CloudRain className="w-3.5 h-3.5" />
                    <span>Rain</span>
                  </button>

                  <button
                    onClick={() => setWeatherOverlay('wind')}
                    className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                      weatherOverlay === 'wind'
                        ? 'bg-sky-500 text-white font-bold shadow-md shadow-sky-950/50'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Wind className="w-3.5 h-3.5" />
                    <span>Wind</span>
                  </button>

                  <button
                    onClick={() => setWeatherOverlay('clouds')}
                    className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                      weatherOverlay === 'clouds'
                        ? 'bg-sky-500 text-white font-bold shadow-md shadow-sky-950/50'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Clouds</span>
                  </button>
                </div>

                <div className="text-[11px] text-slate-400 flex items-center justify-between px-1 flex-shrink-0">
                  <span>Centered: <strong className="text-white">{activeCity}</strong></span>
                  <span className="font-mono text-[10px] text-sky-400">{cityCoords.lat.toFixed(2)}°N, {cityCoords.lon.toFixed(2)}°E</span>
                </div>

                {/* Iframe Viewport: flex: 1 with height 100%, no fixed height */}
                <div className="rounded-xl overflow-hidden border border-white/10 bg-black flex-1 min-h-0 w-full relative">
                  <iframe
                    key={`${activeCity}-${weatherOverlay}`}
                    src={windyUrl}
                    title="Windy Weather Radar"
                    className="w-full h-full border-0 block"
                    style={{ width: '100%', height: '100%', minHeight: '100%' }}
                    loading="lazy"
                  />
                </div>

                {/* Mandatory Attribution */}
                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400 flex-shrink-0">
                  <span>Weather: <strong>Windy.com</strong></span>
                  <a
                    href="https://www.windy.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 hover:text-sky-300 flex items-center gap-1"
                  >
                    <span>Windy.com</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            {/* ── PANEL 2: FLOOD (Google Flood Hub) ── */}
            {activePanel === 'flood' && (
              <div className="space-y-3 flex-1 flex flex-col overflow-y-auto">
                <button
                  onClick={onToggleFloodGauges}
                  className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors ${
                    showFloodGauges
                      ? 'bg-blue-500/20 border-blue-400/50 text-blue-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Show Flood Pins on Globe</span>
                  <span className={`w-2 h-2 rounded-full ${showFloodGauges ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`} />
                </button>

                {floodData?.gauges && floodData.gauges.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {floodData.gauges.map(g => {
                      const dotColor = g.severity === 'red' ? 'bg-rose-500' : g.severity === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'
                      return (
                        <div
                          key={g.id}
                          className="p-2 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                            <div>
                              <div className="font-semibold text-slate-200 line-clamp-1">{g.name}</div>
                              <div className="text-[10px] text-slate-400">{g.river}</div>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono capitalize px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                            {g.status}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                <div className="pt-1">
                  <a
                    href={floodData?.flood_hub_url || `https://floodhub.google.com/`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Open Flood Hub</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="pt-2 border-t border-white/10 text-center text-[11px] text-slate-400 mt-auto">
                  <span>Google Flood Hub, CC BY 4.0</span>
                </div>
              </div>
            )}

            {/* ── PANEL 3: EARTHQUAKES (USGS Quakes) ── */}
            {activePanel === 'earthquakes' && (
              <div className="space-y-3 flex-1 flex flex-col overflow-y-auto">
                <button
                  onClick={onToggleEarthquakes}
                  className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors ${
                    showEarthquakes
                      ? 'bg-orange-500/20 border-orange-400/50 text-orange-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Show Pulsing Quakes on Globe</span>
                  <span className={`w-2 h-2 rounded-full ${showEarthquakes ? 'bg-orange-400 animate-ping' : 'bg-slate-600'}`} />
                </button>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 flex-1">
                  {earthquakes.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-500">No recent quakes recorded</div>
                  ) : (
                    earthquakes.map((eq, i) => {
                      const mag = eq.payload?.magnitude || 3.0
                      const place = eq.payload?.place || 'Regional epicentre'
                      const isHigh = mag >= 4.5
                      return (
                        <div
                          key={eq.device_id || i}
                          className="p-2 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between text-xs hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded font-black font-mono text-[10px] ${
                              isHigh ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40' : 'bg-orange-500/30 text-orange-300 border border-orange-500/40'
                            }`}>
                              M{mag.toFixed(1)}
                            </span>
                            <div className="line-clamp-1 max-w-[170px] text-slate-200">
                              {place}
                            </div>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">
                            {eq.payload?.depth_km} km
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="pt-2 border-t border-white/10 text-center text-[11px] text-slate-400 mt-auto">
                  <span>USGS Earthquake Hazards Program, Public Domain</span>
                </div>
              </div>
            )}

            {/* ── PANEL 4: SCENARIOS (Icons only + tooltip) ── */}
            {activePanel === 'scenarios' && (
              <div className="space-y-3.5 flex-1 flex flex-col">
                {scenarioStatus && (
                  <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-400/40 text-cyan-300 text-[11px] flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-cyan-400" />
                    <span className="line-clamp-1 font-semibold">{scenarioStatus}</span>
                  </div>
                )}

                <div>
                  <div className="grid grid-cols-4 gap-2">
                    {testScenarios.map(s => (
                      <button
                        key={s.id}
                        onClick={() => handleRunScenario(s.id, s.label)}
                        disabled={isRunningScenario}
                        title={s.tooltip}
                        className="group relative flex flex-col items-center justify-center p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-purple-500/20 hover:border-purple-400/50 hover:shadow-lg transition-all duration-150 disabled:opacity-40"
                      >
                        <span className="text-2xl group-hover:scale-110 transition-transform">{s.icon}</span>
                        <span className="absolute bottom-full mb-1 hidden group-hover:block w-40 p-1.5 rounded-lg bg-slate-950 border border-white/20 text-white text-[10px] text-center shadow-2xl pointer-events-none z-50">
                          {s.tooltip}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10 mt-auto">
                  <button
                    onClick={handleReset}
                    disabled={isRunningScenario}
                    title="Reset Database: Clear and restore default state"
                    className="w-full py-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset All to Default Seed</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── PANEL 5: SOURCES (Compact Rows: name, status dot, license) ── */}
            {activePanel === 'sources' && (
              <div className="space-y-3 flex-1 flex flex-col overflow-y-auto">
                {sourcesLoading ? (
                  <div className="text-center py-8 text-xs text-slate-400">Loading registries...</div>
                ) : (
                  <div className="space-y-2 flex-1">
                    {sources.map(src => {
                      const dotClass =
                        src.status === 'live'
                          ? 'bg-emerald-400 shadow-sm shadow-emerald-400'
                          : src.status === 'fallback'
                          ? 'bg-amber-400 shadow-sm shadow-amber-400'
                          : 'bg-slate-500'

                      return (
                        <div
                          key={src.id}
                          className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClass}`} />
                            <div className="min-w-0">
                              <div className="font-bold text-slate-100 line-clamp-1">{src.name}</div>
                              <div className="text-[10px] text-slate-400 line-clamp-1">{src.type}</div>
                            </div>
                          </div>

                          <span className="px-2 py-0.5 rounded-md bg-white/10 text-cyan-300 font-mono text-[10px] flex-shrink-0">
                            {src.license}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── PANEL 6: INCIDENTS ── */}
            {activePanel === 'incidents' && (
              <div className="space-y-3 flex-1 flex flex-col overflow-y-auto">
                <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-xl text-[11px] font-medium flex-shrink-0">
                  {['all', 'high', 'medium', 'low'].map(s => (
                    <button
                      key={s}
                      onClick={() => setSeverityFilter(s)}
                      className={`flex-1 py-1 rounded-lg capitalize transition-colors ${
                        severityFilter === s ? 'bg-white/15 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                  {filteredIncidents.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-500">No incidents found in sector</div>
                  ) : (
                    filteredIncidents.map(inc => {
                      const isSelected = selectedIncident?.incident_id === inc.incident_id
                      const sev = (inc.severity_level || 'Medium').toLowerCase()
                      const sevBadge =
                        sev === 'high'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          : sev === 'medium'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'

                      return (
                        <div
                          key={inc.incident_id}
                          onClick={() => onSelectIncident(inc)}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                            isSelected
                              ? 'bg-cyan-500/15 border-cyan-400/50 shadow-lg'
                              : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-mono text-cyan-400">{inc.incident_id}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${sevBadge}`}>
                              {inc.severity_level || 'Medium'}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-slate-100 line-clamp-1">{inc.title}</div>
                          <div className="text-[11px] text-cyan-300 mt-0.5 font-medium">
                            {formatCause(inc.primary_cause)}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {/* ── PANEL 7: LAYERS ── */}
            {activePanel === 'layers' && (
              <div className="space-y-2.5">
                <div
                  onClick={onToggleInfrastructure}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    showInfrastructure
                      ? 'bg-emerald-500/15 border-emerald-400/50 text-white'
                      : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">🏥</span>
                    <div>
                      <div className="text-xs font-semibold">Infrastructure & Emergency Help</div>
                      <div className="text-[10px] text-slate-400">Hospitals, fire stations, railway hubs</div>
                    </div>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full ${showInfrastructure ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-600'}`} />
                </div>

                <div
                  onClick={onToggleRainfall}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    showRainfall
                      ? 'bg-cyan-500/15 border-cyan-400/50 text-white'
                      : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">🌧️</span>
                    <div>
                      <div className="text-xs font-semibold">Rainfall Observations</div>
                      <div className="text-[10px] text-slate-400">Radar precipitation sensors</div>
                    </div>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full ${showRainfall ? 'bg-cyan-400 shadow-sm shadow-cyan-400' : 'bg-slate-600'}`} />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen Weather Radar Overlay */}
      {isWeatherFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col pointer-events-auto">
          {/* Top Bar */}
          <div className="h-14 px-6 border-b border-white/10 bg-slate-900/80 flex items-center justify-between flex-shrink-0 z-10">
            <div className="flex items-center gap-3">
              <CloudRain className="w-5 h-5 text-sky-400" />
              <span className="font-semibold text-sm text-white tracking-wide">
                Windy Weather Radar — <span className="text-sky-400">{activeCity}</span> ({cityCoords.lat.toFixed(2)}°N, {cityCoords.lon.toFixed(2)}°E)
              </span>
            </div>

            {/* Weather Overlay Controls */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/10 text-xs">
                <button
                  onClick={() => setWeatherOverlay('rain')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                    weatherOverlay === 'rain'
                      ? 'bg-sky-500 text-white font-bold shadow-md shadow-sky-950/50'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <CloudRain className="w-3.5 h-3.5" />
                  <span>Rain</span>
                </button>
                <button
                  onClick={() => setWeatherOverlay('wind')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                    weatherOverlay === 'wind'
                      ? 'bg-sky-500 text-white font-bold shadow-md shadow-sky-950/50'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Wind className="w-3.5 h-3.5" />
                  <span>Wind</span>
                </button>
                <button
                  onClick={() => setWeatherOverlay('clouds')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                    weatherOverlay === 'clouds'
                      ? 'bg-sky-500 text-white font-bold shadow-md shadow-sky-950/50'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Clouds</span>
                </button>
              </div>

              {/* Attribution */}
              <a
                href="https://www.windy.com"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-sky-400 hover:text-sky-300 transition-colors"
              >
                <span>Weather: Windy.com</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              {/* Close ✕ Button */}
              <button
                onClick={() => setIsWeatherFullscreen(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/20 hover:text-rose-400 text-slate-300 transition-all border border-white/10 ml-2"
                title="Close Fullscreen (✕)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Fullscreen Iframe */}
          <div className="flex-1 w-full h-full min-h-0 bg-black relative">
            <iframe
              key={`fs-${activeCity}-${weatherOverlay}`}
              src={windyFullscreenUrl}
              title="Windy Fullscreen Weather Radar"
              className="w-full h-full border-0 block"
              style={{ width: '100%', height: '100%' }}
              loading="lazy"
            />
          </div>
        </div>
      )}
    </div>
  )
}
