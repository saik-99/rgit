"""
Multi-factor severity, response priority, and data-completeness scoring.
Enforces the safety invariant:
A potentially severe incident must NOT be discarded merely because confidence
is low or nearby sensors are missing. It remains visible and is flagged for
priority operational verification.
"""

from typing import List, Tuple
from .models import NormalizedEvent
from .causal_engine import INCIDENT_TAXONOMY


def compute_data_completeness(events: List[NormalizedEvent], weather_present: bool = False) -> Tuple[float, List[str]]:
    """
    Computes data completeness score (0.0 to 1.0) across 4 critical facets:
    1. Spatial completeness (verified coordinates)
    2. Physical sensor coverage (IoT/pavement/transit)
    3. Eyewitness / Human reporting (311/911/citizen)
    4. Environmental / Meteorological context (weather)
    """
    non_dups = [e for e in events if not e.is_duplicate]
    if not non_dups:
        return 0.0, ["all_data_missing"]

    has_coords = any(e.lat is not None and e.lon is not None for e in non_dups)
    has_sensors = any(e.source_type in ("water_level", "road_sensor", "transit") for e in non_dups)
    has_eyewitness = any(e.source_type in ("citizen_report", "emergency_call") for e in non_dups)
    has_weather = weather_present or any(e.source_type == "weather" for e in non_dups)

    score = 0.0
    missing = []

    if has_coords:
        score += 0.30
    else:
        missing.append("verified_coordinates")

    if has_sensors:
        score += 0.30
    else:
        missing.append("physical_sensors")

    if has_eyewitness:
        score += 0.20
    else:
        missing.append("eyewitness_reports")

    if has_weather:
        score += 0.20
    else:
        missing.append("weather_context")

    return round(score, 2), missing


def compute_severity_and_priority(
    cause: str,
    events: List[NormalizedEvent],
    confidence: float
) -> Tuple[int, str, str, float, bool, List[str]]:
    """
    Calculates:
      - severity_score: 0 to 100
      - severity_level: critical, high, medium, low
      - response_priority: P1_CRITICAL, P2_HIGH, P3_MEDIUM, P4_LOW
      - data_completeness: 0.0 to 1.0
      - verification_required: bool (True if potentially severe with low confidence / missing data)
      - missing_modalities: list of missing data dimensions
    """
    cause_def = INCIDENT_TAXONOMY.get(cause, {"base_severity": 50})
    base_sev = cause_def["base_severity"]

    non_dups = [e for e in events if not e.is_duplicate]
    source_types = set(e.source_type for e in non_dups)

    # Multi-source corroboration bonus (up to 15 points)
    source_bonus = min(15, len(source_types) * 4)

    # Anomaly severity amplification
    anomaly_bonus = 0
    for e in non_dups:
        if e.is_anomaly and e.anomaly_zscore > 2.5:
            anomaly_bonus = max(anomaly_bonus, min(15, int(e.anomaly_zscore * 3)))

    raw_severity = min(100, base_sev + source_bonus + anomaly_bonus)

    # Safety-critical invariant:
    # We do NOT simply multiply raw_severity by low confidence if the underlying event is life-threatening!
    # Instead, we retain a baseline severity floor (0.6 * raw_severity) so high hazard events are never hidden.
    effective_severity = int(raw_severity * max(confidence, 0.60))

    if effective_severity >= 80:
        sev_level = "critical"
    elif effective_severity >= 60:
        sev_level = "high"
    elif effective_severity >= 40:
        sev_level = "medium"
    else:
        sev_level = "low"

    # Data completeness
    completeness, missing_modalities = compute_data_completeness(events)

    # Verification Required safety flag
    verification_required = False
    if raw_severity >= 65 and (confidence < 0.65 or completeness < 0.50):
        verification_required = True
    elif "physical_sensors" in missing_modalities and raw_severity >= 60:
        verification_required = True

    # Response priority assignment
    if effective_severity >= 80 or (raw_severity >= 80 and verification_required):
        priority = "P1_CRITICAL"
    elif effective_severity >= 60 or (raw_severity >= 65 and verification_required):
        priority = "P2_HIGH"
    elif effective_severity >= 40:
        priority = "P3_MEDIUM"
    else:
        priority = "P4_LOW"

    return effective_severity, sev_level, priority, completeness, verification_required, missing_modalities
