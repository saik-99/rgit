"""Google Flood Hub Forecasting API Adapter:
Queries Google Flood Forecasting API if GOOGLE_FLOOD_API_KEY is present,
otherwise provides graceful fallback with official direct web link and notice.
"""
import datetime
import json
import logging
import os
import urllib.request
import urllib.error
from typing import Optional, Dict, Any, List

logger = logging.getLogger("google_flood_adapter")

MUMBAI_LAT = 19.0760
MUMBAI_LON = 72.8777
GOOGLE_FLOOD_HUB_WEB_URL = f"https://sites.research.google/floods/l/{MUMBAI_LAT}/{MUMBAI_LON}/10"

_cache: Dict[str, Any] = {
    "data": None,
    "last_fetched": None,
}
CACHE_TTL_SECONDS = 900  # 15 minutes


def fetch_google_flood_data() -> Dict[str, Any]:
    """
    Fetch river gauge forecasts from Google Flood Forecasting API if key is present.
    Caches results for 15 minutes. Never exposes key to frontend.
    """
    global _cache
    now = datetime.datetime.now(datetime.timezone.utc)

    if _cache["last_fetched"] and (now - _cache["last_fetched"]).total_seconds() < CACHE_TTL_SECONDS:
        return _cache["data"]

    api_key = os.getenv("GOOGLE_FLOOD_API_KEY", "").strip()

    if not api_key:
        result = {
            "available": False,
            "status": "fallback",
            "message": "GOOGLE_FLOOD_API_KEY is not configured. River gauge forecasting API is in fallback mode.",
            "gauges": [],
            "flood_hub_url": GOOGLE_FLOOD_HUB_WEB_URL,
            "attribution": "Flood forecast data: Google Flood Hub, CC BY 4.0",
            "coverage_note": "Google Flood Hub models riverine flood risks, not street-level drainage / waterlogging.",
            "last_updated": now.isoformat(),
        }
        _cache["data"] = result
        _cache["last_fetched"] = now
        return result

    # When key is present, query Google Flood Forecasting API
    # https://developers.google.com/flood-forecasting
    try:
        url = f"https://floodforecasting.googleapis.com/v1/gauges:search?key={api_key}"
        body = json.dumps({
            "location": {"latitude": MUMBAI_LAT, "longitude": MUMBAI_LON},
            "radiusKm": 150.0
        }).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": "UrbanIncidentFusion/1.0"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            gauges_raw = data.get("gauges", [])

            gauges_parsed: List[Dict[str, Any]] = []
            for g in gauges_raw:
                loc = g.get("location", {})
                status = g.get("status", "NORMAL")
                # Map to green / amber / red
                severity = "green"
                if "WARNING" in status or "ALERT" in status:
                    severity = "amber"
                elif "DANGER" in status or "CRITICAL" in status:
                    severity = "red"

                gauges_parsed.append({
                    "id": g.get("gaugeId", "gauge"),
                    "name": g.get("gaugeName", "River Gauge"),
                    "river": g.get("riverName", "Local River Basin"),
                    "lat": loc.get("latitude", MUMBAI_LAT),
                    "lon": loc.get("longitude", MUMBAI_LON),
                    "severity": severity,
                    "status": status,
                    "forecast": g.get("forecast", {}),
                })

            result = {
                "available": len(gauges_parsed) > 0,
                "status": "live" if len(gauges_parsed) > 0 else "no_data",
                "message": f"Retrieved {len(gauges_parsed)} upstream river gauges from Google Flood Forecasting API." if gauges_parsed else "No upstream river gauges returned for Mumbai basin in Google Flood API.",
                "gauges": gauges_parsed,
                "flood_hub_url": GOOGLE_FLOOD_HUB_WEB_URL,
                "attribution": "Flood forecast data: Google Flood Hub, CC BY 4.0",
                "coverage_note": "Google Flood Hub models riverine flood risks, not street-level drainage / waterlogging.",
                "last_updated": now.isoformat(),
            }
            _cache["data"] = result
            _cache["last_fetched"] = now
            return result
    except Exception as ex:
        logger.warning(f"Google Flood API request failed: {ex}")
        result = {
            "available": False,
            "status": "fallback",
            "message": f"Google Flood Forecasting API request error: {str(ex)}",
            "gauges": [],
            "flood_hub_url": GOOGLE_FLOOD_HUB_WEB_URL,
            "attribution": "Flood forecast data: Google Flood Hub, CC BY 4.0",
            "coverage_note": "Google Flood Hub models riverine flood risks, not street-level drainage / waterlogging.",
            "last_updated": now.isoformat(),
        }
        _cache["data"] = result
        _cache["last_fetched"] = now
        return result
