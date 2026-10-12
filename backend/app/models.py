"""SQLAlchemy ORM models for events, incidents, and sources."""
import datetime
import json
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_type = Column(String(50), nullable=False)  # water_level | road_sensor | citizen_report | emergency_call | weather | transit
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    timestamp = Column(DateTime, nullable=False)
    received_at = Column(DateTime, default=datetime.datetime.utcnow)
    payload = Column(Text, default="{}")  # JSON blob
    device_id = Column(String(100), nullable=True)
    signature = Column(String(256), nullable=True)
    trust = Column(Float, default=0.5)
    signature_verified = Column(Boolean, default=False)
    is_duplicate = Column(Boolean, default=False)
    is_anomaly = Column(Boolean, default=False)
    anomaly_zscore = Column(Float, default=0.0)
    h3_cell = Column(String(20), nullable=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=True)

    incident = relationship("Incident", back_populates="events")

    def to_dict(self):
        return {
            "id": self.id,
            "source_type": self.source_type,
            "lat": self.lat,
            "lon": self.lon,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "received_at": self.received_at.isoformat() if self.received_at else None,
            "payload": json.loads(self.payload) if self.payload else {},
            "device_id": self.device_id,
            "trust": self.trust,
            "signature_verified": self.signature_verified,
            "is_duplicate": self.is_duplicate,
            "is_anomaly": self.is_anomaly,
            "anomaly_zscore": self.anomaly_zscore,
            "h3_cell": self.h3_cell,
            "incident_id": self.incident_id,
        }


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), default="Unclassified Incident")
    cause = Column(String(100), default="unknown")
    cause_confidence = Column(Float, default=0.0)
    severity_score = Column(Integer, default=0)
    severity_level = Column(String(20), default="low")
    status = Column(String(20), default="active")  # active | resolved | monitoring
    centroid_lat = Column(Float, default=0.0)
    centroid_lon = Column(Float, default=0.0)
    radius_m = Column(Float, default=500.0)
    neighborhood = Column(String(200), default="")
    explanation = Column(Text, default="")
    cause_ranking = Column(Text, default="[]")  # JSON array
    confidence_history = Column(Text, default="[]")  # JSON array of {t, confidence}
    flood_polygon = Column(Text, default="[]")  # GeoJSON coordinates array
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

    events = relationship("Event", back_populates="incident", lazy="selectin")

    def to_dict(self, include_events=False):
        d = {
            "id": self.id,
            "title": self.title,
            "cause": self.cause,
            "cause_confidence": self.cause_confidence,
            "severity_score": self.severity_score,
            "severity_level": self.severity_level,
            "status": self.status,
            "centroid_lat": self.centroid_lat,
            "centroid_lon": self.centroid_lon,
            "radius_m": self.radius_m,
            "neighborhood": self.neighborhood,
            "explanation": self.explanation,
            "cause_ranking": json.loads(self.cause_ranking) if self.cause_ranking else [],
            "confidence_history": json.loads(self.confidence_history) if self.confidence_history else [],
            "flood_polygon": json.loads(self.flood_polygon) if self.flood_polygon else [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "event_count": len(self.events) if self.events else 0,
        }
        if include_events:
            d["events"] = [e.to_dict() for e in (self.events or [])]
        return d


class Source(Base):
    __tablename__ = "sources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(100), unique=True, nullable=False)
    source_type = Column(String(50), nullable=False)
    name = Column(String(200), default="")
    lat = Column(Float, default=0.0)
    lon = Column(Float, default=0.0)
    trust_score = Column(Float, default=0.8)
    hmac_key = Column(String(256), default="")  # Shared secret for HMAC verification
    last_seen = Column(DateTime, nullable=True)
    signature_status = Column(String(20), default="unknown")  # verified | failed | unknown
    event_count = Column(Integer, default=0)
    is_flagged = Column(Boolean, default=False)

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "source_type": self.source_type,
            "name": self.name,
            "lat": self.lat,
            "lon": self.lon,
            "trust_score": self.trust_score,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "signature_status": self.signature_status,
            "event_count": self.event_count,
            "is_flagged": self.is_flagged,
        }
