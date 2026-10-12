"""Downstream API v1: clean schemas for external municipal consumers."""
import os
import json
from typing import Optional, List
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Incident

router = APIRouter()

SEVERITY_THRESHOLDS = {
    "low": 0,
    "medium": 40,
    "high": 60,
    "critical": 80,
}


def _verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")):
    """Validate optional API key from .env if configured."""
    expected_key = os.getenv("API_KEY") or os.getenv("X_API_KEY") or os.getenv("DOWNSTREAM_API_KEY")
    if expected_key:
        if not x_api_key or x_api_key.strip() != expected_key.strip():
            raise HTTPException(status_code=401, detail="Unauthorized: Invalid or missing X-API-Key")
    return x_api_key


@router.get("/v1/incidents")
async def get_v1_incidents(
    status: Optional[str] = Query(None, description="Filter by incident status: active, monitoring, resolved"),
    min_severity: Optional[str] = Query(None, description="Minimum severity score (e.g. 50) or level (low, medium, high, critical)"),
    api_key: Optional[str] = Depends(_verify_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Downstream endpoint for external municipal dispatch and agency integrations.
    Returns clean, compact schema:
    [{id, cause, confidence, severity_level, lat, lon, updated_at, event_count}]
    """
    query = select(Incident).order_by(Incident.severity_score.desc())
    if status:
        query = query.where(Incident.status == status.lower())

    result = await db.execute(query)
    incidents = result.scalars().all()

    # Filter min_severity if provided
    min_score = None
    if min_severity is not None:
        ms = str(min_severity).strip().lower()
        if ms in SEVERITY_THRESHOLDS:
            min_score = SEVERITY_THRESHOLDS[ms]
        else:
            try:
                min_score = float(ms)
            except ValueError:
                pass

    filtered = []
    for inc in incidents:
        if min_score is not None and (inc.severity_score or 0) < min_score:
            continue
        non_dup_events = [e for e in (inc.events or []) if not e.is_duplicate]
        filtered.append({
            "id": inc.id,
            "cause": inc.cause,
            "confidence": inc.cause_confidence,
            "severity_level": inc.severity_level,
            "lat": inc.centroid_lat,
            "lon": inc.centroid_lon,
            "updated_at": inc.updated_at.isoformat() if inc.updated_at else None,
            "event_count": len(non_dup_events),
        })

    return filtered
