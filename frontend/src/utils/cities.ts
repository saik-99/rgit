export interface CityInfo {
  id: string
  name: string
  lat: number
  lon: number
}

export const CITIES: Record<string, CityInfo> = {
  mumbai: { id: 'mumbai', name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
  pune: { id: 'pune', name: 'Pune', lat: 18.5204, lon: 73.8567 },
  nagpur: { id: 'nagpur', name: 'Nagpur', lat: 21.1458, lon: 79.0882 },
  delhi: { id: 'delhi', name: 'Delhi', lat: 28.6139, lon: 77.2090 },
  bengaluru: { id: 'bengaluru', name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  hyderabad: { id: 'hyderabad', name: 'Hyderabad', lat: 17.3850, lon: 78.4867 },
  guwahati: { id: 'guwahati', name: 'Guwahati', lat: 26.1445, lon: 91.7362 },
}

export const INDIAN_CITY_KEYS = ['mumbai', 'pune', 'nagpur', 'delhi', 'bengaluru', 'hyderabad', 'guwahati']

export const ALL_INDIA_COORDS = {
  lat: 22.5,
  lon: 79.0,
  zoom: 5,
}

export const CITY_COORDINATES: Record<string, { center: [number, number]; zoom: number; pitch: number; bearing: number }> = {
  all: {
    center: [79.0, 22.5],
    zoom: 4.6,
    pitch: 0,
    bearing: 0,
  },
  'all-india': {
    center: [79.0, 22.5],
    zoom: 4.6,
    pitch: 0,
    bearing: 0,
  },
  'all india': {
    center: [79.0, 22.5],
    zoom: 4.6,
    pitch: 0,
    bearing: 0,
  },
  mumbai: {
    center: [72.8777, 19.0760],
    zoom: 11,
    pitch: 45,
    bearing: -15,
  },
  pune: {
    center: [73.8567, 18.5204],
    zoom: 11,
    pitch: 45,
    bearing: 0,
  },
  nagpur: {
    center: [79.0882, 21.1458],
    zoom: 11,
    pitch: 45,
    bearing: 10,
  },
  delhi: {
    center: [77.2090, 28.6139],
    zoom: 11,
    pitch: 45,
    bearing: 0,
  },
  bengaluru: {
    center: [77.5946, 12.9716],
    zoom: 11,
    pitch: 45,
    bearing: 15,
  },
  hyderabad: {
    center: [78.4867, 17.3850],
    zoom: 11,
    pitch: 45,
    bearing: -10,
  },
  guwahati: {
    center: [91.7362, 26.1445],
    zoom: 11,
    pitch: 45,
    bearing: 20,
  },
}
