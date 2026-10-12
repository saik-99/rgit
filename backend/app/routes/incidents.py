"""Incident API routes: list, detail, replay, explain."""
import sys
import os
import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Incident, Event
from ..engine import generate_explanation

# Ensure repo root is on sys.path for agents import
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

router = APIRouter()

# Symptom vocabulary mapping
SOURCE_TO_SYMPTOM = {
    "water_level": "water_rise",
    "road_sensor": "road_blocked",
    "transit": "traffic_slowdown",
    "citizen_report": "citizen_flood_report",
    "emergency_call": "emergency_call",
    "seismic": "ground_shaking",
    "weather": "rainfall_context",
}


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
    """
    Get full incident detail with 3-layer causal evidence graph:
    Layer 1: Root cause node (+ top 2 faded alternative causes)
    Layer 2: Symptom nodes (water_rise, road_blocked, etc.)
    Layer 3: Event nodes
    Edges: "causes", "observed_by", "contradicts"
    """
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id)
    )
    incident = result.scalars().first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    data = incident.to_dict(include_events=True)
    cause_ranking = json.loads(incident.cause_ranking) if incident.cause_ranking else []

    nodes = []
    edges = []

    # ── Layer 1: Root Cause Node ──────────────────────────────────────────────
    nodes.append({
        "id": "incident",
        "label": incident.cause,
        "type": "incident",
        "layer": "root_cause",
        "confidence": incident.cause_confidence,
        "faded": False,
    })

    # Add top 2 alternative causes as faded nodes
    alt_causes = [c for c in cause_ranking if c.get("cause") != incident.cause][:2]
    for alt in alt_causes:
        alt_id = f"alt-cause-{alt.get('cause')}"
        nodes.append({
            "id": alt_id,
            "label": alt.get("label", alt.get("cause")),
            "type": "alternative_cause",
            "layer": "root_cause",
            "probability": alt.get("probability", 0.0),
            "faded": True,
        })

    # ── Layer 2: Symptom Nodes ────────────────────────────────────────────────
    present_symptoms = set()
    for evt in (incident.events or []):
        sym = SOURCE_TO_SYMPTOM.get(evt.source_type, "traffic_slowdown")
        present_symptoms.add(sym)

    for sym in sorted(present_symptoms):
        nodes.append({
            "id": f"symptom-{sym}",
            "label": sym.replace("_", " ").title(),
            "type": "symptom",
            "layer": "symptom",
            "symptom": sym,
            "faded": False,
        })
        # Root cause -> Symptom edge ("causes")
        edges.append({
            "source": "incident",
            "target": f"symptom-{sym}",
            "type": "causes",
            "weight": 0.85,
        })

    # ── Layer 3: Event Nodes ──────────────────────────────────────────────────
    for evt in (incident.events or []):
        payload = json.loads(evt.payload) if isinstance(evt.payload, str) else (evt.payload or {})
        text = payload.get("text", payload.get("description", ""))
        is_conflict = False
        if isinstance(text, str):
            is_conflict = any(w in text.lower() for w in ["no issue", "clear", "no problem"])

        sym = SOURCE_TO_SYMPTOM.get(evt.source_type, "traffic_slowdown")

        nodes.append({
            "id": f"evt-{evt.id}",
            "label": f"{evt.source_type} ({evt.device_id or 'unknown'})",
            "type": evt.source_type,
            "layer": "event",
            "trust": evt.trust,
            "verified": evt.signature_verified,
            "is_anomaly": evt.is_anomaly,
            "is_duplicate": evt.is_duplicate,
            "duplicate_of": evt.duplicate_of,
            "corroboration_count": evt.corroboration_count,
            "timestamp": evt.timestamp.isoformat() if evt.timestamp else None,
            "value": payload.get("value"),
            "text": text[:100] if text else None,
            "faded": False,
        })

        if not evt.is_duplicate:
            # Symptom -> Event edge: "observed_by" (or "contradicts")
            edges.append({
                "source": f"symptom-{sym}",
                "target": f"evt-{evt.id}",
                "type": "contradicts" if is_conflict else "observed_by",
                "weight": evt.trust,
            })
            # Backward-compatible direct edge: evt -> incident ("supports" / "contradicts")
            edges.append({
                "source": f"evt-{evt.id}",
                "target": "incident",
                "type": "contradicts" if is_conflict else "supports",
                "weight": evt.trust,
            })

    data["evidence_graph"] = {"nodes": nodes, "edges": edges}
    return data


@router.post("/incidents/{incident_id}/explain")
async def explain_incident(incident_id: int, db: AsyncSession = Depends(get_db)):
    """
    Explain incident using the Agent (Person 4 analyze_incident).
    If the agent fails or is missing, fall back to engine.generate_explanation().
    Returns {briefing, recommended_actions, conflicts, integrity_flags, source: 'agent'|'fallback'}.
    """
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id)
    )
    incident = result.scalars().first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    events_list = [e.to_dict() for e in (incident.events or [])]
    cause_ranking = json.loads(incident.cause_ranking) if incident.cause_ranking else []

    agent_input = {
        "incident_id": incident.id,
        "cause": incident.cause,
        "confidence": incident.cause_confidence,
        "cause_ranking": cause_ranking,
        "events": events_list,
    }

    try:
        from agents.agent_manager import analyze_incident
        analysis = analyze_incident(agent_input)
        briefing = analysis.get("briefing") or analysis.get("response") or ""
        recommended_actions = analysis.get("recommended_actions") or []
        conflicts = analysis.get("conflicts") or []
        integrity_flags = analysis.get("integrity_flags") or []
        source = "agent"
    except Exception:
        # Fallback to engine.generate_explanation()
        briefing = generate_explanation(
            incident,
            incident.events or [],
            incident.cause,
            incident.cause_confidence,
            cause_ranking
        )
        recommended_actions = [
            "Dispatch emergency municipal repair team to address drainage infrastructure",
            "Deploy portable high-capacity suction pumps at Hindmata / Dadar junctions",
            "Coordinate with Mumbai Traffic Police to reroute arterial congestion",
            "Verify sensor battery and telemetry health for silent nodes"
        ]
        conflicts = []
        integrity_flags = []
        source = "fallback"

    return {
        "briefing": briefing,
        "recommended_actions": recommended_actions,
        "conflicts": conflicts,
        "integrity_flags": integrity_flags,
        "source": source,
    }


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
