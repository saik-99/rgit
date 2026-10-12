"""Mumbai waterlogging demo scenario seed data."""
import json
import datetime
import random
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .models import Event, Incident, Source


# Mumbai landmarks coordinates
HINDMATA = (19.0112, 72.8512)
MILAN_SUBWAY = (19.0285, 72.8403)
SION = (19.0431, 72.8629)

# Flood extent polygon (Hindmata area)
FLOOD_POLYGON = [
    [72.8490, 19.0095],
    [72.8535, 19.0095],
    [72.8545, 19.0130],
    [72.8520, 19.0140],
    [72.8485, 19.0125],
    [72.8490, 19.0095],
]


async def seed_mumbai_scenario(db: AsyncSession):
    """Seed the database with Mumbai waterlogging scenario data if empty."""
    result = await db.execute(select(Event).limit(1))
    if result.scalars().first() is not None:
        return  # Already seeded

    now = datetime.datetime.utcnow()

    # ── Register Sources ─────────────────────────────────────────────
    sources = [
        Source(device_id="IOT-DRAIN-HM01", source_type="water_level", name="Hindmata Drainage Sensor #1",
               lat=HINDMATA[0], lon=HINDMATA[1], trust_score=0.95, hmac_key="secret_hm01", signature_status="verified"),
        Source(device_id="IOT-DRAIN-HM02", source_type="water_level", name="Hindmata Drainage Sensor #2",
               lat=19.0105, lon=72.8520, trust_score=0.93, hmac_key="secret_hm02", signature_status="verified"),
        Source(device_id="ROAD-HM-01", source_type="road_sensor", name="Hindmata Junction Road Sensor",
               lat=19.0118, lon=72.8508, trust_score=0.88, hmac_key="secret_road01", signature_status="verified"),
        Source(device_id="TRANSIT-BEST-104", source_type="transit", name="BEST Bus Route 104 Telemetry",
               lat=19.0125, lon=72.8515, trust_score=0.85, hmac_key="", signature_status="unknown"),
        Source(device_id="ROAD-MILAN-01", source_type="road_sensor", name="Milan Subway Road Sensor",
               lat=MILAN_SUBWAY[0], lon=MILAN_SUBWAY[1], trust_score=0.87, hmac_key="secret_milan01", signature_status="verified"),
        Source(device_id="IOT-DRAIN-SION01", source_type="water_level", name="Sion Station Drainage Sensor",
               lat=SION[0], lon=SION[1], trust_score=0.90, hmac_key="secret_sion01", signature_status="verified"),
    ]
    for s in sources:
        existing = await db.execute(select(Source).where(Source.device_id == s.device_id))
        if not existing.scalars().first():
            db.add(s)
    await db.flush()

    # ── Create the incident ──────────────────────────────────────────
    incident = Incident(
        title="Drainage / Waterlogging Failure — Hindmata, Mumbai",
        cause="drainage_failure",
        cause_confidence=0.0,
        severity_score=0,
        severity_level="low",
        status="active",
        centroid_lat=HINDMATA[0],
        centroid_lon=HINDMATA[1],
        radius_m=800,
        neighborhood="Hindmata Junction, Parel, Mumbai",
        flood_polygon=json.dumps(FLOOD_POLYGON),
        created_at=now - datetime.timedelta(minutes=40),
        updated_at=now,
    )
    db.add(incident)
    await db.flush()

    # ── Seed Events ──────────────────────────────────────────────────
    events_data = [
        # Water level spike (initial signal)
        {
            "source_type": "water_level", "device_id": "IOT-DRAIN-HM01",
            "lat": HINDMATA[0], "lon": HINDMATA[1],
            "timestamp": now - datetime.timedelta(minutes=38),
            "payload": {"value": 78.5, "unit": "cm_above_normal", "description": "Water level rising rapidly at Hindmata nallah"},
            "trust": 0.95, "signature_verified": True,
        },
        # Second water sensor confirms
        {
            "source_type": "water_level", "device_id": "IOT-DRAIN-HM02",
            "lat": 19.0105, "lon": 72.8520,
            "timestamp": now - datetime.timedelta(minutes=35),
            "payload": {"value": 82.3, "unit": "cm_above_normal", "description": "Storm drain overflow confirmed near Hindmata bridge"},
            "trust": 0.93, "signature_verified": True,
        },
        # Road sensor submerged
        {
            "source_type": "road_sensor", "device_id": "ROAD-HM-01",
            "lat": 19.0118, "lon": 72.8508,
            "timestamp": now - datetime.timedelta(minutes=32),
            "payload": {"value": 1, "status": "submerged", "description": "Road surface underwater at Hindmata junction"},
            "trust": 0.88, "signature_verified": True,
        },
        # Transit slowdown
        {
            "source_type": "transit", "device_id": "TRANSIT-BEST-104",
            "lat": 19.0125, "lon": 72.8515,
            "timestamp": now - datetime.timedelta(minutes=28),
            "payload": {"value": 3.2, "unit": "km/h", "description": "BEST bus route 104 crawling near Hindmata due to waterlogging"},
            "trust": 0.85, "signature_verified": False,
        },
        # Citizen 311 complaint (arrives late — out of order)
        {
            "source_type": "citizen_report", "device_id": "CITIZEN-APP-9901",
            "lat": 19.0110, "lon": 72.8518,
            "timestamp": now - datetime.timedelta(minutes=36),  # Happened earlier but arrived later
            "payload": {"text": "Paani bhar gaya Hindmata pe! Cars stuck, water up to knee level near the bridge.", "language": "hi-en"},
            "trust": 0.50, "signature_verified": False,
        },
        # Emergency call
        {
            "source_type": "emergency_call", "device_id": "BMC-CTRL-1916",
            "lat": 19.0115, "lon": 72.8510,
            "timestamp": now - datetime.timedelta(minutes=25),
            "payload": {"text": "Multiple calls reporting flooding at Hindmata junction, vehicles stranded", "call_count": 7},
            "trust": 0.70, "signature_verified": False,
        },
        # Weather data
        {
            "source_type": "weather", "device_id": "IMD-COLABA-01",
            "lat": 18.9067, "lon": 72.8147,
            "timestamp": now - datetime.timedelta(minutes=45),
            "payload": {"value": 85, "unit": "mm/hr", "description": "Extremely heavy rainfall over south-central Mumbai", "humidity": 98},
            "trust": 0.80, "signature_verified": True,
        },
        # Milan Subway road sensor
        {
            "source_type": "road_sensor", "device_id": "ROAD-MILAN-01",
            "lat": MILAN_SUBWAY[0], "lon": MILAN_SUBWAY[1],
            "timestamp": now - datetime.timedelta(minutes=22),
            "payload": {"value": 1, "status": "partially_submerged", "description": "Milan Subway underpass water accumulation detected"},
            "trust": 0.87, "signature_verified": True,
        },
        # Sion drainage sensor
        {
            "source_type": "water_level", "device_id": "IOT-DRAIN-SION01",
            "lat": SION[0], "lon": SION[1],
            "timestamp": now - datetime.timedelta(minutes=18),
            "payload": {"value": 65.0, "unit": "cm_above_normal", "description": "Sion station drain level elevated"},
            "trust": 0.90, "signature_verified": True,
        },
        # Conflicting citizen report (tests conflict handling)
        {
            "source_type": "citizen_report", "device_id": "CITIZEN-APP-2244",
            "lat": 19.0120, "lon": 72.8505,
            "timestamp": now - datetime.timedelta(minutes=15),
            "payload": {"text": "Road looks clear from my window, no issue here at all.", "language": "en"},
            "trust": 0.20, "signature_verified": False,
        },
    ]

    for i, ed in enumerate(events_data):
        event = Event(
            source_type=ed["source_type"],
            device_id=ed["device_id"],
            lat=ed["lat"],
            lon=ed["lon"],
            timestamp=ed["timestamp"],
            received_at=now - datetime.timedelta(minutes=random.randint(0, 5)),
            payload=json.dumps(ed["payload"]),
            trust=ed["trust"],
            signature_verified=ed["signature_verified"],
            is_duplicate=False,
            is_anomaly=ed.get("is_anomaly", False),
            anomaly_zscore=ed.get("anomaly_zscore", 0.0),
            h3_cell=f"grid_{int(ed['lat'] * 100)}_{int(ed['lon'] * 100)}",
            incident_id=incident.id,
        )
        db.add(event)

    await db.flush()

    # ── Now run inference on the seeded incident ─────────────────────
    from .engine import infer_cause, compute_severity, generate_explanation

    result = await db.execute(select(Event).where(Event.incident_id == incident.id))
    all_events = list(result.scalars().all())

    cause, confidence, ranking = infer_cause(all_events)
    sev_score, sev_level = compute_severity(cause, all_events, confidence)

    incident.cause = cause
    incident.cause_confidence = confidence
    incident.cause_ranking = json.dumps(ranking)
    incident.severity_score = sev_score
    incident.severity_level = sev_level
    incident.explanation = generate_explanation(incident, all_events, cause, confidence, ranking)

    # Build confidence history
    history = []
    sorted_events = sorted(all_events, key=lambda e: e.timestamp)
    for idx in range(1, len(sorted_events) + 1):
        subset = sorted_events[:idx]
        c, conf, _ = infer_cause(subset)
        history.append({
            "t": sorted_events[idx - 1].timestamp.isoformat(),
            "confidence": conf,
            "event_count": idx,
        })
    incident.confidence_history = json.dumps(history)

    await db.commit()
