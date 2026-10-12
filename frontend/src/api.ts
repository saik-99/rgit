import type { Incident, SourceItem, WeatherMetrics } from './types'

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
      return await resAlt.json()
    }
    return await res.json()
  } catch (err) {
    console.warn('Backend unavailable, using mock weather:', err)
    return MOCK_WEATHER
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
