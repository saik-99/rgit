"""Event API routes: ingest single/batch events, list events."""
import json
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Event, Incident
from ..schemas import EventCreate, BatchEventsCreate
from ..engine import process_event
from .stream import broadcast_event

router = APIRouter()


async def broadcast_ingest_updates(processed_event: Event, db: AsyncSession):
    """Broadcast event_ingested and incident_updated to live WebSocket stream."""
    try:
        await broadcast_event({"type": "event_ingested", "event": processed_event.to_dict()})
        incident = getattr(processed_event, "_incident", None)
        if not incident and processed_event.incident_id:
            res = await db.execute(select(Incident).where(Incident.id == processed_event.incident_id))
            incident = res.scalars().first()
        if incident:
            await broadcast_event({"type": "incident_updated", "incident": incident.to_dict(include_events=True)})
    except Exception:
        pass


@router.post("/events", status_code=201)
async def ingest_event(event_data: EventCreate, db: AsyncSession = Depends(get_db)):
    """Ingest a single event through the full processing pipeline."""
    event = Event(
        source_type=event_data.source_type,
        lat=event_data.lat,
        lon=event_data.lon,
        timestamp=event_data.timestamp,
        received_at=datetime.datetime.utcnow(),
        payload=json.dumps(event_data.payload),
        device_id=event_data.device_id,
        signature=event_data.signature,
        trust=event_data.trust,
    )
    processed = await process_event(db, event)
    await broadcast_ingest_updates(processed, db)
    return processed.to_dict()


@router.post("/events/batch", status_code=201)
async def ingest_batch(batch: BatchEventsCreate, db: AsyncSession = Depends(get_db)):
    """Ingest a batch of events."""
    results = []
    for event_data in batch.events:
        event = Event(
            source_type=event_data.source_type,
            lat=event_data.lat,
            lon=event_data.lon,
            timestamp=event_data.timestamp,
            received_at=datetime.datetime.utcnow(),
            payload=json.dumps(event_data.payload),
            device_id=event_data.device_id,
            signature=event_data.signature,
            trust=event_data.trust,
        )
        processed = await process_event(db, event)
        await broadcast_ingest_updates(processed, db)
        results.append(processed.to_dict())
    return {"ingested": len(results), "events": results}


@router.get("/events")
async def list_events(
    limit: int = 50,
    offset: int = 0,
    source_type: str | None = None,
    incident_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List events with optional filters."""
    query = select(Event).order_by(Event.timestamp.desc())
    if source_type:
        query = query.where(Event.source_type == source_type)
    if incident_id:
        query = query.where(Event.incident_id == incident_id)
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    events = result.scalars().all()
    return [e.to_dict() for e in events]
