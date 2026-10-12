"""
Causal intelligence and evidence graph builder.
Implements:
1. Bayesian Noisy-OR formulation for root-cause probability inference.
2. Cross-modal weather reasoning (corroborates or challenges flood hypotheses).
3. Qualified relationship extraction (possible_contributor, temporally_related, spatially_related, duplicate_of, contradicts).
4. Direct Acyclic Graph (DAG) construction without cycles.
"""

import json
from typing import List, Tuple, Dict, Any, Optional
from .models import NormalizedEvent, EvidenceRelationship
from .clustering import haversine_distance_m

# Constrained Vocabulary aligned with project specifications
INCIDENT_TAXONOMY = {
    "drainage_failure": {
        "label": "Drainage / Waterlogging Failure",
        "category": "Hydrological / Infrastructure",
        "prior": 0.30,
        "weights": {
            "water_level": 0.90,
            "road_sensor": 0.70,
            "transit": 0.60,
            "citizen_report": 0.50,
            "emergency_call": 0.40,
            "weather": 0.35,
        },
        "base_severity": 75,
    },
    "road_accident": {
        "label": "Road Accident / Collision",
        "category": "Transportation Safety",
        "prior": 0.25,
        "weights": {
            "road_sensor": 0.85,
            "emergency_call": 0.80,
            "citizen_report": 0.65,
            "transit": 0.55,
            "water_level": 0.05,
            "weather": 0.10,
        },
        "base_severity": 65,
    },
    "power_outage": {
        "label": "Power Grid Failure / Blackout",
        "category": "Utility / Electrical",
        "prior": 0.20,
        "weights": {
            "citizen_report": 0.75,
            "emergency_call": 0.65,
            "road_sensor": 0.35,
            "transit": 0.45,
            "water_level": 0.05,
            "weather": 0.20,
        },
        "base_severity": 70,
    },
    "road_blockage": {
        "label": "Road Blockage / Obstruction",
        "category": "Transportation Infrastructure",
        "prior": 0.25,
        "weights": {
            "road_sensor": 0.80,
            "transit": 0.75,
            "citizen_report": 0.60,
            "emergency_call": 0.35,
            "water_level": 0.15,
            "weather": 0.10,
        },
        "base_severity": 55,
    },
    "gas_leak_hazard": {
        "label": "Gas Leak or Chemical Hazard",
        "category": "Environmental / Hazard",
        "prior": 0.10,
        "weights": {
            "emergency_call": 0.85,
            "citizen_report": 0.70,
            "road_sensor": 0.30,
            "transit": 0.40,
            "water_level": 0.05,
            "weather": 0.05,
        },
        "base_severity": 85,
    }
}


def analyze_weather_context(events: List[NormalizedEvent], external_weather: Optional[dict] = None) -> dict:
    """Analyze rain intensity, temperature, and data staleness."""
    weather_events = [e for e in events if e.source_type == "weather" and not e.is_duplicate]
    max_rain = 0.0
    has_rain = False

    for e in weather_events:
        val = e.payload.get("value") or e.payload.get("rain_mm")
        if isinstance(val, (int, float)) and val > 1.0:
            has_rain = True
            max_rain = max(max_rain, float(val))

    # Incorporate external weather if provided
    if external_weather:
        ext_rain = external_weather.get("current_rain_mm", 0.0)
        if ext_rain > 1.0:
            has_rain = True
            max_rain = max(max_rain, float(ext_rain))

    return {
        "has_rainfall": has_rain,
        "max_rain_mm": round(max_rain, 1),
        "is_heavy": max_rain >= 30.0,
        "is_extreme": max_rain >= 60.0,
        "weather_missing": (len(weather_events) == 0 and external_weather is None),
        "event_count": len(weather_events)
    }


def infer_probable_cause(
    events: List[NormalizedEvent],
    weather_context: Optional[dict] = None
) -> Tuple[str, str, float, List[dict], int, int]:
    """
    Computes root-cause probability using Bayesian Noisy-OR.
    Returns: (best_cause_id, label, confidence, ranking, supporting_count, conflict_count)
    """
    non_dups = [e for e in events if not e.is_duplicate]
    if not non_dups:
        return "unknown", "Unknown Incident", 0.0, [], 0, 0

    source_counts: Dict[str, int] = {}
    source_trust: Dict[str, float] = {}
    conflict_count = 0
    untrusted_count = 0

    # Tally counts and trust by modality
    for e in non_dups:
        st = e.source_type
        source_counts[st] = source_counts.get(st, 0) + 1
        source_trust[st] = source_trust.get(st, 0.0) + e.trust
        if e.trust < 0.4 or not e.signature_verified:
            untrusted_count += 1

        # Check for conflicting statements (e.g. "no issue", "clear road", "normal")
        desc = (e.payload.get("text") or e.payload.get("description") or "").lower()
        if any(w in desc for w in ["no issue", "clear", "no problem", "all dry", "normal flow"]):
            conflict_count += 1

    weather_info = analyze_weather_context(events, weather_context)
    has_water_level = source_counts.get("water_level", 0) > 0

    ranking = []
    for cause_id, cause_def in INCIDENT_TAXONOMY.items():
        noisy_or_comp = 1.0
        evidence_signals = 0

        for st, weight in cause_def["weights"].items():
            count = source_counts.get(st, 0)
            if count > 0:
                avg_trust = source_trust.get(st, 0.5) / count
                effective_weight = weight * avg_trust
                # Cap saturation at 3 independent signals
                for _ in range(min(count, 3)):
                    noisy_or_comp *= (1.0 - effective_weight)
                evidence_signals += count

        raw_prob = 1.0 - noisy_or_comp
        # Factor in domain prior (80% evidence, 20% prior)
        posterior = (raw_prob * 0.80) + (cause_def["prior"] * 0.20)

        # Cross-modal weather reasoning adjustments
        if cause_id == "drainage_failure":
            if weather_info["has_rainfall"] and has_water_level:
                boost = 0.12 if weather_info["is_extreme"] else (0.08 if weather_info["is_heavy"] else 0.04)
                posterior = min(0.99, posterior + boost)
            elif has_water_level and not weather_info["has_rainfall"] and not weather_info["weather_missing"]:
                # Water level rise without rain suggests water main pipe burst or drain blockage
                posterior = max(0.05, posterior - 0.06)

        elif cause_id == "road_blockage":
            if has_water_level and not weather_info["has_rainfall"]:
                posterior = min(0.95, posterior + 0.05)

        ranking.append({
            "cause": cause_id,
            "label": cause_def["label"],
            "category": cause_def["category"],
            "probability": round(posterior, 3),
            "evidence_signals": evidence_signals
        })

    ranking.sort(key=lambda x: x["probability"], reverse=True)
    best = ranking[0]
    confidence = best["probability"]

    # Calibrate confidence: penalize for contradictions and untrusted inputs
    confidence -= conflict_count * 0.12
    confidence -= untrusted_count * 0.05

    if weather_info["weather_missing"] and has_water_level:
        confidence -= 0.04  # Penalize missing weather context

    confidence = max(0.05, min(0.99, round(confidence, 3)))
    supporting_count = len(non_dups) - conflict_count

    return best["cause"], best["label"], confidence, ranking, supporting_count, conflict_count


def build_evidence_relationships(
    events: List[NormalizedEvent],
    incident_id: str,
    root_cause: str
) -> List[EvidenceRelationship]:
    """
    Construct qualified DAG relationships between events and the root incident.
    Ensures qualified semantics: possible_contributor, temporally_related,
    spatially_related, duplicate_of, contradicts, corroborates.
    """
    relationships: List[EvidenceRelationship] = []
    rel_counter = 1

    # Sort chronologically
    sorted_events = sorted(events, key=lambda e: (e.event_time or e.received_time).timestamp() if (e.event_time or e.received_time) else 0)

    for i, e in enumerate(sorted_events):
        rid = f"REL-{incident_id}-{rel_counter:03d}"
        rel_counter += 1

        # 1. Duplicates
        if e.is_duplicate and e.duplicate_of:
            relationships.append(EvidenceRelationship(
                relationship_id=rid,
                source_id=e.event_id,
                target_id=e.duplicate_of,
                relationship_type="duplicate_of",
                time_difference_sec=0.0,
                geographic_distance_m=0.0,
                evidence_summary=f"Event {e.event_id} is an exact or near duplicate of {e.duplicate_of}.",
                confidence=0.99,
                alternative_explanations="Automated sensor retry or telemetry retransmission"
            ))
            continue

        # 2. Check contradiction
        desc = (e.payload.get("text") or e.payload.get("description") or "").lower()
        if any(w in desc for w in ["no issue", "clear", "no problem", "all dry", "normal flow"]):
            relationships.append(EvidenceRelationship(
                relationship_id=rid,
                source_id=e.event_id,
                target_id=incident_id,
                relationship_type="contradicts",
                time_difference_sec=None,
                geographic_distance_m=None,
                evidence_summary=f"Report {e.event_id} claims normal conditions, contradicting physical indicators.",
                confidence=round(1.0 - e.trust, 2),
                alternative_explanations="Report was localized, stale, or submitted from an unaffected vantage point."
            ))
            continue

        # 3. Inter-event causal sequence (e.g., water_level -> road_sensor -> transit)
        for prev in sorted_events[:i]:
            if prev.is_duplicate:
                continue
            t_diff = None
            if e.event_time and prev.event_time:
                t_diff = (e.event_time - prev.event_time).total_seconds()

            g_dist = None
            if e.lat is not None and e.lon is not None and prev.lat is not None and prev.lon is not None:
                g_dist = round(haversine_distance_m(e.lat, e.lon, prev.lat, prev.lon), 1)

            # Water level preceding road submersion
            if prev.source_type == "water_level" and e.source_type in ("road_sensor", "transit"):
                if t_diff is not None and 0 <= t_diff <= 1800:
                    pair_rid = f"REL-{incident_id}-{rel_counter:03d}"
                    rel_counter += 1
                    relationships.append(EvidenceRelationship(
                        relationship_id=pair_rid,
                        source_id=prev.event_id,
                        target_id=e.event_id,
                        relationship_type="possible_contributor",
                        time_difference_sec=t_diff,
                        geographic_distance_m=g_dist,
                        evidence_summary=f"Water level rise at {prev.event_id} preceded symptom {e.event_id} by {int(t_diff)}s.",
                        confidence=round(min(prev.trust, e.trust), 2),
                        alternative_explanations="Independent road obstacle or localized surface runoff"
                    ))
                    break

        # 4. Link event to incident hypothesis
        rel_type = "possible_contributor" if e.trust >= 0.70 else "corroborates"
        relationships.append(EvidenceRelationship(
            relationship_id=rid,
            source_id=e.event_id,
            target_id=incident_id,
            relationship_type=rel_type,
            time_difference_sec=None,
            geographic_distance_m=None,
            evidence_summary=f"{e.source_type.title()} signal from {e.device_id} supports {root_cause}.",
            confidence=round(e.trust, 2),
            alternative_explanations="Coincidental temporal alignment"
        ))

    return relationships
