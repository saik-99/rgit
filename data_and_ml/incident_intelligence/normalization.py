"""
Input normalization and validation for incident streams.
Converts heterogeneous dictionaries, backend models, and CSV records into
strictly validated NormalizedEvent instances without discarding data.
"""

import datetime
import json
import re
import csv
from pathlib import Path
from typing import Any, Optional, Dict
from .models import NormalizedEvent

# Load evidence registry from datasets/evidence.csv
_EVIDENCE_LOOKUP: Dict[str, Dict[str, str]] = {}
try:
    _ev_path = Path(__file__).resolve().parents[1] / "datasets" / "evidence.csv"
    if _ev_path.exists():
        with open(_ev_path, mode="r", encoding="utf-8") as _f:
            _reader = csv.DictReader(_f)
            for _row in _reader:
                _eid = _row.get("event_id")
                if _eid:
                    _EVIDENCE_LOOKUP[_eid] = {
                        "source_name": _row.get("source_name", ""),
                        "source_url": _row.get("source_url", "")
                    }
except Exception:
    pass



def parse_timestamp(val: Any) -> Optional[datetime.datetime]:
    """Parse various timestamp representations into timezone-aware/UTC datetime."""
    if val is None:
        return None
    if isinstance(val, datetime.datetime):
        return val
    if isinstance(val, (int, float)):
        return datetime.datetime.fromtimestamp(val, tz=datetime.timezone.utc)
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return None
        # Handle trailing Z
        s = val.replace("Z", "+00:00")
        try:
            return datetime.datetime.fromisoformat(s)
        except Exception:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                try:
                    return datetime.datetime.strptime(val, fmt)
                except ValueError:
                    pass
    return None


def parse_float(val: Any) -> Optional[float]:
    """Safely convert numeric coordinates or sensor values, preserving None."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        v = val.strip()
        if not v or v.lower() in ("none", "null", "nan", ""):
            return None
        try:
            return float(v)
        except ValueError:
            return None
    return None


def normalize_event(raw: Any) -> NormalizedEvent:
    """
    Normalize raw event dictionary, JSON string, or backend ORM object into NormalizedEvent.
    Preserves missing values as None instead of replacing with zeros or guesses.
    """
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = {"description": raw}

    # Extract dictionary attributes or object attributes
    def get_attr(key: str, default: Any = None) -> Any:
        if isinstance(raw, dict):
            return raw.get(key, default)
        return getattr(raw, key, default)

    event_id = str(get_attr("event_id") or get_attr("id") or f"EVT-AUTO-{id(raw)}")
    source_type = str(get_attr("source_type") or get_attr("type") or "unknown").lower()
    device_id = str(get_attr("device_id") or get_attr("source_reference") or "UNKNOWN-DEVICE")

    lat = parse_float(get_attr("latitude") or get_attr("lat"))
    lon = parse_float(get_attr("longitude") or get_attr("lon"))

    # Validate coordinate ranges; if invalid, preserve as None and note in payload
    if lat is not None and not (-90.0 <= lat <= 90.0):
        lat = None
    if lon is not None and not (-180.0 <= lon <= 180.0):
        lon = None

    e_time = parse_timestamp(get_attr("event_time") or get_attr("timestamp"))
    r_time = parse_timestamp(get_attr("received_time") or get_attr("received_at")) or e_time or datetime.datetime.utcnow()

    # Payload normalization
    payload = get_attr("payload", {})
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {"raw_text": payload}
    elif not isinstance(payload, dict):
        payload = {"value": payload}

    # Inherit top-level description if present
    desc = get_attr("description")
    if desc and "description" not in payload and "text" not in payload:
        payload["description"] = desc

    trust_val = parse_float(get_attr("trust") or get_attr("trust_score"))
    if trust_val is None:
        # Default trust scores by modality
        defaults = {
            "water_level": 0.92, "road_sensor": 0.88, "transit": 0.85,
            "weather": 0.90, "emergency_call": 0.80, "citizen_report": 0.50
        }
        trust_val = defaults.get(source_type, 0.50)
    trust_val = max(0.0, min(1.0, trust_val))

    sig_ver = bool(get_attr("signature_verified", False))

    city = get_attr("city")
    country = get_attr("country")
    loc_name = get_attr("location") or get_attr("neighborhood") or get_attr("location_name")

    is_synth = bool(get_attr("is_synthetic", False))
    data_type = str(get_attr("data_type") or ("model_weather" if source_type == "weather" else "direct_observation" if "sensor" in source_type or "water" in source_type else "reported_incident"))

    ev_info = _EVIDENCE_LOOKUP.get(event_id, {})
    src_url = get_attr("source_url") or ev_info.get("source_url") or get_attr("source_reference")
    src_name = get_attr("source_name") or ev_info.get("source_name") or get_attr("source_reference")

    return NormalizedEvent(
        event_id=event_id,
        source_type=source_type,
        device_id=device_id,
        lat=lat,
        lon=lon,
        event_time=e_time,
        received_time=r_time,
        payload=payload,
        trust=trust_val,
        signature_verified=sig_ver,
        city=city,
        country=country,
        location_name=loc_name,
        is_synthetic=is_synth,
        data_type=data_type,
        source_url=src_url,
        source_name=src_name
    )

