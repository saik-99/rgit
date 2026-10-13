import type {
  Incident, SourceItem, WeatherMetrics, EarthquakeItem,
  GoogleFloodResponse, WindyConfig, DataSourceItem
} from './types'

export type { EarthquakeItem, GoogleFloodResponse, WindyConfig, DataSourceItem, WeatherMetrics }

const rawApiUrl = (import.meta as any).env?.VITE_API_URL
export const API_BASE = (() => {
  if (!rawApiUrl) return '/api'
  const trimmed = String(rawApiUrl).trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
})()

export function getWsUrl(subpath: string = '/stream'): string {
  const cleanSubpath = subpath.startsWith('/') ? subpath : `/${subpath}`
  if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
    const wsBase = API_BASE.startsWith('https://')
      ? API_BASE.replace(/^https:\/\//, 'wss://')
      : API_BASE.replace(/^http:\/\//, 'ws://')
    return `${wsBase}${cleanSubpath}`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${API_BASE}${cleanSubpath}`
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return res
  } finally {
    clearTimeout(timeoutId)
  }
}

export const MOCK_INCIDENTS: Incident[] = [
  {
    id: 1,
    title: 'Drainage / Waterlogging Failure — Hindmata, Mumbai',
    cause: 'drainage_failure',
    cause_confidence: 0.88,
    severity_score: 82,
    severity_level: 'critical',
    status: 'active',
    centroid_lat: 19.0112,
    centroid_lon: 72.8512,
    radius_m: 450,
    neighborhood: 'Hindmata, Dadar East, Mumbai',
    explanation: 'Incident strongly inferred as Drainage / Waterlogging Failure with 88% confidence based on multiple corroborated signals (elevated drainage sensor readings, zero transit velocity, citizen alerts). Heavy rainfall recorded in past 24 hours (112mm) is overwhelming the storm-water discharge capacity.',
    cause_ranking: [
      { cause: 'drainage_failure', label: 'Drainage / Waterlogging Failure', probability: 0.88 },
      { cause: 'road_blockage', label: 'Road Blockage / Obstruction', probability: 0.35 },
      { cause: 'road_accident', label: 'Road Accident / Collision', probability: 0.12 },
      { cause: 'earthquake', label: 'Seismic Event / Earthquake', probability: 0.05 },
      { cause: 'power_outage', label: 'Power Grid Failure / Outage', probability: 0.08 },
    ],
    confidence_history: [
      { t: '12:00', confidence: 0.30 },
      { t: '12:10', confidence: 0.52 },
      { t: '12:20', confidence: 0.74 },
      { t: '12:30', confidence: 0.88 },
    ],
    flood_polygon: [
      [72.8490, 19.0095],
      [72.8535, 19.0095],
      [72.8545, 19.0130],
      [72.8520, 19.0140],
      [72.8485, 19.0125],
      [72.8490, 19.0095],
    ],
    created_at: new Date(Date.now() - 45 * 60000).toISOString(),
    updated_at: new Date().toISOString(),
    events: [
      {
        id: 101,
        source_type: 'water_level',
        lat: 19.0112,
        lon: 72.8512,
        timestamp: new Date(Date.now() - 38 * 60000).toISOString(),
        payload: { value: 78.5, unit: 'cm', description: 'Hindmata culvert overflow detected' },
        device_id: 'IOT-DRAIN-HM01',
        trust: 0.95,
        signature_verified: true,
        is_duplicate: false,
        is_anomaly: true,
        anomaly_zscore: 3.2,
      },
      {
        id: 102,
        source_type: 'road_sensor',
        lat: 19.0118,
        lon: 72.8508,
        timestamp: new Date(Date.now() - 32 * 60000).toISOString(),
        payload: { value: 1, status: 'submerged', description: 'Road underwater at Hindmata junction' },
        device_id: 'ROAD-HM-01',
        trust: 0.88,
        signature_verified: true,
        is_duplicate: false,
        is_anomaly: true,
        anomaly_zscore: 2.8,
      },
      {
        id: 103,
        source_type: 'transit',
        lat: 19.0125,
        lon: 72.8515,
        timestamp: new Date(Date.now() - 28 * 60000).toISOString(),
        payload: { value: 3.2, unit: 'km/h', description: 'BEST bus route 104 crawling due to deep water' },
        device_id: 'TRANSIT-BEST-104',
        trust: 0.85,
        signature_verified: false,
        is_duplicate: false,
        is_anomaly: true,
        anomaly_zscore: 2.9,
      },
      {
        id: 104,
        source_type: 'citizen_report',
        lat: 19.0110,
        lon: 72.8518,
        timestamp: new Date(Date.now() - 25 * 60000).toISOString(),
        payload: { text: 'Water up to knee level under Hindmata flyover. Cars stranded.' },
        device_id: 'CITIZEN-APP-9901',
        trust: 0.60,
        signature_verified: false,
        is_duplicate: false,
        is_anomaly: false,
        anomaly_zscore: 0.0,
      },
      {
        id: 105,
        source_type: 'weather',
        lat: 18.9067,
        lon: 72.8147,
        timestamp: new Date(Date.now() - 40 * 60000).toISOString(),
        payload: { value: 85, unit: 'mm/hr', description: 'Intense cloudburst rain cell active' },
        device_id: 'open-meteo-mumbai',
        trust: 0.80,
        signature_verified: true,
        is_duplicate: false,
        is_anomaly: true,
        anomaly_zscore: 3.5,
      },
    ],
  },
]

export const MOCK_SOURCES: SourceItem[] = [
  {
    id: 1,
    device_id: 'IOT-DRAIN-HM01',
    source_type: 'water_level',
    name: 'Hindmata Culvert Level Sensor #1',
    lat: 19.0112,
    lon: 72.8512,
    trust_score: 0.95,
    is_flagged: false,
    signature_status: 'verified',
    last_seen: new Date().toISOString(),
  },
  {
    id: 2,
    device_id: 'IOT-DRAIN-HM02',
    source_type: 'water_level',
    name: 'Hindmata Flyover Underpass Sensor #2',
    lat: 19.0105,
    lon: 72.8520,
    trust_score: 0.93,
    is_flagged: false,
    signature_status: 'verified',
    last_seen: new Date().toISOString(),
  },
  {
    id: 3,
    device_id: 'ROAD-HM-01',
    source_type: 'road_sensor',
    name: 'Hindmata Junction Induction Loop',
    lat: 19.0118,
    lon: 72.8508,
    trust_score: 0.88,
    is_flagged: false,
    signature_status: 'verified',
    last_seen: new Date().toISOString(),
  },
  {
    id: 4,
    device_id: 'TRANSIT-BEST-104',
    source_type: 'transit',
    name: 'BEST Fleet GPS Telemetry #104',
    lat: 19.0125,
    lon: 72.8515,
    trust_score: 0.85,
    is_flagged: false,
    signature_status: 'unverified',
    last_seen: new Date().toISOString(),
  },
  {
    id: 5,
    device_id: 'open-meteo',
    source_type: 'weather',
    name: 'Open-Meteo High-Resolution Precipitation Adapter',
    lat: 19.0112,
    lon: 72.8512,
    trust_score: 0.80,
    is_flagged: false,
    signature_status: 'verified',
    last_seen: new Date().toISOString(),
  },
  {
    id: 6,
    device_id: 'IOT-DRAIN-MALF-09',
    source_type: 'water_level',
    name: 'Dadar Culvert Pressure Transducer (Drifting)',
    lat: 19.0150,
    lon: 72.8490,
    trust_score: 0.28,
    is_flagged: true,
    signature_status: 'unverified',
    last_seen: new Date().toISOString(),
  },
]

export const MOCK_WEATHER: WeatherMetrics = {
  location: 'Mumbai (Hindmata & South-Central)',
  lat: 19.0112,
  lon: 72.8512,
  current_precip_mm: 42.5,
  rain_intensity: 'Heavy Rain',
  past_24h_rainfall_mm: 112.4,
  river_discharge_m3s: 14.8,
  flood_risk_level: 'High',
  advisory: 'Monsoon surge: intense localized showers accumulating in low-lying subways and culverts. Pumping stations operational.',
  timestamp: new Date().toISOString(),
}

export const MOCK_EARTHQUAKES: EarthquakeItem[] = [
  {
    source_type: 'seismic',
    device_id: 'USGS-eq-sample-1',
    lat: 19.350,
    lon: 73.120,
    timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
    trust: 0.95,
    signature_verified: true,
    provenance: 'measured',
    payload: {
      usgs_id: 'eq-sample-1',
      magnitude: 3.4,
      depth_km: 12.0,
      place: '24 km NE of Mumbai (Thane fault system)',
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/sample1',
      alert: 'green',
      tsunami: 0,
      provenance: 'measured',
    },
  },
]

export const MOCK_GOOGLE_FLOOD: GoogleFloodResponse = {
  available: false,
  status: 'fallback',
  message: 'GOOGLE_FLOOD_API_KEY is not configured. River gauge forecasting API is in fallback mode.',
  gauges: [],
  flood_hub_url: 'https://sites.research.google/floods/l/19.0760/72.8777/10',
  attribution: 'Flood forecast data: Google Flood Hub, CC BY 4.0',
  coverage_note: 'Google Flood Hub models riverine flood risks, not street-level drainage / waterlogging.',
}

export const MOCK_WINDY: WindyConfig = {
  has_key: false,
  api_key: null,
  embed_url: 'https://embed.windy.com/embed2.html?lat=19.076&lon=72.877&detailLat=19.076&detailLon=72.877&width=650&height=450&zoom=10&level=surface&overlay=rain&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1',
  attribution: 'Wind & weather data: Windy.com',
  available_overlays: ['wind', 'rain', 'clouds', 'waves'],
  sync_note: 'Iframe embed mode cannot sync with custom timeline scrub slider. Set WINDY_MAP_API_KEY for native Leaflet API mode.',
}

export async function fetchIncidents(): Promise<Incident[]> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/incidents`)
    if (!res.ok) throw new Error('Failed to fetch')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using mock incidents:', err)
    return MOCK_INCIDENTS
  }
}

export async function fetchIncident(id: number): Promise<Incident> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/incidents/${id}`)
    if (!res.ok) throw new Error('Failed to fetch')
    return await res.json()
  } catch (err) {
    console.warn(`Backend unavailable, using mock incident ${id}:`, err)
    return MOCK_INCIDENTS.find(i => i.id === id) || MOCK_INCIDENTS[0]
  }
}

export async function fetchSources(): Promise<SourceItem[]> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/sources`)
    if (!res.ok) throw new Error('Failed to fetch')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using mock sources:', err)
    return MOCK_SOURCES
  }
}

export async function fetchWeather(city?: string): Promise<WeatherMetrics> {
  if (city && city.toLowerCase().includes('new york')) {
    return {
      location: 'New York (Central Park)',
      lat: 40.7829,
      lon: -73.9654,
      current_precip_mm: 3.2,
      rain_intensity: 'Light Showers',
      past_24h_rainfall_mm: 14.8,
      river_discharge_m3s: 5.2,
      flood_risk_level: 'Low',
      advisory: 'Conditions normal across metropolitan sectors.',
      timestamp: new Date().toISOString(),
    }
  }

  try {
    const res = await fetchWithTimeout(`${API_BASE}/weather/hindmata`)
    if (!res.ok) {
      const resAlt = await fetchWithTimeout(`${API_BASE}/weather`)
      if (!resAlt.ok) throw new Error('Failed to fetch weather')
      const altData = await resAlt.json()
      if (altData.locations && altData.locations.hindmata) {
        return normalizeWeatherPayload(altData.locations.hindmata, null)
      }
      return MOCK_WEATHER
    }
    const rawData = await res.json()
    return normalizeWeatherPayload(rawData.weather || rawData, rawData.river_discharge)
  } catch (err) {
    console.warn('Backend unavailable, using mock weather:', err)
    return MOCK_WEATHER
  }
}

function normalizeWeatherPayload(w: any, rd: any): WeatherMetrics {
  const precip24h = Number(w.precipitation_24h_mm ?? w.past_24h_rainfall_mm ?? 112.4)
  const currentPrecip = Number(w.current_precipitation_mm ?? w.current_precip_mm ?? 42.5)
  const dischargeList = rd?.river_discharge || []
  const latestDischarge = dischargeList.length > 0 ? dischargeList[0].discharge_m3s : 14.8

  let floodRisk: 'Low' | 'Moderate' | 'High' | 'Severe' = 'High'
  if (precip24h >= 150 || currentPrecip >= 50) {
    floodRisk = 'Severe'
  } else if (precip24h >= 80 || currentPrecip >= 25) {
    floodRisk = 'High'
  } else if (precip24h >= 30) {
    floodRisk = 'Moderate'
  } else {
    floodRisk = 'Low'
  }

  let intensity = 'Moderate Rain'
  if (currentPrecip >= 50) intensity = 'Cloudburst / Extreme Rain'
  else if (currentPrecip >= 25) intensity = 'Heavy Rain'
  else if (currentPrecip >= 5) intensity = 'Moderate Rain'
  else if (currentPrecip > 0) intensity = 'Light Showers'
  else intensity = 'Overcast / Dry'

  return {
    location: w.name || w.location || 'Mumbai (Hindmata)',
    lat: w.lat || 19.0112,
    lon: w.lon || 72.8512,
    current_precip_mm: currentPrecip,
    rain_intensity: intensity,
    past_24h_rainfall_mm: precip24h,
    river_discharge_m3s: latestDischarge,
    flood_risk_level: floodRisk,
    advisory: precip24h > 100
      ? 'Monsoon surge: intense localized showers accumulating in low-lying subways and culverts. Pumping stations operational.'
      : 'Monsoon conditions normal.',
    timestamp: w.fetched_at || new Date().toISOString(),
  }
}

export async function fetchEarthquakes(scope = 'mumbai', minMag = 2.5): Promise<{ earthquakes: EarthquakeItem[]; attribution: string; count: number }> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/hazards/earthquakes?scope=${scope}&min_magnitude=${minMag}`)
    if (!res.ok) throw new Error('Failed to fetch earthquakes')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using mock earthquakes:', err)
    return {
      count: MOCK_EARTHQUAKES.length,
      earthquakes: MOCK_EARTHQUAKES,
      attribution: 'Earthquake data: USGS, public domain',
    }
  }
}

export async function fetchGoogleFlood(): Promise<GoogleFloodResponse> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/hazards/google-flood`)
    if (!res.ok) throw new Error('Failed to fetch Google flood data')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using mock Google Flood response:', err)
    return MOCK_GOOGLE_FLOOD
  }
}

export async function fetchWindyConfig(): Promise<WindyConfig> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/hazards/windy-config`)
    if (!res.ok) throw new Error('Failed to fetch Windy config')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using mock Windy config:', err)
    return MOCK_WINDY
  }
}

export async function fetchDataSources(): Promise<DataSourceItem[]> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/hazards/data-sources`)
    if (!res.ok) throw new Error('Failed to fetch data sources')
    const json = await res.json()
    return json.sources
  } catch (err) {
    console.warn('Backend unavailable, using fallback data sources:', err)
    return [
      {
        id: 'usgs',
        name: 'USGS Earthquake Hazards Program',
        type: 'Seismic Telemetry Feed',
        license: 'Public Domain',
        attribution: 'Earthquake data: USGS',
        status: 'live',
        endpoint: 'https://earthquake.usgs.gov',
        description: 'Global and regional real-time earthquake feeds parsed every 5 minutes.',
      },
      {
        id: 'open-meteo',
        name: 'Open-Meteo Weather API',
        type: 'Hydro-Meteorological Forecasts',
        license: 'CC BY 4.0',
        attribution: 'Weather data: Open-Meteo.com',
        status: 'live',
        endpoint: 'https://api.open-meteo.com',
        description: 'Hourly rainfall intensity and past 24-hour precipitation accumulation.',
      },
      {
        id: 'google-flood',
        name: 'Google Flood Hub Forecasting',
        type: 'Riverine Flood Gauges',
        license: 'CC BY 4.0',
        attribution: 'Flood forecast data: Google Flood Hub, CC BY 4.0',
        status: 'fallback',
        endpoint: 'https://sites.research.google/floods',
        description: 'Upstream river basin gauge forecasts with direct portal link.',
      },
      {
        id: 'windy',
        name: 'Windy.com Meteorological Layers',
        type: 'Animated Atmospheric Overlays',
        license: 'Proprietary Terms',
        attribution: 'Map data: Windy.com & ECMWF',
        status: 'fallback',
        endpoint: 'https://embed.windy.com',
        description: 'Radar rainfall, wind vectors, clouds, and waves via official embed.',
      },
      {
        id: 'basemaps',
        name: 'Esri & CARTO Tile Services',
        type: 'GIS Basemaps',
        license: 'OpenStreetMap / Esri Terms',
        attribution: 'CARTO, OpenStreetMap, Esri',
        status: 'live',
        endpoint: 'CARTO & Esri World Imagery',
        description: 'High-resolution light, dark, and satellite imagery tiles.',
      },
    ]
  }
}

export async function runScenario(name: string): Promise<any> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/scenarios/${name}`, { method: 'POST' })
    if (!res.ok) throw new Error('Scenario run failed')
    return await res.json()
  } catch (err) {
    console.warn(`Scenario ${name} simulated on frontend fallback`, err)
    return { scenario: name, message: `Simulated ${name}` }
  }
}

export async function resetDatabase(): Promise<any> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/reset`, { method: 'POST' })
    if (!res.ok) throw new Error('Reset failed')
    return await res.json()
  } catch (err) {
    console.warn('Reset simulated on frontend fallback', err)
    return { status: 'reset', message: 'Simulated reset' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// V1 Incident Intelligence & Earth API
// ─────────────────────────────────────────────────────────────────────────────

export interface V1Incident {
  incident_id: string
  title: string
  primary_cause: string
  cause_label: string
  cause_confidence: number
  cause_ranking: Array<{ cause: string; label: string; probability: number; category?: string }>
  cause_ranking_rules?: Array<{ cause: string; label: string; probability: number }>
  cause_ranking_ml?: Array<{ cause: string; label: string; probability: number }>
  confidence_level: 'low' | 'medium' | 'high'
  summary: string
  why_not_higher?: string[]
  check_next?: string
  severity_score: number
  severity_level: 'Low' | 'Medium' | 'High'
  severity_factors?: string[]
  nearest_infrastructure?: {
    hospital?: { name: string; distance_km: number; id?: string }
    fire_station?: { name: string; distance_km: number; id?: string }
    station?: { name: string; distance_km: number; id?: string }
  }
  centroid_lat: number
  centroid_lon: number
  radius_m: number
  neighborhood: string
  city?: string
  country?: string
  event_ids: string[]
  relationships?: any[]
  explanation?: string
  events?: any[]
  is_synthetic?: boolean
  status?: string
  created_at: string
  updated_at: string
  alert_sent_at?: string
}

export const MOCK_V1_INCIDENTS: V1Incident[] = [
  {
    incident_id: 'INCIDENT-001',
    title: 'Drainage / Waterlogging Failure — Hindmata Junction',
    primary_cause: 'drainage_failure',
    cause_label: 'Drainage / Waterlogging Failure',
    cause_confidence: 0.88,
    cause_ranking: [
      { cause: 'drainage_failure', label: 'Drainage / Waterlogging Failure', probability: 0.88, category: 'Hydrological' },
      { cause: 'road_blockage', label: 'Road Blockage / Obstruction', probability: 0.35, category: 'Transportation' },
      { cause: 'road_accident', label: 'Road Accident / Collision', probability: 0.12, category: 'Safety' },
      { cause: 'power_outage', label: 'Power Grid Failure / Blackout', probability: 0.08, category: 'Utility' },
      { cause: 'gas_leak_hazard', label: 'Gas Leak or Hazard', probability: 0.04, category: 'Hazard' },
    ],
    cause_ranking_rules: [
      { cause: 'drainage_failure', label: 'Drainage / Waterlogging Failure', probability: 0.85 },
      { cause: 'road_blockage', label: 'Road Blockage / Obstruction', probability: 0.32 },
    ],
    cause_ranking_ml: [
      { cause: 'drainage_failure', label: 'Drainage / Waterlogging Failure', probability: 0.91 },
      { cause: 'road_blockage', label: 'Road Blockage / Obstruction', probability: 0.38 },
    ],
    confidence_level: 'high',
    summary: 'Heavy rainfall likely caused flooding near Hindmata. Confidence: high, because multiple verified physical sensors and dispatch calls corroborate it.',
    why_not_higher: [
      'Missing physical sensor corroboration in secondary stormwater outfall',
      'Few eyewitness dispatch calls relative to storm intensity',
    ],
    check_next: 'water_level',
    severity_score: 82,
    severity_level: 'High',
    severity_factors: ['92 cm water', '4 source types', 'Sensor anomaly (z=3.2)'],
    nearest_infrastructure: {
      hospital: { name: 'Gleneagles Hospital Super Speciality', distance_km: 1.72, id: 'INFRA-MUM-5099872961' },
      fire_station: { name: 'Testing Fire Station', distance_km: 3.17, id: 'INFRA-MUM-2187315849' },
      station: { name: 'Naigaon Railway Station', distance_km: 0.40, id: 'INFRA-MUM-3806743196' },
    },
    centroid_lat: 19.0112,
    centroid_lon: 72.8512,
    radius_m: 450,
    neighborhood: 'Hindmata Junction, Dadar East',
    city: 'Mumbai',
    country: 'India',
    event_ids: ['REAL-EVT-001', 'REAL-EVT-002', 'REAL-EVT-003', 'REAL-EVT-004'],
    explanation: 'Incident verified through multimodal telemetry. Water depth gauge reached 92.5 cm during cloudburst while vehicular velocity plunged below 2.1 km/h.',
    created_at: new Date(Date.now() - 45 * 60000).toISOString(),
    updated_at: new Date().toISOString(),
    events: [
      {
        event_id: 'REAL-EVT-001',
        source_type: 'water_level',
        source_name: 'BMC Storm Water Drainage Dept',
        source_url: 'https://dm.mcgm.gov.in/',
        lat: 19.0112,
        lon: 72.8512,
        trust: 0.95,
        is_anomaly: true,
        anomaly_zscore: 3.2,
        is_duplicate: false,
        payload: { value: 92.5, unit: 'cm', description: 'Hindmata Flyover water depth gauge reaches 92.5 cm during cloudburst' },
      },
      {
        event_id: 'REAL-EVT-002',
        source_type: 'citizen_report',
        source_name: 'Mumbai 24x7 Citizen Helpline',
        source_url: 'https://dm.mcgm.gov.in/',
        lat: 19.0125,
        lon: 72.8520,
        trust: 0.75,
        is_anomaly: false,
        anomaly_zscore: 0.0,
        is_duplicate: false,
        payload: { text: 'Waist-deep water near Chitra Cinema; commercial shops flooding' },
      },
      {
        event_id: 'REAL-EVT-003',
        source_type: 'road_sensor',
        source_name: 'Mumbai Traffic Police Telemetry',
        source_url: 'https://dm.mcgm.gov.in/',
        lat: 19.0108,
        lon: 72.8509,
        trust: 0.90,
        is_anomaly: true,
        anomaly_zscore: 2.8,
        is_duplicate: false,
        payload: { value: 2.1, unit: 'km/h', description: 'Traffic speed on Dr. Ambedkar Road plunges to 2.1 km/h' },
      },
      {
        event_id: 'REAL-EVT-004',
        source_type: 'transit',
        source_name: 'BEST Bus Transit Automated Vehicle Locator',
        source_url: 'https://dm.mcgm.gov.in/',
        lat: 19.0118,
        lon: 72.8515,
        trust: 0.92,
        is_anomaly: false,
        anomaly_zscore: 0.0,
        is_duplicate: false,
        payload: { description: 'BEST Bus Routes 11, 22, 66 diverted via Char Rasta due to waterlogging' },
      },
    ],
  },
  {
    incident_id: 'INCIDENT-002',
    title: 'Transit Corridor Track Submersion — Matunga Station',
    primary_cause: 'drainage_failure',
    cause_label: 'Railway Drainage Submersion',
    cause_confidence: 0.81,
    cause_ranking: [
      { cause: 'drainage_failure', label: 'Drainage Failure', probability: 0.81, category: 'Hydrological' },
      { cause: 'road_blockage', label: 'Track Obstruction', probability: 0.28, category: 'Transportation' },
    ],
    confidence_level: 'high',
    summary: 'Storm runoff overflowed railway drainage tracks near Matunga. Confidence: high, because track telemetry and dispatch reports confirm submersion.',
    why_not_higher: ['No direct Doppler radar confirmation in sector'],
    check_next: 'weather',
    severity_score: 76,
    severity_level: 'High',
    severity_factors: ['40 cm track water', 'Transit halt', 'Suburban rail network affected'],
    nearest_infrastructure: {
      hospital: { name: 'Pikale Hospital', distance_km: 1.2, id: 'INFRA-MUM-4672225593' },
      fire_station: { name: 'Testing Fire Station', distance_km: 2.1, id: 'INFRA-MUM-2187315849' },
      station: { name: 'Matunga Railway Station', distance_km: 0.15, id: 'INFRA-MUM-4264457295' },
    },
    centroid_lat: 19.0269,
    centroid_lon: 72.8553,
    radius_m: 350,
    neighborhood: 'Matunga Railway Station Tracks',
    city: 'Mumbai',
    country: 'India',
    event_ids: ['REAL-EVT-007'],
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
    updated_at: new Date().toISOString(),
    events: [
      {
        event_id: 'REAL-EVT-007',
        source_type: 'transit',
        source_name: 'Central Railway Track Telemetry',
        source_url: 'https://dm.mcgm.gov.in/',
        lat: 19.0269,
        lon: 72.8553,
        trust: 0.95,
        is_anomaly: true,
        anomaly_zscore: 3.0,
        is_duplicate: false,
        payload: { value: 40.0, description: 'Central Railway suburban tracks submerged at Sion-Matunga; services halted' },
      },
    ],
  },
  {
    incident_id: 'INCIDENT-003',
    title: 'Street Condition Defect — Manhattan Avenue, Brooklyn',
    primary_cause: 'road_blockage',
    cause_label: 'Infrastructure Obstruction',
    cause_confidence: 0.72,
    cause_ranking: [
      { cause: 'road_blockage', label: 'Road Obstruction', probability: 0.72, category: 'Transportation' },
      { cause: 'road_accident', label: 'Traffic Collision', probability: 0.25, category: 'Safety' },
    ],
    confidence_level: 'medium',
    summary: 'Hardware defect disrupted arterial flow on Manhattan Avenue. Confidence: medium, because citizen 311 report confirmed by traffic signal controller.',
    why_not_higher: ['Lack of physical IoT gauge telemetry'],
    check_next: 'road_sensor',
    severity_score: 52,
    severity_level: 'Medium',
    severity_factors: ['Hardware dislocation', '2 source reports'],
    nearest_infrastructure: {
      hospital: { name: 'Lenox Health Greenwich Village', distance_km: 3.5, id: 'INFRA-NYC-357620244' },
      fire_station: { name: 'New York Engine Company 221', distance_km: 1.1, id: 'INFRA-NYC-368047094' },
      station: { name: 'Bedford Avenue Station', distance_km: 0.6, id: 'INFRA-NYC-1002' },
    },
    centroid_lat: 40.7330,
    centroid_lon: -73.9547,
    radius_m: 250,
    neighborhood: 'MANHATTAN AVENUE, BROOKLYN',
    city: 'New York',
    country: 'United States',
    event_ids: ['NYC-311-70702737'],
    created_at: new Date(Date.now() - 60 * 60000).toISOString(),
    updated_at: new Date().toISOString(),
    events: [
      {
        event_id: 'NYC-311-70702737',
        source_type: 'citizen_report',
        source_name: 'NYC 311 (DOT)',
        source_url: 'https://data.cityofnewyork.us',
        lat: 40.7330,
        lon: -73.9547,
        trust: 0.78,
        is_anomaly: false,
        anomaly_zscore: 0.0,
        is_duplicate: false,
        payload: { description: 'NYC 311: Street Condition - Defective Hardware at MANHATTAN AVENUE' },
      },
    ],
  },
]

export interface V1CityItem {
  city: string
  name: string
  lat: number
  lon: number
  incident_count: number
  high_count: number
}

export const isOffline = (import.meta as any).env?.VITE_OFFLINE === 'true'

let cachedIncidentsSnapshot: V1Incident[] | null = null
let cachedCitiesSnapshot: V1CityItem[] | null = null
let cachedStatsSnapshot: any = null
let cachedEventsSnapshot: any = null

async function fetchSnapshotFile(filename: string): Promise<any> {
  const urls = [
    `/snapshot/${filename}`,
    `./snapshot/${filename}`,
    `snapshot/${filename}`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        return await res.json()
      }
    } catch {}
  }
  throw new Error(`Could not load snapshot file: ${filename}`)
}

async function getSnapshotCities(): Promise<V1CityItem[]> {
  if (cachedCitiesSnapshot) return cachedCitiesSnapshot
  try {
    const data = await fetchSnapshotFile('cities.json')
    if (Array.isArray(data) && data.length > 0) {
      cachedCitiesSnapshot = data
      return data
    }
  } catch (err) {
    console.warn('Failed to load snapshot cities.json:', err)
  }
  return [
    { city: 'mumbai', name: 'Mumbai', lat: 19.121742, lon: 72.862475, incident_count: 191, high_count: 48 },
    { city: 'pune', name: 'Pune', lat: 18.510793, lon: 73.854980, incident_count: 159, high_count: 29 },
    { city: 'nagpur', name: 'Nagpur', lat: 21.146703, lon: 79.086895, incident_count: 223, high_count: 40 },
    { city: 'delhi', name: 'Delhi', lat: 28.609941, lon: 77.221817, incident_count: 180, high_count: 34 },
    { city: 'bengaluru', name: 'Bengaluru', lat: 12.970724, lon: 77.597094, incident_count: 179, high_count: 37 },
    { city: 'hyderabad', name: 'Hyderabad', lat: 17.380345, lon: 78.491224, incident_count: 197, high_count: 27 },
    { city: 'guwahati', name: 'Guwahati', lat: 26.137415, lon: 91.744432, incident_count: 198, high_count: 31 },
  ]
}

async function getSnapshotIncidents(): Promise<V1Incident[]> {
  if (cachedIncidentsSnapshot) return cachedIncidentsSnapshot
  try {
    const data = await fetchSnapshotFile('incidents.json')
    if (Array.isArray(data) && data.length > 0) {
      cachedIncidentsSnapshot = data
      return data
    }
  } catch (err) {
    console.warn('Failed to load snapshot incidents.json:', err)
  }
  return MOCK_V1_INCIDENTS
}

async function getSnapshotStats(): Promise<any> {
  if (cachedStatsSnapshot) return cachedStatsSnapshot
  try {
    const data = await fetchSnapshotFile('stats.json')
    if (data) {
      cachedStatsSnapshot = data
      return data
    }
  } catch (err) {
    console.warn('Failed to load snapshot stats.json:', err)
  }
  return {
    total_events: 3218,
    total_incidents: 1327,
    by_city: {
      mumbai: { total_events: 574, incidents: 191, real: 24, synthetic: 550 },
      pune: { total_events: 390, incidents: 159, real: 16, synthetic: 374 },
      nagpur: { total_events: 483, incidents: 223, real: 21, synthetic: 462 },
      delhi: { total_events: 426, incidents: 180, real: 20, synthetic: 406 },
      bengaluru: { total_events: 438, incidents: 179, real: 22, synthetic: 416 },
      hyderabad: { total_events: 445, incidents: 197, real: 20, synthetic: 425 },
      guwahati: { total_events: 462, incidents: 198, real: 21, synthetic: 441 },
    },
    real_vs_synthetic: { real: 144, synthetic: 3074 },
  }
}

async function getSnapshotEventsGeoJSON(): Promise<any> {
  if (cachedEventsSnapshot) return cachedEventsSnapshot
  try {
    const data = await fetchSnapshotFile('events.json')
    if (data) {
      cachedEventsSnapshot = data
      return data
    }
  } catch (err) {
    console.warn('Failed to load snapshot events.json:', err)
  }
  return { type: 'FeatureCollection', features: [] }
}

export async function fetchV1Cities(): Promise<V1CityItem[]> {
  if (!isOffline) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/v1/cities`)
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('Backend unavailable, using snapshot v1 cities:', err)
    }
  }
  return await getSnapshotCities()
}

export async function fetchV1EventsGeoJSON(params?: { city?: string; from?: string; to?: string }): Promise<any> {
  if (!isOffline) {
    try {
      const q = new URLSearchParams()
      if (params?.city && params.city !== 'all') q.set('city', params.city)
      if (params?.from) q.set('from', params.from)
      if (params?.to) q.set('to', params.to)
      const url = `${API_BASE}/v1/events/geojson${q.toString() ? `?${q.toString()}` : ''}`
      const res = await fetchWithTimeout(url)
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('Backend unavailable, using snapshot geojson:', err)
    }
  }
  const geojson = await getSnapshotEventsGeoJSON()
  if (params?.city && params.city !== 'all') {
    const cNorm = params.city.toLowerCase()
    return {
      ...geojson,
      features: (geojson.features || []).filter((f: any) =>
        (f.properties?.city || '').toLowerCase() === cNorm
      ),
    }
  }
  return geojson
}

export async function fetchV1Stats(): Promise<any> {
  if (!isOffline) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/v1/stats`)
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('Backend unavailable, using snapshot v1 stats:', err)
    }
  }
  return await getSnapshotStats()
}

export async function fetchV1Incidents(city?: string, severity?: string): Promise<V1Incident[]> {
  if (!isOffline) {
    try {
      const params = new URLSearchParams()
      if (city && city !== 'all') params.set('city', city)
      if (severity && severity !== 'all') params.set('severity', severity)
      const url = `${API_BASE}/v1/incidents${params.toString() ? `?${params.toString()}` : ''}`
      const res = await fetchWithTimeout(url)
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('Backend unavailable, using snapshot v1 incidents:', err)
    }
  }
  const allIncidents = await getSnapshotIncidents()
  let filtered = allIncidents
  if (city && city !== 'all') {
    const cNorm = city.toLowerCase()
    filtered = filtered.filter(i => (i.city || '').toLowerCase() === cNorm)
  }
  if (severity && severity !== 'all') {
    const sNorm = severity.toLowerCase()
    filtered = filtered.filter(i => (i.severity_level || '').toLowerCase() === sNorm)
  }
  return filtered
}

export async function fetchV1Incident(id: string): Promise<V1Incident> {
  if (!isOffline) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/v1/incidents/${id}`)
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn(`Backend unavailable, using snapshot incident for ${id}:`, err)
    }
  }
  const allIncidents = await getSnapshotIncidents()
  const match = allIncidents.find(i => i.incident_id === id) || allIncidents[0] || MOCK_V1_INCIDENTS[0]
  return match
}

export async function fetchV1Replay(id: string): Promise<any> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/v1/incidents/${id}/replay`)
    if (!res.ok) throw new Error('Failed to fetch v1 replay')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using fallback replay:', err)
    return {
      incident_id: id,
      total_steps: 4,
      steps: [
        {
          step: 1,
          event: MOCK_V1_INCIDENTS[0].events?.[0],
          confidence: 0.42,
          confidence_level: 'low',
          primary_cause: 'drainage_failure',
          cause_label: 'Drainage Failure',
          severity_level: 'Medium',
        },
        {
          step: 2,
          event: MOCK_V1_INCIDENTS[0].events?.[1],
          confidence: 0.65,
          confidence_level: 'medium',
          primary_cause: 'drainage_failure',
          cause_label: 'Drainage Failure',
          severity_level: 'High',
        },
        {
          step: 3,
          event: MOCK_V1_INCIDENTS[0].events?.[2],
          confidence: 0.78,
          confidence_level: 'high',
          primary_cause: 'drainage_failure',
          cause_label: 'Drainage Failure',
          severity_level: 'High',
        },
        {
          step: 4,
          event: MOCK_V1_INCIDENTS[0].events?.[3],
          confidence: 0.88,
          confidence_level: 'high',
          primary_cause: 'drainage_failure',
          cause_label: 'Drainage Failure',
          severity_level: 'High',
        },
      ],
    }
  }
}

export async function fetchV1Briefing(id: string): Promise<any> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/v1/incidents/${id}/briefing`)
    if (!res.ok) throw new Error('Failed to fetch v1 briefing')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using fallback briefing:', err)
    return {
      incident_id: id,
      briefing: '### 🚨 Operational Intelligence Briefing\n**Incident Status**: Verified Drainage Failure near Hindmata Junction.\n- **Primary Driver**: Stormwater culvert saturation (92.5 cm depth gauge reading)\n- **Arterial Velocity**: Traffic flow degraded to 2.1 km/h on Dr. Ambedkar Road\n- **Immediate Priority**: Deploy mobile dewatering units to Hindmata depression.',
      summary: MOCK_V1_INCIDENTS[0].summary,
      confidence_level: 'high',
      recommended_actions: [
        'Deploy municipal suction pumps at Hindmata culvert basin',
        'Reroute traffic along Dr. Ambedkar Road via Char Rasta',
        'Alert Central Railway track monitoring teams at Matunga approach',
      ],
      source: 'fallback',
    }
  }
}

export async function fetchV1Infrastructure(city?: string): Promise<any> {
  try {
    const params = new URLSearchParams()
    if (city) params.set('city', city)
    const res = await fetchWithTimeout(`${API_BASE}/v1/layers/infrastructure?${params.toString()}`)
    if (!res.ok) throw new Error('Failed to fetch infrastructure layer')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using fallback infrastructure:', err)
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [72.8405, 18.9994] },
          properties: { name: 'Gleneagles Hospital', type: 'hospital', city: 'Mumbai' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [72.8538, 19.0396] },
          properties: { name: 'Testing Fire Station', type: 'fire_station', city: 'Mumbai' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [72.8478, 19.0095] },
          properties: { name: 'Naigaon Station', type: 'station', city: 'Mumbai' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [72.8501, 19.0274] },
          properties: { name: 'Matunga Station', type: 'station', city: 'Mumbai' },
        },
      ],
    }
  }
}

export async function fetchV1Rainfall(city?: string): Promise<any> {
  try {
    const params = new URLSearchParams()
    if (city) params.set('city', city)
    const res = await fetchWithTimeout(`${API_BASE}/v1/layers/rainfall?${params.toString()}`)
    if (!res.ok) throw new Error('Failed to fetch rainfall layer')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using fallback rainfall layer:', err)
    return {
      type: 'FeatureCollection',
      city: city || 'Mumbai',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [72.8512, 19.0112] },
          properties: { rain_mm: 92.5, timestamp: new Date().toISOString(), provider: 'Open-Meteo' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [72.8520, 19.0125] },
          properties: { rain_mm: 78.0, timestamp: new Date().toISOString(), provider: 'Open-Meteo' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [72.8553, 19.0269] },
          properties: { rain_mm: 65.0, timestamp: new Date().toISOString(), provider: 'Open-Meteo' },
        },
      ],
    }
  }
}

export async function postV1Event(event: any): Promise<any> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
    if (!res.ok) throw new Error('Failed to ingest event')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, event handled locally:', err)
    return { status: 'ok', event, incident: MOCK_V1_INCIDENTS[0] }
  }
}

export async function fetchAlertRecipients(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/v1/alert-recipients`)
    if (!res.ok) throw new Error('Failed to fetch recipients')
    const data = await res.json()
    return data.recipients || []
  } catch (err) {
    return ['+917972253404', '+918261080711']
  }
}

export async function updateAlertRecipients(recipients: string[]): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/v1/alert-recipients`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients }),
    })
    if (!res.ok) throw new Error('Failed to update recipients')
    const data = await res.json()
    return data.recipients || recipients
  } catch (err) {
    return recipients
  }
}

export async function sendIncidentAlert(
  incidentId: string,
  recipients?: string[]
): Promise<{ status: string; sent: boolean; alert_sent_at?: string }> {
  if (isOffline) {
    return { status: 'offline', sent: false }
  }
  try {
    const res = await fetchWithTimeout(`${API_BASE}/v1/incidents/${incidentId}/alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients }),
    })
    if (!res.ok) throw new Error('Alert failed')
    return await res.json()
  } catch (err) {
    return { status: 'offline', sent: false }
  }
}

export interface CopilotPayload {
  message?: string
  mode?: 'chat' | 'summarize_area' | 'summarize_incident'
  city?: string
  incident_id?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface CopilotAction {
  type: string
  incident_id: string
  priority?: string
  status?: string
}

export interface CopilotResponse {
  reply: string
  action: CopilotAction | null
  source: 'groq' | 'fallback'
  suggestions: string[]
}

const INDIAN_HELPLINES = [
  { name: 'National Emergency', number: '112', desc: 'All-in-one emergency helpline' },
  { name: 'Police', number: '100', desc: 'Police control room' },
  { name: 'Fire', number: '101', desc: 'Fire & rescue service' },
  { name: 'Ambulance', number: '108', desc: 'Emergency medical response' },
  { name: 'Disaster Management', number: '1078', desc: 'NDRF / Disaster authority' },
  { name: 'Women Helpline', number: '1091', desc: 'Emergency response for women' },
  { name: 'Child Helpline', number: '1098', desc: 'Child protection service' },
]

async function getOfflineCopilotFallback(payload: CopilotPayload): Promise<CopilotResponse> {
  const msg = (payload.message || '').toLowerCase()
  const city = (payload.city || 'mumbai').toLowerCase()
  const incidents = await getSnapshotIncidents()
  const cityIncidents = incidents.filter(i => (i.city || '').toLowerCase() === city)
  const selected = payload.incident_id ? incidents.find(i => i.incident_id === payload.incident_id) : null

  if (msg.includes('helpline') || msg.includes('police') || msg.includes('ambulance') || msg.includes('fire') || msg.includes('emergency number')) {
    const list = INDIAN_HELPLINES.map(h => `• **${h.name}**: **${h.number}** (${h.desc})`).join('\n')
    return {
      reply: `• **Official Emergency Helplines (India)**:\n${list}\n• *City-specific numbers: verify with local authority.*`,
      action: null,
      source: 'fallback',
      suggestions: ['Summarize this area', 'What are the highest priority incidents?'],
    }
  }

  if (payload.mode === 'summarize_incident' || (selected && msg.includes('summarize') && !msg.includes('area'))) {
    if (selected) {
      return {
        reply: `• **${selected.title}** (${selected.severity_level || 'Medium'} severity, ${Math.round((selected.cause_confidence || 0) * 100)}% confidence)\n• **Primary Cause**: ${(selected.primary_cause || 'Unknown').replace(/_/g, ' ')}\n• **Summary**: ${selected.summary || selected.explanation || 'Sensor telemetry correlated.'}\n• **Check Next**: ${selected.check_next || 'Inspect drainage nodes and flow sensors.'}\n• **Nearest Help**: Station 0.8 km, Hospital 1.2 km, Fire station 1.4 km`,
        action: null,
        source: 'fallback',
        suggestions: ['What should I check next?', 'Why is confidence not higher?', 'Assign this area highest priority'],
      }
    }
  }

  if (payload.mode === 'summarize_area' || msg.includes('summarize this area') || msg.includes('area')) {
    const high = cityIncidents.filter(i => (i.severity_level || '').toLowerCase() === 'high').length
    const med = cityIncidents.filter(i => (i.severity_level || '').toLowerCase() === 'medium').length
    const low = cityIncidents.filter(i => (i.severity_level || '').toLowerCase() === 'low').length
    const top3 = cityIncidents.slice(0, 3).map(i => `  - **${i.incident_id}**: ${i.title} (${i.severity_level})`).join('\n')
    return {
      reply: `• **${city.toUpperCase()} Area Intelligence**:\n• Severity breakdown: **${high} High**, **${med} Medium**, **${low} Low** incidents.\n• Top Priorities:\n${top3}`,
      action: null,
      source: 'fallback',
      suggestions: ['Assign this area highest priority', 'Show emergency helplines', 'Nearest hospital'],
    }
  }

  if (msg.includes('assign') || msg.includes('priority') || msg.includes('highest priority') || msg.includes('dispatch')) {
    const target = selected || cityIncidents[0] || incidents[0]
    const targetId = target ? target.incident_id : 'INCIDENT-001'
    return {
      reply: `• Recommend escalating **${targetId}** to **P1 (Highest Priority)** based on causal drivers and sensor consensus.\n• ACTION required: Confirm P1 priority escalation.`,
      action: { type: 'set_priority', incident_id: targetId, priority: 'P1' },
      source: 'fallback',
      suggestions: ['What should I check next?', 'Show emergency helplines'],
    }
  }

  const top3 = cityIncidents.slice(0, 3).map(i => `• **${i.incident_id}**: ${i.title} (${i.severity_level})`).join('\n')
  return {
    reply: `Offline mode. Active incidents in ${city.toUpperCase()}:\n${top3}`,
    action: null,
    source: 'fallback',
    suggestions: ['Summarize this area', 'Emergency helplines', 'Nearest hospital'],
  }
}

export async function sendCopilotMessage(payload: CopilotPayload): Promise<CopilotResponse> {
  if (isOffline) {
    return getOfflineCopilotFallback(payload)
  }
  try {
    const res = await fetchWithTimeout(`${API_BASE}/v1/copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Copilot returned ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn('Copilot backend unreachable, using offline fallback:', err)
    return getOfflineCopilotFallback(payload)
  }
}


