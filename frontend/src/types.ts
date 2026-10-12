export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical'

export interface CauseRank {
  cause: string
  label: string
  probability: number
  supports?: string[]
  contradicts?: string[]
}

export interface ConfidencePoint {
  t: string
  confidence: number
}

export interface EventItem {
  id: number
  source_type: 'water_level' | 'road_sensor' | 'citizen_report' | 'emergency_call' | 'weather' | 'transit' | 'seismic'
  lat: number
  lon: number
  timestamp: string
  received_at?: string
  payload: Record<string, any>
  device_id: string
  trust: number
  signature_verified: boolean
  is_duplicate: boolean
  is_anomaly: boolean
  anomaly_zscore: number
  h3_cell?: string
  incident_id?: number | null
}

export interface Incident {
  id: number
  title: string
  cause: string
  cause_confidence: number
  severity_score: number
  severity_level: SeverityLevel
  status: 'active' | 'resolved' | 'monitoring'
  centroid_lat: number
  centroid_lon: number
  radius_m: number
  neighborhood: string
  explanation: string
  cause_ranking: CauseRank[]
  confidence_history: ConfidencePoint[]
  flood_polygon: [number, number][]
  created_at: string
  updated_at: string
  events?: EventItem[]
}

export interface SourceItem {
  id: number
  device_id: string
  source_type: string
  name: string
  lat: number
  lon: number
  trust_score: number
  is_flagged: boolean
  signature_status: string
  last_seen: string
}

export interface WeatherMetrics {
  location: string
  lat: number
  lon: number
  current_precip_mm: number
  rain_intensity: string
  past_24h_rainfall_mm: number
  river_discharge_m3s?: number
  flood_risk_level: 'Low' | 'Moderate' | 'High' | 'Severe'
  advisory: string
  timestamp: string
}

export interface EarthquakeItem {
  source_type: 'seismic'
  device_id: string
  lat: number
  lon: number
  timestamp: string
  trust: number
  signature_verified: boolean
  provenance: 'measured' | 'test'
  payload: {
    usgs_id: string
    magnitude: number
    depth_km: number
    place: string
    url: string
    alert?: string | null
    tsunami?: number
    provenance?: 'measured' | 'test'
    test_flag?: boolean
  }
}

export interface GoogleFloodGauge {
  id: string
  name: string
  river: string
  lat: number
  lon: number
  severity: 'green' | 'amber' | 'red'
  status: string
  forecast?: Record<string, any>
}

export interface GoogleFloodResponse {
  available: boolean
  status: 'live' | 'fallback' | 'no_data'
  message: string
  gauges: GoogleFloodGauge[]
  flood_hub_url: string
  attribution: string
  coverage_note: string
  last_updated?: string
}

export interface WindyConfig {
  has_key: boolean
  api_key?: string | null
  embed_url: string
  attribution: string
  available_overlays: string[]
  sync_note: string
}

export interface DataSourceItem {
  id: string
  name: string
  type: string
  license: string
  attribution: string
  status: 'live' | 'fallback' | 'disabled'
  endpoint: string
  description: string
}
