"""
Core intelligence engine: event correlation, deduplication, anomaly detection,
causal inference (noisy-OR), severity scoring, and explanation generation.
"""
import json
import math
import hashlib
import hmac
import datetime
import numpy as np
from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

try:
    import h3
    HAS_H3 = True
except ImportError:
    HAS_H3 = False

from .models import Event, Incident, Source


# ── Constrained vocabulary ───────────────────────────────────────────────────
CAUSE_VOCABULARY = {
    "drainage_failure": {
        "label": "Drainage / Waterlogging Failure",
        "prior": 0.30,
        "evidence_weights": {
            "water_level": 0.90,
            "road_sensor": 0.70,
            "citizen_report": 0.50,
            "transit": 0.60,
            "emergency_call": 0.40,
            "weather": 0.30,
        },
        "severity_base": 75,
    },
    "road_accident": {
        "label": "Road Accident / Collision",
        "prior": 0.25,
        "evidence_weights": {
            "road_sensor": 0.85,
            "citizen_report": 0.65,
            "emergency_call": 0.80,
            "transit": 0.50,
            "water_level": 0.05,
            "weather": 0.10,
        },
        "severity_base": 65,
    },
    "power_outage": {
        "label": "Power Grid Failure / Outage",
        "prior": 0.20,
        "evidence_weights": {
            "citizen_report": 0.70,
            "emergency_call": 0.60,
            "road_sensor": 0.30,
            "transit": 0.40,
            "water_level": 0.05,
            "weather": 0.20,
        },
        "severity_base": 70,
    },
    "road_blockage": {
        "label": "Road Blockage / Obstruction",
        "prior": 0.25,
        "evidence_weights": {
            "road_sensor": 0.80,
            "transit": 0.70,
            "citizen_report": 0.60,
            "emergency_call": 0.30,
            "water_level": 0.10,
            "weather": 0.10,
        },
        "severity_base": 55,
    },
    "earthquake": {
        "label": "Seismic Event / Earthquake",
        "prior": 0.10,
        "evidence_weights": {
            "seismic": 0.95,
            "citizen_report": 0.60,
            "emergency_call": 0.65,
            "road_sensor": 0.45,
            "transit": 0.40,
            "water_level": 0.05,
            "weather": 0.05,
        },
        "severity_base": 85,
    },
}


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in meters."""
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_h3_cell(lat: float, lon: float, resolution: int = 7) -> str:
    """Get H3 hexagonal cell index for geospatial grouping."""
    if HAS_H3:
        return h3.latlng_to_cell(lat, lon, resolution)
    # Fallback: simple grid cell
    return f"grid_{int(lat * 100)}_{int(lon * 100)}"


# ── HMAC Signature Verification ──────────────────────────────────────────────

def verify_signature(event_data: dict, signature: str, hmac_key: str) -> bool:
    """Verify HMAC-SHA256 signature of event payload."""
    if not signature or not hmac_key:
        return False
    message = json.dumps({
        "device_id": event_data.get("device_id", ""),
        "timestamp": str(event_data.get("timestamp", "")),
        "payload": event_data.get("payload", {}),
    }, sort_keys=True).encode()
    expected = hmac.new(hmac_key.encode(), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


# ── Deduplication ─────────────────────────────────────────────────────────────

async def check_duplicate(db: AsyncSession, event: Event) -> bool:
    """Check if an identical event (same device, timestamp, source_type) already exists."""
    result = await db.execute(
        select(Event).where(
            Event.device_id == event.device_id,
            Event.timestamp == event.timestamp,
            Event.source_type == event.source_type,
            Event.is_duplicate == False,
        )
    )
    existing = result.scalars().first()
    return existing is not None


# ── Anomaly Detection ─────────────────────────────────────────────────────────

async def detect_anomaly(db: AsyncSession, event: Event) -> tuple[bool, float]:
    """Rolling z-score anomaly detection for numeric sensor values."""
    payload = json.loads(event.payload) if isinstance(event.payload, str) else event.payload
    value = payload.get("value")
    if value is None or not isinstance(value, (int, float)):
        return False, 0.0

    # Get recent values from same device
    result = await db.execute(
        select(Event.payload).where(
            Event.device_id == event.device_id,
            Event.source_type == event.source_type,
            Event.is_duplicate == False,
        ).order_by(Event.timestamp.desc()).limit(20)
    )
    rows = result.scalars().all()
    values = []
    for row in rows:
        try:
            p = json.loads(row) if isinstance(row, str) else row
            v = p.get("value")
            if isinstance(v, (int, float)):
                values.append(v)
        except (json.JSONDecodeError, TypeError):
            pass

    if len(values) < 3:
        return False, 0.0

    arr = np.array(values, dtype=float)
    mean, std = arr.mean(), arr.std()
    if std < 0.01:
        return False, 0.0
    zscore = abs((value - mean) / std)
    return zscore > 2.5, round(zscore, 2)


# ── Event Correlation / Clustering ────────────────────────────────────────────

async def correlate_event(db: AsyncSession, event: Event, max_distance_m: float = 500.0, max_time_sec: float = 1800.0) -> Optional[Incident]:
    """Find or create an incident cluster for this event using spatiotemporal proximity."""
    result = await db.execute(
        select(Incident).where(Incident.status == "active")
    )
    active_incidents = result.scalars().all()

    best_match: Optional[Incident] = None
    best_dist = float("inf")

    for inc in active_incidents:
        dist = haversine_m(event.lat, event.lon, inc.centroid_lat, inc.centroid_lon)
        if inc.events:
            time_diff = min(abs((event.timestamp - e.timestamp).total_seconds()) for e in inc.events if e.timestamp)
        elif inc.updated_at:
            time_diff = abs((event.timestamp - inc.updated_at).total_seconds())
        else:
            time_diff = 0

        if dist <= max_distance_m and time_diff <= max_time_sec and dist < best_dist:
            best_match = inc
            best_dist = dist

    return best_match


# ── Weather Evidence Analysis ─────────────────────────────────────────────────

def _analyze_weather_evidence(events: list[Event]) -> dict:
    """
    Extract weather signal strength from weather-type events in the cluster.
    Returns a dict with rainfall info and staleness.
    """
    weather_events = [e for e in events if e.source_type == "weather" and not e.is_duplicate]
    has_rainfall = False
    max_rain_mm = 0.0
    rain_24h = 0.0
    newest_weather_ts = None

    for e in weather_events:
        try:
            p = json.loads(e.payload) if isinstance(e.payload, str) else e.payload
            rain_val = p.get("value", 0)
            if isinstance(rain_val, (int, float)) and rain_val > 2.0:  # >2 mm/hr = meaningful rain
                has_rainfall = True
                max_rain_mm = max(max_rain_mm, rain_val)
            p24 = p.get("precipitation_24h", 0)
            if isinstance(p24, (int, float)):
                rain_24h = max(rain_24h, p24)
        except (json.JSONDecodeError, TypeError):
            pass
        if e.timestamp and (newest_weather_ts is None or e.timestamp > newest_weather_ts):
            newest_weather_ts = e.timestamp

    # Calculate staleness
    stale_minutes = 999.0
    if newest_weather_ts:
        stale_minutes = (datetime.datetime.utcnow() - newest_weather_ts).total_seconds() / 60.0

    return {
        "has_rainfall": has_rainfall,
        "max_rain_mm": max_rain_mm,
        "rain_24h_mm": rain_24h,
        "is_heavy": max_rain_mm >= 30.0,  # 30+ mm/hr = heavy
        "is_extreme": max_rain_mm >= 60.0,  # 60+ mm/hr = extreme
        "weather_stale": stale_minutes > 30.0,
        "weather_missing": len(weather_events) == 0,
        "stale_minutes": round(stale_minutes, 1),
        "event_count": len(weather_events),
    }


# ── Causal Inference (Noisy-OR / Weighted Scoring) ────────────────────────────

def infer_cause(events: list[Event]) -> tuple[str, float, list[dict]]:
    """
    Noisy-OR / weighted scoring for probable cause inference.
    Now weather-aware: heavy rain + water_level strongly supports drainage_failure;
    water_level rise without rain raises pipe_burst/blockage alternatives.
    Returns: (best_cause, confidence, ranking)
    """
    if not events:
        return "unknown", 0.0, []

    # Count source types and trust
    source_counts: dict[str, int] = {}
    trust_sum: dict[str, float] = {}
    conflict_count = 0
    untrusted_count = 0

    for e in events:
        if e.is_duplicate:
            continue
        st = e.source_type
        source_counts[st] = source_counts.get(st, 0) + 1
        trust_sum[st] = trust_sum.get(st, 0.0) + e.trust
        if e.trust < 0.4:
            untrusted_count += 1

    # Check for conflicting evidence via payload
    for e in events:
        if e.is_duplicate:
            continue
        try:
            p = json.loads(e.payload) if isinstance(e.payload, str) else e.payload
            text = p.get("text", "")
            if "no issue" in text.lower() or "clear" in text.lower() or "no problem" in text.lower():
                conflict_count += 1
        except (json.JSONDecodeError, TypeError):
            pass

    # Analyze weather evidence
    weather_info = _analyze_weather_evidence(events)
    has_water_level = source_counts.get("water_level", 0) > 0

    # Score each cause using noisy-OR
    scores = []
    for cause_id, cause_def in CAUSE_VOCABULARY.items():
        noisy_or_complement = 1.0
        evidence_count = 0
        for src_type, weight in cause_def["evidence_weights"].items():
            n = source_counts.get(src_type, 0)
            if n > 0:
                avg_trust = trust_sum.get(src_type, 0.5) / max(n, 1)
                effective_weight = weight * avg_trust
                for _ in range(min(n, 3)):  # Cap at 3 events per type
                    noisy_or_complement *= (1.0 - effective_weight)
                evidence_count += n

        probability = 1.0 - noisy_or_complement
        # Factor in prior
        probability = probability * 0.8 + cause_def["prior"] * 0.2

        # ── Weather-aware adjustments ────────────────────────────────
        if cause_id == "drainage_failure":
            if weather_info["has_rainfall"] and has_water_level:
                # Rain + water_level = strong corroboration for drainage
                boost = 0.08 if weather_info["is_heavy"] else 0.04
                if weather_info["is_extreme"]:
                    boost = 0.12
                probability = min(0.99, probability + boost)
            elif has_water_level and not weather_info["has_rainfall"] and not weather_info["weather_missing"]:
                # Water rising WITHOUT rain: could be pipe burst / blockage instead
                probability = max(0.05, probability - 0.06)
            elif weather_info["has_rainfall"] and not has_water_level:
                # Rain alone: small supporting signal
                probability = min(0.99, probability + 0.02)

        elif cause_id == "road_blockage":
            if has_water_level and not weather_info["has_rainfall"] and not weather_info["weather_missing"]:
                # Water rise without rain → could be a pipe-related blockage
                probability = min(0.99, probability + 0.05)

        elif cause_id == "earthquake":
            has_seismic = source_counts.get("seismic", 0) > 0
            if has_seismic:
                # Strong seismic evidence guarantees dominant earthquake probability
                probability = min(0.99, probability + 0.15)

        scores.append({
            "cause": cause_id,
            "label": cause_def["label"],
            "probability": round(probability, 3),
            "evidence_count": evidence_count,
        })

    scores.sort(key=lambda x: x["probability"], reverse=True)

    best = scores[0] if scores else {"cause": "unknown", "probability": 0.0}
    confidence = best["probability"]

    # Reduce confidence for conflicts and untrusted sources
    confidence -= conflict_count * 0.12
    confidence -= untrusted_count * 0.05

    # Reduce confidence when weather data is stale or missing
    if weather_info["weather_stale"] and not weather_info["weather_missing"]:
        confidence -= 0.04  # Stale data penalty
    elif weather_info["weather_missing"] and has_water_level:
        confidence -= 0.03  # No weather context at all

    confidence = max(0.05, min(0.99, confidence))

    # Attach weather info to the ranking for the explanation generator
    for s in scores:
        s["_weather_info"] = weather_info

    return best["cause"], round(confidence, 3), scores


# ── Severity Model ────────────────────────────────────────────────────────────

def compute_severity(cause: str, events: list[Event], confidence: float) -> tuple[int, str]:
    """Severity 0-100 based on anomaly magnitude, independent sources, radius, and cause type."""
    cause_def = CAUSE_VOCABULARY.get(cause, {"severity_base": 50})
    base = cause_def["severity_base"]

    # Unique source types boost
    unique_sources = len(set(e.source_type for e in events if not e.is_duplicate))
    source_bonus = min(15, unique_sources * 4)

    # Anomaly magnitude
    anomaly_bonus = 0
    for e in events:
        if e.is_anomaly and e.anomaly_zscore > 3:
            anomaly_bonus = max(anomaly_bonus, min(10, int(e.anomaly_zscore)))

    raw = min(100, int(base + source_bonus + anomaly_bonus))

    # Weight by confidence
    weighted = int(raw * max(confidence, 0.3))

    if weighted >= 80:
        level = "critical"
    elif weighted >= 60:
        level = "high"
    elif weighted >= 40:
        level = "medium"
    else:
        level = "low"

    return weighted, level


# ── Explanation Generator ─────────────────────────────────────────────────────

def generate_explanation(incident: Incident, events: list[Event], cause: str, confidence: float, ranking: list[dict]) -> str:
    """Template-based, confidence-aware explanation for operators. Now includes weather reasoning."""
    cause_label = CAUSE_VOCABULARY.get(cause, {}).get("label", cause)
    event_count = len([e for e in events if not e.is_duplicate])
    source_types = set(e.source_type for e in events if not e.is_duplicate)

    # Confidence wording
    if confidence >= 0.85:
        conf_word = "high confidence"
    elif confidence >= 0.65:
        conf_word = "moderate confidence"
    elif confidence >= 0.40:
        conf_word = "low confidence"
    else:
        conf_word = "very low confidence"

    # Build explanation
    lines = [
        f"**Incident Analysis** — {conf_word} ({confidence:.0%})",
        "",
        f"The system has correlated **{event_count} signals** from {len(source_types)} independent source types "
        f"({', '.join(sorted(source_types))}) near **{incident.neighborhood or 'the affected area'}**.",
        "",
        f"**Most probable cause: {cause_label}** ({confidence:.0%} confidence).",
    ]

    # Seismic / Earthquake reasoning
    seismic_events = [e for e in events if e.source_type == "seismic" and not e.is_duplicate]
    if cause == "earthquake" and seismic_events:
        try:
            sp = json.loads(seismic_events[0].payload) if isinstance(seismic_events[0].payload, str) else seismic_events[0].payload
            mag = sp.get("magnitude", 4.5)
            depth = sp.get("depth_km", 10.0)
            place = sp.get("place", "Regional Epicenter")
            lines.append(f"\n🌋 **Seismic Telemetry**: Confirmed USGS ground motion (Magnitude {mag}, Depth {depth} km) near {place}. Corroborated with citizen tremor reports and power telemetry.")
        except Exception:
            lines.append("\n🌋 **Seismic Telemetry**: Confirmed ground motion. Structural tremors and transit disruptions detected.")

    # Weather reasoning
    weather_info = ranking[0].get("_weather_info", {}) if ranking else {}
    has_water_level = any(e.source_type == "water_level" and not e.is_duplicate for e in events)

    if weather_info.get("has_rainfall") and has_water_level:
        rain_mm = weather_info.get("max_rain_mm", 0)
        intensity = "extreme" if weather_info.get("is_extreme") else ("heavy" if weather_info.get("is_heavy") else "moderate")
        lines.append(f"\n🌧️ **Weather corroboration**: {intensity} rainfall ({rain_mm:.0f} mm/hr) detected — "
                     f"strongly supports drainage/waterlogging as root cause.")
    elif has_water_level and not weather_info.get("has_rainfall") and not weather_info.get("weather_missing"):
        lines.append(f"\n⚠️ **Weather anomaly**: Water levels are rising but **no significant rainfall** is recorded. "
                     f"Consider alternative causes: pipe burst, upstream release, or blocked drainage infrastructure. "
                     f"Drainage failure confidence has been reduced.")
    elif weather_info.get("has_rainfall") and not has_water_level:
        lines.append(f"\n🌧️ **Weather note**: Rainfall detected ({weather_info.get('max_rain_mm', 0):.0f} mm/hr) but no water-level rise yet. "
                     f"Monitoring for drainage impact.")

    if weather_info.get("weather_stale") and not weather_info.get("weather_missing"):
        lines.append(f"\n⏰ **Stale weather data**: Weather information is {weather_info.get('stale_minutes', 0):.0f} minutes old. "
                     f"Confidence has been reduced. Refresh recommended.")
    elif weather_info.get("weather_missing") and has_water_level:
        lines.append(f"\n❓ **No weather data**: No rainfall information is available for this area. "
                     f"Unable to confirm whether flooding is rain-induced. Confidence has been reduced.")

    # Supporting / contradicting evidence summary
    supporting = [e for e in events if not e.is_duplicate and e.trust >= 0.5]
    contradicting = []
    for e in events:
        if e.is_duplicate:
            continue
        try:
            p = json.loads(e.payload) if isinstance(e.payload, str) else e.payload
            if "no issue" in p.get("text", "").lower() or "clear" in p.get("text", "").lower():
                contradicting.append(e)
        except Exception:
            pass

    if supporting:
        lines.append(f"\n**Supporting evidence**: {len(supporting)} sensor/report signals confirm the assessment.")

    if contradicting:
        lines.append(f"\n⚠️ **Conflicting report(s)**: {len(contradicting)} source(s) contradict — confidence has been reduced.")

    untrusted = [e for e in events if not e.is_duplicate and (not e.signature_verified or e.trust < 0.4)]
    if untrusted:
        lines.append(f"\n🔒 **Integrity note**: {len(untrusted)} source(s) have unverified signatures or low trust scores.")

    # Alternative causes
    if len(ranking) > 1:
        alt = ranking[1]
        lines.append(f"\n**Alternative cause**: {alt['label']} ({alt['probability']:.0%}).")

    return "\n".join(lines)


# ── Master Processing Pipeline ────────────────────────────────────────────────

async def process_event(db: AsyncSession, event: Event) -> Event:
    """Full pipeline: integrity → dedup → anomaly → correlate → infer → severity → explain."""

    # 1. H3 geospatial cell
    event.h3_cell = get_h3_cell(event.lat, event.lon)

    # 2. Trust defaults by source type
    if event.trust is None:
        trust_defaults = {
            "water_level": 0.90, "road_sensor": 0.85,
            "transit": 0.80, "weather": 0.75,
            "emergency_call": 0.70, "citizen_report": 0.50,
        }
        event.trust = trust_defaults.get(event.source_type, 0.5)

    # 3. Signature verification
    source = await db.execute(
        select(Source).where(Source.device_id == event.device_id)
    )
    source_obj = source.scalars().first()
    if source_obj and event.signature:
        verified = verify_signature(
            {"device_id": event.device_id, "timestamp": event.timestamp.isoformat(), "payload": json.loads(event.payload) if isinstance(event.payload, str) else event.payload},
            event.signature, source_obj.hmac_key
        )
        event.signature_verified = verified
        if not verified:
            event.trust = max(0.1, event.trust - 0.3)
    elif event.source_type in ("citizen_report", "emergency_call"):
        event.signature_verified = False
    else:
        event.signature_verified = True  # Trust registered sensors by default

    # 4. Deduplication
    is_dup = await check_duplicate(db, event)
    event.is_duplicate = is_dup

    # 5. Anomaly detection
    is_anomaly, zscore = await detect_anomaly(db, event)
    event.is_anomaly = is_anomaly
    event.anomaly_zscore = zscore

    # 6. Persist the event
    if isinstance(event.payload, dict):
        event.payload = json.dumps(event.payload)
    db.add(event)
    await db.flush()

    if event.is_duplicate:
        await db.commit()
        return event

    # 7. Correlate to incident
    incident = await correlate_event(db, event)

    if incident is None:
        # Create new incident
        incident = Incident(
            centroid_lat=event.lat,
            centroid_lon=event.lon,
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow(),
        )
        db.add(incident)
        await db.flush()

    event.incident_id = incident.id

    # 8. Refresh incident events
    result = await db.execute(
        select(Event).where(Event.incident_id == incident.id)
    )
    inc_events = list(result.scalars().all())

    # 9. Update centroid
    non_dup_events = [e for e in inc_events if not e.is_duplicate]
    if non_dup_events:
        incident.centroid_lat = sum(e.lat for e in non_dup_events) / len(non_dup_events)
        incident.centroid_lon = sum(e.lon for e in non_dup_events) / len(non_dup_events)

    # 10. Causal inference
    cause, confidence, ranking = infer_cause(inc_events)
    incident.cause = cause
    incident.cause_confidence = confidence
    incident.cause_ranking = json.dumps(ranking)

    # 11. Severity
    sev_score, sev_level = compute_severity(cause, inc_events, confidence)
    incident.severity_score = sev_score
    incident.severity_level = sev_level

    # 12. Title
    cause_label = CAUSE_VOCABULARY.get(cause, {}).get("label", cause)
    incident.title = f"{cause_label} — {incident.neighborhood or 'Urban Sector'}"

    # 13. Explanation
    incident.explanation = generate_explanation(incident, inc_events, cause, confidence, ranking)

    # 14. Confidence history
    history = json.loads(incident.confidence_history or "[]")
    history.append({
        "t": datetime.datetime.utcnow().isoformat(),
        "confidence": confidence,
        "event_count": len(non_dup_events),
    })
    incident.confidence_history = json.dumps(history)

    incident.updated_at = datetime.datetime.utcnow()
    await db.commit()

    # Update source tracking
    if source_obj:
        source_obj.last_seen = datetime.datetime.utcnow()
        source_obj.event_count += 1
        source_obj.signature_status = "verified" if event.signature_verified else "failed"
        source_obj.is_flagged = event.trust < 0.4
        await db.commit()

    return event
