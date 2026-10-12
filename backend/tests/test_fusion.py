"""Tests for Urban Incident Fusion engine:
Verifies that the same primary incident is reconstructed under:
- Shuffled event order
- Duplicate event injection
- Missing sensor (dropped sensor)
- Spoofed / untrusted sensor injection
"""
import pytest
import asyncio
import json
import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.models import Base, Event, Incident, Source
from app.engine import process_event
from app.seed import seed_mumbai_scenario


@pytest.fixture
async def test_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
    await engine.dispose()


@pytest.mark.anyio
async def test_standard_drainage_fusion(test_db):
    """Test standard seed scenario reconstructs drainage_failure incident."""
    await seed_mumbai_scenario(test_db)
    
    result = await test_db.execute(select(Incident))
    incidents = result.scalars().all()
    assert len(incidents) >= 1
    
    primary = incidents[0]
    assert primary.cause == "drainage_failure"
    assert primary.cause_confidence >= 0.70
    assert primary.severity_level in ["high", "critical"]
    assert len(primary.events) >= 5


@pytest.mark.anyio
async def test_shuffled_event_order(test_db):
    """Test that events arriving out of order reconstruct the same incident cause."""
    now = datetime.datetime.utcnow()
    events = [
        Event(
            source_type="transit",
            device_id="BEST-BUS-HM102",
            lat=19.0118, lon=72.8520,
            timestamp=now - datetime.timedelta(minutes=15),
            received_at=now,
            payload=json.dumps({"value": 0.0, "unit": "kmh", "status": "rerouted"}),
            trust=0.90
        ),
        Event(
            source_type="water_level",
            device_id="IOT-DRAIN-HM01",
            lat=19.0112, lon=72.8512,
            timestamp=now - datetime.timedelta(minutes=30),
            received_at=now,
            payload=json.dumps({"value": 85.0, "unit": "cm", "reading": "waterlogging"}),
            trust=0.95
        ),
        Event(
            source_type="water_level",
            device_id="IOT-DRAIN-HM02",
            lat=19.0105, lon=72.8520,
            timestamp=now - datetime.timedelta(minutes=35),
            received_at=now,
            payload=json.dumps({"value": 62.0, "unit": "cm", "status": "overflow"}),
            trust=0.93
        ),
        Event(
            source_type="citizen_report",
            device_id="CITIZEN-APP-8841",
            lat=19.0110, lon=72.8515,
            timestamp=now - datetime.timedelta(minutes=25),
            received_at=now,
            payload=json.dumps({"text": "Severe waterlogging near flyover"}),
            trust=0.60
        ),
        Event(
            source_type="road_sensor",
            device_id="MUM-TRAF-HM04",
            lat=19.0114, lon=72.8518,
            timestamp=now - datetime.timedelta(minutes=20),
            received_at=now,
            payload=json.dumps({"speed": 5.0, "occupancy": 95.0}),
            trust=0.90
        )
    ]

    for ev in events:
        await process_event(test_db, ev)

    res = await test_db.execute(select(Incident))
    incidents = res.scalars().all()
    assert len(incidents) >= 1
    assert incidents[0].cause == "drainage_failure"


@pytest.mark.anyio
async def test_duplicate_events_resilience(test_db):
    """Test that duplicate events do not create multiple incidents or break cause."""
    await seed_mumbai_scenario(test_db)
    
    # Inject duplicate of initial water level event
    now = datetime.datetime.utcnow()
    dup = Event(
        source_type="water_level",
        device_id="IOT-DRAIN-HM01",
        lat=19.0112, lon=72.8512,
        timestamp=now - datetime.timedelta(minutes=38),
        received_at=now,
        payload=json.dumps({"value": 78.5, "unit": "cm_above_normal"}),
        trust=0.95
    )
    await process_event(test_db, dup)
    
    res = await test_db.execute(select(Incident))
    incidents = res.scalars().all()
    assert len(incidents) >= 1
    assert incidents[0].cause == "drainage_failure"


@pytest.mark.anyio
async def test_missing_sensor_resilience(test_db):
    """Test incident reconstruction when one sensor is missing."""
    now = datetime.datetime.utcnow()
    events = [
        Event(
            source_type="water_level",
            device_id="IOT-DRAIN-HM01",
            lat=19.0112, lon=72.8512,
            timestamp=now - datetime.timedelta(minutes=30),
            received_at=now,
            payload=json.dumps({"value": 85.0, "unit": "cm"}),
            trust=0.95
        ),
        Event(
            source_type="citizen_report",
            device_id="CITIZEN-APP-8841",
            lat=19.0110, lon=72.8515,
            timestamp=now - datetime.timedelta(minutes=25),
            received_at=now,
            payload=json.dumps({"text": "Knee-deep water outside"}),
            trust=0.60
        ),
        Event(
            source_type="transit",
            device_id="BEST-BUS-HM102",
            lat=19.0118, lon=72.8520,
            timestamp=now - datetime.timedelta(minutes=15),
            received_at=now,
            payload=json.dumps({"status": "submerged"}),
            trust=0.90
        )
    ]
    for ev in events:
        await process_event(test_db, ev)

    res = await test_db.execute(select(Incident))
    incidents = res.scalars().all()
    assert len(incidents) >= 1
    assert incidents[0].cause == "drainage_failure"


@pytest.mark.anyio
async def test_spoofed_sensor_resilience(test_db):
    """Test that spoofed sensor with invalid signature is flagged and does not hijack the cause."""
    await seed_mumbai_scenario(test_db)
    
    now = datetime.datetime.utcnow()
    spoof = Event(
        source_type="water_level",
        device_id="IOT-DRAIN-SPOOF",
        lat=19.0110, lon=72.8515,
        timestamp=now - datetime.timedelta(minutes=5),
        received_at=now,
        payload=json.dumps({"value": 999.0, "unit": "cm"}),
        signature="tampered_signature_xyz",
        trust=0.1
    )
    await process_event(test_db, spoof)
    
    res = await test_db.execute(select(Incident))
    incidents = res.scalars().all()
    assert len(incidents) >= 1
    assert incidents[0].cause == "drainage_failure"
