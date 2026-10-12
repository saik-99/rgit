/**
 * Friendly name formatters and event date/time formatters.
 * Clean text without emojis for professional UI aesthetics.
 */

export const SOURCE_TYPE_FRIENDLY: Record<string, string> = {
  emergency_call: 'Emergency calls',
  emergency_calls: 'Emergency calls',
  water_level: 'Water level',
  road_sensor: 'Road sensor',
  transit: 'Transit telemetry',
  citizen_report: 'Citizen report',
  citizen_flood_report: 'Citizen flood report',
  weather: 'Weather radar',
  social_media: 'Social media',
  traffic_camera: 'Traffic camera',
  camera: 'Traffic camera',
  power_sensor: 'Power sensor',
  gas_sensor: 'Gas sensor',
  seismic: 'Seismic sensor',
  earthquake: 'Seismic sensor',
  iot_drain: 'Drainage telemetry',
  dispatch: 'Dispatch alert',
}

export const CAUSE_FRIENDLY: Record<string, string> = {
  drainage_failure: 'Drainage / Flooding',
  road_accident: 'Road Accident',
  power_outage: 'Power Outage',
  road_blockage: 'Road Blockage',
  gas_leak_hazard: 'Gas Leak Hazard',
  earthquake: 'Earthquake Hazard',
  fire_hazard: 'Fire Hazard',
  waterlogging: 'Waterlogging',
  flash_flood: 'Flash Flood',
}

export const INFRA_FRIENDLY: Record<string, string> = {
  hospital: 'Hospital',
  fire_station: 'Fire Station',
  station: 'Railway Station',
}

export function formatFriendlyName(value?: string | null): string {
  if (!value) return ''
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()

  if (SOURCE_TYPE_FRIENDLY[lower]) return SOURCE_TYPE_FRIENDLY[lower]
  if (CAUSE_FRIENDLY[lower]) return CAUSE_FRIENDLY[lower]
  if (INFRA_FRIENDLY[lower]) return INFRA_FRIENDLY[lower]

  // Fallback: convert any snake_case to Title Case
  if (lower.includes('_')) {
    return lower
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }

  return trimmed
}

export function formatSourceType(sourceType?: string | null): string {
  if (!sourceType) return 'Sensor'
  return SOURCE_TYPE_FRIENDLY[sourceType.toLowerCase()] || formatFriendlyName(sourceType)
}

export function formatCause(cause?: string | null): string {
  if (!cause) return 'Unknown Incident'
  return CAUSE_FRIENDLY[cause.toLowerCase()] || formatFriendlyName(cause)
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Format event timestamp replacing the "05:30 AM" bug:
 * If precision is date_only / date_from_context / publication_proxy,
 * or time is 00:00 UTC, show only the date ("8 Jul 2024").
 * Otherwise "8 Jul, 07:00".
 */
export function formatEventTime(iso?: string | null, precision?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)

  const prec = (precision || '').toLowerCase().trim()
  const isDateOnlyPrecision =
    prec === 'date_only' || prec === 'date_from_context' || prec === 'publication_proxy'

  const isMidnightUtc =
    (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) ||
    /T00:00(:00)?(\.0+)?(Z|\+00:00)?$/i.test(iso.trim()) ||
    /^\d{4}-\d{2}-\d{2}$/.test(iso.trim())

  const day = d.getUTCDate()
  const month = MONTH_NAMES[d.getUTCMonth()]
  const year = d.getUTCFullYear()

  if (isDateOnlyPrecision || isMidnightUtc) {
    return `${day} ${month} ${year}`
  }

  const hours = String(d.getUTCHours()).padStart(2, '0')
  const mins = String(d.getUTCMinutes()).padStart(2, '0')
  return `${day} ${month}, ${hours}:${mins}`
}
