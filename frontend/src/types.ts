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
  source_type: 'water_level' | 'road_sensor' | 'citizen_report' | 'emergency_call' | 'weather' | 'transit'
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
