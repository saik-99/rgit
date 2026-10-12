"""Weather API route: per-location weather data and status."""
from fastapi import APIRouter
from ..adapters.open_meteo import (
    fetch_weather_for_location, fetch_all_weather,
    fetch_river_discharge, fetch_google_flood_data,
    LOCATIONS, USE_LIVE_WEATHER, GOOGLE_FLOOD_API_KEY,
)

router = APIRouter()


@router.get("/weather")
async def get_all_weather():
    """Get weather data for all monitored Mumbai locations."""
    data = fetch_all_weather()
    return {
        "use_live_weather": USE_LIVE_WEATHER,
        "google_flood_enabled": bool(GOOGLE_FLOOD_API_KEY),
        "locations": data,
    }


@router.get("/weather/{location}")
async def get_weather(location: str):
    """Get weather data for a specific location (hindmata, milan_subway, sion)."""
    if location not in LOCATIONS:
        return {"error": f"Unknown location '{location}'. Available: {list(LOCATIONS.keys())}"}
    weather = fetch_weather_for_location(location)

    # Optional: river discharge
    loc = LOCATIONS[location]
    discharge = fetch_river_discharge(loc["lat"], loc["lon"])

    # Optional: Google Flood data
    flood = fetch_google_flood_data(loc["lat"], loc["lon"])

    return {
        "weather": weather,
        "river_discharge": discharge,
        "google_flood": flood,
        "use_live_weather": USE_LIVE_WEATHER,
    }
