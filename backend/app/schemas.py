"""Pydantic schemas for API request/response validation."""
from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


class EventCreate(BaseModel):
    source_type: str = Field(..., pattern="^(water_level|road_sensor|citizen_report|emergency_call|weather|transit|seismic)$")
    lat: float
    lon: float
    timestamp: datetime
    payload: dict[str, Any] = {}
    device_id: Optional[str] = None
    signature: Optional[str] = None
    trust: Optional[float] = None


class EventResponse(BaseModel):
    id: int
    source_type: str
    lat: float
    lon: float
    timestamp: str
    received_at: Optional[str] = None
    payload: dict[str, Any] = {}
    device_id: Optional[str] = None
    trust: float
    signature_verified: bool
    is_duplicate: bool
    is_anomaly: bool
    anomaly_zscore: float
    h3_cell: Optional[str] = None
    incident_id: Optional[int] = None


class IncidentResponse(BaseModel):
    id: int
    title: str
    cause: str
    cause_confidence: float
    severity_score: int
    severity_level: str
    status: str
    centroid_lat: float
    centroid_lon: float
    radius_m: float
    neighborhood: str
    explanation: str
    cause_ranking: list[dict[str, Any]] = []
    confidence_history: list[dict[str, Any]] = []
    flood_polygon: list = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    event_count: int = 0
    events: Optional[list[dict[str, Any]]] = None


class BatchEventsCreate(BaseModel):
    events: list[EventCreate]


class ScenarioRequest(BaseModel):
    name: str = Field(..., pattern="^(drainage_failure|shuffle_order|inject_duplicates|drop_sensor|conflicting_report|spoofed_sensor|heavy_rain|earthquake)$")
