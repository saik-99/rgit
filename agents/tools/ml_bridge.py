"""
Bridge to Person 2/3's ML engine (data_and_ml.incident_intelligence).

The agent uses it as an independent cross-check tool. If the module is
missing or crashes, the agent keeps working and records why.
"""

from __future__ import annotations

# ML engine cause ids -> agent vocabulary names
CAUSE_ID_TO_AGENT = {
    "drainage_failure": "DrainageFailure",
    "road_accident": "TrafficCollision",
    "power_outage": "PowerGridFailure",
    "road_blockage": "RoadBlockage",
    "earthquake": "SeismicEvent",
    "gas_leak": "GasLeakOrHazard",
}


def to_agent_cause(cause_id: str | None) -> str | None:
    if not cause_id:
        return None
    return CAUSE_ID_TO_AGENT.get(cause_id, cause_id)


def run_ml_engine(raw_events: list, weather_context: dict | None = None) -> dict:
    """Run Person 2/3's engine on the raw events. Never raises."""
    try:
        from data_and_ml.incident_intelligence import analyze_events
    except Exception as e:  # missing module or import error inside it
        return {"available": False, "error": f"{type(e).__name__}: {e}"}
    try:
        reports = analyze_events(list(raw_events), weather_context=weather_context)
    except Exception as e:
        return {"available": False, "error": f"{type(e).__name__}: {e}"}
    if not reports:
        return {"available": True, "report": None}
    # biggest cluster = the incident we are explaining
    top = max(reports, key=lambda r: len(r.get("event_ids") or []))
    keep = ("primary_cause", "cause_confidence", "severity_level", "response_priority",
            "data_completeness", "verification_required", "why_not_higher", "check_next",
            "nearest_infrastructure", "missing_modalities", "recommended_actions")
    rep = {k: top.get(k) for k in keep}
    rep["agent_cause"] = to_agent_cause(top.get("primary_cause"))
    return {"available": True, "report": rep, "clusters": len(reports)}
