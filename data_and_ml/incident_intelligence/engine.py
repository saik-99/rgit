"""
Main Incident Intelligence Engine.
Orchestrates normalization, deduplication, spatiotemporal clustering,
anomaly detection, causal graph inference, ML-based classification,
severity/priority scoring, and operational explanation generation.
"""

import csv
import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
from .models import NormalizedEvent, IncidentReport, EvidenceRelationship
from .normalization import normalize_event
from .deduplication import deduplicate_events
from .clustering import cluster_events_spatiotemporal, compute_cluster_centroid, haversine_distance_m
from .causal_engine import infer_probable_cause, build_evidence_relationships, INCIDENT_TAXONOMY
from .severity import compute_severity_and_priority
from .explainer import generate_operator_briefing
from .anomaly import detect_anomalies
from .ml_classifier import get_ml_classifier, combine_cause_rankings


# Cached infrastructure nodes from datasets/infrastructure.csv
_INFRASTRUCTURE_CACHE: List[Dict[str, Any]] = []


def _load_infrastructure() -> List[Dict[str, Any]]:
    """Loads and caches infrastructure nodes from datasets/infrastructure.csv."""
    global _INFRASTRUCTURE_CACHE
    if _INFRASTRUCTURE_CACHE:
        return _INFRASTRUCTURE_CACHE

    csv_path = Path(__file__).resolve().parents[1] / "datasets" / "infrastructure.csv"
    if not csv_path.exists():
        return []

    nodes = []
    try:
        with open(csv_path, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    lat = float(row.get("latitude", 0.0))
                    lon = float(row.get("longitude", 0.0))
                    nodes.append({
                        "id": row.get("infrastructure_id", ""),
                        "name": row.get("name", ""),
                        "type": row.get("type", ""),
                        "latitude": lat,
                        "longitude": lon,
                        "city": row.get("city", "")
                    })
                except (ValueError, TypeError):
                    continue
    except Exception:
        pass

    _INFRASTRUCTURE_CACHE = nodes
    return _INFRASTRUCTURE_CACHE


def find_nearest_infrastructure(lat: Optional[float], lon: Optional[float], city: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Computes closest hospital, fire station, and railway station from infrastructure.csv with distance in km.
    Only points in the same city are considered.
    """
    if lat is None or lon is None:
        return None

    infra_nodes = _load_infrastructure()
    if not infra_nodes:
        return None

    result: Dict[str, Any] = {}
    target_types = ["hospital", "fire_station", "station"]

    for t in target_types:
        candidates = [
            n for n in infra_nodes
            if n["type"] == t and (not city or n.get("city", "").strip().lower() == city.strip().lower())
        ]
        if not candidates:
            continue
        best_node = None
        min_dist_m = float("inf")
        for node in candidates:
            dist_m = haversine_distance_m(lat, lon, node["latitude"], node["longitude"])
            if dist_m < min_dist_m:
                min_dist_m = dist_m
                best_node = node

        if best_node:
            dist_km = round(min_dist_m / 1000.0, 2)
            item = {
                "name": best_node["name"],
                "distance_km": dist_km,
                "id": best_node["id"],
                "latitude": best_node["latitude"],
                "longitude": best_node["longitude"]
            }
            result[t] = item

    return result if result else None


class IncidentIntelligenceEngine:
    """
    Main incident intelligence and multimodal fusion coordinator.
    Usage:
        engine = IncidentIntelligenceEngine(spatial_radius_m=800.0, time_window_sec=1800.0)
        reports = engine.analyze_events(raw_events, weather_context)
    """

    def __init__(self, spatial_radius_m: float = 800.0, time_window_sec: float = 1800.0):
        self.spatial_radius_m = spatial_radius_m
        self.time_window_sec = time_window_sec
        self.ml_classifier = get_ml_classifier()

    def analyze_events(
        self,
        raw_events: List[Any],
        weather_context: Optional[dict] = None
    ) -> List[IncidentReport]:
        """
        Processes a collection of streaming or batch events through the intelligence pipeline.
        Returns a list of structured IncidentReports with DAG relationships and explanations.
        """
        if not raw_events:
            return []

        # 1. Normalization & validation
        normalized = [normalize_event(r) for r in raw_events]

        # 2. Anomaly Detection (IsolationForest + rolling z-score)
        normalized = detect_anomalies(normalized)

        # 3. Deduplication (marks duplicate events while preserving original evidence)
        unique_events, duplicate_events = deduplicate_events(normalized)

        # 4. Spatiotemporal Clustering
        clusters = cluster_events_spatiotemporal(
            normalized,
            max_distance_m=self.spatial_radius_m,
            max_time_sec=self.time_window_sec
        )

        incident_reports: List[IncidentReport] = []

        for idx, cluster in enumerate(clusters, start=1):
            inc_id = f"INCIDENT-{idx:03d}"
            c_lat, c_lon, radius = compute_cluster_centroid(cluster)

            # 5. Causal Inference (Rule-based Bayesian Noisy-OR)
            cause_rules, label_rules, conf_rules, ranking_rules, supp_cnt, confl_cnt = infer_probable_cause(
                cluster, weather_context
            )

            # 6. ML Model Inference (Logistic Regression on 10-feature vector)
            weather_rain = 0.0
            if weather_context and "current_rain_mm" in weather_context:
                weather_rain = float(weather_context["current_rain_mm"])
            features = self.ml_classifier.featurize_cluster(cluster, weather_rain=weather_rain)
            ranking_ml = self.ml_classifier.predict_probabilities(features)

            # 7. Hybrid Fusion: Final cause probability = 0.5 * Bayesian noisy-OR + 0.5 * ML model
            cause_ranking, final_cause, final_label, final_conf = combine_cause_rankings(
                ranking_rules, ranking_ml
            )

            # 8. Severity, Priority & Completeness (Low / Medium / High)
            sev_score, sev_level, priority, completeness, ver_req, missing_mods, sev_factors = compute_severity_and_priority(
                final_cause, cluster, final_conf
            )

            # 9. Evidence Graph & Relationships
            relationships = build_evidence_relationships(cluster, inc_id, final_label)

            # Determine location title
            loc_names = [e.location_name for e in cluster if e.location_name]
            neighborhood = loc_names[0] if loc_names else "Urban Sector"
            city = next((e.city for e in cluster if e.city), None)
            country = next((e.country for e in cluster if e.country), None)

            # 10. Confidence Level & Diagnostic Explanations
            if final_conf >= 0.70:
                confidence_level = "high"
            elif final_conf >= 0.45:
                confidence_level = "medium"
            else:
                confidence_level = "low"

            # Reasons why confidence is not higher
            why_not_higher: List[str] = []
            non_dups = [e for e in cluster if not e.is_duplicate]
            present_types = set(e.source_type for e in non_dups)

            if confl_cnt > 0:
                why_not_higher.append("conflicting reports received disputing incident")
            if any(e.trust < 0.4 or not e.signature_verified for e in non_dups):
                why_not_higher.append("untrusted or unverified sensor telemetry present")
            if "physical_sensors" in missing_mods:
                why_not_higher.append("no direct physical sensor confirmation")
            if "weather_context" in missing_mods:
                why_not_higher.append("missing environmental weather station corroboration")
            if len(present_types) < 3:
                why_not_higher.append("few reporting source types")
            if not why_not_higher and final_conf < 0.95:
                why_not_higher.append("probabilistic prior distribution and noisy-OR ceiling")

            # Check Next: missing source type that best separates the top 2 causes
            top_cause = final_cause
            second_cause = cause_ranking[1]["cause"] if len(cause_ranking) > 1 else "road_blockage"
            w1 = INCIDENT_TAXONOMY.get(top_cause, {}).get("weights", {})
            w2 = INCIDENT_TAXONOMY.get(second_cause, {}).get("weights", {})
            all_st = ["water_level", "road_sensor", "transit", "citizen_report", "emergency_call", "weather"]
            missing_st = [st for st in all_st if st not in present_types]
            if missing_st:
                check_next = max(missing_st, key=lambda st: abs(w1.get(st, 0.0) - w2.get(st, 0.0)))
            else:
                check_next = max(all_st, key=lambda st: abs(w1.get(st, 0.0) - w2.get(st, 0.0)))

            # One-sentence summary with confidence + reason
            has_rain = any(
                e.source_type == "weather" and (e.payload.get("value") or e.payload.get("rain_mm") or 0) > 1.0
                for e in non_dups
            ) or (weather_rain > 1.0)

            if final_cause == "drainage_failure":
                lead = f"Heavy rainfall likely caused flooding near {neighborhood}." if has_rain else f"Drainage failure likely caused waterlogging near {neighborhood}."
            elif final_cause == "road_accident":
                lead = f"Vehicle collision likely caused road blockage near {neighborhood}."
            elif final_cause == "power_outage":
                lead = f"Grid failure likely caused power blackout near {neighborhood}."
            elif final_cause == "road_blockage":
                lead = f"Obstruction likely blocked roadways near {neighborhood}."
            elif final_cause == "gas_leak_hazard":
                lead = f"Gas leak or chemical hazard likely triggered alert near {neighborhood}."
            else:
                lead = f"{final_label} occurred near {neighborhood}."

            if confidence_level == "high":
                reason = "multiple verified physical sensors and dispatch calls corroborate it."
            elif confidence_level == "medium":
                if has_rain and "physical_sensors" in missing_mods:
                    reason = "rainfall supports it but no direct sensor confirmation."
                elif "physical_sensors" in missing_mods:
                    reason = "reports support it but lack direct sensor confirmation."
                elif confl_cnt > 0:
                    reason = "signals support it despite conflicting eyewitness accounts."
                else:
                    reason = "signals support it across limited reporting modalities."
            else:
                if confl_cnt > 0:
                    reason = "conflicting reports and sparse sensor telemetry require verification."
                else:
                    reason = "single uncorroborated source is reporting without sensor backing."

            summary = f"{lead} Confidence: {confidence_level}, because {reason}"

            # 11. Nearest Infrastructure
            nearest_infra = find_nearest_infrastructure(c_lat, c_lon, city=city)

            # 12. Operational Narrative Briefing
            explanation, rec_actions = generate_operator_briefing(
                cause_label=final_label,
                confidence=final_conf,
                severity_level=sev_level,
                priority=priority,
                events=cluster,
                supporting_count=supp_cnt,
                conflicting_count=confl_cnt,
                missing_modalities=missing_mods,
                verification_required=ver_req,
                ranking=cause_ranking,
                location_name=neighborhood
            )

            times = [e.event_time for e in cluster if e.event_time]
            created_at = min(times) if times else datetime.datetime.utcnow()
            updated_at = max(times) if times else datetime.datetime.utcnow()

            report = IncidentReport(
                incident_id=inc_id,
                title=f"{final_label} — {neighborhood}",
                primary_cause=final_cause,
                cause_label=final_label,
                cause_confidence=final_conf,
                cause_ranking=cause_ranking,
                cause_ranking_rules=ranking_rules,
                cause_ranking_ml=ranking_ml,
                confidence_level=confidence_level,
                summary=summary,
                why_not_higher=why_not_higher,
                check_next=check_next,
                severity_score=sev_score,
                severity_level=sev_level,
                severity_factors=sev_factors,
                nearest_infrastructure=nearest_infra,
                response_priority=priority,
                data_completeness=completeness,
                verification_required=ver_req,
                centroid_lat=c_lat,
                centroid_lon=c_lon,
                radius_m=radius,
                neighborhood=neighborhood,
                city=city,
                country=country,
                event_ids=[e.event_id for e in cluster],
                relationships=relationships,
                explanation=explanation,
                supporting_evidence_count=supp_cnt,
                conflicting_evidence_count=confl_cnt,
                missing_modalities=missing_mods,
                recommended_actions=rec_actions,
                created_at=created_at,
                updated_at=updated_at
            )
            incident_reports.append(report)

        return incident_reports


# Functional Convenience Helpers for Backend / Agent Integration
_default_engine = IncidentIntelligenceEngine()


def analyze_events(events: List[Any], weather_context: Optional[dict] = None) -> List[dict]:
    """Top-level convenience function returning JSON-serializable incident report dicts."""
    reports = _default_engine.analyze_events(events, weather_context)
    return [r.to_dict() for r in reports]


def build_evidence_graph(events: List[Any], root_cause: str = "Incident") -> dict:
    """Convenience helper to extract nodes and edges for frontend/agent visualizers."""
    normalized = [normalize_event(e) for e in events]
    normalized = detect_anomalies(normalized)
    rels = build_evidence_relationships(normalized, "incident", root_cause)

    nodes = []
    for e in normalized:
        nodes.append({
            "id": e.event_id,
            "label": f"{e.source_type} ({e.device_id})",
            "type": e.source_type,
            "trust": e.trust,
            "is_duplicate": e.is_duplicate,
            "is_anomaly": e.is_anomaly
        })
    nodes.append({"id": "incident", "label": root_cause, "type": "incident"})

    edges = []
    for r in rels:
        edges.append({
            "id": r.relationship_id,
            "source": r.source_id,
            "target": r.target_id,
            "type": r.relationship_type,
            "confidence": r.confidence,
            "summary": r.evidence_summary
        })

    return {"nodes": nodes, "edges": edges}
