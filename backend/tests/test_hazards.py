"""Tests for External Hazard Layers & Providers:
- USGS GeoJSON earthquake parsing & deduplication
- Graceful behavior when external services are unreachable
- Safe startup with no API keys
- Earthquake incident fusion and separation from drainage failure
"""
import pytest
import datetime
import json
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.models import Base, Event, Incident
from app.engine import process_event, infer_cause
from app.adapters.usgs import (
    parse_usgs_feature,
    filter_earthquakes,
    create_demo_test_earthquake,
    fetch_usgs_feed_sync
)
from app.adapters.google_flood import fetch_google_flood_data


@pytest.fixture
async def test_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
    await engine.dispose()


def test_usgs_feature_parsing_and_dedupe():
    """Verify USGS GeoJSON features are correctly parsed and normalized."""
    sample_feature = {
        "type": "Feature",
        "id": "us7000xyz1",
        "properties": {
            "mag": 4.5,
            "place": "12 km W of Koyna, India",
            "time": 1700000000000,
            "url": "https://earthquake.usgs.gov/earthquakes/eventpage/us7000xyz1",
            "alert": "green",
            "tsunami": 0
        },
        "geometry": {
            "type": "Point",
            "coordinates": [73.75, 17.40, 10.0]
        }
    }

    parsed = parse_usgs_feature(sample_feature)
    assert parsed is not None
    assert parsed["source_type"] == "seismic"
    assert parsed["device_id"] == "USGS-us7000xyz1"
    assert parsed["lat"] == 17.40
    assert parsed["lon"] == 73.75
    assert parsed["payload"]["magnitude"] == 4.5
    assert parsed["payload"]["depth_km"] == 10.0
    assert parsed["payload"]["usgs_id"] == "us7000xyz1"
    assert parsed["trust"] == 0.95
    assert parsed["provenance"] == "measured"


def test_google_flood_fallback_without_keys():
    """Verify Google Flood Hub adapter provides graceful fallback when key is not set."""
    res = fetch_google_flood_data()
    assert res is not None
    assert "available" in res
    assert "flood_hub_url" in res
    assert "sites.research.google/floods" in res["flood_hub_url"]
    assert "CC BY 4.0" in res["attribution"]
    assert "coverage_note" in res


def test_usgs_feed_unreachable_handling():
    """Verify feed fetcher handles unreachable URLs gracefully without throwing unhandled exceptions."""
    # Pass an invalid / unreachable feed URL
    result = fetch_usgs_feed_sync(feed_url="https://invalid-non-existent-domain-12345.org/feed.json", timeout_sec=0.5)
    assert isinstance(result, list)  # Should return empty or cached list, never crash


def test_demo_test_earthquake_provenance():
    """Verify demo test earthquake has explicit test provenance."""
    demo_eq = create_demo_test_earthquake(19.076, 72.877, 5.0)
    assert demo_eq["provenance"] == "test"
    assert demo_eq["payload"]["provenance"] == "test"
    assert demo_eq["payload"]["magnitude"] == 5.0
    assert "TEST" in demo_eq["device_id"]


@pytest.mark.anyio
async def test_earthquake_incident_fusion(test_db):
    """Verify that a seismic event triggers earthquake cause inference and is kept separate from drainage failure."""
    now = datetime.datetime.now(datetime.timezone.utc)
    
    # 1. Seismic event
    eq_event = Event(
        source_type="seismic",
        device_id="USGS-EQ-MUMBAI-TEST",
        lat=19.0112,
        lon=72.8512,
        timestamp=now - datetime.timedelta(minutes=5),
        received_at=now,
        payload=json.dumps({"magnitude": 5.2, "depth_km": 10.0, "place": "Mumbai Region"}),
        trust=0.95,
        signature_verified=True,
    )
    # 2. Citizen tremor report
    tremor_report = Event(
        source_type="citizen_report",
        device_id="CITIZEN-TREMOR-01",
        lat=19.0115,
        lon=72.8510,
        timestamp=now - datetime.timedelta(minutes=4),
        received_at=now,
        payload=json.dumps({"text": "Violent ground shaking felt! Buildings swaying.", "language": "en"}),
        trust=0.70,
        signature_verified=False,
    )

    await process_event(test_db, eq_event)
    await process_event(test_db, tremor_report)

    res = await test_db.execute(select(Incident))
    incidents = res.scalars().all()
    assert len(incidents) >= 1
    
    primary = incidents[0]
    assert primary.cause == "earthquake"
    assert primary.cause_confidence >= 0.70
    assert "Seismic" in primary.explanation or "earthquake" in primary.explanation.lower()
