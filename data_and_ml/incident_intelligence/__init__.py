"""
Incident Intelligence & ML Module for UrbanIncident Fusion.
Exports:
- IncidentIntelligenceEngine
- analyze_events
- build_evidence_graph
- normalize_event
- deduplicate_events
- cluster_events_spatiotemporal
- infer_probable_cause
- compute_severity_and_priority
"""

from .models import NormalizedEvent, EvidenceRelationship, IncidentReport
from .normalization import normalize_event
from .deduplication import deduplicate_events
from .clustering import cluster_events_spatiotemporal
from .causal_engine import infer_probable_cause, build_evidence_relationships, INCIDENT_TAXONOMY
from .severity import compute_severity_and_priority, compute_data_completeness
from .explainer import generate_operator_briefing
from .engine import IncidentIntelligenceEngine, analyze_events, build_evidence_graph

from .anomaly import detect_anomalies, AnomalyDetector
from .ml_classifier import MLIncidentClassifier, get_ml_classifier, combine_cause_rankings

__all__ = [
    "IncidentIntelligenceEngine",
    "analyze_events",
    "build_evidence_graph",
    "normalize_event",
    "deduplicate_events",
    "cluster_events_spatiotemporal",
    "infer_probable_cause",
    "build_evidence_relationships",
    "compute_severity_and_priority",
    "compute_data_completeness",
    "generate_operator_briefing",
    "detect_anomalies",
    "AnomalyDetector",
    "MLIncidentClassifier",
    "get_ml_classifier",
    "combine_cause_rankings",
    "NormalizedEvent",
    "EvidenceRelationship",
    "IncidentReport",
    "INCIDENT_TAXONOMY"
]

