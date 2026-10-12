"""USGS Earthquake Adapter:
Fetches public GeoJSON feeds from USGS, parses and deduplicates earthquakes,
and converts them into normalized seismic events for the fusion engine.
"""
import asyncio
import datetime
import json
import logging
import math
import os
import urllib.request
import urllib.error
from typing import Optional, List, Dict, Any

logger = logging.getLogger("usgs_adapter")

DEFAULT_USGS_FEED = os.getenv(
    "USGS_FEED_URL",
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
)

# Mumbai bounding box / region coordinates
MUMBAI_CENTER = (19.0760, 72.8777)
MUMBAI_REGION_RADIUS_KM = 600.0  # Western India / Maharashtra seismic zone

_cache: Dict[str, Any] = {
    "data": [],
    "last_fetched": None,
    "seen_ids": set(),
}
CACHE_TTL_SECONDS = 300  # 5 minutes


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in kilometers."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_usgs_feature(feature: Dict[str, Any], provenance: str = "measured") -> Optional[Dict[str, Any]]:
    """Parse a single GeoJSON earthquake feature into normalized event format."""
    try:
        props = feature.get("properties", {})
        geom = feature.get("geometry", {})
        coords = geom.get("coordinates", [])

        if len(coords) < 2:
            return None

        lon = float(coords[0])
        lat = float(coords[1])
        depth_km = float(coords[2]) if len(coords) > 2 else 10.0

        usgs_id = feature.get("id") or props.get("code") or f"eq_{lat}_{lon}"
        mag = float(props.get("mag", 0.0)) if props.get("mag") is not None else 0.0
        place = props.get("place") or "Unknown location"
        time_epoch_ms = props.get("time")
        url = props.get("url") or f"https://earthquake.usgs.gov/earthquakes/eventpage/{usgs_id}"

        if time_epoch_ms:
            ts = datetime.datetime.fromtimestamp(time_epoch_ms / 1000.0, tz=datetime.timezone.utc)
        else:
            ts = datetime.datetime.now(datetime.timezone.utc)

        return {
            "source_type": "seismic",
            "device_id": f"USGS-{usgs_id}",
            "lat": lat,
            "lon": lon,
            "timestamp": ts.isoformat(),
            "trust": 0.95,
            "signature_verified": True,
            "provenance": provenance,
            "payload": {
                "usgs_id": str(usgs_id),
                "magnitude": mag,
                "depth_km": round(depth_km, 1),
                "place": place,
                "url": url,
                "alert": props.get("alert"),
                "tsunami": props.get("tsunami", 0),
                "provenance": provenance,
            },
        }
    except Exception as ex:
        logger.warning(f"Failed to parse USGS feature: {ex}")
        return None


def fetch_usgs_feed_sync(feed_url: str = DEFAULT_USGS_FEED, timeout_sec: float = 8.0) -> List[Dict[str, Any]]:
    """Synchronous fetch from USGS GeoJSON feed with error handling and deduplication."""
    global _cache
    now = datetime.datetime.now(datetime.timezone.utc)

    # Check cache freshness
    if _cache["last_fetched"] and (now - _cache["last_fetched"]).total_seconds() < CACHE_TTL_SECONDS:
        return _cache["data"]

    parsed_events: List[Dict[str, Any]] = []
    try:
        req = urllib.request.Request(
            feed_url,
            headers={"User-Agent": "UrbanIncidentFusion/1.0 (Hackathon Educational GIS)"}
        )
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            features = data.get("features", [])

            for f in features:
                parsed = parse_usgs_feature(f)
                if parsed:
                    usgs_id = parsed["payload"]["usgs_id"]
                    # Deduplicate in-memory
                    _cache["seen_ids"].add(usgs_id)
                    parsed_events.append(parsed)

            _cache["data"] = parsed_events
            _cache["last_fetched"] = now
            logger.info(f"Fetched {len(parsed_events)} earthquakes from USGS feed.")
    except Exception as err:
        logger.warning(f"USGS feed unreachable ({err}). Using cached or fallback data.")
        # If we have cached data, return it
        if _cache["data"]:
            return _cache["data"]

    return _cache["data"]


async def fetch_earthquakes(feed_url: str = DEFAULT_USGS_FEED) -> List[Dict[str, Any]]:
    """Async wrapper around feed fetcher."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fetch_usgs_feed_sync, feed_url)


def filter_earthquakes(
    events: List[Dict[str, Any]],
    scope: str = "global",
    min_magnitude: float = 2.5
) -> List[Dict[str, Any]]:
    """Filter earthquakes by magnitude and regional scope."""
    res = []
    for ev in events:
        mag = ev.get("payload", {}).get("magnitude", 0.0)
        if mag < min_magnitude:
            continue

        if scope == "mumbai":
            dist = haversine_km(ev["lat"], ev["lon"], MUMBAI_CENTER[0], MUMBAI_CENTER[1])
            if dist <= MUMBAI_REGION_RADIUS_KM:
                res.append(ev)
        else:
            res.append(ev)

    return res


def create_demo_test_earthquake(lat: float = 19.350, lon: float = 73.120, magnitude: float = 4.8) -> Dict[str, Any]:
    """
    Creates a clearly labeled test seismic event for demonstration/scenarios
    (flagged provenance 'test') so that live demos work even when USGS is quiet.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    return {
        "source_type": "seismic",
        "device_id": "USGS-TEST-MUMBAI-EQ",
        "lat": lat,
        "lon": lon,
        "timestamp": now.isoformat(),
        "trust": 0.95,
        "signature_verified": True,
        "provenance": "test",
        "payload": {
            "usgs_id": "TEST-MUMBAI-EQ",
            "magnitude": magnitude,
            "depth_km": 12.5,
            "place": "28 km NE of Mumbai (Thane Basin Fault)",
            "url": "https://earthquake.usgs.gov/earthquakes/eventpage/test",
            "alert": "yellow",
            "tsunami": 0,
            "provenance": "test",
            "test_flag": True,
        },
    }
