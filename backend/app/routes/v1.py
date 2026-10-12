"""
Downstream V1 API Router.
On startup, loads india_events.csv (or events.csv), evidence.csv, observations.csv,
and infrastructure.csv via pandas; runs data_and_ml.incident_intelligence.analyze_events()
per city once; and maintains intelligence models and incident graphs in memory.
"""

import os
import sys
import json
import asyncio
import logging
import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
import dateutil.parser
import httpx
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Request
from dotenv import load_dotenv

# Ensure repository root is on sys.path for data_and_ml and agents imports
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Load .env from backend/.env or root .env
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
load_dotenv(REPO_ROOT / ".env")

from data_and_ml.incident_intelligence import analyze_events
from .stream import broadcast_event

logger = logging.getLogger("v1-alerts")

router = APIRouter(prefix="/v1")

# Initial recipients from environment variable or default fallback
_env_recipients = [
    r.strip() for r in (os.getenv("ALERT_RECIPIENTS") or "").split(",") if r.strip()
]
_default_recipients = ["+917972253404"]

# In-memory storage state
STATE: Dict[str, Any] = {
    "cities": [],
    "city_summaries": [],
    "events_by_city": {},
    "incidents_by_city": {},
    "all_incidents": [],
    "all_events": [],
    "incidents_by_id": {},
    "events_by_id": {},
    "evidence_lookup": {},
    "observations_df": pd.DataFrame(),
    "infrastructure_df": pd.DataFrame(),
    "stats": {},
    "alert_recipients": _env_recipients or _default_recipients,
}


def to_utc_dt(val: Any) -> Optional[datetime.datetime]:
    """Converts a timestamp representation into a UTC timezone-aware datetime."""
    if val is None or pd.isna(val):
        return None
    if isinstance(val, datetime.datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=datetime.timezone.utc)
        return val.astimezone(datetime.timezone.utc)
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "null"):
        return None
    try:
        dt = dateutil.parser.parse(s)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=datetime.timezone.utc)
        return dt.astimezone(datetime.timezone.utc)
    except Exception:
        return None


def _parse_filter_date(val: Optional[str]) -> Optional[datetime.datetime]:
    return to_utc_dt(val)


def _get_incident_time(inc: Dict[str, Any]) -> datetime.datetime:
    events = inc.get("events") or []
    if events:
        for ev in events:
            t = ev.get("event_time") or ev.get("time") or ev.get("received_time")
            parsed = to_utc_dt(t)
            if parsed:
                return parsed
    created = inc.get("created_at")
    if created:
        parsed = to_utc_dt(created)
        if parsed:
            return parsed
    return datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)


def _map_taxonomy_to_source_type(taxonomy_code: str, source_type_col: str = "", verification_status: str = "") -> str:
    """Maps taxonomy code to incident intelligence engine source types."""
    tax = (taxonomy_code or "").strip().upper()
    src = (source_type_col or "").strip().lower()
    ver = (verification_status or "").strip().lower()

    if tax == "FLOOD.WATER_LEVEL_EXCEEDANCE" or "WATER_LEVEL" in tax:
        return "water_level"
    if tax == "FLOOD.URBAN_WATERLOGGING":
        if src == "official_alert" or ver == "official":
            return "emergency_call"
        return "citizen_report"
    if tax == "WEATHER.HEAVY_RAIN" or tax.startswith("WEATHER."):
        return "weather"
    if tax.startswith("TRAFFIC."):
        return "road_sensor"
    if tax.startswith("TRANSIT."):
        return "transit"
    if tax.startswith("EMERGENCY."):
        return "emergency_call"
    if tax.startswith("POWER.") or tax.startswith("STRUCTURE."):
        return "citizen_report"
    if tax.startswith("FLOOD."):
        return "water_level"
    return "citizen_report"


def _normalize_phone(num: str) -> str:
    raw = str(num).strip().replace(" ", "").replace("-", "")
    if not raw.startswith("+"):
        if len(raw) == 10:
            return f"+91{raw}"
        return f"+{raw}"
    return raw


def _generate_alert_message(inc: Dict[str, Any]) -> str:
    """Generates complete responder alert including severity, location, cause, confidence, infrastructure, action, and link."""
    conf_percent = round((inc.get("cause_confidence") or 0.0) * 100)
    sev = (inc.get("severity_level") or "High").upper()
    title = inc.get("title") or "Incident Detected"
    city = inc.get("city") or "Mumbai"
    lat = inc.get("centroid_lat")
    lon = inc.get("centroid_lon")
    loc_str = f"{city} ({lat:.3f}, {lon:.3f})" if (lat and lon) else city
    cause = inc.get("cause_label") or inc.get("primary_cause") or "System Correlation"
    events = inc.get("events") or []
    ev_count = len(events) or len(inc.get("event_ids") or [])

    infra = inc.get("nearest_infrastructure") or {}
    hosp = infra.get("hospital", "KEM Hospital (1.2 km)")
    fire = infra.get("fire_station", "Parel Fire Station (0.8 km)")

    iid = inc.get("incident_id")
    dashboard_url = f"http://localhost:5173/?incident={iid}" if iid else "http://localhost:5173"

    return (
        f"🚨 SEVERITY: {sev} | {title}\n"
        f"📍 LOCATION: {loc_str}\n"
        f"🧠 CAUSE: {cause} (Confidence: {conf_percent}%)\n"
        f"📊 SIGNALS: {ev_count} events correlated\n"
        f"🏥 NEAREST: Hospital: {hosp} | Fire: {fire}\n"
        f"✅ ACTION: Dispatch quick response unit to secure sector\n"
        f"🔗 DASHBOARD: {dashboard_url}"
    )


async def _send_direct_twilio_alert(inc: Dict[str, Any], recipients: List[str]) -> Tuple[bool, Optional[str]]:
    """Directly dispatches SMS alerts via Twilio REST API using httpx."""
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    from_sms = os.getenv("TWILIO_FROM_NUMBER") or os.getenv("TWILIO_PHONE_NUMBER") or "+15739282431"
    verify_sid = os.getenv("TWILIO_VERIFY_SERVICE_SID", "VA1287fc4203e0d3d57fcdd31629308c34")
    if not sid or not token:
        return False, "Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) not set in backend/.env"

    body_text = _generate_alert_message(inc)
    clean_recipients = [_normalize_phone(r) for r in recipients if str(r).strip()]
    if not clean_recipients:
        return False, "No recipient phone numbers provided"

    msg_url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    verify_url = f"https://verify.twilio.com/v2/Services/{verify_sid}/Verifications" if verify_sid else None

    sent_count = 0
    errors = []

    async with httpx.AsyncClient(timeout=10.0) as client:
        for to_phone in clean_recipients:
            sms_sent = False
            # 1. Primary: Twilio Verify SMS
            if verify_url:
                try:
                    resp_v = await client.post(verify_url, auth=(sid, token), data={
                        "To": to_phone,
                        "Channel": "sms",
                    })
                    if resp_v.status_code in (200, 201):
                        sent_count += 1
                        sms_sent = True
                        logger.info(f"Twilio Verify SMS dispatched successfully to {to_phone}")
                except Exception as e:
                    logger.warning(f"Verify SMS attempt failed for {to_phone}: {e}")

            # 2. Fallback: Standard programmable SMS
            if not sms_sent:
                try:
                    resp = await client.post(msg_url, auth=(sid, token), data={
                        "From": from_sms,
                        "To": to_phone,
                        "Body": body_text[:160],
                    })
                    if resp.status_code in (200, 201):
                        sent_count += 1
                        sms_sent = True
                        logger.info(f"Twilio standard SMS sent to {to_phone}")
                    else:
                        resp_json = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                        errors.append(f"{to_phone}: {resp_json.get('message', resp.text[:100])}")
                except Exception as e:
                    errors.append(f"{to_phone}: {str(e)}")

            if not sms_sent and not verify_url:
                errors.append(f"{to_phone}: SMS dispatch failed")

    if sent_count > 0:
        return True, None
    return False, "; ".join(errors) if errors else "Failed to dispatch Twilio SMS messages"


async def _send_n8n_alert(inc: Dict[str, Any], recipients: List[str]) -> Tuple[bool, Optional[str]]:
    """POSTs incident alert payload to N8N_WEBHOOK_URL."""
    webhook_url = os.getenv("N8N_WEBHOOK_URL")
    if not webhook_url:
        reason = "N8N_WEBHOOK_URL is not set in backend/.env"
        logger.warning(reason)
        return False, reason

    conf_percent = round((inc.get("cause_confidence") or 0.0) * 100)
    events = inc.get("events") or []
    source_types = list(dict.fromkeys(
        str(e.get("type") or e.get("source_type") or "sensor")
        for e in events if e.get("type") or e.get("source_type")
    ))

    payload = {
        "id": inc.get("incident_id"),
        "title": inc.get("title"),
        "city": inc.get("city"),
        "lat": inc.get("centroid_lat"),
        "lon": inc.get("centroid_lon"),
        "cause_label": inc.get("cause_label") or inc.get("primary_cause"),
        "confidence_percent": conf_percent,
        "severity": inc.get("severity_level") or "High",
        "summary": inc.get("summary") or inc.get("explanation") or "",
        "event_count": len(events) or len(inc.get("event_ids") or []),
        "source_types": source_types,
        "nearest_infrastructure": inc.get("nearest_infrastructure") or {},
        "dashboard_link": f"http://localhost:5173/?incident={inc.get('incident_id')}",
        "recipients": recipients,
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(3.0, connect=1.5)) as client:
            resp = await client.post(webhook_url, json=payload)
            if resp.status_code in (200, 201, 202, 204):
                logger.info(f"n8n alert delivered for {inc.get('incident_id')}: status {resp.status_code}")
                return True, None
            else:
                reason = f"n8n webhook returned HTTP {resp.status_code}: {resp.text[:120]}"
                logger.warning(reason)
                return False, reason
    except Exception as e:
        reason = f"Webhook dispatch error: {str(e)}"
        logger.warning(reason)
        return False, reason


async def _dispatch_incident_alert(inc: Dict[str, Any], recipients: List[str]) -> Tuple[bool, Optional[str]]:
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    if sid and token:
        ok, reason = await _send_direct_twilio_alert(inc, recipients)
        if ok:
            webhook_url = os.getenv("N8N_WEBHOOK_URL")
            if webhook_url:
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(_send_n8n_alert(inc, recipients))
                except Exception:
                    pass
            return True, None
        return False, reason

    webhook_url = os.getenv("N8N_WEBHOOK_URL")
    if webhook_url:
        return await _send_n8n_alert(inc, recipients)

    return False, "No alert service configured. Set TWILIO_ACCOUNT_SID or N8N_WEBHOOK_URL in backend/.env"


def _check_and_trigger_auto_alert(inc: Dict[str, Any]):
    """Auto-send once when an incident first becomes High/Critical."""
    sev = str(inc.get("severity_level") or "").strip().lower()
    score = float(inc.get("severity_score") or 0.0)
    is_high_or_crit = sev in ("high", "critical") or score >= 70.0
    if is_high_or_crit and not inc.get("alert_sent_at"):
        env_rec = [r.strip() for r in (os.getenv("ALERT_RECIPIENTS") or "").split(",") if r.strip()]
        recipients = env_rec or list(STATE.get("alert_recipients", []))
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        inc["alert_sent_at"] = now_iso
        iid = inc.get("incident_id")
        if iid and iid in STATE["incidents_by_id"]:
            STATE["incidents_by_id"][iid]["alert_sent_at"] = now_iso
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_dispatch_incident_alert(inc, recipients))
        except RuntimeError:
            pass


def load_and_initialize_data():
    """Loads CSV datasets with pandas, runs analyze_events() per city once, and caches results."""
    datasets_dir = REPO_ROOT / "data_and_ml" / "datasets"
    events_path = datasets_dir / "india_events.csv"
    if not events_path.exists():
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
    STATE["evidence_lookup"] = {}
    if not evidence_df.empty:
        for _, row in evidence_df.iterrows():
            eid = row.get("event_id")
            if eid and pd.notna(eid):
                STATE["evidence_lookup"][str(eid)] = {
                    "source_name": str(row.get("source_name", "")),
                    "source_url": str(row.get("source_url", ""))
                }

    if events_df.empty:
        return

    # Determine city column
    city_col = "city_id" if "city_id" in events_df.columns else "city"
    cities = [str(c) for c in events_df[city_col].dropna().unique()]
    STATE["cities"] = cities

    # Compute city average lat/lon
    city_coords: Dict[str, Tuple[float, float]] = {}
    for c in cities:
        cdf = events_df[events_df[city_col] == c]
        avg_lat = float(cdf["lat"].dropna().mean()) if not cdf["lat"].dropna().empty else 0.0
        avg_lon = float(cdf["lon"].dropna().mean()) if not cdf["lon"].dropna().empty else 0.0
        city_coords[c] = (avg_lat, avg_lon)

    default_now = datetime.datetime.now(datetime.timezone.utc)

    STATE["events_by_city"] = {}
    STATE["incidents_by_city"] = {}
    STATE["all_incidents"] = []
    STATE["all_events"] = []
    STATE["incidents_by_id"] = {}
    STATE["events_by_id"] = {}
    STATE["city_summaries"] = []

    global_inc_counter = 1
    total_real = 0
    total_synth = 0
    taxonomy_counts: Dict[str, int] = {}
    city_stats: Dict[str, Dict[str, int]] = {}

    for city in cities:
        cdf = events_df[events_df[city_col] == city]
        avg_lat, avg_lon = city_coords[city]
        city_records: List[Dict[str, Any]] = []

        for _, row in cdf.iterrows():
            eid = str(row.get("event_id"))
            lat_val = row.get("lat")
            lon_val = row.get("lon")
            if pd.isna(lat_val) or pd.isna(lon_val):
                lat = avg_lat
                lon = avg_lon
                loc_approx = True
            else:
                lat = float(lat_val)
                lon = float(lon_val)
                loc_approx = False

            # Timestamps
            e_dt = to_utc_dt(row.get("event_time")) or to_utc_dt(row.get("published_at")) or to_utc_dt(row.get("event_date")) or default_now
            r_dt = to_utc_dt(row.get("received_at")) or e_dt

            ver_status = str(row.get("verification_status") or "").strip().lower()
            sig_ver = ver_status in ("official", "machine_observed")

            tax_code = str(row.get("taxonomy_code") or "")
            src_type_col = str(row.get("source_type") or "")
            mapped_type = _map_taxonomy_to_source_type(tax_code, src_type_col, ver_status)

            polarity = row.get("polarity")
            try:
                polarity_val = int(polarity) if pd.notna(polarity) else 1
            except (ValueError, TypeError):
                polarity_val = 1

            desc = str(row.get("description") or "")
            if polarity_val == -1 and not any(w in desc.lower() for w in ["no issue", "clear", "no problem", "all dry", "normal"]):
                desc = f"{desc} [conflicting report: clear / normal condition]"

            try:
                trust = float(row.get("source_reliability")) if pd.notna(row.get("source_reliability")) else 0.5
            except (ValueError, TypeError):
                trust = 0.5

            is_synth = bool(row.get("is_synthetic", False))
            if is_synth:
                total_synth += 1
            else:
                total_real += 1

            taxonomy_counts[tax_code] = taxonomy_counts.get(tax_code, 0) + 1

            val = row.get("value")
            unit = row.get("unit")

            ev_info = STATE["evidence_lookup"].get(eid, {})
            src_name = str(row.get("source_name") or ev_info.get("source_name") or "")
            src_url = str(row.get("source_url") or ev_info.get("source_url") or "")

            rec = {
                "id": eid,
                "event_id": eid,
                "description": desc,
                "event_time": e_dt,
                "received_time": r_dt,
                "lat": lat,
                "lon": lon,
                "city": city,
                "location_name": str(row.get("location_name") or "").strip(),
                "trust": trust,
                "signature_verified": sig_ver,
                "source_name": src_name,
                "source_url": src_url,
                "is_synthetic": is_synth,
                "value": None if pd.isna(val) else val,
                "unit": None if pd.isna(unit) else str(unit),
                "type": mapped_type,
                "source_type": mapped_type,
                "location_approx": loc_approx,
                "taxonomy_code": tax_code,
                "polarity": polarity_val,
                "conflicting": (polarity_val == -1),
                "severity": "Medium",
            }
            city_records.append(rec)
            STATE["events_by_id"][eid] = rec
            STATE["all_events"].append(rec)

        STATE["events_by_city"][city] = city_records

        # Run analyze_events once per city
        city_incidents = analyze_events(city_records)
        enriched_city_incidents = []
        high_count = 0

        for inc in city_incidents:
            inc_dict = inc.to_dict() if hasattr(inc, "to_dict") else dict(inc)
            inc_id = f"INCIDENT-{global_inc_counter:03d}"
            global_inc_counter += 1
            inc_dict["incident_id"] = inc_id

            # Gather events belonging to this incident
            inc_event_ids = set(inc_dict.get("event_ids", []))
            inc_events_raw = [STATE["events_by_id"][eid] for eid in inc_event_ids if eid in STATE["events_by_id"]]

            # Real location names: incident title/neighborhood must use the most common location_name of its events
            from collections import Counter
            loc_list = [
                str(e.get("location_name") or "").strip()
                for e in inc_events_raw
                if str(e.get("location_name") or "").strip() and str(e.get("location_name") or "").strip().lower() != "nan"
            ]
            if loc_list:
                common_loc = Counter(loc_list).most_common(1)[0][0]
            else:
                common_loc = city.title()

            inc_dict["neighborhood"] = f"{common_loc}, {city.title()}"
            cause_label = inc_dict.get("cause_label") or inc_dict.get("primary_cause", "Incident").replace("_", " ").title()
            inc_dict["title"] = f"{cause_label} — {common_loc}"

            # Check if any event has resolved/restored/reopened taxonomy
            is_resolved = any(
                any(k in str(e.get("taxonomy_code") or "").upper() for k in ["RESOLVED", "RESTORED", "REOPENED"])
                for e in inc_events_raw
            )
            inc_dict["status"] = "resolved" if is_resolved else "active"
            inc_dict["is_resolved"] = is_resolved

            # Conflicting evidence
            has_conflict = any(e.get("polarity") == -1 for e in inc_events_raw)
            inc_dict["has_conflicting_evidence"] = has_conflict
            if has_conflict:
                conflict_sum = sum(1 for e in inc_events_raw if e.get("polarity") == -1)
                inc_dict["conflicting_evidence_count"] = max(inc_dict.get("conflicting_evidence_count", 0), conflict_sum)

            # Check if synthetic
            inc_dict["is_synthetic"] = all(bool(e.get("is_synthetic", False)) for e in inc_events_raw) if inc_events_raw else False

            sev_level = inc_dict.get("severity_level") or "Medium"
            sev_score = inc_dict.get("severity_score") or 50
            if sev_level.lower() in ("high", "critical") or sev_score >= 70:
                high_count += 1

            # Update event severities
            for e in inc_events_raw:
                e["severity"] = sev_level

            # Convert datetimes to ISO strings for JSON serialization
            serialized_events = []
            for e in inc_events_raw:
                e_copy = dict(e)
                if isinstance(e_copy.get("event_time"), datetime.datetime):
                    e_copy["event_time"] = e_copy["event_time"].isoformat()
                if isinstance(e_copy.get("received_time"), datetime.datetime):
                    e_copy["received_time"] = e_copy["received_time"].isoformat()
                e_copy["time"] = e_copy.get("event_time")
                serialized_events.append(e_copy)

            serialized_events.sort(key=lambda x: str(x.get("event_time") or ""))
            inc_dict["events"] = serialized_events

            _check_and_trigger_auto_alert(inc_dict)

            enriched_city_incidents.append(inc_dict)
            STATE["all_incidents"].append(inc_dict)
            STATE["incidents_by_id"][inc_id] = inc_dict
            STATE["incidents_by_id"][f"{city.lower()}-{inc_id.lower()}"] = inc_dict
            STATE["incidents_by_id"][f"{city.lower()}:{inc_id.lower()}"] = inc_dict

        STATE["incidents_by_city"][city] = enriched_city_incidents

        # City summary
        STATE["city_summaries"].append({
            "city": city,
            "name": city.title(),
            "lat": round(avg_lat, 6),
            "lon": round(avg_lon, 6),
            "incident_count": len(enriched_city_incidents),
            "high_count": high_count,
        })

        city_stats[city] = {
            "total_events": len(city_records),
            "incidents": len(enriched_city_incidents),
            "real": sum(1 for e in city_records if not e.get("is_synthetic")),
            "synthetic": sum(1 for e in city_records if e.get("is_synthetic")),
            "high_count": high_count,
        }

    # Complete stats
    STATE["stats"] = {
        "total_events": len(STATE["all_events"]),
        "total_incidents": len(STATE["all_incidents"]),
        "by_city": city_stats,
        "totals_per_city": city_stats,
        "by_taxonomy": taxonomy_counts,
        "totals_per_taxonomy": taxonomy_counts,
        "real_vs_synthetic": {
            "real": total_real,
            "synthetic": total_synth,
        },
        "by_status": {
            "active": sum(1 for inc in STATE["all_incidents"] if inc.get("status") == "active"),
            "resolved": sum(1 for inc in STATE["all_incidents"] if inc.get("status") == "resolved"),
        }
    }


def _enrich_incident_events(inc: Dict[str, Any]) -> Dict[str, Any]:
    """Ensures incident has full serialized events array."""
    if inc.get("events") and len(inc["events"]) > 0:
        return inc

    event_ids = inc.get("event_ids", [])
    events_lookup = STATE.get("events_by_id", {})
    enriched = []
    for eid in event_ids:
        rec = events_lookup.get(str(eid))
        if rec:
            e_copy = dict(rec)
            if isinstance(e_copy.get("event_time"), datetime.datetime):
                e_copy["event_time"] = e_copy["event_time"].isoformat()
            if isinstance(e_copy.get("received_time"), datetime.datetime):
                e_copy["received_time"] = e_copy["received_time"].isoformat()
            e_copy["time"] = e_copy.get("event_time")
            enriched.append(e_copy)

    enriched.sort(key=lambda x: str(x.get("event_time") or ""))
    inc_copy = dict(inc)
    inc_copy["events"] = enriched
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
async def get_cities() -> List[Dict[str, Any]]:
    """Returns 7 cities with lat, lon, incident_count, high_count."""
    return STATE["city_summaries"]


@router.get("/incidents")
async def get_incidents(
    city: Optional[str] = Query(None, description="Filter incidents by city name"),
    severity: Optional[str] = Query(None, description="Filter incidents by severity level (Low, Medium, High, Critical)"),
    status: Optional[str] = Query(None, description="Filter incidents by status (active, resolved)"),
    from_: Optional[str] = Query(None, alias="from", description="Filter incidents after this timestamp"),
    to: Optional[str] = Query(None, alias="to", description="Filter incidents before this timestamp"),
    real_only: Optional[Any] = Query(None, description="Filter to real incidents only (non-synthetic)")
) -> List[Dict[str, Any]]:
    """Lists incidents filtered by city, severity, status, time range, and real_only."""
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

    if status:
        target_status = status.strip().lower()
        incidents = [
            inc for inc in incidents
            if (inc.get("status") or "active").lower() == target_status
        ]

    if from_:
        from_dt = _parse_filter_date(from_)
        if from_dt:
            incidents = [
                inc for inc in incidents
                if _get_incident_time(inc) >= from_dt
            ]

    if to:
        to_dt = _parse_filter_date(to)
        if to_dt:
            incidents = [
                inc for inc in incidents
                if _get_incident_time(inc) <= to_dt
            ]

    if real_only is not None:
        is_real = str(real_only).strip().lower() in ("true", "1", "yes") if isinstance(real_only, (str, bool)) else bool(real_only)
        if is_real:
            incidents = [
                inc for inc in incidents
                if (not inc.get("is_synthetic", False)) or any(not e.get("is_synthetic", True) for e in inc.get("events", []))
            ]

    return [_enrich_incident_events(inc) for inc in incidents]


@router.get("/incidents/{incident_id}")
async def get_incident(incident_id: str) -> Dict[str, Any]:
    """Retrieves full incident details including the full events list."""
    inc = _lookup_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return _enrich_incident_events(inc)


@router.get("/events/geojson")
async def get_events_geojson(
    city: Optional[str] = Query(None, description="Filter events by city"),
    from_: Optional[str] = Query(None, alias="from", description="Filter events after this timestamp"),
    to: Optional[str] = Query(None, alias="to", description="Filter events before this timestamp")
) -> Dict[str, Any]:
    """Returns all events as a GeoJSON FeatureCollection with properties: id, type, taxonomy_code, severity, is_synthetic, location_approx, time."""
    events = STATE["all_events"]

    if city:
        target_city = city.strip().lower()
        events = [
            e for e in events
            if (e.get("city") or "").lower() == target_city or target_city in (e.get("city") or "").lower()
        ]

    if from_:
        from_dt = _parse_filter_date(from_)
        if from_dt:
            events = [
                e for e in events
                if (to_utc_dt(e.get("event_time")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)) >= from_dt
            ]

    if to:
        to_dt = _parse_filter_date(to)
        if to_dt:
            events = [
                e for e in events
                if (to_utc_dt(e.get("event_time")) or datetime.datetime.max.replace(tzinfo=datetime.timezone.utc)) <= to_dt
            ]

    features = []
    for e in events:
        lat = e.get("lat")
        lon = e.get("lon")
        if lat is None or lon is None:
            continue

        e_time = e.get("event_time")
        if isinstance(e_time, datetime.datetime):
            time_str = e_time.isoformat()
        else:
            time_str = str(e_time or "")

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [float(lon), float(lat)]
            },
            "properties": {
                "id": str(e.get("id") or e.get("event_id")),
                "type": str(e.get("type") or e.get("source_type") or "citizen_report"),
                "taxonomy_code": str(e.get("taxonomy_code") or ""),
                "severity": str(e.get("severity") or "Medium"),
                "is_synthetic": bool(e.get("is_synthetic", False)),
                "location_approx": bool(e.get("location_approx", False)),
                "time": time_str
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features
    }


@router.get("/stats")
async def get_stats() -> Dict[str, Any]:
    """Returns totals per city, per taxonomy, real vs synthetic."""
    return STATE["stats"]


@router.get("/incidents/{incident_id}/replay")
async def replay_incident(incident_id: str) -> Dict[str, Any]:
    """Returns chronological timeline of events with cumulative confidence progression."""
    inc = _lookup_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")

    events = inc.get("events", [])
    events_sorted = sorted(events, key=lambda e: str(e.get("event_time") or e.get("received_time") or ""))

    steps = []
    for k in range(1, len(events_sorted) + 1):
        subset = events_sorted[:k]
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
            "event": events_sorted[k - 1],
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
    inc = _lookup_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")

    events = inc.get("events", [])
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
        elif "delhi" in target:
            rain_df = rain_df[rain_df["latitude"].astype(float).between(27.0, 30.0)]
        elif "bengaluru" in target:
            rain_df = rain_df[rain_df["latitude"].astype(float).between(11.0, 14.0)]

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
    raw_event = await request.json()
    if not isinstance(raw_event, dict):
        raise HTTPException(status_code=400, detail="Event must be a JSON object")

    event_id = raw_event.get("event_id") or raw_event.get("id") or f"EVT-LIVE-{id(raw_event)}"
    raw_event["event_id"] = event_id
    raw_event["id"] = event_id

    now_dt = datetime.datetime.now(datetime.timezone.utc)
    if not raw_event.get("event_time") and not raw_event.get("timestamp"):
        raw_event["event_time"] = now_dt
    else:
        raw_event["event_time"] = to_utc_dt(raw_event.get("event_time") or raw_event.get("timestamp")) or now_dt

    if not raw_event.get("received_time"):
        raw_event["received_time"] = raw_event["event_time"]
    else:
        raw_event["received_time"] = to_utc_dt(raw_event.get("received_time")) or raw_event["event_time"]

    city = str(raw_event.get("city") or raw_event.get("city_id") or "mumbai").lower()
    raw_event["city"] = city

    if city not in STATE["events_by_city"]:
        STATE["events_by_city"][city] = []
        if city not in STATE["cities"]:
            STATE["cities"].append(city)

    STATE["events_by_city"][city].append(raw_event)
    STATE["events_by_id"][event_id] = raw_event
    STATE["all_events"].append(raw_event)

    updated_city_incidents = analyze_events(STATE["events_by_city"][city])
    enriched_updated = [_enrich_incident_events(inc if isinstance(inc, dict) else inc.to_dict()) for inc in updated_city_incidents]
    STATE["incidents_by_city"][city] = enriched_updated

    all_incs = []
    for c, incs in STATE["incidents_by_city"].items():
        all_incs.extend(incs)
    STATE["all_incidents"] = all_incs

    for inc in enriched_updated:
        iid = inc["incident_id"]
        STATE["incidents_by_id"][iid] = inc
        STATE["incidents_by_id"][f"{city.lower()}-{iid.lower()}"] = inc
        STATE["incidents_by_id"][f"{city.lower()}:{iid.lower()}"] = inc

    matching_incident = next(
        (inc for inc in enriched_updated if event_id in inc.get("event_ids", [])),
        enriched_updated[0] if enriched_updated else None
    )

    await broadcast_event({"type": "event_ingested", "event": raw_event})
    if matching_incident:
        await broadcast_event({"type": "incident_updated", "incident": matching_incident})

    return {
        "status": "ok",
        "event": raw_event,
        "incident": matching_incident,
        "incident_count": len(updated_city_incidents)
    }


@router.get("/alert-recipients")
async def get_alert_recipients() -> Dict[str, Any]:
    if not STATE.get("alert_recipients_customized"):
        load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env", override=True)
        env_rec = [r.strip() for r in (os.getenv("ALERT_RECIPIENTS") or "").split(",") if r.strip()]
        if env_rec:
            STATE["alert_recipients"] = env_rec
    return {"recipients": STATE.get("alert_recipients", [])}


@router.put("/alert-recipients")
async def update_alert_recipients(request: Request) -> Dict[str, Any]:
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    if isinstance(body, dict):
        recipients = body.get("recipients", [])
    elif isinstance(body, list):
        recipients = body
    else:
        recipients = []

    clean = [str(r).strip() for r in recipients if str(r).strip()]
    STATE["alert_recipients"] = clean
    STATE["alert_recipients_customized"] = True
    return {"status": "ok", "recipients": clean}


@router.post("/incidents/{incident_id}/alert")
async def trigger_incident_alert(incident_id: str, request: Request) -> Dict[str, Any]:
    inc = _lookup_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    custom_recipients = body.get("recipients") if isinstance(body, dict) else None
    if custom_recipients and isinstance(custom_recipients, list) and len(custom_recipients) > 0:
        recipients = [str(r).strip() for r in custom_recipients if str(r).strip()]
    else:
        env_rec = [r.strip() for r in (os.getenv("ALERT_RECIPIENTS") or "").split(",") if r.strip()]
        recipients = env_rec or list(STATE.get("alert_recipients", []))

    sent, failure_reason = await _dispatch_incident_alert(inc, recipients)
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if sent:
        inc["alert_sent_at"] = now_iso
        iid = inc.get("incident_id")
        if iid and iid in STATE["incidents_by_id"]:
            STATE["incidents_by_id"][iid]["alert_sent_at"] = now_iso

    return {
        "status": "sent" if sent else "failed",
        "sent": sent,
        "reason": failure_reason,
        "incident_id": inc.get("incident_id"),
        "recipients": recipients,
        "recipients_count": len(recipients),
        "alert_sent_at": inc.get("alert_sent_at")
    }


@router.get("/health")
async def health_v1():
    return {"status": "ok", "service": "v1-api", "cities": STATE["cities"]}
