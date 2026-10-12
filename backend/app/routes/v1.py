"""
Downstream V1 API Router.
On startup, loads events.csv, evidence.csv, observations.csv, and infrastructure.csv
via pandas; runs data_and_ml.incident_intelligence.analyze_events() per city;
and maintains intelligence models and incident graphs in memory.
"""

import sys
import json
from pathlib import Path
from typing import Optional, List, Dict, Any
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Request

# Ensure repository root is on sys.path for data_and_ml and agents imports
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from data_and_ml.incident_intelligence import analyze_events
from .stream import broadcast_event

router = APIRouter(prefix="/v1")

# In-memory storage state
STATE: Dict[str, Any] = {
    "cities": [],
    "events_by_city": {},
    "incidents_by_city": {},
    "all_incidents": [],
    "incidents_by_id": {},
    "events_by_id": {},
    "evidence_lookup": {},
    "observations_df": pd.DataFrame(),
    "infrastructure_df": pd.DataFrame(),
}


def load_and_initialize_data():
    """Loads CSV datasets with pandas and computes incident clusters per city."""
    datasets_dir = REPO_ROOT / "data_and_ml" / "datasets"
    events_path = datasets_dir / "events.csv"
    evidence_path = datasets_dir / "evidence.csv"
    obs_path = datasets_dir / "observations.csv"
    infra_path = datasets_dir / "infrastructure.csv"

    events_df = pd.read_csv(events_path) if events_path.exists() else pd.DataFrame()
    evidence_df = pd.read_csv(evidence_path) if evidence_path.exists() else pd.DataFrame()
    obs_df = pd.read_csv(obs_path) if obs_path.exists() else pd.DataFrame()
    infra_df = pd.read_csv(infra_path) if infra_path.exists() else pd.DataFrame()

    STATE["observations_df"] = obs_df
    STATE["infrastructure_df"] = infra_df

    # Build evidence map
    if not evidence_df.empty:
        for _, row in evidence_df.iterrows():
            eid = row.get("event_id")
            if eid and pd.notna(eid):
                STATE["evidence_lookup"][str(eid)] = {
                    "source_name": str(row.get("source_name", "")),
                    "source_url": str(row.get("source_url", ""))
                }

    # Process events per city
    if not events_df.empty and "city" in events_df.columns:
        cities = [str(c) for c in events_df["city"].dropna().unique()]
    else:
        cities = ["Mumbai", "New York"]

    STATE["cities"] = cities
    STATE["events_by_city"] = {}
    STATE["incidents_by_city"] = {}
    STATE["all_incidents"] = []
    STATE["incidents_by_id"] = {}
    STATE["events_by_id"] = {}

    global_inc_counter = 1
    for city in cities:
        city_rows = events_df[events_df["city"] == city] if not events_df.empty else pd.DataFrame()
        city_records: List[Dict[str, Any]] = city_rows.to_dict(orient="records") if not city_rows.empty else []

        for rec in city_records:
            eid = rec.get("event_id")
            if eid:
                STATE["events_by_id"][str(eid)] = rec

        STATE["events_by_city"][city] = city_records

        # Run analyze_events per city
        city_incidents = analyze_events(city_records)
        enriched_city_incidents = []
        for inc in city_incidents:
            inc["incident_id"] = f"INCIDENT-{global_inc_counter:03d}"
            global_inc_counter += 1
            enriched = _enrich_incident_events(inc)
            enriched_city_incidents.append(enriched)
            inc_id = enriched["incident_id"]
            STATE["all_incidents"].append(enriched)
            # Support both exact ID and city-prefixed ID
            STATE["incidents_by_id"][inc_id] = enriched
            STATE["incidents_by_id"][f"{city.lower()}-{inc_id.lower()}"] = enriched
            STATE["incidents_by_id"][f"{city.lower()}:{inc_id.lower()}"] = enriched

        STATE["incidents_by_city"][city] = enriched_city_incidents


def _enrich_incident_events(inc: Dict[str, Any]) -> Dict[str, Any]:
    """Enriches an incident with full events array joined from events.csv and evidence.csv."""
    event_ids = inc.get("event_ids", [])
    events_lookup = STATE.get("events_by_id", {})
    evidence_lookup = STATE.get("evidence_lookup", {})

    enriched_events = []
    for eid in event_ids:
        eid_str = str(eid)
        rec = events_lookup.get(eid_str, {})
        ev_info = evidence_lookup.get(eid_str, {})

        # Coordinates
        try:
            lat = float(rec.get("latitude") if rec.get("latitude") is not None else rec.get("lat", 0.0))
        except (ValueError, TypeError):
            lat = 0.0

        try:
            lon = float(rec.get("longitude") if rec.get("longitude") is not None else rec.get("lon", 0.0))
        except (ValueError, TypeError):
            lon = 0.0

        # Trust
        try:
            trust = float(rec.get("trust", 0.85))
        except (ValueError, TypeError):
            trust = 0.85

        # signature_verified
        sig = rec.get("signature_verified")
        if isinstance(sig, str):
            sig_ver = sig.strip().lower() in ("true", "1", "yes")
        elif sig is None:
            sig_ver = True
        else:
            sig_ver = bool(sig)

        # is_duplicate
        dup = rec.get("is_duplicate", False)
        if isinstance(dup, str):
            is_dup = dup.strip().lower() in ("true", "1", "yes")
        else:
            is_dup = bool(dup)

        # is_anomaly
        anom = rec.get("is_anomaly", False)
        if isinstance(anom, str):
            is_anom = anom.strip().lower() in ("true", "1", "yes")
        else:
            is_anom = bool(anom)

        # description
        desc = rec.get("description")
        if not desc and isinstance(rec.get("payload"), dict):
            desc = rec.get("payload", {}).get("text") or rec.get("payload", {}).get("description")
        if not desc:
            desc = ""

        event_time = str(rec.get("event_time") or rec.get("timestamp") or "")
        received_time = str(rec.get("received_time") or rec.get("event_time") or "")

        enriched_events.append({
            "id": eid_str,
            "event_id": eid_str,
            "type": str(rec.get("type") or rec.get("source_type") or "sensor"),
            "source_type": str(rec.get("type") or rec.get("source_type") or "sensor"),
            "description": str(desc),
            "event_time": event_time,
            "received_time": received_time,
            "lat": lat,
            "lon": lon,
            "trust": trust,
            "signature_verified": sig_ver,
            "is_duplicate": is_dup,
            "is_anomaly": is_anom,
            "source_name": str(ev_info.get("source_name") or rec.get("source_name") or "Municipal Telemetry"),
            "source_url": str(ev_info.get("source_url") or rec.get("source_url") or "")
        })

    enriched_events.sort(key=lambda e: str(e.get("event_time") or ""))
    inc_copy = dict(inc)
    inc_copy["events"] = enriched_events
    return inc_copy


# Initial load at module import time
try:
    load_and_initialize_data()
except Exception as e:
    print(f"Warning: Failed to load v1 datasets on startup: {e}")


def _lookup_incident(incident_id: str) -> Optional[Dict[str, Any]]:
    """Flexibly finds incident by ID (e.g. INCIDENT-001, incident-001, 1)."""
    clean_id = incident_id.strip()
    if clean_id in STATE["incidents_by_id"]:
        return _enrich_incident_events(STATE["incidents_by_id"][clean_id])

    lower_id = clean_id.lower()
    for inc in STATE["all_incidents"]:
        inc_id = inc["incident_id"]
        if inc_id.lower() == lower_id:
            return _enrich_incident_events(inc)
        num = inc_id.replace("INCIDENT-", "").lstrip("0")
        if num and num == clean_id.lstrip("0"):
            return _enrich_incident_events(inc)
    return None


@router.get("/cities")
async def get_cities() -> List[str]:
    """Returns list of distinct cities loaded into memory."""
    return STATE["cities"]


@router.get("/incidents")
async def get_incidents(
    city: Optional[str] = Query(None, description="Filter incidents by city name"),
    severity: Optional[str] = Query(None, description="Filter incidents by severity level (Low, Medium, High)")
) -> List[Dict[str, Any]]:
    """Lists incidents filtered by city and severity level with full events joined."""
    incidents = STATE["all_incidents"]

    if city:
        target_city = city.strip().lower()
        incidents = [
            inc for inc in incidents
            if (inc.get("city") or "").lower() == target_city or target_city in (inc.get("city") or "").lower()
        ]

    if severity:
        target_sev = severity.strip().lower()
        incidents = [
            inc for inc in incidents
            if (inc.get("severity_level") or "").lower() == target_sev
        ]

    return [_enrich_incident_events(inc) for inc in incidents]


@router.get("/incidents/{incident_id}")
async def get_incident(incident_id: str) -> Dict[str, Any]:
    """Retrieves full incident details with events array joined from events.csv and evidence.csv."""
    inc = _lookup_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return _enrich_incident_events(inc)


@router.get("/incidents/{incident_id}/replay")
async def replay_incident(incident_id: str) -> Dict[str, Any]:
    """Returns chronological timeline of events with cumulative confidence progression."""
    inc = _lookup_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")

    event_ids = inc.get("event_ids", [])
    events = [STATE["events_by_id"][eid] for eid in event_ids if eid in STATE["events_by_id"]]

    # Chronological sort
    events.sort(key=lambda e: str(e.get("event_time") or e.get("timestamp") or e.get("received_time") or ""))

    steps = []
    for k in range(1, len(events) + 1):
        subset = events[:k]
        sub_reports = analyze_events(subset)
        if sub_reports:
            rep = sub_reports[0]
            conf = rep.get("cause_confidence", 0.0)
            conf_level = rep.get("confidence_level", "medium")
            primary = rep.get("primary_cause", "")
            label = rep.get("cause_label", "")
            sev_level = rep.get("severity_level", "Medium")
            ranking = rep.get("cause_ranking", [])
        else:
            conf = 0.0
            conf_level = "low"
            primary = "unknown"
            label = "Unknown"
            sev_level = "Low"
            ranking = []

        steps.append({
            "step": k,
            "event": events[k - 1],
            "confidence": conf,
            "confidence_level": conf_level,
            "primary_cause": primary,
            "cause_label": label,
            "severity_level": sev_level,
            "cause_ranking": ranking,
            "cumulative_confidence": conf
        })

    return {
        "incident_id": inc["incident_id"],
        "total_steps": len(steps),
        "steps": steps
    }


@router.get("/incidents/{incident_id}/briefing")
async def get_incident_briefing(incident_id: str) -> Dict[str, Any]:
    """
    Returns incident operational briefing using AI agent analysis,
    falling back to summary if agent is unavailable.
    """
    inc = _lookup_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")

    event_ids = inc.get("event_ids", [])
    events = [STATE["events_by_id"][eid] for eid in event_ids if eid in STATE["events_by_id"]]

    agent_input = {
        "incident_id": inc["incident_id"],
        "cause": inc.get("primary_cause"),
        "confidence": inc.get("cause_confidence"),
        "cause_ranking": inc.get("cause_ranking"),
        "events": events
    }

    try:
        from agents.agent_manager import analyze_incident
        analysis = analyze_incident(agent_input)
        briefing = analysis.get("briefing") or analysis.get("response") or ""
        rec_actions = analysis.get("recommended_actions") or inc.get("recommended_actions", [])
        source = "agent"
    except Exception:
        briefing = inc.get("summary") or inc.get("explanation") or ""
        rec_actions = inc.get("recommended_actions", [])
        source = "fallback"

    return {
        "incident_id": inc["incident_id"],
        "briefing": briefing,
        "summary": inc.get("summary", ""),
        "confidence_level": inc.get("confidence_level", "medium"),
        "recommended_actions": rec_actions,
        "source": source
    }


@router.get("/layers/infrastructure")
async def get_infrastructure_layer(
    city: Optional[str] = Query(None, description="Filter infrastructure by city")
) -> Dict[str, Any]:
    """Returns infrastructure nodes from infrastructure.csv in standard GeoJSON format."""
    df = STATE["infrastructure_df"]
    if df.empty:
        return {"type": "FeatureCollection", "features": []}

    if city:
        target_city = city.strip().lower()
        df = df[df["city"].astype(str).str.lower().str.contains(target_city)]

    features = []
    for _, row in df.iterrows():
        try:
            lat = float(row["latitude"])
            lon = float(row["longitude"])
        except (ValueError, TypeError):
            continue

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat]
            },
            "properties": {
                "id": str(row.get("infrastructure_id", "")),
                "name": str(row.get("name", "")),
                "type": str(row.get("type", "")),
                "city": str(row.get("city", "")),
                "country": str(row.get("country", "")),
                "source": str(row.get("source", ""))
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features
    }


@router.get("/layers/rainfall")
async def get_rainfall_layer(
    city: Optional[str] = Query(None, description="Filter rainfall observations by city")
) -> Dict[str, Any]:
    """Returns rainfall observations from observations.csv in GeoJSON format."""
    df = STATE["observations_df"]
    if df.empty:
        return {"type": "FeatureCollection", "city": city, "features": []}

    rain_df = df[df["variable_name"] == "rain_mm"]
    if rain_df.empty:
        rain_df = df[df["data_type"] == "weather_observation"]

    if city:
        target = city.strip().lower()
        if "mumbai" in target:
            rain_df = rain_df[rain_df["latitude"].astype(float).between(18.0, 20.0)]
        elif "new york" in target or "nyc" in target:
            rain_df = rain_df[rain_df["latitude"].astype(float).between(40.0, 42.0)]

    features = []
    for _, row in rain_df.iterrows():
        try:
            lat = float(row["latitude"])
            lon = float(row["longitude"])
            val = float(row["value"])
        except (ValueError, TypeError):
            continue

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat]
            },
            "properties": {
                "id": str(row.get("observation_id", "")),
                "event_id": str(row.get("event_id", "")),
                "rain_mm": val,
                "unit": str(row.get("unit", "mm/hour")),
                "timestamp": str(row.get("timestamp", "")),
                "provider": str(row.get("provider", ""))
            }
        })

    return {
        "type": "FeatureCollection",
        "city": city,
        "features": features
    }


@router.post("/events")
async def ingest_event(request: Request) -> Dict[str, Any]:
    """
    Appends a new event, re-runs incident analysis for the city,
    and broadcasts updates via WebSocket stream.broadcast_event.
    """
    raw_event = await request.json()
    if not isinstance(raw_event, dict):
        raise HTTPException(status_code=400, detail="Event must be a JSON object")

    event_id = raw_event.get("event_id") or f"EVT-LIVE-{id(raw_event)}"
    raw_event["event_id"] = event_id

    # Ensure timezone-aware timestamp
    import datetime
    now_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if not raw_event.get("event_time") and not raw_event.get("timestamp"):
        raw_event["event_time"] = now_utc
    elif raw_event.get("event_time") and isinstance(raw_event["event_time"], str):
        t_str = raw_event["event_time"].strip()
        if not t_str.endswith("Z") and "+" not in t_str:
            raw_event["event_time"] = t_str + "+00:00"

    if not raw_event.get("received_time"):
        raw_event["received_time"] = raw_event.get("event_time") or now_utc

    # Determine city
    city = raw_event.get("city")

    if not city:
        lat = raw_event.get("lat") or raw_event.get("latitude")
        if lat is not None and float(lat) > 35.0:
            city = "New York"
        else:
            city = "Mumbai"
        raw_event["city"] = city

    if city not in STATE["events_by_city"]:
        STATE["events_by_city"][city] = []
        if city not in STATE["cities"]:
            STATE["cities"].append(city)

    # Append to state
    STATE["events_by_city"][city].append(raw_event)
    STATE["events_by_id"][event_id] = raw_event

    # Re-run incident intelligence for city
    updated_city_incidents = analyze_events(STATE["events_by_city"][city])
    enriched_updated = [_enrich_incident_events(inc) for inc in updated_city_incidents]
    STATE["incidents_by_city"][city] = enriched_updated

    # Refresh all_incidents
    all_incs = []
    for c, incs in STATE["incidents_by_city"].items():
        all_incs.extend(incs)
    STATE["all_incidents"] = all_incs

    # Update lookup index
    for inc in enriched_updated:
        iid = inc["incident_id"]
        STATE["incidents_by_id"][iid] = inc
        STATE["incidents_by_id"][f"{city.lower()}-{iid.lower()}"] = inc
        STATE["incidents_by_id"][f"{city.lower()}:{iid.lower()}"] = inc

    matching_incident = next(
        (inc for inc in enriched_updated if event_id in inc.get("event_ids", [])),
        enriched_updated[0] if enriched_updated else None
    )

    # Broadcast via WebSocket
    await broadcast_event({"type": "event_ingested", "event": raw_event})
    if matching_incident:
        await broadcast_event({"type": "incident_updated", "incident": matching_incident})

    return {
        "status": "ok",
        "event": raw_event,
        "incident": matching_incident,
        "incident_count": len(updated_city_incidents)
    }


@router.get("/health")
async def health_v1():
    """Health check endpoint."""
    return {"status": "ok", "service": "v1-api", "cities": STATE["cities"]}
