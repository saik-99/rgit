"""
UrbanFusion Copilot Route.
Provides AI-assisted operational intelligence for city control-room operators.
Uses Groq (OpenAI-compatible) API with zero-downtime offline fallback.
"""

import os
import json
import re
import logging
from typing import Optional, List, Dict, Any, Tuple
import httpx
from fastapi import APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv()

from .v1 import STATE, _lookup_incident

logger = logging.getLogger("copilot")

router = APIRouter(prefix="/v1")

# Fixed verified Indian helplines - included in context, never hallucinated
HELPLINES = [
    {"name": "National Emergency", "number": "112", "description": "All-in-one emergency response"},
    {"name": "Police", "number": "100", "description": "Police control room"},
    {"name": "Fire", "number": "101", "description": "Fire and rescue services"},
    {"name": "Ambulance", "number": "108", "description": "Emergency medical response"},
    {"name": "Disaster Management", "number": "1078", "description": "NDRF / Disaster authority"},
    {"name": "Women Helpline", "number": "1091", "description": "Emergency support for women"},
    {"name": "Child Helpline", "number": "1098", "description": "Child protection assistance"},
]
HELPLINES_NOTE = "City-specific numbers: verify with local authority."


class CopilotRequest(BaseModel):
    message: Optional[str] = ""
    mode: Optional[str] = "chat"  # "chat" | "summarize_area" | "summarize_incident"
    city: Optional[str] = None
    incident_id: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = []


def _format_nearest_help(infra: Optional[Dict[str, Any]]) -> str:
    if not infra or not isinstance(infra, dict):
        return "Nearest facilities: Station 0.8 km, Hospital 1.2 km, Fire station 1.4 km"
    parts = []
    for k in ["hospital", "fire_station", "station"]:
        item = infra.get(k)
        if isinstance(item, dict):
            name = item.get("name") or k.replace("_", " ").title()
            dist = item.get("distance_km")
            dist_str = f" ({dist} km)" if dist is not None else ""
            parts.append(f"{k.replace('_', ' ').title()}: {name}{dist_str}")
    return ", ".join(parts) if parts else "Hospital 1.2 km, Fire station 1.4 km"


def _build_context(city: str, inc: Optional[Dict[str, Any]], city_incidents: List[Dict[str, Any]]) -> Tuple[str, Dict[str, int], List[Dict[str, Any]]]:
    # Compute severity counts
    counts = {"High": 0, "Medium": 0, "Low": 0}
    for item in city_incidents:
        sev = (item.get("severity_level") or "Medium").capitalize()
        if sev in counts:
            counts[sev] += 1
        elif sev.lower() == "critical":
            counts["High"] += 1
        else:
            counts["Medium"] += 1

    # Sort top 5 incidents by severity score descending
    def _sev_rank(x: Dict[str, Any]) -> int:
        lvl = (x.get("severity_level") or "").lower()
        if lvl in ("high", "critical"):
            return 3
        if lvl == "medium":
            return 2
        return 1

    top_incidents = sorted(
        city_incidents,
        key=lambda x: (_sev_rank(x), x.get("severity_score") or 0),
        reverse=True
    )[:5]

    lines = [f"=== URBANFUSION CONTEXT (CITY: {city.upper()}) ==="]
    lines.append(f"City Incident Counts: High={counts['High']}, Medium={counts['Medium']}, Low={counts['Low']}, Total={len(city_incidents)}")

    lines.append("\nTop Incidents in City:")
    for item in top_incidents:
        lines.append(
            f"- ID: {item.get('incident_id')} | Title: {item.get('title')} | "
            f"Severity: {item.get('severity_level')} | Confidence: {round((item.get('cause_confidence') or 0)*100)}% | "
            f"Cause: {item.get('primary_cause')} | Status: {item.get('status', 'active')}"
        )

    if inc:
        lines.append(f"\nCurrently Selected Incident:")
        lines.append(f"- ID: {inc.get('incident_id')}")
        lines.append(f"- Title: {inc.get('title')}")
        lines.append(f"- Location: {inc.get('neighborhood', city)}")
        lines.append(f"- Severity: {inc.get('severity_level')} (score: {inc.get('severity_score', 50)})")
        lines.append(f"- Confidence: {round((inc.get('cause_confidence') or 0)*100)}%")
        lines.append(f"- Primary Cause: {inc.get('primary_cause')}")
        lines.append(f"- Status: {inc.get('status', 'active')}")
        lines.append(f"- Event Count: {len(inc.get('events') or [])}")
        lines.append(f"- Summary: {inc.get('summary') or inc.get('explanation') or 'Telemetry aggregated.'}")
        if inc.get("why_not_higher"):
            lines.append(f"- Why Confidence Not Higher: {inc.get('why_not_higher')}")
        if inc.get("check_next"):
            lines.append(f"- Check Next: {inc.get('check_next')}")
        lines.append(f"- Nearest Emergency Infrastructure: {_format_nearest_help(inc.get('nearest_infrastructure'))}")

    lines.append("\n=== OFFICIAL INDIAN EMERGENCY HELPLINES ===")
    for h in HELPLINES:
        lines.append(f"- {h['name']}: {h['number']} ({h['description']})")
    lines.append(f"- Note: {HELPLINES_NOTE}")

    return "\n".join(lines), counts, top_incidents


def _generate_suggestions(inc: Optional[Dict[str, Any]], mode: str) -> List[str]:
    if inc:
        return [
            "What should I check next?",
            "Why is confidence not higher?",
            "Assign this area highest priority",
        ]
    return [
        "Summarize this area",
        "What are the highest priority incidents?",
        "Show emergency helplines",
    ]


def _build_fallback_reply(
    mode: str,
    message: str,
    city: str,
    inc: Optional[Dict[str, Any]],
    counts: Dict[str, int],
    top_incidents: List[Dict[str, Any]],
) -> Tuple[str, Optional[Dict[str, Any]]]:
    msg_lower = (message or "").lower()

    # Helpline query check
    if any(k in msg_lower for k in ["helpline", "emergency number", "phone", "call", "police", "ambulance", "fire"]):
        helpline_lines = [f"• **{h['name']}**: **{h['number']}** ({h['description']})" for h in HELPLINES]
        reply = "• **Official Emergency Helplines (India)**:\n" + "\n".join(helpline_lines) + f"\n• *{HELPLINES_NOTE}*"
        return reply, None

    # Summarize incident
    if mode == "summarize_incident" or "summarize this incident" in msg_lower or (inc and "summarize" in msg_lower and "area" not in msg_lower):
        if inc:
            nearest = _format_nearest_help(inc.get("nearest_infrastructure"))
            reply = (
                f"• **{inc.get('title')}** ({inc.get('severity_level', 'Medium')} severity, {round((inc.get('cause_confidence') or 0)*100)}% confidence)\n"
                f"• **Primary Cause**: {str(inc.get('primary_cause', 'Unknown')).replace('_', ' ').title()}\n"
                f"• **Summary**: {inc.get('summary') or inc.get('explanation') or 'Multi-modal telemetry correlated.'}\n"
                f"• **Check Next**: {inc.get('check_next') or 'Inspect local drainage and sensor nodes.'}\n"
                f"• **Nearest Help**: {nearest}"
            )
            return reply, None
        return "• No incident is currently selected. Please select an incident on the map to view detailed synthesis.", None

    # Summarize area
    if mode == "summarize_area" or "summarize this area" in msg_lower or "area" in msg_lower:
        top_lines = [
            f"  - **{i.get('incident_id')}**: {i.get('title')} ({i.get('severity_level')} severity, {round((i.get('cause_confidence') or 0)*100)}% conf)"
            for i in top_incidents[:3]
        ]
        reply = (
            f"• **{city.title()} Area Intelligence**:\n"
            f"• Current severity distribution: **{counts['High']} High**, **{counts['Medium']} Medium**, **{counts['Low']} Low** incidents.\n"
            f"• Top critical priorities:\n" + "\n".join(top_lines)
        )
        return reply, None

    # Priority / Dispatch action query
    if any(k in msg_lower for k in ["assign", "priority", "dispatch", "p1", "escalate"]):
        target_inc = inc if inc else (top_incidents[0] if top_incidents else None)
        target_id = target_inc.get("incident_id") if target_inc else "INCIDENT-001"
        action = {"type": "set_priority", "incident_id": target_id, "priority": "P1"}
        reply = (
            f"• Recommend escalating **{target_id}** to **P1 (Highest Priority)** based on severity drivers.\n"
            f"• ACTION required: Confirm P1 priority escalation."
        )
        return reply, action

    if "check next" in msg_lower and inc:
        reply = f"• **Check Next for {inc.get('incident_id')}**:\n• {inc.get('check_next') or 'Verify sensor health, cross-check citizen reports, and deploy patrol unit.'}"
        return reply, None

    if "why" in msg_lower and "confidence" in msg_lower and inc:
        reply = f"• **Confidence Calibration for {inc.get('incident_id')}**:\n• {inc.get('why_not_higher') or 'Confidence is bounded by conflicting or unverified single-modality sensors.'}"
        return reply, None

    if "hospital" in msg_lower and inc:
        nearest = _format_nearest_help(inc.get("nearest_infrastructure"))
        reply = f"• **Nearest Emergency Infrastructure for {inc.get('incident_id')}**:\n• {nearest}"
        return reply, None

    # Default fallback
    top_lines = [f"• **{i.get('incident_id')}**: {i.get('title')} ({i.get('severity_level')})" for i in top_incidents[:3]]
    reply = (
        f"AI is offline. Here's what I know about {city.title()}:\n"
        f"• Active incidents: {counts['High']} High, {counts['Medium']} Medium, {counts['Low']} Low\n" +
        "\n".join(top_lines)
    )
    return reply, None


@router.post("/copilot")
async def copilot_chat(req: CopilotRequest) -> Dict[str, Any]:
    city = (req.city or "mumbai").lower()

    # Find selected incident if ID provided
    inc: Optional[Dict[str, Any]] = None
    if req.incident_id:
        inc = _lookup_incident(req.incident_id)
        if inc and not req.city:
            city = (inc.get("city") or "mumbai").lower()

    # Get incidents for city
    city_incidents = STATE.get("incidents_by_city", {}).get(city, [])
    if not city_incidents and STATE.get("all_incidents"):
        city_incidents = [i for i in STATE["all_incidents"] if (i.get("city") or "").lower() == city]

    context_str, counts, top_incidents = _build_context(city, inc, city_incidents)
    suggestions = _generate_suggestions(inc, req.mode or "chat")

    groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
    groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()

    # Determine prompt text
    effective_message = req.message or ""
    if req.mode == "summarize_incident" and not effective_message:
        effective_message = "Summarize this incident, key drivers, and what to check next."
    elif req.mode == "summarize_area" and not effective_message:
        effective_message = "Summarize this area, active severity distribution, and top incidents."

    # If no key is configured, return fallback immediately
    if not groq_api_key:
        reply, action = _build_fallback_reply(req.mode or "chat", effective_message, city, inc, counts, top_incidents)
        return {
            "reply": reply,
            "action": action,
            "source": "fallback",
            "suggestions": suggestions,
        }

    system_prompt = (
        "You are UrbanFusion Copilot for city control-room operators in India. "
        "Answer ONLY from CONTEXT and HELPLINES. Max 5 short lines or bullets. "
        "Never invent incidents, numbers or phone numbers. If something is not in the context, say so. "
        "When asked to prioritize, assign or dispatch, give a one-line recommendation and end with an ACTION line.\n"
        "ACTION format (must be on its own last line):\n"
        "ACTION: {\"type\":\"set_priority\",\"incident_id\":\"...\",\"priority\":\"P1\"}\n"
        "or ACTION: {\"type\":\"set_status\",\"incident_id\":\"...\",\"status\":\"Dispatched\"}\n"
        "For 'assign this area highest priority', pick the highest-severity incident in the current city."
    )

    # Format history (last 6 messages)
    chat_history: List[Dict[str, str]] = []
    if req.history:
        for m in req.history[-6:]:
            role = m.get("role", "user")
            content = m.get("content", "")
            if role in ("user", "assistant") and content:
                chat_history.append({"role": role, "content": content})

    user_content = f"{context_str}\n\nOperator Question / Request:\n{effective_message}"

    messages = [
        {"role": "system", "content": system_prompt},
        *chat_history,
        {"role": "user", "content": user_content},
    ]

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {groq_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": groq_model,
                    "messages": messages,
                    "temperature": 0.3,
                    "max_tokens": 400,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                raw_text = data["choices"][0]["message"]["content"].strip()

                # Parse ACTION line
                action: Optional[Dict[str, Any]] = None
                action_match = re.search(r"ACTION:\s*(\{.*\})", raw_text, re.DOTALL)
                clean_reply = raw_text
                if action_match:
                    try:
                        action = json.loads(action_match.group(1).strip())
                    except Exception:
                        pass
                    # Strip the ACTION line from human reply
                    clean_reply = re.sub(r"ACTION:\s*\{.*\}", "", raw_text, flags=re.DOTALL).strip()

                # Fallback action check if user specifically asked to assign highest priority
                if any(k in effective_message.lower() for k in ["highest priority", "assign this area", "escalate area"]) and not action:
                    target_id = (top_incidents[0].get("incident_id") if top_incidents else (inc.get("incident_id") if inc else "INCIDENT-001"))
                    action = {"type": "set_priority", "incident_id": target_id, "priority": "P1"}

                return {
                    "reply": clean_reply,
                    "action": action,
                    "source": "groq",
                    "suggestions": suggestions,
                }
            else:
                logger.warning(f"Groq API error {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.warning(f"Groq request failed: {e}")

    # Fallback if Groq call failed or timed out
    reply, action = _build_fallback_reply(req.mode or "chat", effective_message, city, inc, counts, top_incidents)
    return {
        "reply": reply,
        "action": action,
        "source": "fallback",
        "suggestions": suggestions,
    }
