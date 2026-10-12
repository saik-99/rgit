"""
Convenience wrapper for Person 1's backend.

analyze_incident() now understands backend events directly, so the existing
/explain route already works. This helper just passes the incident fields:

    from agents import analyze_backend_incident
    result = analyze_backend_incident(incident.to_dict(include_events=True))
"""

from __future__ import annotations

from agents.agent_manager import analyze_incident
from agents.tools.normalize import map_signal  # noqa: F401  (re-exported for tests)


def analyze_backend_incident(incident: dict, use_llm: bool = True, use_ml: bool = True) -> dict:
    return analyze_incident({
        "incident_id": incident.get("id"),
        "cause": incident.get("cause"),
        "confidence": incident.get("cause_confidence"),
        "neighborhood": incident.get("neighborhood"),
        "events": incident.get("events") or [],
    }, use_llm=use_llm, use_ml=use_ml)
