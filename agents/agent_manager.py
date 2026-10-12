"""
Incident Agent Manager (Person 4)

Orchestrates the evidence tools in agents/tools/graph_tools.py, records
every step, and writes an operator briefing.

Design rule: TOOLS DECIDE, LLM ONLY EXPLAINS.
  - Cause, confidence, severity and actions come from deterministic tools.
  - Gemini (optional) only rewrites the facts into a friendly briefing.
  - If no API key / network, a template briefing is used, so the demo
    never breaks.

Public functions:
    analyze_incident(incident_data: dict) -> dict      # repo contract
    run_agent(task_prompt: str, context: dict = None) -> dict
"""

from __future__ import annotations

import os
import time

try:  # works both as `agents.agent_manager` and when run from inside agents/
    from agents.tools import graph_tools as gt
except ImportError:  # pragma: no cover
    from tools import graph_tools as gt

PROMPT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "prompts", "system_prompts.md")


# ---------------------------------------------------------------------------
# Step recorder
# ---------------------------------------------------------------------------
class _Steps:
    def __init__(self):
        self.items = []

    def run(self, tool_name: str, fn, *args, summary=None):
        start = time.perf_counter()
        result = fn(*args)
        self.items.append({
            "step": len(self.items) + 1,
            "tool": tool_name,
            "summary": summary(result) if summary else "",
            "ms": round((time.perf_counter() - start) * 1000, 2),
        })
        return result


# ---------------------------------------------------------------------------
# Input helpers
# ---------------------------------------------------------------------------
def _extract_events(incident_data: dict) -> list[dict]:
    """Accept events in whatever shape Person 1/2 send them."""
    if not incident_data:
        return []
    for key in ("events", "raw_events", "signals"):
        if isinstance(incident_data.get(key), list):
            return incident_data[key]
    graph = incident_data.get("causal_graph") or incident_data.get("graph") or {}
    nodes = graph.get("nodes", []) if isinstance(graph, dict) else []
    events = []
    for n in nodes:
        if not isinstance(n, dict):
            continue
        if isinstance(n.get("event"), dict):
            events.append(n["event"])
        elif n.get("signal"):
            events.append(n)
    return events


def _pct(x: float) -> str:
    return f"{round(x * 100)}%"


# ---------------------------------------------------------------------------
# Briefing writers
# ---------------------------------------------------------------------------
def _template_briefing(a: dict) -> str:
    cause = a["root_cause"]
    where = a.get("location") or "the reported area"
    lines = [
        f"{a['severity'].upper()}: Probable {cause} at {where} "
        f"(confidence {_pct(a['confidence'])}).",
    ]
    top = a["cause_ranking"][0]
    if top["matched_symptoms"]:
        lines.append("Evidence: " + ", ".join(top["matched_symptoms"])
                     + f" from {a['source_count']} independent source types.")
    if a["late_arrivals"]:
        late = a["late_arrivals"][0]
        lines.append(f"Timeline corrected: {late['event_id']} ({late['signal']}) arrived "
                     f"{late['delay_min']} min late and was placed at its true time.")
    if a["duplicates_removed"]:
        lines.append(f"{len(a['duplicates_removed'])} duplicate signal(s) ignored.")
    for c in a["conflicts"]:
        lines.append(f"Conflict: {c['source_type']} says \"{c['claim']}\" -> {c['verdict']} "
                     f"({c['reason']}).")
    for f in a["integrity_flags"]:
        if f["issue"] == "possible_tampering":
            lines.append(f"Security: {f['device_id']} may be tampered - {f['detail']}.")
    if a["uncertainty_reasons"]:
        lines.append("Why not 100%: " + "; ".join(a["uncertainty_reasons"]) + ".")
    lines.append("Next action: " + a["recommended_actions"][0] + ".")
    return " ".join(lines)


def _llm_briefing(analysis: dict) -> str | None:
    """Optional Gemini rewrite. Returns None if unavailable or unsafe."""
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        return None
    try:
        from google import genai  # pip install google-genai
    except ImportError:
        return None
    try:
        with open(PROMPT_FILE, encoding="utf-8") as f:
            system = f.read()
    except OSError:
        system = "You write short, factual incident briefings for city operators."

    facts = {k: analysis[k] for k in (
        "root_cause", "confidence", "severity", "location", "cause_ranking",
        "late_arrivals", "duplicates_removed", "conflicts", "integrity_flags",
        "silent_sensors", "uncertainty_reasons", "recommended_actions")}
    try:
        client = genai.Client(api_key=key)
        resp = client.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            contents=f"{system}\n\nFACTS (JSON):\n{facts}\n\nWrite the operator briefing.",
        )
        text = (resp.text or "").strip()
    except Exception:  # network, quota, bad model name...
        return None
    # Grounding guard: the LLM must keep our confidence number unchanged.
    if not text or _pct(analysis["confidence"]) not in text:
        return None
    return text


# ---------------------------------------------------------------------------
# Main entry: analyze_incident
# ---------------------------------------------------------------------------
def analyze_incident(incident_data: dict, use_llm: bool = True) -> dict:
    """
    Input  : {"incident_id": ..., "events": [...]}  (or a causal_graph with nodes)
    Output : root cause, confidence, severity, conflicts, integrity flags,
             corrected timeline, actions, operator briefing and steps_taken.
    """
    incident_data = incident_data or {}
    steps = _Steps()
    vocab = incident_data.get("vocabulary") or steps.run(
        "load_vocabulary", gt.load_vocabulary,
        summary=lambda v: f"{len(v)} incident types loaded")

    events = _extract_events(incident_data)
    if not events:
        return {"incident_id": incident_data.get("incident_id"), "error": "no events supplied",
                "response": "No events were supplied for this incident.",
                "steps_taken": steps.items}

    events, dups = steps.run("remove_duplicates", gt.remove_duplicates, events,
                             summary=lambda r: f"{len(r[1])} duplicate(s) removed")
    timeline, late = steps.run("reorder_timeline", gt.reorder_timeline, events,
                               summary=lambda r: f"{len(r[1])} late arrival(s) re-placed")
    ranking = steps.run("rank_causes", gt.rank_causes, timeline, vocab,
                        summary=lambda r: f"top: {r[0]['cause']} {_pct(r[0]['probability'])}")
    top = ranking[0]
    conflicts = steps.run("detect_conflicts", gt.detect_conflicts, timeline, top,
                          summary=lambda r: f"{len(r)} conflict(s)")
    flags = steps.run("check_integrity", gt.check_integrity, timeline, top,
                      summary=lambda r: f"{len(r)} integrity flag(s)")
    silent = steps.run("find_silent_sensors", gt.find_silent_sensors, timeline,
                       incident_data.get("as_of"),
                       summary=lambda r: f"{len(r)} silent sensor(s)")
    confidence, reasons = steps.run(
        "final_confidence", gt.final_confidence, top, conflicts, flags, silent,
        summary=lambda r: f"confidence {_pct(r[0])}")

    # If Person 2's ML already computed confidence, blend it (agent = cross-check)
    ml_conf = incident_data.get("confidence")
    if isinstance(ml_conf, (int, float)) and 0 <= ml_conf <= 1:
        confidence = round((confidence + ml_conf) / 2, 3)
        reasons.append(f"blended with ML engine confidence {_pct(ml_conf)}")

    sources = {e.get("source_type") for e in timeline
               if e.get("signal") in top["matched_symptoms"]}
    severity = incident_data.get("severity") or steps.run(
        "estimate_severity", gt.estimate_severity, top["cause"], vocab, confidence,
        len(sources), summary=lambda r: r)
    actions = steps.run("recommend_actions", gt.recommend_actions, top["cause"],
                        confidence, conflicts, flags,
                        summary=lambda r: f"{len(r)} action(s)")

    location = next((e.get("location", {}).get("neighborhood") for e in timeline
                     if isinstance(e.get("location"), dict)), None)

    analysis = {
        "incident_id": incident_data.get("incident_id"),
        "root_cause": top["cause"],
        "confidence": confidence,
        "confidence_label": ("High" if confidence >= 0.75 else
                             "Medium" if confidence >= 0.5 else "Low"),
        "severity": severity,
        "location": location,
        "source_count": len(sources),
        "cause_ranking": ranking,
        "timeline": [{"event_id": e.get("event_id"), "timestamp": e.get("timestamp"),
                      "signal": e.get("signal"), "source_type": e.get("source_type")}
                     for e in timeline],
        "duplicates_removed": dups,
        "late_arrivals": late,
        "conflicts": conflicts,
        "integrity_flags": flags,
        "silent_sensors": silent,
        "uncertainty_reasons": reasons,
        "recommended_actions": actions,
    }

    briefing = _llm_briefing(analysis) if use_llm else None
    analysis["llm_used"] = briefing is not None
    analysis["briefing"] = briefing or _template_briefing(analysis)
    steps.items.append({"step": len(steps.items) + 1, "tool": "write_briefing",
                        "summary": "Gemini" if analysis["llm_used"] else "template", "ms": 0})
    analysis["response"] = analysis["briefing"]
    analysis["steps_taken"] = steps.items
    return analysis


# ---------------------------------------------------------------------------
# Generic entry: run_agent (task + context)
# ---------------------------------------------------------------------------
def run_agent(task_prompt: str, context: dict = None) -> dict:
    """
    Generic wrapper the backend can call:
        run_agent("Explain incident INC-1", {"incident": {...events...}})
    Returns {"response": str, "steps_taken": list, "analysis": dict}
    """
    context = context or {}
    incident = context.get("incident") or context.get("incident_data") or context
    analysis = analyze_incident(incident)
    steps = [{"step": 0, "tool": "read_task", "summary": (task_prompt or "")[:120], "ms": 0}]
    return {"response": analysis.get("response", ""),
            "steps_taken": steps + analysis.get("steps_taken", []),
            "analysis": analysis}
