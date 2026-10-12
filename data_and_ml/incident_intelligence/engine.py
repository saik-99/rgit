"""
Main Incident Intelligence Engine.
Orchestrates normalization, deduplication, spatiotemporal clustering,
causal graph inference, severity/priority scoring, and explanation generation.
Importable by backend routes and AI agent workflows.
"""

import datetime
import logging
from typing import List, Dict, Any, Optional
from .models import NormalizedEvent, IncidentReport, EvidenceRelationship
from .normalization import normalize_event
from .deduplication import deduplicate_events
from .clustering import cluster_events_spatiotemporal, compute_cluster_centroid
from .causal_engine import infer_probable_cause, build_evidence_relationships
from .severity import compute_severity_and_priority
from .explainer import generate_operator_briefing
from .ingestion_gate import IngestionGate, GateResult

logger = logging.getLogger(__name__)


class IncidentIntelligenceEngine:
    """
    Main incident intelligence and multimodal fusion coordinator.
    Usage:
        engine = IncidentIntelligenceEngine(spatial_radius_m=800.0, time_window_sec=1800.0)
        reports = engine.analyze_events(raw_events, weather_context)
    """

    def __init__(
        self,
        spatial_radius_m: float = 800.0,
        time_window_sec: float = 1800.0,
        gate_mode: str = "permissive",
    ):
        self.spatial_radius_m = spatial_radius_m
        self.time_window_sec  = time_window_sec
        # SHA-256 Ingestion Gate — cybersecurity boundary layer
        self.gate = IngestionGate(mode=gate_mode)

    def analyze_events(
        self,
        raw_events: List[Any],
        weather_context: Optional[dict] = None
    ) -> List[IncidentReport]:
        """
        Processes a collection of streaming or batch events through the intelligence pipeline.

        Pipeline stages:
          0. SHA-256 Ingestion Gate   — verify / reject tampered records
          1. Normalization            — canonical NormalizedEvent objects
          2. Deduplication            — mark duplicate evidence
          3. Spatiotemporal Clustering
          4. Causal Inference
          5. Severity & Priority Scoring
          6. Evidence Graph & Relationships
          7. Operational Explanation

        Returns a list of structured IncidentReports.
        """
        if not raw_events:
            return []

        # ── STEP 0: SHA-256 Ingestion Gate ─────────────────────────────
        # Every raw record is screened before any AI processing.
        # Tampered / spoof-flagged records are silently quarantined here.
        admitted, admitted_results, rejected = self.gate.screen_batch(raw_events)
        if rejected:
            spoof = [r for r in rejected if r.is_spoof_flagged]
            logger.warning(
                "GATE: %d record(s) rejected before AI engine (%d spoof flags). "
                "Rejected IDs: %s",
                len(rejected), len(spoof),
                [r.record_id for r in rejected],
            )
        logger.info("GATE summary: %s", self.gate.summary())

        if not admitted:
            logger.error("GATE: all records rejected — no data admitted to AI engine.")
            return []

        # Build a trust override map from gate decisions
        gate_trust: Dict[str, float] = {
            r.record_id: r.trust_score for r in admitted_results
        }

        # ── STEP 1: Normalization & validation ─────────────────────────
        normalized: List[NormalizedEvent] = []
        for raw in admitted:
            ev = normalize_event(raw)
            # Override trust with gate-derived score (gate is authoritative)
            rec_id = str(
                (raw.get("event_id") or raw.get("id") or raw.get("unique_key") or "")
                if isinstance(raw, dict) else getattr(raw, "event_id", "")
            )
            if rec_id in gate_trust:
                ev.trust = gate_trust[rec_id]
            ev.signature_verified = (gate_trust.get(rec_id, 0.5) == 1.0)
            normalized.append(ev)

        # 2. Deduplication (marks duplicate events while preserving original evidence)
        unique_events, duplicate_events = deduplicate_events(normalized)

        # 3. Spatiotemporal Clustering
        # Cluster all events (unique and duplicates together so duplicates stay attached to their incident)
        clusters = cluster_events_spatiotemporal(
            normalized,
            max_distance_m=self.spatial_radius_m,
            max_time_sec=self.time_window_sec
        )

        incident_reports: List[IncidentReport] = []

        for idx, cluster in enumerate(clusters, start=1):
            inc_id = f"INCIDENT-{idx:03d}"
            c_lat, c_lon, radius = compute_cluster_centroid(cluster)

            # 4. Causal Inference
            cause, label, conf, ranking, supp_cnt, confl_cnt = infer_probable_cause(
                cluster, weather_context
            )

            # 5. Severity, Priority & Completeness
            sev_score, sev_level, priority, completeness, ver_req, missing_mods = compute_severity_and_priority(
                cause, cluster, conf
            )

            # 6. Evidence Graph & Relationships
            relationships = build_evidence_relationships(cluster, inc_id, label)

            # Determine location title
            loc_names = [e.location_name for e in cluster if e.location_name]
            neighborhood = loc_names[0] if loc_names else "Urban Sector"
            city = next((e.city for e in cluster if e.city), None)
            country = next((e.country for e in cluster if e.country), None)

            # 7. Operational Explanation
            explanation, rec_actions = generate_operator_briefing(
                cause_label=label,
                confidence=conf,
                severity_level=sev_level,
                priority=priority,
                events=cluster,
                supporting_count=supp_cnt,
                conflicting_count=confl_cnt,
                missing_modalities=missing_mods,
                verification_required=ver_req,
                ranking=ranking,
                location_name=neighborhood
            )

            times = [e.event_time for e in cluster if e.event_time]
            created_at = min(times) if times else datetime.datetime.utcnow()
            updated_at = max(times) if times else datetime.datetime.utcnow()

            report = IncidentReport(
                incident_id=inc_id,
                title=f"{label} — {neighborhood}",
                primary_cause=cause,
                cause_label=label,
                cause_confidence=conf,
                cause_ranking=ranking,
                severity_score=sev_score,
                severity_level=sev_level,
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
