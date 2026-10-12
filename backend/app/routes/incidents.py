"""Incident API routes: list, detail, replay, explain."""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Incident, Event

router = APIRouter()


@router.get("/incidents")
async def list_incidents(db: AsyncSession = Depends(get_db)):
    """List all incidents sorted by severity."""
    result = await db.execute(
        select(Incident).order_by(Incident.severity_score.desc())
    )
    incidents = result.scalars().all()
    return [i.to_dict() for i in incidents]


@router.get("/incidents/{incident_id}")
async def get_incident(incident_id: int, db: AsyncSession = Depends(get_db)):
    """Get full incident detail with events, cause ranking, evidence graph, explanation, confidence history."""
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id)
    )
    incident = result.scalars().first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    data = incident.to_dict(include_events=True)

    # Build evidence graph (nodes = events, edges = supports/contradicts)
    nodes = []
    edges = []
    for evt in (incident.events or []):
        payload = json.loads(evt.payload) if isinstance(evt.payload, str) else evt.payload
        text = payload.get("text", payload.get("description", ""))
        is_conflict = False
        if isinstance(text, str):
            is_conflict = any(w in text.lower() for w in ["no issue", "clear", "no problem"])

        nodes.append({
            "id": f"evt-{evt.id}",
            "label": f"{evt.source_type} ({evt.device_id or 'unknown'})",
            "type": evt.source_type,
            "trust": evt.trust,
            "verified": evt.signature_verified,
            "is_anomaly": evt.is_anomaly,
            "is_duplicate": evt.is_duplicate,
            "timestamp": evt.timestamp.isoformat() if evt.timestamp else None,
            "value": payload.get("value"),
            "text": text[:100] if text else None,
        })
        if not evt.is_duplicate:
            edges.append({
                "source": f"evt-{evt.id}",
                "target": "incident",
                "type": "contradicts" if is_conflict else "supports",
                "weight": evt.trust,
            })

    # Add incident node
    nodes.append({
        "id": "incident",
        "label": incident.cause,
        "type": "incident",
        "confidence": incident.cause_confidence,
    })

    data["evidence_graph"] = {"nodes": nodes, "edges": edges}
    return data


@router.get("/incidents/{incident_id}/replay")
async def replay_incident(incident_id: int, db: AsyncSession = Depends(get_db)):
    """Get events in chronological order for timeline replay."""
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id)
    )
    incident = result.scalars().first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    result = await db.execute(
        select(Event).where(Event.incident_id == incident_id).order_by(Event.timestamp.asc())
    )
    events = result.scalars().all()

    # Build replay: each step shows cumulative state
    from ..engine import infer_cause, compute_severity
    steps = []
    cumulative = []
    for evt in events:
        cumulative.append(evt)
        cause, conf, ranking = infer_cause(cumulative)
        sev, level = compute_severity(cause, cumulative, conf)
        steps.append({
            "step": len(steps) + 1,
            "event": evt.to_dict(),
            "cumulative_cause": cause,
            "cumulative_confidence": conf,
            "cumulative_severity": sev,
            "severity_level": level,
            "event_count": len(cumulative),
        })

    return {
        "incident_id": incident_id,
        "total_steps": len(steps),
        "steps": steps,
    }
