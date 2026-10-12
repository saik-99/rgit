"""Tests for Backend Add-on:
1. why_not_100 and check_next in GET /api/incidents/{id}
2. spoofed_sensor scenario sets trust=0.2, is_flagged=True, shows as quarantined in /api/sources, ignored by cause scoring
3. drainage_failure scenario creates a second separate incident (road accident in Andheri)
"""
import pytest
import json
import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from httpx import AsyncClient, ASGITransport

from app.models import Base, Event, Incident, Source
from app.engine import process_event, compute_why_not_100_and_check_next, haversine_m
from app.seed import seed_mumbai_scenario
from app.main import app
from app.database import get_db


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
async def test_why_not_100_and_check_next(test_db):
    """Test GET /api/incidents/{id} returns why_not_100 list and check_next recommendation."""
    await seed_mumbai_scenario(test_db)

    app.dependency_overrides[get_db] = lambda: test_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/incidents/1")
            assert resp.status_code == 200
            data = resp.json()

            # 1. why_not_100
            assert "why_not_100" in data
            assert isinstance(data["why_not_100"], list)
            assert len(data["why_not_100"]) > 0
            # Seed data contains CITIZEN-APP-2244 conflicting report ("Road looks clear... no issue")
            # and an unverified transit feed
            reasons_text = " ".join(data["why_not_100"]).lower()
            assert any(term in reasons_text for term in ["conflicting report", "untrusted sensor", "missing/offline sensor", "few sources"])

            # 2. check_next
            assert "check_next" in data
            assert isinstance(data["check_next"], str)
            check_next_str = data["check_next"]
            assert check_next_str.startswith("Check ")
            assert "at Hindmata" in check_next_str or "at " in check_next_str
            assert "would confirm" in check_next_str
            assert " vs " in check_next_str

            # Test isolated compute_why_not_100_and_check_next logic
            # Create a mock incident with few sources and test specific triggers
            inc_few = Incident(
                id=99,
                cause="drainage_failure",
                cause_confidence=0.55,
                cause_ranking=json.dumps([
                    {"cause": "drainage_failure", "probability": 0.55},
                    {"cause": "road_blockage", "probability": 0.40},
                ]),
                neighborhood="Hindmata Junction, Mumbai",
                missing_sources=json.dumps(["IOT-DRAIN-MISSING"]),
            )
            # Only 1 water level event
            events_few = [
                Event(
                    id=1001,
                    source_type="water_level",
                    lat=19.0112,
                    lon=72.8512,
                    trust=0.9,
                    signature_verified=True,
                    is_duplicate=False,
                    payload=json.dumps({"value": 85.0}),
                ),
            ]
            reasons, recommendation = compute_why_not_100_and_check_next(inc_few, events_few)
            assert any("few sources" in r for r in reasons)
            assert any("missing/offline sensor" in r for r in reasons)
            assert "Check " in recommendation
            assert "would confirm drainage vs road blockage" in recommendation
    finally:
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_spoofed_sensor_scenario_quarantine_and_ignored(test_db):
    """Test spoofed_sensor scenario marks device trust=0.2, is_flagged=True in /api/sources and ignores it in scoring."""
    await seed_mumbai_scenario(test_db)

    app.dependency_overrides[get_db] = lambda: test_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Run spoofed_sensor scenario
            scenario_resp = await ac.post("/api/scenarios/spoofed_sensor")
            assert scenario_resp.status_code == 200

            # Verify /api/sources lists IOT-DRAIN-SPOOF as quarantined
            sources_resp = await ac.get("/api/sources")
            assert sources_resp.status_code == 200
            sources = sources_resp.json()

            spoof_src = next((s for s in sources if s.get("device_id") == "IOT-DRAIN-SPOOF"), None)
            assert spoof_src is not None, "IOT-DRAIN-SPOOF must be present in /api/sources"
            assert spoof_src["trust_score"] == 0.2
            assert spoof_src["is_flagged"] is True

            # Verify incident cause is NOT hijacked by the fake 200cm water reading
            inc_resp = await ac.get("/api/incidents/1")
            assert inc_resp.status_code == 200
            inc_data = inc_resp.json()
            assert inc_data["cause"] == "drainage_failure"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_drainage_failure_creates_second_incident_in_andheri(test_db):
    """Test drainage_failure scenario creates a second separate incident (road accident in Andheri)."""
    app.dependency_overrides[get_db] = lambda: test_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Trigger drainage_failure scenario
            scenario_resp = await ac.post("/api/scenarios/drainage_failure")
            assert scenario_resp.status_code == 200

            # Verify /api/incidents returns multiple separated incidents
            inc_resp = await ac.get("/api/incidents")
            assert inc_resp.status_code == 200
            incidents = inc_resp.json()
            assert len(incidents) >= 2, "Must create at least 2 separate incidents"

            hindmata_inc = next((i for i in incidents if i.get("cause") == "drainage_failure"), None)
            andheri_inc = next((i for i in incidents if i.get("cause") == "road_accident"), None)

            assert hindmata_inc is not None, "Hindmata drainage_failure incident must exist"
            assert andheri_inc is not None, "Andheri road_accident incident must exist"

            # Check distance separation between centroids
            dist = haversine_m(
                hindmata_inc["centroid_lat"], hindmata_inc["centroid_lon"],
                andheri_inc["centroid_lat"], andheri_inc["centroid_lon"]
            )
            # Hindmata to Andheri is ~12-14 km
            assert dist > 5000.0, f"Incidents should be spatially separated across city (got {dist:.0f}m)"
            assert "Andheri" in andheri_inc["neighborhood"] or "Andheri" in andheri_inc["title"]

            # Verify GET /api/incidents/{andheri_id} returns why_not_100 and check_next
            andheri_detail = await ac.get(f"/api/incidents/{andheri_inc['id']}")
            assert andheri_detail.status_code == 200
            det_json = andheri_detail.json()
            assert "why_not_100" in det_json
            assert "check_next" in det_json
            assert "Check " in det_json["check_next"]
    finally:
        app.dependency_overrides.clear()
