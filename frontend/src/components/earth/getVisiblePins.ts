import type { V1Incident } from '../../api'
import { CITIES, INDIAN_CITY_KEYS } from '../../utils/cities'

export interface VisiblePinsGeoJSON {
  type: 'FeatureCollection'
  features: any[]
}

/**
 * Single source of truth for map pins.
 * - view = "all-india": ONLY top 4 incidents per city (max 28 pins),
 *   plus one city bubble per city at zoom < 5.
 * - view = city: top 10 as full pins WITH labels;
 *   all others as 5px dots WITHOUT labels (labels appear only at zoom >= 15).
 */
export function getVisiblePins(
  view: string,
  zoom: number,
  incidents: V1Incident[],
  selectedIncidentId?: string | null,
  stats?: any
): VisiblePinsGeoJSON {
  const normView = (view || 'all').toLowerCase().trim()
  const isAllIndia = normView === 'all' || normView === 'all-india' || normView === 'all india'

  const features: any[] = []

  if (isAllIndia) {
    // 1. One city bubble per city at zoom < 5
    if (zoom < 5) {
      INDIAN_CITY_KEYS.forEach(cityKey => {
        const cityInfo = CITIES[cityKey]
        if (!cityInfo) return

        const cityIncidents = incidents.filter(i => (i.city || '').toLowerCase() === cityKey)
        const cityStats = stats?.by_city?.[cityKey]
        const count = cityStats?.incidents ?? (cityIncidents.length || 20)

        const hasHigh =
          (cityStats?.high_count ?? 0) > 0 ||
          cityIncidents.some(i => (i.severity_level || '').toLowerCase() === 'high')
        const color = hasHigh ? '#ef4444' : '#f59e0b'
        const radius = Math.min(26, Math.max(16, 14 + Math.round(count / 25)))

        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [cityInfo.lon, cityInfo.lat],
          },
          properties: {
            kind: 'city_bubble',
            city_id: cityKey,
            city_name: cityInfo.name,
            label: `${cityInfo.name} · ${count}`,
            count,
            color,
            radius,
            sort_key: -1000,
          },
        })
      })
    }

    // 2. ONLY top 4 incidents per city (skip resolved) = max 28 pins
    INDIAN_CITY_KEYS.forEach(cityKey => {
      const cityIncidents = incidents
        .filter(i => (i.city || '').toLowerCase() === cityKey)
        .filter(i => (i.status || '').toLowerCase() !== 'resolved')
        .sort((a, b) => {
          const diff = (b.severity_score || 0) - (a.severity_score || 0)
          if (diff !== 0) return diff
          return (b.cause_confidence || 0) - (a.cause_confidence || 0)
        })

      const top4 = cityIncidents.slice(0, 4)

      top4.forEach(inc => {
        if (!inc.centroid_lat || !inc.centroid_lon) return
        const sev = (inc.severity_level || 'Medium').toLowerCase()
        const isHigh = sev === 'high'
        const color = isHigh ? '#ef4444' : sev === 'medium' ? '#f59e0b' : '#eab308'
        const isSelected = inc.incident_id === selectedIncidentId

        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [inc.centroid_lon, inc.centroid_lat],
          },
          properties: {
            kind: 'pin',
            incident_id: inc.incident_id,
            title: inc.title,
            label: inc.title,
            severity: inc.severity_level || 'Medium',
            severity_score: inc.severity_score || 50,
            sort_key: -(inc.severity_score || 50),
            color,
            radius: isHigh ? 9 : 7,
            is_dot: false,
            is_selected: isSelected,
            city: inc.city,
          },
        })
      })
    })
  } else {
    // view = city
    const cityIncidents = incidents
      .filter(i => (i.city || '').toLowerCase() === normView)
      .sort((a, b) => {
        const diff = (b.severity_score || 0) - (a.severity_score || 0)
        if (diff !== 0) return diff
        return (b.cause_confidence || 0) - (a.cause_confidence || 0)
      })

    const top10 = cityIncidents.slice(0, 10)
    const otherDots = cityIncidents.slice(10)

    // Top 10 as full pins WITH labels
    top10.forEach(inc => {
      if (!inc.centroid_lat || !inc.centroid_lon) return
      const sev = (inc.severity_level || 'Medium').toLowerCase()
      const isHigh = sev === 'high'
      const color = isHigh ? '#ef4444' : sev === 'medium' ? '#f59e0b' : '#eab308'
      const isSelected = inc.incident_id === selectedIncidentId

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [inc.centroid_lon, inc.centroid_lat],
        },
        properties: {
          kind: 'pin',
          incident_id: inc.incident_id,
          title: inc.title,
          label: inc.title,
          severity: inc.severity_level || 'Medium',
          severity_score: inc.severity_score || 50,
          sort_key: -(inc.severity_score || 50),
          color,
          radius: isHigh ? 9 : 7,
          is_dot: false,
          is_selected: isSelected,
          city: inc.city,
        },
      })
    })

    // Other incidents of that city as small 5px dots WITHOUT labels (labels appear only at zoom >= 15)
    otherDots.forEach(inc => {
      if (!inc.centroid_lat || !inc.centroid_lon) return
      const sev = (inc.severity_level || 'Medium').toLowerCase()
      const color = sev === 'high' ? '#ef4444' : sev === 'medium' ? '#f59e0b' : '#eab308'
      const isSelected = inc.incident_id === selectedIncidentId
      const label = zoom >= 15 ? inc.title : ''

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [inc.centroid_lon, inc.centroid_lat],
        },
        properties: {
          kind: 'dot',
          incident_id: inc.incident_id,
          title: inc.title,
          label,
          severity: inc.severity_level || 'Medium',
          severity_score: inc.severity_score || 50,
          sort_key: -(inc.severity_score || 50),
          color,
          radius: 5,
          is_dot: true,
          is_selected: isSelected,
          city: inc.city,
        },
      })
    })
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}
