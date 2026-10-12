"""
Open-Meteo weather adapter — fetches live precipitation data for Mumbai locations.
Falls back to synthetic rainfall events when offline.
No API key required.
"""
import os
import json
import asyncio
import datetime
import logging
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import URLError

logger = logging.getLogger("weather_adapter")

USE_LIVE_WEATHER = os.environ.get("USE_LIVE_WEATHER", "false").lower() == "true"
GOOGLE_FLOOD_API_KEY = os.environ.get("GOOGLE_FLOOD_API_KEY", "")

# Mumbai monitoring locations
LOCATIONS = {
    "hindmata": {"lat": 19.0112, "lon": 72.8512, "name": "Hindmata Junction"},
    "milan_subway": {"lat": 19.0285, "lon": 72.8403, "name": "Milan Subway"},
    "sion": {"lat": 19.0431, "lon": 72.8629, "name": "Sion Station"},
}

# In-memory cache (location -> {data, fetched_at})
_weather_cache: dict[str, dict] = {}
CACHE_TTL_SEC = 300  # 5 minutes


def _fetch_url(url: str, timeout: int = 10) -> Optional[dict]:
    """Synchronous URL fetch with timeout; returns parsed JSON or None."""
    try:
        req = Request(url, headers={"User-Agent": "UrbanIncidentFusion/1.0"})
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except (URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
        logger.warning(f"Weather fetch failed for {url}: {e}")
        return None


def _build_synthetic_weather(location_key: str) -> dict:
    """Generate synthetic rainfall data for demo when API is unavailable."""
    loc = LOCATIONS[location_key]
    now = datetime.datetime.utcnow()
    return {
        "location": location_key,
        "name": loc["name"],
        "lat": loc["lat"],
        "lon": loc["lon"],
        "current_precipitation_mm": 65.0,
        "current_rain_mm": 62.0,
        "precipitation_24h_mm": 185.0,
        "humidity_pct": 96,
        "temperature_c": 27.5,
        "is_live": False,
        "is_synthetic": True,
        "fetched_at": now.isoformat(),
        "hourly_rain": [
            {"time": (now - datetime.timedelta(hours=i)).strftime("%H:%M"), "rain_mm": max(0, 40 + (i * 5) - (i**1.3))}
            for i in range(24, 0, -1)
        ],
        "source": "synthetic-fallback",
    }


def fetch_weather_for_location(location_key: str) -> dict:
    """
    Fetch weather data for a single location from Open-Meteo.
    Returns a normalized dict with current precipitation and 24h history.
    Falls back to synthetic data if the API is unreachable.
    """
    # Check cache
    cached = _weather_cache.get(location_key)
    if cached:
        age = (datetime.datetime.utcnow() - datetime.datetime.fromisoformat(cached["fetched_at"])).total_seconds()
        if age < CACHE_TTL_SEC:
            return cached

    if not USE_LIVE_WEATHER:
        result = _build_synthetic_weather(location_key)
        _weather_cache[location_key] = result
        return result

    loc = LOCATIONS.get(location_key)
    if not loc:
        return _build_synthetic_weather(location_key)

    # Fetch from Open-Meteo Forecast API
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={loc['lat']}&longitude={loc['lon']}"
        f"&current=precipitation,rain,relative_humidity_2m,temperature_2m"
        f"&hourly=rain,precipitation"
        f"&past_hours=24&forecast_hours=1"
        f"&timezone=auto"
    )
    data = _fetch_url(url)

    if data is None:
        logger.info(f"Open-Meteo unreachable for {location_key}, using synthetic fallback.")
        result = _build_synthetic_weather(location_key)
        _weather_cache[location_key] = result
        return result

    now = datetime.datetime.utcnow()
    current = data.get("current", {})
    hourly = data.get("hourly", {})

    # Parse hourly rain for the past 24h
    hourly_times = hourly.get("time", [])
    hourly_rain = hourly.get("rain", [])
    hourly_precip = hourly.get("precipitation", [])

    rain_history = []
    total_24h = 0.0
    for i, t in enumerate(hourly_times):
        r = hourly_rain[i] if i < len(hourly_rain) else 0.0
        total_24h += r
        rain_history.append({"time": t[-5:] if len(t) >= 5 else t, "rain_mm": r})

    result = {
        "location": location_key,
        "name": loc["name"],
        "lat": loc["lat"],
        "lon": loc["lon"],
        "current_precipitation_mm": current.get("precipitation", 0.0),
        "current_rain_mm": current.get("rain", 0.0),
        "precipitation_24h_mm": round(total_24h, 1),
        "humidity_pct": current.get("relative_humidity_2m", 0),
        "temperature_c": current.get("temperature_2m", 0.0),
        "is_live": True,
        "is_synthetic": False,
        "fetched_at": now.isoformat(),
        "hourly_rain": rain_history,
        "source": "open-meteo",
    }

    _weather_cache[location_key] = result
    return result


def fetch_all_weather() -> dict[str, dict]:
    """Fetch weather for all monitored locations."""
    results = {}
    for key in LOCATIONS:
        results[key] = fetch_weather_for_location(key)
    return results


def weather_to_event_payload(weather_data: dict) -> dict:
    """Convert weather data into an event payload dict matching our event schema."""
    return {
        "value": weather_data.get("current_rain_mm", 0.0),
        "unit": "mm/hr",
        "description": f"Rainfall at {weather_data.get('name', 'location')}: "
                       f"{weather_data.get('current_rain_mm', 0)} mm/hr, "
                       f"24h total: {weather_data.get('precipitation_24h_mm', 0)} mm",
        "precipitation_24h": weather_data.get("precipitation_24h_mm", 0.0),
        "humidity": weather_data.get("humidity_pct", 0),
        "temperature_c": weather_data.get("temperature_c", 0),
        "source": weather_data.get("source", "open-meteo"),
        "is_live": weather_data.get("is_live", False),
    }


def get_weather_staleness_minutes(location_key: str) -> float:
    """Return how many minutes old the cached weather data is. Returns 999 if no data."""
    cached = _weather_cache.get(location_key)
    if not cached:
        return 999.0
    try:
        fetched = datetime.datetime.fromisoformat(cached["fetched_at"])
        return (datetime.datetime.utcnow() - fetched).total_seconds() / 60.0
    except Exception:
        return 999.0


# ── Optional: Google Flood Forecasting API ────────────────────────────────────

def fetch_google_flood_data(lat: float, lon: float) -> Optional[dict]:
    """
    Fetch river flood forecasts from Google Flood Forecasting API.
    Only called if GOOGLE_FLOOD_API_KEY is set. Returns None otherwise.
    """
    if not GOOGLE_FLOOD_API_KEY:
        return None

    url = (
        f"https://floodforecasting.googleapis.com/v1/floodStatus:lookup?"
        f"key={GOOGLE_FLOOD_API_KEY}"
    )
    # POST request with lat/lon
    try:
        import urllib.request
        body = json.dumps({
            "regionCode": "IN",
            "latLng": {"latitude": lat, "longitude": lon},
        }).encode()
        req = Request(url, data=body, headers={
            "Content-Type": "application/json",
            "User-Agent": "UrbanIncidentFusion/1.0",
        })
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return {
                "source": "google-flood-hub",
                "data": data,
                "attribution": "Flood forecast data: Google Flood Hub, CC BY 4.0",
            }
    except Exception as e:
        logger.warning(f"Google Flood API call failed: {e}")
        return None


# ── Open-Meteo Flood API (river discharge) ────────────────────────────────────

def fetch_river_discharge(lat: float, lon: float) -> Optional[dict]:
    """
    Fetch river discharge data from Open-Meteo Flood API.
    Background signal only — covers rivers, not street drainage.
    """
    url = (
        f"https://flood-api.open-meteo.com/v1/flood?"
        f"latitude={lat}&longitude={lon}"
        f"&daily=river_discharge"
        f"&forecast_days=3"
    )
    data = _fetch_url(url)
    if data and "daily" in data:
        daily = data["daily"]
        times = daily.get("time", [])
        discharges = daily.get("river_discharge", [])
        return {
            "source": "open-meteo-flood",
            "river_discharge": [
                {"date": t, "discharge_m3s": d}
                for t, d in zip(times, discharges) if d is not None
            ],
        }
    return None
