"""
Data models and schemas for Incident Intelligence.
City-independent, strictly typed representations of events, relationships,
clusters, and intelligence summaries.
"""

from dataclasses import dataclass, field, asdict
from typing import Optional, Any
import datetime
import json


@dataclass
class NormalizedEvent:
    event_id: str
    source_type: str                     # water_level, road_sensor, transit, weather, citizen_report, emergency_call
    device_id: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    event_time: Optional[datetime.datetime] = None
    received_time: Optional[datetime.datetime] = None
    payload: dict = field(default_factory=dict)
    trust: float = 0.50
    signature_verified: bool = False
    city: Optional[str] = None
    country: Optional[str] = None
    location_name: Optional[str] = None
    is_duplicate: bool = False
    duplicate_of: Optional[str] = None
    is_anomaly: bool = False
    anomaly_zscore: float = 0.0
    is_synthetic: bool = False
    data_type: str = "reported_incident" # direct_observation, reported_incident, mapped_infrastructure, model_weather
    source_url: Optional[str] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        if self.event_time:
            d["event_time"] = self.event_time.isoformat()
        if self.received_time:
            d["received_time"] = self.received_time.isoformat()
        return d


@dataclass
class EvidenceRelationship:
    relationship_id: str
    source_id: str                       # e.g. "EVT-1001" or "OBS-201"
    target_id: str                       # e.g. "INCIDENT-1" or "EVT-1002"
    relationship_type: str               # possible_contributor, temporally_related, spatially_related, duplicate_of, contradicts, corroborates
    time_difference_sec: Optional[float] = None
    geographic_distance_m: Optional[float] = None
    evidence_summary: str = ""
    confidence: float = 0.50
    alternative_explanations: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class IncidentReport:
    incident_id: str
    title: str
    primary_cause: str
    cause_label: str
    cause_confidence: float
    cause_ranking: list[dict]
    severity_score: int                  # 0 to 100
    severity_level: str                  # critical, high, medium, low
    response_priority: str               # P1_CRITICAL, P2_HIGH, P3_MEDIUM, P4_LOW
    data_completeness: float             # 0.0 to 1.0 (evaluates sensor, weather, spatial, eyewitness presence)
    verification_required: bool          # True if high severity with low confidence or missing critical sensors
    centroid_lat: Optional[float] = None
    centroid_lon: Optional[float] = None
    radius_m: float = 0.0
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    event_ids: list[str] = field(default_factory=list)
    relationships: list[EvidenceRelationship] = field(default_factory=list)
    explanation: str = ""
    supporting_evidence_count: int = 0
    conflicting_evidence_count: int = 0
    missing_modalities: list[str] = field(default_factory=list)
    recommended_actions: list[str] = field(default_factory=list)
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        if self.created_at:
            d["created_at"] = self.created_at.isoformat()
        if self.updated_at:
            d["updated_at"] = self.updated_at.isoformat()
        d["relationships"] = [r.to_dict() if hasattr(r, "to_dict") else r for r in self.relationships]
        return d
