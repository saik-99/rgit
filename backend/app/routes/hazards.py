"""Hazards API routes: USGS earthquakes, Google Flood Hub, Windy config, and external provider statuses."""
import os
from fastapi import APIRouter, Query
from typing import Optional, List, Dict, Any

from ..adapters.usgs import fetch_usgs_feed_sync, filter_earthquakes
from ..adapters.google_flood import fetch_google_flood_data

router = APIRouter()

# Keep track of in-memory injected test earthquakes
_injected_test_events: List[Dict[str, Any]] = []


@router.get("/hazards/earthquakes")
def get_earthquakes(
    scope: str = Query("mumbai", pattern="^(mumbai|global)$"),
    min_magnitude: float = Query(2.5, ge=0.0, le=10.0),
):
    """
    Fetch parsed earthquakes from USGS GeoJSON feed with regional filtering.
    Always includes any active demo test earthquakes.
    """
    raw_events = fetch_usgs_feed_sync()
    all_events = list(_injected_test_events) + list(raw_events)
    filtered = filter_earthquakes(all_events, scope=scope, min_magnitude=min_magnitude)

    return {
        "count": len(filtered),
        "scope": scope,
        "min_magnitude": min_magnitude,
        "attribution": "Earthquake data: USGS, public domain",
        "earthquakes": filtered,
    }


@router.get("/hazards/google-flood")
def get_google_flood():
    """
    Fetch upstream river risk gauge data from Google Flood Forecasting API.
    Returns graceful fallback if key is not provided or API is unreachable.
    """
    return fetch_google_flood_data()


@router.get("/hazards/windy-config")
def get_windy_config():
    """
    Returns configuration and status for Windy layer (API key status or iframe embed).
    """
    key = os.getenv("WINDY_MAP_API_KEY", "").strip()
    embed_url = (
        "https://embed.windy.com/embed2.html?"
        "lat=19.076&lon=72.877&detailLat=19.076&detailLon=72.877"
        "&width=650&height=450&zoom=10&level=surface&overlay=rain"
        "&product=ecmwf&menu=&message=&marker=&calendar=now&pressure="
        "&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1"
    )

    return {
        "has_key": bool(key),
        "api_key": key if key else None,
        "embed_url": embed_url,
        "attribution": "Wind & weather data: Windy.com",
        "available_overlays": ["wind", "rain", "clouds", "waves"],
        "sync_note": "Iframe embed mode cannot sync with custom timeline scrub slider. Set WINDY_MAP_API_KEY for native Leaflet API mode.",
    }


@router.get("/hazards/data-sources")
def get_data_sources_status():
    """
    Returns registry of all external data sources, their license/attribution, and current operational status.
    """
    windy_key = bool(os.getenv("WINDY_MAP_API_KEY", "").strip())
    flood_key = bool(os.getenv("GOOGLE_FLOOD_API_KEY", "").strip())

    return {
        "sources": [
            {
                "id": "usgs",
                "name": "USGS Earthquake Hazards Program",
                "type": "Seismic Telemetry Feed",
                "license": "Public Domain (U.S. Geological Survey)",
                "attribution": "Earthquake data: USGS",
                "status": "live",
                "endpoint": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
                "description": "Global and regional real-time earthquake feeds parsed every 5 minutes.",
            },
            {
                "id": "open-meteo",
                "name": "Open-Meteo Weather API",
                "type": "Hydro-Meteorological Forecasts",
                "license": "Creative Commons Attribution 4.0 (CC BY 4.0)",
                "attribution": "Weather data: Open-Meteo.com",
                "status": "live",
                "endpoint": "https://api.open-meteo.com/v1/forecast",
                "description": "Hourly rainfall intensity, 24-hour accumulation, and flood river discharge.",
            },
            {
                "id": "google-flood",
                "name": "Google Flood Hub Forecasting",
                "type": "Riverine Flood Gauges",
                "license": "Creative Commons Attribution 4.0 (CC BY 4.0)",
                "attribution": "Flood forecast data: Google Flood Hub, CC BY 4.0",
                "status": "live" if flood_key else "fallback",
                "endpoint": "https://sites.research.google/floods",
                "description": "Upstream river basin gauge forecasts. When key is omitted, directs operators to official Flood Hub portal.",
            },
            {
                "id": "windy",
                "name": "Windy.com Meteorological Layers",
                "type": "Animated Atmospheric Overlays",
                "license": "Proprietary (Windy.com Free/Developer API Terms)",
                "attribution": "Map data: Windy.com & ECMWF",
                "status": "live" if windy_key else "fallback",
                "endpoint": "https://embed.windy.com",
                "description": "Wind particles, radar precipitation, cloud cover, and sea wave overlays via official embed or API.",
            },
            {
                "id": "basemaps",
                "name": "Esri & CARTO Public Tile Services",
                "type": "GIS Basemap Tiles",
                "license": "OpenStreetMap / CARTO / Esri World Imagery Terms",
                "attribution": "CARTO, OpenStreetMap, Esri World Imagery",
                "status": "live",
                "endpoint": "CARTO Light/Dark & Esri Streets/Satellite",
                "description": "High-performance vector and raster basemaps for operations GIS rendering.",
            },
        ]
    }
