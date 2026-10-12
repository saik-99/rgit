/**
 * Friendly name formatters converting snake_case tokens to human-readable labels with emojis.
 */

export const SOURCE_TYPE_FRIENDLY: Record<string, string> = {
  emergency_call: '📞 Emergency calls',
  emergency_calls: '📞 Emergency calls',
  water_level: '💧 Water level',
  road_sensor: '🚦 Road sensor',
  transit: '🚌 Transit telemetry',
  citizen_report: '📢 Citizen report',
  citizen_flood_report: '📢 Citizen flood report',
  weather: '🌧️ Weather radar',
  social_media: '📱 Social media',
  traffic_camera: '📹 Traffic camera',
  camera: '📹 Traffic camera',
  power_sensor: '⚡ Power sensor',
  gas_sensor: '☣️ Gas sensor',
  seismic: '🌋 Seismic sensor',
  earthquake: '🌋 Seismic sensor',
  iot_drain: '🚰 Drainage telemetry',
  dispatch: '🚨 Dispatch alert',
}

export const CAUSE_FRIENDLY: Record<string, string> = {
  drainage_failure: '🌊 Drainage / Flooding',
  road_accident: '🚗 Road Accident',
  power_outage: '⚡ Power Outage',
  road_blockage: '🚧 Road Blockage',
  gas_leak_hazard: '☣️ Gas Leak Hazard',
  earthquake: '🌋 Earthquake Hazard',
  fire_hazard: '🔥 Fire Hazard',
  waterlogging: '🌊 Waterlogging',
  flash_flood: '🌊 Flash Flood',
}

export const INFRA_FRIENDLY: Record<string, string> = {
  hospital: '🏥 Hospital',
  fire_station: '🚒 Fire Station',
  station: '🚉 Railway Station',
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
  if (!sourceType) return '📡 Sensor'
  return SOURCE_TYPE_FRIENDLY[sourceType.toLowerCase()] || formatFriendlyName(sourceType)
}

export function formatCause(cause?: string | null): string {
  if (!cause) return 'Unknown Incident'
  return CAUSE_FRIENDLY[cause.toLowerCase()] || formatFriendlyName(cause)
}
