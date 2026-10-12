import type {
  Incident, SourceItem, WeatherMetrics, EarthquakeItem,
  GoogleFloodResponse, WindyConfig, DataSourceItem
} from './types'

const API_BASE = '/api'

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
    const res = await fetch(`${API_BASE}/incidents`)
    if (!res.ok) throw new Error('Failed to fetch')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using mock incidents:', err)
    return MOCK_INCIDENTS
  }
}

export async function fetchIncident(id: number): Promise<Incident> {
  try {
    const res = await fetch(`${API_BASE}/incidents/${id}`)
    if (!res.ok) throw new Error('Failed to fetch')
    return await res.json()
  } catch (err) {
    console.warn(`Backend unavailable, using mock incident ${id}:`, err)
    return MOCK_INCIDENTS.find(i => i.id === id) || MOCK_INCIDENTS[0]
  }
}

export async function fetchSources(): Promise<SourceItem[]> {
  try {
    const res = await fetch(`${API_BASE}/sources`)
    if (!res.ok) throw new Error('Failed to fetch')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using mock sources:', err)
    return MOCK_SOURCES
  }
}

export async function fetchWeather(): Promise<WeatherMetrics> {
  try {
    const res = await fetch(`${API_BASE}/weather/hindmata`)
    if (!res.ok) {
      const resAlt = await fetch(`${API_BASE}/weather`)
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
    const res = await fetch(`${API_BASE}/hazards/earthquakes?scope=${scope}&min_magnitude=${minMag}`)
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
    const res = await fetch(`${API_BASE}/hazards/google-flood`)
    if (!res.ok) throw new Error('Failed to fetch Google flood data')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using mock Google Flood response:', err)
    return MOCK_GOOGLE_FLOOD
  }
}

export async function fetchWindyConfig(): Promise<WindyConfig> {
  try {
    const res = await fetch(`${API_BASE}/hazards/windy-config`)
    if (!res.ok) throw new Error('Failed to fetch Windy config')
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using mock Windy config:', err)
    return MOCK_WINDY
  }
}

export async function fetchDataSources(): Promise<DataSourceItem[]> {
  try {
    const res = await fetch(`${API_BASE}/hazards/data-sources`)
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
    const res = await fetch(`${API_BASE}/scenarios/${name}`, { method: 'POST' })
    if (!res.ok) throw new Error('Scenario run failed')
    return await res.json()
  } catch (err) {
    console.warn(`Scenario ${name} simulated on frontend fallback`, err)
    return { scenario: name, message: `Simulated ${name}` }
  }
}

export async function resetDatabase(): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/reset`, { method: 'POST' })
    if (!res.ok) throw new Error('Reset failed')
    return await res.json()
  } catch (err) {
    console.warn('Reset simulated on frontend fallback', err)
    return { status: 'reset', message: 'Simulated reset' }
  }
}
