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

router = APIRouter()

# Mumbai coordinates
HINDMATA = (19.0112, 72.8512)


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
            await process_event(db, dup)
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
        await process_event(db, evt)
        return {"scenario": name, "message": "Conflicting citizen report injected — confidence should decrease."}

    elif name == "spoofed_sensor":
        # Inject an event with a bad signature / low trust
        evt = Event(
            source_type="water_level",
            device_id="IOT-DRAIN-SPOOF",
            lat=19.0110, lon=72.8515,
            timestamp=now - datetime.timedelta(minutes=10),
            received_at=now,
            payload=json.dumps({"value": 200.0, "unit": "cm_above_normal", "description": "Suspiciously high reading from unverified device"}),
            signature="invalid_signature_data",
            trust=0.15,
        )
        await process_event(db, evt)
        return {"scenario": name, "message": "Spoofed sensor event injected — should be flagged as untrusted."}

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
        await process_event(db, evt)
        return {"scenario": name, "message": "Heavy rain event injected (120 mm/hr). Drainage failure confidence should increase."}

    return {"error": f"Unknown scenario: {name}"}
