"""
Graph / evidence tools used by the Incident Agent.

Every function here is a plain, deterministic Python "tool":
it takes events (dicts) and returns facts. The agent manager calls
these tools in order and records each call in `steps_taken`.

No LLM is used here -> numbers are reproducible and explainable.
"""

from __future__ import annotations

import json
import math
import os
from datetime import datetime

# ---------------------------------------------------------------------------
# Settings (tweak freely)
# ---------------------------------------------------------------------------
UNVERIFIED_TRUST = 0.6        # weight for sources without integrity check
DUPLICATE_WINDOW_SEC = 120    # same device + signal within 2 min = duplicate
LATE_ARRIVAL_SEC = 300        # received >5 min after it happened = "late"
SILENT_SENSOR_MIN = 10        # verified sensor quiet for 10+ min = "silent"

CONFLICT_SIGNALS = {"ConflictingReport", "RoadClearReport", "AllClearReport"}

# Fallback copy of data_and_ml/datasets/incident_vocabulary.json
_FALLBACK_VOCAB = {
    "DrainageFailure": {
        "symptoms": ["WaterLevelSpike", "RoadInundation", "TrafficSlowdown",
                     "Citizen311FloodCall", "SubmergedSensorTelemetry"],
        "prior_probability": 0.35, "typical_severity": "High"},
    "TrafficCollision": {
        "symptoms": ["CameraCrashDetection", "SuddenBrakingTelemetry",
                     "Citizen911EmergencyCall", "LaneBlockageSensor"],
        "prior_probability": 0.40, "typical_severity": "Medium"},
    "PowerGridFailure": {
        "symptoms": ["SubstationVoltageDrop", "TrafficSignalDark",
                     "CitizenBlackoutReport", "BuildingTelemetryOffline"],
        "prior_probability": 0.15, "typical_severity": "Critical"},
    "GasLeakOrHazard": {
        "symptoms": ["AirQualityPPMSpike", "AcousticSensorHiss",
                     "OdorComplaintCalls", "ThermalCameraHeatAnomaly"],
        "prior_probability": 0.10, "typical_severity": "Critical"},
}

ACTIONS = {
    "DrainageFailure": [
        "Dispatch public works crew to clear the storm drain",
        "Divert traffic away from the flooded segment",
        "Alert nearby residents and transit operators",
    ],
    "TrafficCollision": [
        "Dispatch police and ambulance to the location",
        "Close the blocked lane and reroute traffic",
        "Pull nearby camera footage for verification",
    ],
    "PowerGridFailure": [
        "Notify the electricity utility control room",
        "Send traffic police to manage dark signals",
        "Check hospitals in the area for backup power",
    ],
    "GasLeakOrHazard": [
        "Dispatch fire brigade with hazmat unit",
        "Evacuate a 200 m radius around the source",
        "Cut gas supply to the affected line",
    ],
}

SEVERITY_ORDER = ["Low", "Medium", "High", "Critical"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _ts(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _trust(event: dict) -> float:
    """How much we believe one event: its own confidence x source trust."""
    conf = float(event.get("confidence", 0.7))
    return conf * (1.0 if event.get("integrity_verified") else UNVERIFIED_TRUST)


def load_vocabulary(path: str | None = None) -> dict:
    """Read Person 3's vocabulary file (read-only). Falls back to a copy."""
    if path is None:
        here = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(here, "..", "..", "data_and_ml", "datasets",
                            "incident_vocabulary.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data.get("vocabulary", data)
    except (OSError, json.JSONDecodeError):
        return _FALLBACK_VOCAB


# ---------------------------------------------------------------------------
# Tool 1: remove duplicates
# ---------------------------------------------------------------------------
def remove_duplicates(events: list[dict]) -> tuple[list[dict], list[dict]]:
    """Same device + same signal within DUPLICATE_WINDOW_SEC -> keep one."""
    kept, dropped = [], []
    for ev in events:
        t = _ts(ev.get("timestamp"))
        dup_of = None
        for k in kept:
            if (k.get("device_id") == ev.get("device_id")
                    and k.get("signal") == ev.get("signal")):
                tk = _ts(k.get("timestamp"))
                if t and tk and abs((t - tk).total_seconds()) <= DUPLICATE_WINDOW_SEC:
                    dup_of = k
                    break
        if dup_of:
            dropped.append({"event_id": ev.get("event_id"),
                            "duplicate_of": dup_of.get("event_id")})
        else:
            kept.append(ev)
    return kept, dropped


# ---------------------------------------------------------------------------
# Tool 2: rebuild true timeline (fixes out-of-order arrival)
# ---------------------------------------------------------------------------
def reorder_timeline(events: list[dict]) -> tuple[list[dict], list[dict]]:
    """Sort by when it HAPPENED, and list events that arrived late."""
    ordered = sorted(events, key=lambda e: _ts(e.get("timestamp")) or datetime.max)
    late = []
    for ev in ordered:
        t, r = _ts(ev.get("timestamp")), _ts(ev.get("received_at"))
        if t and r:
            delay = (r - t).total_seconds()
            if delay >= LATE_ARRIVAL_SEC:
                late.append({"event_id": ev.get("event_id"),
                             "signal": ev.get("signal"),
                             "delay_min": round(delay / 60, 1)})
    return ordered, late


# ---------------------------------------------------------------------------
# Tool 3: rank probable causes
# ---------------------------------------------------------------------------
def rank_causes(events: list[dict], vocab: dict) -> list[dict]:
    """
    For each cause: support = average of the best trust seen per expected
    symptom. score = prior x (0.05 + support). Scores are normalised to
    probabilities so all causes add up to 1.
    """
    best_per_signal: dict[str, float] = {}
    for ev in events:
        s = ev.get("signal")
        best_per_signal[s] = max(best_per_signal.get(s, 0.0), _trust(ev))

    ranking = []
    for cause, info in vocab.items():
        symptoms = info.get("symptoms", [])
        matched = [s for s in symptoms if s in best_per_signal]
        support = (sum(best_per_signal[s] for s in matched) / len(symptoms)
                   if symptoms else 0.0)
        score = info.get("prior_probability", 0.1) * (0.05 + support)
        ranking.append({"cause": cause, "score": score,
                        "matched_symptoms": matched,
                        "missing_symptoms": [s for s in symptoms if s not in matched]})

    total = sum(r["score"] for r in ranking) or 1.0
    for r in ranking:
        r["probability"] = round(r.pop("score") / total, 3)
    ranking.sort(key=lambda r: r["probability"], reverse=True)
    return ranking


# ---------------------------------------------------------------------------
# Tool 4: find conflicting evidence and decide which side wins
# ---------------------------------------------------------------------------
def detect_conflicts(events: list[dict], top_cause: dict) -> list[dict]:
    supporting = [e for e in events if e.get("signal") in top_cause["matched_symptoms"]]
    support_weight = sum(_trust(e) for e in supporting)
    support_sources = {e.get("source_type") for e in supporting}

    conflicts = []
    for ev in events:
        if ev.get("signal") not in CONFLICT_SIGNALS:
            continue
        w = _trust(ev)
        outweighed = support_weight >= 3 * w and len(support_sources) >= 2
        conflicts.append({
            "event_id": ev.get("event_id"),
            "source_type": ev.get("source_type"),
            "claim": ev.get("text") or ev.get("signal"),
            "weight": round(w, 2),
            "supporting_weight": round(support_weight, 2),
            "verdict": "outweighed" if outweighed else "unresolved",
            "reason": (f"{len(supporting)} events from {len(support_sources)} independent "
                       f"source types disagree with it"
                       + ("" if ev.get("integrity_verified") else ", and it is unverified"))
                      if outweighed else
                      "Evidence on both sides is comparable - needs field verification",
        })
    return conflicts


# ---------------------------------------------------------------------------
# Tool 5: cybersecurity / device integrity checks
# ---------------------------------------------------------------------------
def check_integrity(events: list[dict], top_cause: dict) -> list[dict]:
    flags = []
    for ev in events:
        if not ev.get("integrity_verified"):
            flags.append({"event_id": ev.get("event_id"),
                          "device_id": ev.get("device_id"),
                          "issue": "unverified_source",
                          "detail": "Source identity not verified; weight reduced to "
                                    f"{int(UNVERIFIED_TRUST * 100)}%"})

    # Possible tampering: the whole cause rests on ONE device while other
    # sources contradict it.
    support_devices = {e.get("device_id") for e in events
                       if e.get("signal") in top_cause["matched_symptoms"]}
    contradicting = [e for e in events if e.get("signal") in CONFLICT_SIGNALS]
    if len(support_devices) == 1 and contradicting:
        dev = next(iter(support_devices))
        flags.append({"event_id": None, "device_id": dev,
                      "issue": "possible_tampering",
                      "detail": "Only this device supports the incident while "
                                f"{len(contradicting)} other report(s) contradict it"})
    return flags


# ---------------------------------------------------------------------------
# Tool 6: sensors that went silent (signal disappeared temporarily)
# ---------------------------------------------------------------------------
def find_silent_sensors(events: list[dict], as_of: str | None = None) -> list[dict]:
    times = [_ts(e.get("timestamp")) for e in events if _ts(e.get("timestamp"))]
    if not times:
        return []
    now = _ts(as_of) or max(times)
    last_seen: dict[str, datetime] = {}
    for ev in events:
        if ev.get("integrity_verified") and ev.get("device_id", "").startswith(("IOT", "ROAD")):
            t = _ts(ev.get("timestamp"))
            if t:
                last_seen[ev["device_id"]] = max(t, last_seen.get(ev["device_id"], t))
    silent = []
    for dev, t in last_seen.items():
        mins = (now - t).total_seconds() / 60
        if mins >= SILENT_SENSOR_MIN:
            silent.append({"device_id": dev, "silent_for_min": round(mins, 1)})
    return silent


# ---------------------------------------------------------------------------
# Tool 7: final confidence, severity and actions
# ---------------------------------------------------------------------------
def final_confidence(top: dict, conflicts: list, flags: list, silent: list) -> tuple[float, list[str]]:
    conf = top["probability"]
    reasons = []
    for c in conflicts:
        penalty = 0.02 if c["verdict"] == "outweighed" else 0.15
        conf -= penalty
        reasons.append(f"conflicting report {c['event_id']} (-{int(penalty * 100)}%)")
    if any(f["issue"] == "possible_tampering" for f in flags):
        conf -= 0.25
        reasons.append("incident relies on one possibly tampered device (-25%)")
    for s in silent:
        conf -= 0.03
        reasons.append(f"sensor {s['device_id']} silent for {s['silent_for_min']} min (-3%)")
    if top["missing_symptoms"]:
        reasons.append("not yet observed: " + ", ".join(top["missing_symptoms"]))
    return round(max(0.0, min(1.0, conf)), 3), reasons


def estimate_severity(cause: str, vocab: dict, confidence: float, n_sources: int) -> str:
    base = vocab.get(cause, {}).get("typical_severity", "Medium")
    idx = SEVERITY_ORDER.index(base) if base in SEVERITY_ORDER else 1
    if confidence < 0.4:
        idx = max(0, idx - 1)          # weak evidence -> don't over-alarm
    elif confidence >= 0.8 and n_sources >= 3:
        idx = min(3, idx)              # strong & multi-source keeps base level
    return SEVERITY_ORDER[idx]


def recommend_actions(cause: str, confidence: float, conflicts: list, flags: list) -> list[str]:
    actions = list(ACTIONS.get(cause, ["Send a field team to verify the situation"]))
    if confidence < 0.6 or any(c["verdict"] == "unresolved" for c in conflicts):
        actions.insert(0, "Verify on the ground first (field team or drone) before full dispatch")
    if any(f["issue"] == "possible_tampering" for f in flags):
        actions.insert(0, "Quarantine the suspicious device and alert the security team")
    return actions
