"""
Event normalizer (Person 4).

The repo now has THREE event formats. This turns any of them into the agent
format (with a `signal` name from the incident vocabulary):

  1. Agent / synthetic stream : signal, timestamp, received_at, integrity_verified, confidence
  2. Backend (Person 1)       : source_type, payload, timestamp, received_at,
                                signature_verified, trust, is_duplicate, is_anomaly
  3. data_and_ml (Person 2/3) : type|source_type, description, event_time, received_time,
                                latitude, longitude, location (string), trust, signature_verified
"""

from __future__ import annotations

import json

CLEAR_WORDS = ["no issue", "no problem", "no flooding", "is clear", "looks clear", "road is dry",
               "everything is clear", "all clear", "no waterlogging", "road is clear",
               "completely dry", "no delay"]
FLOOD_WORDS = ["flood", "paani", "water", "knee", "waist", "submerged", "waterlog",
               "underwater", "inundat", "drain"]
ACCIDENT_WORDS = ["accident", "collision", "crash", "overturned", "hit by", "pile-up"]
POWER_WORDS = ["power", "blackout", "electricity", "outage", "transformer", "light gayi"]
GAS_WORDS = ["gas leak", "gas smell", "smell of gas", "lpg"]
QUAKE_WORDS = ["earthquake", "tremor", "shaking", "quake", "windows rattling"]
BLOCK_WORDS = ["tree fell", "tree fall", "fallen tree", "blocked", "obstruction", "debris",
               "landslide", "road closed", "barricade"]


def _text(payload: dict, extra: str = "") -> str:
    parts = [str(payload.get(k, "")) for k in ("text", "description", "status", "raw_text")]
    return (" ".join(parts) + " " + (extra or "")).lower()


def map_signal(source_type: str, payload: dict, extra_text: str = "") -> str:
    """Pick the vocabulary signal for one event from its source type + words."""
    st = (source_type or "").lower()
    t = _text(payload or {}, extra_text)
    if "water" in st:                                   # water_level, IoT_Water_Sensor
        return "WaterLevelSpike"
    if "road" in st or "pavement" in st or "lane" in st:
        if any(w in t for w in FLOOD_WORDS):
            return "RoadInundation"
        if any(w in t for w in BLOCK_WORDS):
            return "CitizenRoadBlockReport"
        return "LaneBlockageSensor"
    if "transit" in st or "bus" in st or "traffic_telemetry" in st:
        return "TrafficSlowdown"
    if "camera" in st:
        return "CameraCrashDetection" if any(w in t for w in ACCIDENT_WORDS) else "TrafficSlowdown"
    if "seismic" in st:
        return "SeismicActivity"
    if "weather" in st or "rain" in st:
        return "HeavyRainfall"                         # context only
    if "power" in st or "grid" in st or "substation" in st:
        return "SubstationVoltageDrop"
    if "air" in st or "gas" in st:
        return "AirQualityPPMSpike"
    # people: citizen_report, emergency_call, 311, 911, social media, app reports
    if any(w in t for w in CLEAR_WORDS):
        return "ConflictingReport"
    if any(w in t for w in QUAKE_WORDS):
        return "CitizenShakingReport"
    if any(w in t for w in FLOOD_WORDS):
        return "Citizen311FloodCall"
    if any(w in t for w in ACCIDENT_WORDS):
        return "Citizen911EmergencyCall"
    if any(w in t for w in POWER_WORDS):
        return "CitizenBlackoutReport"
    if any(w in t for w in GAS_WORDS):
        return "OdorComplaintCalls"
    if any(w in t for w in BLOCK_WORDS):
        return "CitizenRoadBlockReport"
    return "Citizen911EmergencyCall" if "emergency" in st or "911" in st else "CitizenReport"


def _first(e: dict, *keys, default=None):
    for k in keys:
        v = e.get(k)
        if v not in (None, ""):
            return v
    return default


def normalize_event(e: dict, place: str | None = None) -> dict:
    """Return the event in agent format. Agent-format events pass through unchanged."""
    if not isinstance(e, dict):
        e = {k: getattr(e, k) for k in dir(e) if not k.startswith("_")}  # ORM object
    if e.get("signal"):
        return e

    payload = e.get("payload") or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {"text": payload}
    source_type = str(_first(e, "source_type", "type", default="unknown"))
    desc = _first(e, "description", "text", default="")

    loc = e.get("location")
    if isinstance(loc, dict):
        lat, lon = loc.get("lat"), loc.get("lon")
        hood = loc.get("neighborhood") or place
    else:
        lat = _first(e, "lat", "latitude")
        lon = _first(e, "lon", "longitude")
        hood = place or loc or e.get("neighborhood")

    ts = _first(e, "timestamp", "event_time")
    trust = _first(e, "trust", "trust_score", "confidence", default=0.7)
    return {
        "event_id": str(_first(e, "event_id", default=f"EVT-{e.get('id', id(e))}")),
        "timestamp": ts,
        "received_at": _first(e, "received_at", "received_time", default=ts),
        "source_type": source_type,
        "device_id": str(_first(e, "device_id", "source_reference", default=f"unknown-{e.get('id', '')}")),
        "location": {"lat": lat, "lon": lon, "neighborhood": hood},
        "signal": map_signal(source_type, payload, desc),
        "text": payload.get("text") or payload.get("description") or desc or None,
        "value": payload.get("value", e.get("value")),
        "integrity_verified": bool(_first(e, "signature_verified", "integrity_verified", default=False)),
        "confidence": float(trust),
        "is_duplicate": bool(e.get("is_duplicate")),
        "is_anomaly": bool(e.get("is_anomaly")),
    }
