import { CITIES, INDIAN_CITY_KEYS } from './cities'

export const FALLBACK_RAINFALL: Record<string, number> = {
  mumbai: 185,
  pune: 42,
  nagpur: 65,
  delhi: 18,
  bengaluru: 35,
  hyderabad: 28,
  guwahati: 140,
}

export async function fetchRainfallForCoords(lat: number, lon: number): Promise<number | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3500)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum&timezone=auto`
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!res.ok) throw new Error('Open-Meteo response not ok')
    const data = await res.json()
    const sum = data.daily?.precipitation_sum?.[0]
    if (typeof sum === 'number') {
      return Math.round(sum)
    }
  } catch {
    // network or timeout
  }
  return null
}

export async function getCityRainfall(cityKey: string): Promise<number> {
  const normKey = cityKey.toLowerCase()
  const city = CITIES[normKey]
  if (city) {
    const live = await fetchRainfallForCoords(city.lat, city.lon)
    if (live !== null) return live
  }
  return FALLBACK_RAINFALL[normKey] ?? 25
}

export async function getAllIndiaMaxRainfall(): Promise<{ maxRain: number; maxCity: string }> {
  const results = await Promise.all(
    INDIAN_CITY_KEYS.map(async key => {
      const rain = await getCityRainfall(key)
      return { key, rain, name: CITIES[key]?.name || key }
    })
  )

  let maxRain = 0
  let maxCity = 'Mumbai'

  for (const item of results) {
    if (item.rain >= maxRain) {
      maxRain = item.rain
      maxCity = item.name
    }
  }

  return { maxRain, maxCity }
}
