import React, { useState, useEffect, useMemo, useRef } from 'react'
import { EarthMap } from '../components/earth/EarthMap'
import { LeftRail } from '../components/earth/LeftRail'
import { IncidentCard } from '../components/earth/IncidentCard'
import { ReplayTimeline } from '../components/earth/ReplayTimeline'
import { LiveTicker } from '../components/earth/LiveTicker'
import { SearchBar } from '../components/earth/SearchBar'
import { AllIndiaStatsCard } from '../components/earth/AllIndiaStatsCard'
import { IntroOverlay } from '../components/earth/IntroOverlay'
import { CopilotWidget } from '../components/earth/CopilotWidget'
import {
  fetchV1Incidents,
  fetchV1Infrastructure,
  fetchV1Rainfall,
  fetchV1EventsGeoJSON,
  fetchV1Stats,
  fetchWeather,
  fetchEarthquakes,
  fetchGoogleFlood,
  getWsUrl,
  type V1Incident,
  type EarthquakeItem,
} from '../api'
import type { WeatherMetrics, GoogleFloodResponse } from '../types'
import { SeverityChip } from '../ui/primitives'
import { Globe, CloudRain, Play, X } from 'lucide-react'
import { CITIES, INDIAN_CITY_KEYS } from '../utils/cities'
import { getCityRainfall, getAllIndiaMaxRainfall } from '../utils/weather'

const CITY_CHIPS = [
  { id: 'all', label: 'All India' },
  { id: 'mumbai', label: 'Mumbai' },
  { id: 'pune', label: 'Pune' },
  { id: 'nagpur', label: 'Nagpur' },
  { id: 'delhi', label: 'Delhi' },
  { id: 'bengaluru', label: 'Bengaluru' },
  { id: 'hyderabad', label: 'Hyderabad' },
  { id: 'guwahati', label: 'Guwahati' },
]

export const EarthPage: React.FC = () => {
  const [activeCity, setActiveCity] = useState<string>('all')
  const [incidents, setIncidents] = useState<V1Incident[]>([])
  const [selectedIncident, setSelectedIncident] = useState<V1Incident | null>(null)

  // Intro Overlay state: shown on every page load unless ?intro=0
  const [isIntroActive, setIsIntroActive] = useState<boolean>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      return urlParams.get('intro') !== '0'
    } catch {
      return true
    }
  })
  const [isIntroExiting, setIsIntroExiting] = useState<boolean>(false)
  const [isMapIdle, setIsMapIdle] = useState<boolean>(false)
  const [uiRevealed, setUiRevealed] = useState<boolean>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      return urlParams.get('intro') === '0'
    } catch {
      return false
    }
  })

  const handleStartEnter = () => {
    setIsIntroExiting(true)
  }

  const handleFlyToIndiaComplete = () => {
    setIsIntroActive(false)
    setIsIntroExiting(false)
    setUiRevealed(true)
    setActiveCity('all')
  }

  // GeoJSON & Stats
  const [eventsGeoJSON, setEventsGeoJSON] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)

  // Rain Pill state: show "—" while loading, and calculate max for All India
  const [rainText, setRainText] = useState<string>('—')

  // Operator Status per incident: New -> Acknowledged -> Dispatched -> Resolved
  const [operatorStatuses, setOperatorStatuses] = useState<
    Record<string, { status: 'New' | 'Acknowledged' | 'Dispatched' | 'Resolved'; timestamp: number }>
  >({})

  // Audio chime & muting
  const [isMuted, setIsMuted] = useState<boolean>(false)

  // New High Incident Pop toast & bounce animation state
  const [newHighToast, setNewHighToast] = useState<{ show: boolean; incident: V1Incident; title: string } | null>(null)
  const [copilotHasNewHigh, setCopilotHasNewHigh] = useState<boolean>(false)

  // Tour State
  const [isTouring, setIsTouring] = useState<boolean>(false)
  const [tourIncident, setTourIncident] = useState<V1Incident | null>(null)
  const [tourCaption, setTourCaption] = useState<string | null>(null)
  const tourTimeoutRef = useRef<any>(null)

  // Filters State
  const [dateBounds, setDateBounds] = useState<[number, number]>([1695427200000, 1791835666000])
  const [filters, setFilters] = useState<{
    category: string
    severity: string
    dateRange: [number, number]
    realOnly: boolean
  }>({
    category: 'all',
    severity: 'all',
    dateRange: [1695427200000, 1791835666000],
    realOnly: false,
  })

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

  // Weather metrics
  const [weather, setWeather] = useState<WeatherMetrics | null>(null)

  const [isReplayOpen, setIsReplayOpen] = useState<boolean>(false)
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null)

  // Two-tone Web Audio chime
  const playTwoToneChime = () => {
    if (isMuted) return
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const now = ctx.currentTime

      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now)
      gain1.gain.setValueAtTime(0.12, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.3)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(880, now + 0.14)
      gain2.gain.setValueAtTime(0.15, now + 0.14)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.14)
      osc2.stop(now + 0.5)
    } catch {
      // AudioContext may need user gesture
    }
  }

  // Unified selectCity function (Requirement 2: used by both city chips and All India bar chart)
  const selectCity = (cityId: string) => {
    const norm = (cityId || 'all').toLowerCase().trim()
    setActiveCity(norm)
    if (norm !== 'all' && norm !== 'all-india' && norm !== 'all india') {
      const cityInc = incidents.find(i => (i.city || '').toLowerCase() === norm)
      if (cityInc) {
        setSelectedIncident(cityInc)
      }
    }
  }

  // 1. Load initial data
  const loadData = async () => {
    try {
      const loadedIncidents = await fetchV1Incidents()
      setIncidents(loadedIncidents)
      if (loadedIncidents.length > 0 && !selectedIncident) {
        setSelectedIncident(loadedIncidents[0])
      }
    } catch (err) {
      console.warn('Failed to load incidents:', err)
    }

    try {
      const geoData = await fetchV1EventsGeoJSON()
      setEventsGeoJSON(geoData)
      if (geoData?.features?.length > 0) {
        const timestamps = geoData.features
          .map((f: any) => new Date(f.properties?.time).getTime())
          .filter((t: number) => !isNaN(t) && t > 0)
        if (timestamps.length > 0) {
          const min = Math.min(...timestamps)
          const max = Math.max(...timestamps)
          setDateBounds([min, max])
          setFilters(prev => ({
            ...prev,
            dateRange: [min, max],
          }))
        }
      }
    } catch (err) {
      console.warn('Failed to load GeoJSON events:', err)
    }

    try {
      const statsData = await fetchV1Stats()
      setStats(statsData)
    } catch (err) {
      console.warn('Failed to load stats:', err)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Requirement 4: RAIN PILL per city — fetch weather for selected city's lat/lon, show "—" while loading
  // All India shows the city with highest rainfall: "Max 185 mm · Mumbai"
  useEffect(() => {
    let isMounted = true
    setRainText('—')

    const norm = activeCity.toLowerCase().trim()
    const isAll = norm === 'all' || norm === 'all-india' || norm === 'all india'

    if (isAll) {
      getAllIndiaMaxRainfall().then(({ maxRain, maxCity }) => {
        if (isMounted) {
          setRainText(`Max ${maxRain} mm today · ${maxCity}`)
        }
      })
    } else {
      getCityRainfall(norm).then(val => {
        if (isMounted) {
          setRainText(`${val} mm today`)
        }
      })
    }

    return () => {
      isMounted = false
    }
  }, [activeCity])

  // WebSocket for new high-incident detection
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: any = null

    function connect() {
      if ((import.meta as any).env?.VITE_OFFLINE === 'true') return
      try {
        const wsUrl = getWsUrl('/stream')
        ws = new WebSocket(wsUrl)

        ws.onmessage = event => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'incident_updated' && data.incident) {
              const inc: V1Incident = data.incident
              const isHigh =
                (inc.severity_level || '').toLowerCase() === 'high' || (inc.severity_score || 0) >= 70

              if (isHigh) {
                playTwoToneChime()
                setNewHighToast({ show: true, incident: inc, title: inc.title })
                setCopilotHasNewHigh(true)
              }
            }
          } catch {
            // Ignore
          }
        }

        ws.onerror = () => ws?.close()
        ws.onclose = () => {
          reconnectTimeout = setTimeout(connect, 6000)
        }
      } catch {
        // Fallback
      }
    }

    connect()
    return () => {
      if (ws) ws.close()
      clearTimeout(reconnectTimeout)
    }
  }, [isMuted])

  // Fetch weather risk
  useEffect(() => {
    const cityToFetch = activeCity === 'all' ? 'Mumbai' : activeCity
    fetchWeather(cityToFetch)
      .then(data => setWeather(data))
      .catch(() => {})
  }, [activeCity])

  // Fetch earthquakes
  useEffect(() => {
    fetchEarthquakes('global', 2.5)
      .then(res => {
        if (res?.earthquakes) setEarthquakes(res.earthquakes)
      })
      .catch(() => {})
  }, [])

  // Fetch Google Flood data
  useEffect(() => {
    fetchGoogleFlood()
      .then(data => setFloodData(data))
      .catch(() => {})
  }, [])

  // Fetch layer data when toggled
  useEffect(() => {
    if (showInfrastructure) {
      const c = activeCity === 'all' ? 'mumbai' : activeCity
      fetchV1Infrastructure(c).then(setInfrastructureData)
    }
  }, [showInfrastructure, activeCity])

  useEffect(() => {
    if (showRainfall) {
      const c = activeCity === 'all' ? 'mumbai' : activeCity
      fetchV1Rainfall(c).then(setRainfallData)
    }
  }, [showRainfall, activeCity])

  // Operator status advancement
  const handleAdvanceOperatorStatus = (incidentId: string) => {
    setOperatorStatuses(prev => {
      const current = prev[incidentId]?.status || 'New'
      const next: 'New' | 'Acknowledged' | 'Dispatched' | 'Resolved' =
        current === 'New'
          ? 'Acknowledged'
          : current === 'Acknowledged'
          ? 'Dispatched'
          : 'Resolved'
      return {
        ...prev,
        [incidentId]: { status: next, timestamp: Date.now() },
      }
    })
  }

  // Reactive filtering of GeoJSON features
  const filteredGeoJSON = useMemo(() => {
    if (!eventsGeoJSON || !eventsGeoJSON.features) return eventsGeoJSON

    const features = eventsGeoJSON.features.filter((f: any) => {
      const p = f.properties || {}
      if (filters.realOnly && p.is_synthetic) return false
      if (filters.severity !== 'all' && (p.severity || '').toLowerCase() !== filters.severity.toLowerCase()) {
        return false
      }
      if (filters.category !== 'all') {
        const cat = filters.category.toLowerCase()
        const type = (p.type || '').toLowerCase()
        const tax = (p.taxonomy_code || '').toUpperCase()
        if (cat === 'flood' && !(type === 'water_level' || tax.includes('FLOOD') || tax.includes('WATER'))) return false
        if (cat === 'traffic' && !(type === 'road_sensor' || tax.includes('TRAFFIC'))) return false
        if (cat === 'power' && !tax.includes('POWER')) return false
        if (cat === 'transit' && !(type === 'transit' || tax.includes('TRANSIT'))) return false
        if (cat === 'emergency' && !(type === 'emergency_call' || tax.includes('EMERGENCY'))) return false
      }
      if (p.time) {
        const t = new Date(p.time).getTime()
        if (!isNaN(t) && (t < filters.dateRange[0] || t > filters.dateRange[1])) {
          return false
        }
      }
      return true
    })

    return {
      type: 'FeatureCollection',
      features,
    }
  }, [eventsGeoJSON, filters])

  // 2.a: filteredIncidents useMemo over incidents + filters
  const filteredIncidents = useMemo(() => {
    return incidents.filter(inc => {
      // 1. Severity: severity_level case-insensitive
      if (filters.severity && filters.severity !== 'all') {
        if ((inc.severity_level || '').toLowerCase() !== filters.severity.toLowerCase()) {
          return false
        }
      }

      // 2. Category: match primary_cause/title or any event taxonomy_code
      // (flood: FLOOD|WEATHER|drainage|water, traffic: TRAFFIC|accident|blockage,
      //  power: POWER|outage|grid, transit: TRANSIT|rail|bus,
      //  emergency: EMERGENCY|STRUCTURE|gas|collapse|fire)
      if (filters.category && filters.category !== 'all') {
        const cat = filters.category.toLowerCase()
        const textToMatch = `${inc.primary_cause || ''} ${inc.cause_label || ''} ${inc.title || ''} ${(inc.events || []).map((e: any) => e.taxonomy_code || '').join(' ')}`.toLowerCase()

        if (cat === 'flood') {
          if (!/(flood|weather|drainage|water)/i.test(textToMatch)) return false
        } else if (cat === 'traffic') {
          if (!/(traffic|accident|blockage)/i.test(textToMatch)) return false
        } else if (cat === 'power') {
          if (!/(power|outage|grid)/i.test(textToMatch)) return false
        } else if (cat === 'transit') {
          if (!/(transit|rail|bus)/i.test(textToMatch)) return false
        } else if (cat === 'emergency') {
          if (!/(emergency|structure|gas|collapse|fire)/i.test(textToMatch)) return false
        }
      }

      // 3. Date range: created_at (fallback updated_at) inside range
      if (filters.dateRange && filters.dateRange.length === 2) {
        const timeStr = inc.created_at || inc.updated_at || (inc.events?.[0]?.event_time) || (inc.events?.[0]?.time)
        if (timeStr) {
          const t = new Date(timeStr).getTime()
          if (!isNaN(t) && (t < filters.dateRange[0] || t > filters.dateRange[1])) {
            return false
          }
        }
      }

      // 4. realOnly: keep if any event is non-synthetic; keep if no event info
      if (filters.realOnly) {
        const events = inc.events || []
        if (events.length > 0) {
          const hasNonSynthetic = events.some((e: any) => !e.is_synthetic)
          if (!hasNonSynthetic) return false
        }
        // keep if no event info
      }

      return true
    })
  }, [incidents, filters])

  // Active incidents count (Resolved pins excluded from stat)
  const activeIncidentsCount = useMemo(() => {
    const list = activeCity === 'all'
      ? filteredIncidents
      : filteredIncidents.filter(i => (i.city || '').toLowerCase() === activeCity.toLowerCase())
    return list.filter(i => (operatorStatuses[i.incident_id]?.status || 'New') !== 'Resolved').length
  }, [filteredIncidents, activeCity, operatorStatuses])

  // Tour management
  const stopTour = () => {
    setIsTouring(false)
    setTourIncident(null)
    setTourCaption(null)
    if (tourTimeoutRef.current) clearTimeout(tourTimeoutRef.current)
  }

  const runTourStep = (list: V1Incident[], idx: number) => {
    if (idx >= list.length) {
      stopTour()
      return
    }

    const cur = list[idx]
    setTourIncident(cur)
    setSelectedIncident(cur)
    const conf = Math.round((cur.cause_confidence || 0) * 100)
    setTourCaption(`${cur.title} · ${cur.severity_level || 'Medium'} · ${conf}% confidence`)

    tourTimeoutRef.current = setTimeout(() => {
      runTourStep(list, idx + 1)
    }, 4000)
  }

  const handleStartTour = () => {
    if (isTouring) {
      stopTour()
      return
    }

    let tourList: V1Incident[] = []
    if (activeCity === 'all') {
      INDIAN_CITY_KEYS.forEach(c => {
        const cityList = incidents
          .filter(i => (i.city || '').toLowerCase() === c && (operatorStatuses[i.incident_id]?.status || 'New') !== 'Resolved')
          .sort((a, b) => (b.severity_score || 0) - (a.severity_score || 0))
        if (cityList.length > 0) {
          tourList.push(cityList[0])
        }
      })
    } else {
      tourList = incidents
        .filter(i => (i.city || '').toLowerCase() === activeCity.toLowerCase() && (operatorStatuses[i.incident_id]?.status || 'New') !== 'Resolved')
        .sort((a, b) => (b.severity_score || 0) - (a.severity_score || 0))
        .slice(0, 5)
    }

    if (tourList.length === 0) return

    setIsTouring(true)
    runTourStep(tourList, 0)
  }

  useEffect(() => {
    if (!isTouring) return

    const handleInterrupt = (e: MouseEvent | KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('#tour-caption-box') || target?.closest('#tour-button')) return
      stopTour()
    }

    window.addEventListener('click', handleInterrupt)
    window.addEventListener('keydown', handleInterrupt)
    return () => {
      window.removeEventListener('click', handleInterrupt)
      window.removeEventListener('keydown', handleInterrupt)
    }
  }, [isTouring])

  const isAllIndia = activeCity.toLowerCase() === 'all' || activeCity.toLowerCase() === 'all-india' || activeCity.toLowerCase() === 'all india'
  const floodRiskLevel = weather?.flood_risk_level ?? (activeCity.toLowerCase() === 'mumbai' ? 'High' : 'Moderate')

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
      {/* 1. MapLibre Fullscreen 3D Globe with GeoJSON pins */}
      <EarthMap
        incidents={filteredIncidents}
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
        eventsGeoJSON={filteredGeoJSON}
        allIndiaStats={stats}
        onSelectCity={selectCity}
        tourIncident={tourIncident}
        isIntro={isIntroActive}
        onMapIdle={() => setIsMapIdle(true)}
        isIntroExiting={isIntroExiting}
        onFlyToIndiaComplete={handleFlyToIndiaComplete}
      />

      {/* 2. Top-Left Search Bar + Stats (Reveal delay 120ms from top) */}
      <div
        id="tour-button"
        className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          !uiRevealed
            ? 'opacity-0 -translate-y-3 pointer-events-none'
            : 'opacity-100 translate-y-0 pointer-events-auto delay-[120ms]'
        }`}
      >
        <SearchBar
          incidents={filteredIncidents}
          onSelectIncident={inc => {
            setSelectedIncident(inc)
            if (inc.city) selectCity(inc.city.toLowerCase())
          }}
          onStartTour={handleStartTour}
          isTouring={isTouring}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(p => !p)}
          activeIncidentsCount={activeIncidentsCount}
        />
      </div>

      {/* 3. Top City Bar (Reveal delay 240ms from top) */}
      <div
        className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-20 px-3 py-1.5 bg-[var(--bg-panel)] backdrop-blur-xl border border-[var(--border)] rounded-full shadow-2xl text-xs text-[var(--text)] flex items-center gap-2.5 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          !uiRevealed
            ? 'opacity-0 -translate-y-3 pointer-events-none'
            : 'opacity-100 translate-y-0 pointer-events-auto delay-[240ms]'
        } max-w-[calc(100vw-32px)] sm:max-w-[680px] md:max-w-[800px] lg:max-w-[920px]`}
      >
        {/* Horizontally scrollable city chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1 whitespace-nowrap scroll-smooth touch-pan-x py-0.5">
          {CITY_CHIPS.map(c => {
            const isActive = activeCity.toLowerCase() === c.id.toLowerCase()
            return (
              <button
                key={c.id}
                onClick={() => selectCity(c.id)}
                className={`min-h-[36px] min-w-[44px] px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 ${
                  isActive
                    ? 'bg-[var(--accent)] text-slate-950 font-semibold shadow-md'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/5'
                }`}
              >
                {c.id === 'all' && <Globe className="w-3.5 h-3.5 stroke-[1.5]" />}
                <span>{c.label}</span>
              </button>
            )
          })}
        </div>

        <div className="w-[1px] h-3.5 bg-white/10 shrink-0" />

        {/* Rain status chip inside top bar */}
        <div className="flex items-center gap-1.5 text-[var(--text-muted)] whitespace-nowrap shrink-0 text-xs">
          <CloudRain className="w-3.5 h-3.5 text-[var(--accent)] stroke-[1.5]" />
          <span className="text-[var(--text)] font-medium">
            {rainText}
          </span>
        </div>

        <div className="w-[1px] h-3.5 bg-white/10 shrink-0" />

        {/* Risk status chip inside top bar */}
        <div className="shrink-0 flex items-center">
          <SeverityChip level={isAllIndia ? 'Low' : floodRiskLevel} />
        </div>
      </div>

      {/* 4. NEW-INCIDENT POP Toast */}
      {uiRevealed && newHighToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-[var(--bg-panel)] backdrop-blur-xl border border-rose-500/40 px-4 py-2 rounded-xl text-xs flex items-center gap-3 shadow-2xl">
          <span className="w-2 h-2 rounded-full bg-[var(--sev-high)] animate-ping" />
          <span className="text-[var(--text)]">
            New high-severity incident · <span className="font-semibold">{newHighToast.title}</span>
          </span>
          <button
            onClick={() => {
              const inc = newHighToast.incident
              if (inc.city) selectCity(inc.city.toLowerCase())
              setSelectedIncident(inc)
              setNewHighToast(null)
            }}
            className="px-2.5 py-1 rounded-lg bg-[var(--accent)] text-slate-950 font-semibold text-[11px] hover:opacity-90 transition-opacity"
          >
            View
          </button>
          <button
            onClick={() => setNewHighToast(null)}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X className="w-3.5 h-3.5 stroke-[1.5]" />
          </button>
        </div>
      )}

      {/* 5. TOUR Bottom-Center Caption */}
      {uiRevealed && isTouring && tourCaption && (
        <div
          id="tour-caption-box"
          className="fixed bottom-12 left-1/2 -translate-x-1/2 z-40 bg-[var(--bg-panel)] backdrop-blur-xl border border-[var(--border)] px-4 py-2 rounded-xl text-xs flex items-center gap-3 shadow-2xl"
        >
          <Play className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 fill-current" />
          <span className="text-[var(--text)] font-medium">{tourCaption}</span>
          <button
            onClick={stopTour}
            className="px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] text-[11px] transition-colors"
          >
            Stop
          </button>
        </div>
      )}

      {/* 6. Left Thin Icon Rail & Expandable Panels (Reveal delay 0ms from left) */}
      <div
        className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          !uiRevealed
            ? 'opacity-0 -translate-x-3 pointer-events-none'
            : 'opacity-100 translate-x-0 pointer-events-auto delay-0'
        }`}
      >
        <LeftRail
          incidents={filteredIncidents}
          filteredIncidentsCount={filteredIncidents.length}
          totalIncidentsCount={incidents.length}
          selectedIncident={selectedIncident}
          onSelectIncident={inc => {
            setSelectedIncident(inc)
            if (inc.city) selectCity(inc.city.toLowerCase())
          }}
          activeCity={activeCity}
          onSelectCity={selectCity}
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
          filters={filters}
          onUpdateFilters={setFilters}
          dateBounds={dateBounds}
        />
      </div>

      {/* 7. Right Incident Diagnostic Card */}
      {uiRevealed && (
        <IncidentCard
          incident={selectedIncident}
          onClose={() => {
            setSelectedIncident(null)
            setHighlightedEventId(null)
          }}
          onOpenReplay={() => setIsReplayOpen(true)}
          highlightedEventId={highlightedEventId}
          onSelectEvent={id => setHighlightedEventId(id)}
          operatorStatus={selectedIncident ? operatorStatuses[selectedIncident.incident_id]?.status || 'New' : 'New'}
          operatorTimestamp={selectedIncident ? operatorStatuses[selectedIncident.incident_id]?.timestamp : undefined}
          onAdvanceOperatorStatus={handleAdvanceOperatorStatus}
        />
      )}

      {/* 8. All India Card collapses to small pill above ticker when incident card is open */}
      {uiRevealed && isAllIndia && stats && (
        <AllIndiaStatsCard
          stats={stats}
          incidents={filteredIncidents}
          onSelectCity={selectCity}
          isCollapsed={Boolean(selectedIncident)}
          onToggleCollapse={() => {
            if (selectedIncident) setSelectedIncident(null)
          }}
        />
      )}

      {/* 9. Bottom Timeline Replay */}
      {uiRevealed && isReplayOpen && selectedIncident && (
        <ReplayTimeline
          incident={selectedIncident}
          onClose={() => setIsReplayOpen(false)}
        />
      )}

      {/* 10. Bottom-Left Live Telemetry Ticker (Reveal delay 360ms from bottom) */}
      <div
        className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          !uiRevealed
            ? 'opacity-0 translate-y-3 pointer-events-none'
            : 'opacity-100 translate-y-0 pointer-events-auto delay-[360ms]'
        }`}
      >
        <LiveTicker activeCity={activeCity} incidents={filteredIncidents} />
      </div>

      {/* 11. Cinematic Intro Overlay */}
      {isIntroActive && (
        <IntroOverlay
          mapReady={isMapIdle}
          stats={stats}
          incidentsCount={incidents.length}
          onStartEnter={handleStartEnter}
          isExiting={isIntroExiting}
        />
      )}

      {/* 12. Floating AI Copilot Widget */}
      {uiRevealed && (
        <CopilotWidget
          activeCity={activeCity}
          selectedIncident={selectedIncident}
          incidents={filteredIncidents}
          isIncidentOpen={Boolean(selectedIncident)}
          onSelectIncident={inc => {
            setSelectedIncident(inc)
            if (inc.city) selectCity(inc.city.toLowerCase())
          }}
          onUpdateOperatorStatus={(incidentId, status) => {
            setOperatorStatuses(prev => ({
              ...prev,
              [incidentId]: { status, timestamp: Date.now() },
            }))
          }}
          hasNewHighIncident={copilotHasNewHigh}
          onClearNewHighBadge={() => setCopilotHasNewHigh(false)}
        />
      )}
    </div>
  )
}
