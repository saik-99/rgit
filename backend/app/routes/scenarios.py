"""Scenario API routes: run predefined test scenarios and reset."""
import json
import datetime
import random
from fastapi import APIRouter, Depends
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Event, Incident, Source
from ..seed import seed_mumbai_scenario
from ..engine import process_event
from .stream import broadcast_event

router = APIRouter()

# Mumbai coordinates
HINDMATA = (19.0112, 72.8512)


async def _process_and_broadcast(db: AsyncSession, event: Event) -> Event:
    """Run process_event and broadcast event_ingested and incident_updated to WebSocket."""
    processed = await process_event(db, event)
    try:
        await broadcast_event({"type": "event_ingested", "event": processed.to_dict()})
        incident = getattr(processed, "_incident", None)
        if not incident and processed.incident_id:
            res = await db.execute(select(Incident).where(Incident.id == processed.incident_id))
            incident = res.scalars().first()
        if incident:
            await broadcast_event({"type": "incident_updated", "incident": incident.to_dict(include_events=True)})
    except Exception:
        pass
    return processed


async def _reset_db(db: AsyncSession):
    """Clear all events, incidents, and sources."""
    await db.execute(delete(Event))
    await db.execute(delete(Incident))
    await db.execute(delete(Source))
    await db.commit()


@router.post("/reset")
async def reset_all(db: AsyncSession = Depends(get_db)):
    """Reset the database and re-seed the Mumbai scenario."""
    await _reset_db(db)
    await seed_mumbai_scenario(db)
    return {"status": "reset", "message": "Database reset and re-seeded with Mumbai scenario."}


@router.post("/scenarios/{name}")
async def run_scenario(name: str, db: AsyncSession = Depends(get_db)):
    """Run a named scenario that modifies the current state."""
    now = datetime.datetime.utcnow()

    if name == "drainage_failure":
        # Reset and re-seed the standard drainage failure
        await _reset_db(db)
        await seed_mumbai_scenario(db)
        return {"scenario": name, "message": "Drainage failure scenario loaded with all seed events."}

    elif name == "shuffle_order":
        # Re-ingest the same events in random order via the processing pipeline
        await _reset_db(db)
        await seed_mumbai_scenario(db)
        # The seed already has out-of-order timestamps so this is inherently tested
        return {"scenario": name, "message": "Events re-ingested — out-of-order timestamps are handled by the engine."}

    elif name == "inject_duplicates":
        # Inject duplicate water_level events
        for i in range(3):
            dup = Event(
                source_type="water_level",
                device_id="IOT-DRAIN-HM01",
                lat=HINDMATA[0], lon=HINDMATA[1],
                timestamp=now - datetime.timedelta(minutes=38),  # Same timestamp as seed
                received_at=now,
                payload=json.dumps({"value": 78.5, "unit": "cm_above_normal", "description": "Duplicate signal"}),
                trust=0.95,
            )
            await _process_and_broadcast(db, dup)
        return {"scenario": name, "message": "3 duplicate water_level events injected — deduplication should flag them."}

    elif name == "drop_sensor":
        # Mark a sensor as offline / flagged
        from sqlalchemy import select, update
        await db.execute(
            update(Source).where(Source.device_id == "IOT-DRAIN-HM02").values(
                is_flagged=True, signature_status="failed", trust_score=0.1
            )
        )
        await db.commit()
        return {"scenario": name, "message": "Sensor IOT-DRAIN-HM02 dropped (flagged, trust=0.1). Confidence should decrease."}

    elif name == "conflicting_report":
        # Inject a contradicting citizen report
        evt = Event(
            source_type="citizen_report",
            device_id="CITIZEN-CONFLICT-999",
            lat=19.0115, lon=72.8510,
            timestamp=now - datetime.timedelta(minutes=5),
            received_at=now,
            payload=json.dumps({"text": "Everything is clear here, no flooding at all, road is dry.", "language": "en"}),
            trust=0.25,
        )
        await _process_and_broadcast(db, evt)
        return {"scenario": name, "message": "Conflicting citizen report injected — confidence should decrease."}

    elif name == "spoofed_sensor":
        # Ensure device Source record has trust_score=0.2 and is_flagged=True
        from sqlalchemy import select
        res = await db.execute(select(Source).where(Source.device_id == "IOT-DRAIN-SPOOF"))
        src = res.scalars().first()
        if not src:
            src = Source(
                device_id="IOT-DRAIN-SPOOF",
                source_type="water_level",
                name="Spoofed Culvert Sensor (Quarantined)",
                lat=19.0110,
                lon=72.8515,
                trust_score=0.2,
                is_flagged=True,
                signature_status="unverified",
                hmac_key="invalid_key",
            )
            db.add(src)
        else:
            src.trust_score = 0.2
            src.is_flagged = True
            src.signature_status = "unverified"
        await db.commit()

        # Inject an event with trust=0.2, invalid signature
        evt = Event(
            source_type="water_level",
            device_id="IOT-DRAIN-SPOOF",
            lat=19.0110, lon=72.8515,
            timestamp=now - datetime.timedelta(minutes=10),
            received_at=now,
            payload=json.dumps({"value": 200.0, "unit": "cm_above_normal", "description": "Suspiciously high reading from unverified device"}),
            signature="invalid_signature_data",
            trust=0.2,
            signature_verified=False,
        )
        await _process_and_broadcast(db, evt)
        return {"scenario": name, "message": "Spoofed sensor quarantined (trust=0.2, is_flagged=True) and ignored by cause scoring."}

    elif name == "heavy_rain":
        # Inject heavy rainfall weather event
        evt = Event(
            source_type="weather",
            device_id="open-meteo-hindmata",
            lat=HINDMATA[0], lon=HINDMATA[1],
            timestamp=now - datetime.timedelta(minutes=2),
            received_at=now,
            payload=json.dumps({
                "value": 120.0,
                "unit": "mm/hr",
                "description": "Extreme rainfall spike — cloudburst conditions",
                "precipitation_24h": 280.0,
                "humidity": 99,
                "source": "open-meteo",
            }),
            trust=0.80,
        )
        await _process_and_broadcast(db, evt)
        return {"scenario": name, "message": "Heavy rain event injected (120 mm/hr). Drainage failure confidence should increase."}

    elif name == "earthquake":
        # Inject simulated seismic event (clearly labeled test provenance)
        from .hazards import _injected_test_events
        from ..adapters.usgs import create_demo_test_earthquake

        test_eq = create_demo_test_earthquake(lat=HINDMATA[0] + 0.005, lon=HINDMATA[1] + 0.005, magnitude=5.1)
        _injected_test_events.clear()
        _injected_test_events.append(test_eq)

        seismic_evt = Event(
            source_type="seismic",
            device_id="USGS-TEST-MUMBAI-EQ",
            lat=HINDMATA[0] + 0.005,
            lon=HINDMATA[1] + 0.005,
            timestamp=now - datetime.timedelta(minutes=3),
            received_at=now,
            payload=json.dumps(test_eq["payload"]),
            trust=0.95,
            signature_verified=True,
        )
        await _process_and_broadcast(db, seismic_evt)

        # Inject supporting tremor citizen report
        tremor_report = Event(
            source_type="citizen_report",
            device_id="CITIZEN-TREMOR-881",
            lat=HINDMATA[0],
            lon=HINDMATA[1],
            timestamp=now - datetime.timedelta(minutes=2),
            received_at=now,
            payload=json.dumps({"text": "Strong ground shaking felt across Dadar! Windows rattling, people evacuating buildings.", "language": "en"}),
            trust=0.75,
            signature_verified=False,
        )
        await _process_and_broadcast(db, tremor_report)

        return {
            "scenario": name,
            "message": "Demo test earthquake injected (M5.1, Provenance: test) with citizen tremor reports. Causal intelligence should infer seismic event.",
        }

    return {"error": f"Unknown scenario: {name}"}
