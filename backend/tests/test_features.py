"""Tests for Person 1 features:
- Near-duplicates (difflib ratio > 0.75 within 300m and 10min)
- Out-of-order events landing in the same incident
- Lifecycle transitions (active -> monitoring -> resolved) & silent sensors
- /explain endpoint fallback & downstream API
"""
import pytest
import json
import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from httpx import AsyncClient, ASGITransport

from app.models import Base, Event, Incident
from app.engine import process_event, update_incident_lifecycle
from app.main import app


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
async def test_near_duplicates_detection(test_db):
    """Test citizen reports within 300m and 10 min with similar text are flagged as near-duplicates."""
    now = datetime.datetime.utcnow()

    # Original citizen report
    ev1 = Event(
        source_type="citizen_report",
        device_id="CITIZEN-001",
        lat=19.0112,
        lon=72.8512,
        timestamp=now - datetime.timedelta(minutes=5),
        received_at=now,
        payload=json.dumps({"text": "Severe waterlogging at Hindmata cinema junction, knee deep water"}),
        trust=0.6,
    )
    processed1 = await process_event(test_db, ev1)
    assert not processed1.is_duplicate
    assert processed1.corroboration_count == 0

    # Near-duplicate report (80m away, 2 minutes later, very similar text)
    ev2 = Event(
        source_type="citizen_report",
        device_id="CITIZEN-002",
        lat=19.0116,
        lon=72.8515,
        timestamp=now - datetime.timedelta(minutes=3),
        received_at=now,
        payload=json.dumps({"text": "Severe waterlogging near Hindmata cinema, knee deep water reported"}),
        trust=0.55,
    )
    processed2 = await process_event(test_db, ev2)

    assert processed2.is_duplicate is True
    assert processed2.duplicate_of == processed1.id

    # Check corroboration_count incremented on the original
    res = await test_db.execute(select(Event).where(Event.id == processed1.id))
    original = res.scalars().first()
    assert original.corroboration_count >= 1


@pytest.mark.anyio
async def test_out_of_order_events_landing_in_same_incident(test_db):
    """Test that temporally out-of-order events within the spatiotemporal threshold join the same incident."""
    now = datetime.datetime.utcnow()

    # Event 1: arrives first, timestamp t - 10 min
    ev1 = Event(
        source_type="water_level",
        device_id="IOT-DRAIN-01",
        lat=19.0112,
        lon=72.8512,
        timestamp=now - datetime.timedelta(minutes=10),
        received_at=now,
        payload=json.dumps({"value": 75.0, "unit": "cm"}),
        trust=0.9,
    )
    p1 = await process_event(test_db, ev1)
    assert p1.incident_id is not None

    # Event 2: arrived later but occurred EARLIER (t - 25 min)
    ev2 = Event(
        source_type="road_sensor",
        device_id="ROAD-SENSOR-01",
        lat=19.0118,
        lon=72.8516,
        timestamp=now - datetime.timedelta(minutes=25),
        received_at=now,
        payload=json.dumps({"value": 5.0, "unit": "kmh"}),
        trust=0.85,
    )
    p2 = await process_event(test_db, ev2)

    # Event 3: occurred more recently (t - 2 min)
    ev3 = Event(
        source_type="transit",
        device_id="BEST-BUS-01",
        lat=19.0115,
        lon=72.8510,
        timestamp=now - datetime.timedelta(minutes=2),
        received_at=now,
        payload=json.dumps({"status": "delayed"}),
        trust=0.8,
    )
    p3 = await process_event(test_db, ev3)

    # All three must land in the same incident
    assert p2.incident_id == p1.incident_id
    assert p3.incident_id == p1.incident_id

    # Verify incident contains all 3 non-duplicate events
    ev_res = await test_db.execute(select(Event).where(Event.incident_id == p1.incident_id))
    assert len(ev_res.scalars().all()) == 3


@pytest.mark.anyio
async def test_lifecycle_transitions_and_silent_sensors(test_db):
    """Test active -> monitoring (30 min) -> resolved (60 min) and silent sensor detection."""
    now = datetime.datetime.utcnow()

    # Create incident with sensor reporting 40 min ago
    ev = Event(
        source_type="water_level",
        device_id="IOT-DRAIN-TEST",
        lat=19.0112,
        lon=72.8512,
        timestamp=now - datetime.timedelta(minutes=40),
        received_at=now,
        payload=json.dumps({"value": 60.0}),
        trust=0.9,
    )
    p = await process_event(test_db, ev)
    inc_id = p.incident_id

    res = await test_db.execute(select(Incident).where(Incident.id == inc_id))
    inc = res.scalars().first()

    # At t=now (40 min since last event): should be 'monitoring'
    update_incident_lifecycle(inc, [p], as_of=now)
    assert inc.status == "monitoring"

    # At t = now + 30 min (70 min since last event): should be 'resolved'
    future = now + datetime.timedelta(minutes=30)
    missing = update_incident_lifecycle(inc, [p], as_of=future)
    assert inc.status == "resolved"
    # The sensor has been silent for 70 min (> 15 min), so it should be listed in missing_sources
    assert "IOT-DRAIN-TEST" in missing
    assert "IOT-DRAIN-TEST" in json.loads(inc.missing_sources)


@pytest.mark.anyio
async def test_explain_fallback_and_causal_graph(test_db):
    """Test POST /api/incidents/{id}/explain and GET /api/incidents/{id} 3-layer causal graph."""
    now = datetime.datetime.utcnow()

    # Seed an incident
    ev = Event(
        source_type="water_level",
        device_id="IOT-DRAIN-01",
        lat=19.0112,
        lon=72.8512,
        timestamp=now - datetime.timedelta(minutes=5),
        received_at=now,
        payload=json.dumps({"value": 80.0, "unit": "cm"}),
        trust=0.9,
    )
    p = await process_event(test_db, ev)

    from app.database import get_db
    app.dependency_overrides[get_db] = lambda: test_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Test GET incident evidence_graph
            resp = await ac.get(f"/api/incidents/{p.incident_id}")
            assert resp.status_code == 200
            data = resp.json()

            graph = data.get("evidence_graph", {})
            nodes = graph.get("nodes", [])
            edges = graph.get("edges", [])

            # Layer 1 root cause node
            root_nodes = [n for n in nodes if n.get("layer") == "root_cause"]
            assert len(root_nodes) >= 1

            # Layer 2 symptom nodes (water_rise)
            symptom_nodes = [n for n in nodes if n.get("layer") == "symptom"]
            assert len(symptom_nodes) >= 1
            assert any(n.get("symptom") == "water_rise" for n in symptom_nodes)

            # Edges check: "causes" and "observed_by"
            assert any(e.get("type") == "causes" for e in edges)
            assert any(e.get("type") == "observed_by" for e in edges)

            # 2. Test POST /api/incidents/{id}/explain fallback
            exp_resp = await ac.post(f"/api/incidents/{p.incident_id}/explain")
            assert exp_resp.status_code == 200
            exp_data = exp_resp.json()
            assert "briefing" in exp_data
            assert "recommended_actions" in exp_data
            assert "conflicts" in exp_data
            assert "integrity_flags" in exp_data
            assert exp_data.get("source") in ["agent", "fallback"]

            # 3. Test downstream API GET /api/v1/incidents
            downstream = await ac.get("/api/v1/incidents")
            assert downstream.status_code == 200
            items = downstream.json()
            assert len(items) >= 1
            assert "id" in items[0]
            assert "cause" in items[0]
            assert "severity_level" in items[0]
            assert "event_count" in items[0]
    finally:
        app.dependency_overrides.clear()
