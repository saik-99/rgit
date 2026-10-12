import React, { useState, useEffect } from 'react'
import { EarthMap } from '../components/earth/EarthMap'
import { LeftRail } from '../components/earth/LeftRail'
import { IncidentCard } from '../components/earth/IncidentCard'
import { ReplayTimeline } from '../components/earth/ReplayTimeline'
import { LiveTicker } from '../components/earth/LiveTicker'
import { SearchBar } from '../components/earth/SearchBar'
import {
  fetchV1Cities,
  fetchV1Incidents,
  fetchV1Infrastructure,
  fetchV1Rainfall,
  fetchWeather,
  fetchEarthquakes,
  fetchGoogleFlood,
  type V1Incident,
  type EarthquakeItem,
} from '../api'
import type { WeatherMetrics, GoogleFloodResponse } from '../types'

export const EarthPage: React.FC = () => {
  const [cities, setCities] = useState<string[]>(['Mumbai', 'New York'])
  const [activeCity, setActiveCity] = useState<string>('Mumbai')
  const [incidents, setIncidents] = useState<V1Incident[]>([])
  const [selectedIncident, setSelectedIncident] = useState<V1Incident | null>(null)

  // Map layer states
  const [showInfrastructure, setShowInfrastructure] = useState<boolean>(false)
  const [showRainfall, setShowRainfall] = useState<boolean>(false)
  const [infrastructureData, setInfrastructureData] = useState<any>(null)
  const [rainfallData, setRainfallData] = useState<any>(null)

  // Hazards states
  const [showEarthquakes, setShowEarthquakes] = useState<boolean>(false)
  const [earthquakes, setEarthquakes] = useState<EarthquakeItem[]>([])
  const [showFloodGauges, setShowFloodGauges] = useState<boolean>(false)
  const [floodData, setFloodData] = useState<GoogleFloodResponse | null>(null)

  // Weather metrics for top-center pill
  const [weather, setWeather] = useState<WeatherMetrics | null>(null)

  const [isReplayOpen, setIsReplayOpen] = useState<boolean>(false)
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null)

  // 1. Load initial cities & incidents
  const loadData = async () => {
    try {
      const loadedCities = await fetchV1Cities()
      if (loadedCities && loadedCities.length > 0) {
        setCities(loadedCities)
      }
    } catch (err) {
      console.warn('Failed to load cities:', err)
    }

    try {
      const loadedIncidents = await fetchV1Incidents()
      setIncidents(loadedIncidents)
      if (loadedIncidents.length > 0 && !selectedIncident) {
        setSelectedIncident(loadedIncidents[0])
      }
    } catch (err) {
      console.warn('Failed to load incidents:', err)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // 2. Fetch weather for activeCity
  useEffect(() => {
    fetchWeather(activeCity)
      .then(data => setWeather(data))
      .catch(() => {})
  }, [activeCity])

  // 3. Fetch earthquakes
  useEffect(() => {
    fetchEarthquakes('global', 2.5)
      .then(res => {
        if (res?.earthquakes) setEarthquakes(res.earthquakes)
      })
      .catch(() => {})
  }, [])

  // 4. Fetch Google Flood data
  useEffect(() => {
    fetchGoogleFlood()
      .then(data => setFloodData(data))
      .catch(() => {})
  }, [])

  // 5. Fetch layer data when toggled
  useEffect(() => {
    if (showInfrastructure) {
      fetchV1Infrastructure(activeCity).then(setInfrastructureData)
    }
  }, [showInfrastructure, activeCity])

  useEffect(() => {
    if (showRainfall) {
      fetchV1Rainfall(activeCity).then(setRainfallData)
    }
  }, [showRainfall, activeCity])

  const handleSelectCity = (city: string) => {
    setActiveCity(city)
    // Find first incident in selected city if available
    const cityInc = incidents.find(i => (i.city || '').toLowerCase().includes(city.toLowerCase()))
    if (cityInc) {
      setSelectedIncident(cityInc)
    }
  }

  // Rainfall and flood risk values for pill
  const rain24h = weather?.past_24h_rainfall_mm ?? (activeCity.toLowerCase() === 'mumbai' ? 112.4 : 14.8)
  const floodRiskLevel = weather?.flood_risk_level ?? (activeCity.toLowerCase() === 'mumbai' ? 'High' : 'Low')

  const riskBadgeClass =
    floodRiskLevel === 'Severe' || floodRiskLevel === 'High'
      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
      : floodRiskLevel === 'Moderate'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'

  const riskDotClass =
    floodRiskLevel === 'Severe' || floodRiskLevel === 'High'
      ? 'bg-rose-400 animate-pulse'
      : floodRiskLevel === 'Moderate'
      ? 'bg-amber-400'
      : 'bg-emerald-400'

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans select-none">
      {/* 1. MapLibre Fullscreen 3D Globe */}
      <EarthMap
        incidents={incidents}
        selectedIncident={selectedIncident}
        onSelectIncident={inc => {
          setSelectedIncident(inc)
          setIsReplayOpen(false)
        }}
        activeCity={activeCity}
        showInfrastructure={showInfrastructure}
        showRainfall={showRainfall}
        infrastructureData={infrastructureData}
        rainfallData={rainfallData}
        earthquakes={earthquakes}
        showEarthquakes={showEarthquakes}
        floodGauges={floodData?.gauges || []}
        showFloodGauges={showFloodGauges}
        highlightedEventId={highlightedEventId}
        onSelectEvent={id => setHighlightedEventId(id)}
      />

      {/* 2. Top-Left Search Bar */}
      <SearchBar
        incidents={incidents}
        onSelectIncident={inc => {
          setSelectedIncident(inc)
          if (inc.city) setActiveCity(inc.city)
        }}
      />

      {/* 3. Top-Center Small Glass Pill: City name, rain mm/24h, flood risk chip */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 flex items-center gap-2.5 px-3 py-1.5 bg-slate-950/85 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl pointer-events-auto text-xs text-white">
        {/* City Toggle Buttons */}
        <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-full">
          {cities.map(c => {
            const isActive = activeCity.toLowerCase() === c.toLowerCase()
            return (
              <button
                key={c}
                onClick={() => handleSelectCity(c)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {c}
              </button>
            )
          })}
        </div>

        <div className="w-[1px] h-3.5 bg-white/15" />

        {/* Rain mm/24h */}
        <div className="flex items-center gap-1.5 font-medium text-slate-200">
          <span>🌧️</span>
          <span className="font-mono font-semibold text-cyan-300">
            {rain24h} mm/24h
          </span>
        </div>

        <div className="w-[1px] h-3.5 bg-white/15" />

        {/* Flood Risk Chip */}
        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] tracking-wide border uppercase flex items-center gap-1.5 ${riskBadgeClass}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${riskDotClass}`} />
          <span>{floodRiskLevel} Risk</span>
        </span>
      </div>

      {/* 4. Left Thin Icon Rail & Expandable Glass Panels */}
      <LeftRail
        incidents={incidents}
        selectedIncident={selectedIncident}
        onSelectIncident={inc => {
          setSelectedIncident(inc)
          if (inc.city) setActiveCity(inc.city)
        }}
        activeCity={activeCity}
        onSelectCity={handleSelectCity}
        showInfrastructure={showInfrastructure}
        onToggleInfrastructure={() => setShowInfrastructure(prev => !prev)}
        showRainfall={showRainfall}
        onToggleRainfall={() => setShowRainfall(prev => !prev)}
        showEarthquakes={showEarthquakes}
        onToggleEarthquakes={() => setShowEarthquakes(prev => !prev)}
        showFloodGauges={showFloodGauges}
        onToggleFloodGauges={() => setShowFloodGauges(prev => !prev)}
        earthquakes={earthquakes}
        floodData={floodData}
        onRefreshIncidents={loadData}
      />

      {/* 5. Right Incident Diagnostic Card */}
      <IncidentCard
        incident={selectedIncident}
        onClose={() => {
          setSelectedIncident(null)
          setHighlightedEventId(null)
        }}
        onOpenReplay={() => setIsReplayOpen(true)}
        highlightedEventId={highlightedEventId}
        onSelectEvent={id => setHighlightedEventId(id)}
      />

      {/* 6. Bottom Timeline Replay */}
      {isReplayOpen && selectedIncident && (
        <ReplayTimeline
          incident={selectedIncident}
          onClose={() => setIsReplayOpen(false)}
        />
      )}

      {/* 7. Bottom-Left Live Telemetry Ticker (Filtered to activeCity) */}
      <LiveTicker activeCity={activeCity} />
    </div>
  )
}
