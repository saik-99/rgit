"""
Human-readable explanation generator for municipal operators.
Generates structured narratives detailing:
- Inferred root-cause hypothesis and confidence
- Supporting evidence signals
- Conflicting reports
- Missing data modalities
- Concrete operational recommendations
"""

from typing import Tuple, List, Dict, Optional, Any
from .models import NormalizedEvent, IncidentReport


def generate_operator_briefing(
    cause_label: str,
    confidence: float,
    severity_level: str,
    priority: str,
    events: List[NormalizedEvent],
    supporting_count: int,
    conflicting_count: int,
    missing_modalities: List[str],
    verification_required: bool,
    ranking: List[Dict[str, Any]],
    location_name: str = "Affected Urban Sector"
) -> Tuple[str, List[str]]:
    """
    Returns (explanation_text, list_of_recommended_actions).
    """
    non_dups = [e for e in events if not e.is_duplicate]
    source_types = sorted(list(set(e.source_type for e in non_dups)))

    conf_desc = (
        "High Confidence" if confidence >= 0.85
        else "Moderate Confidence" if confidence >= 0.65
        else "Low Confidence (Preliminary)" if confidence >= 0.40
        else "Very Low Confidence"
    )

    lines = [
        f"### 🚨 Operational Intelligence Briefing — {cause_label}",
        f"**Severity**: {severity_level.upper()} | **Priority**: {priority} | **Confidence**: {conf_desc} ({confidence:.0%})",
        "",
        f"The fusion engine correlated **{len(non_dups)} signals** from {len(source_types)} independent modalities "
        f"({', '.join(source_types)}) near **{location_name}**.",
        "",
        f"**Primary Hypothesis**: {cause_label} (P = {confidence:.0%})."
    ]

    # Supporting Evidence Summary
    supporting_events = [e for e in non_dups if e.trust >= 0.50]
    lines.append(f"\n✅ **Supporting Evidence ({supporting_count} signals)**:")
    for e in supporting_events[:4]:
        val_str = ""
        val = e.payload.get("value")
        unit = e.payload.get("unit", "")
        if val is not None:
            val_str = f" [reading: {val} {unit}]"
        lines.append(f"- **{e.source_type.title()}** ({e.device_id}){val_str}: {e.payload.get('description') or e.payload.get('text', 'Signal active')}")

    # Conflicting Evidence Warning
    conflicting_events = [e for e in non_dups if any(w in (e.payload.get('text') or e.payload.get('description') or '').lower() for w in ['no issue', 'clear', 'no problem', 'all dry', 'normal'])]
    if conflicting_events:
        lines.append(f"\n⚠️ **Contradictory Reports ({len(conflicting_events)} signals detected)**:")
        for c in conflicting_events:
            lines.append(f"- Source {c.device_id} ({c.source_type}): \"{c.payload.get('text') or c.payload.get('description')}\" — Confidence penalized by {len(conflicting_events)*12}%.")
        lines.append("  *Note*: Contradictions do not discard physical sensor warnings.")

    # Missing Modalities & Data Completeness
    if missing_modalities:
        lines.append(f"\n❓ **Missing Information ({len(missing_modalities)} dimensions)**:")
        for m in missing_modalities:
            lines.append(f"- Missing {m.replace('_', ' ')}: consider deploying mobile sensors or dispatching reconnaissance.")

    if verification_required:
        lines.append("\n🛡️ **Operational Guardrail**: Verification Required. Potential high hazard detected with incomplete sensor corroboration. Do not close ticket without field confirmation.")

    # Alternative Hypotheses
    if len(ranking) > 1:
        alt = ranking[1]
        lines.append(f"\n🔄 **Alternative Explanation**: {alt['label']} ({alt['probability']:.0%} probability).")

    # Actionable Recommendations
    actions = []
    if "drainage" in cause_label.lower():
        actions.append("Dispatch Municipal Stormwater & Drainage pumping crews.")
        actions.append("Issue automated advisory to Transit AVL to reroute buses away from underpasses.")
        actions.append("Monitor upstream sluice gates and adjacent nallah level sensors.")
    elif "accident" in cause_label.lower() or "collision" in cause_label.lower():
        actions.append("Alert Emergency CAD (108/911) for paramedic dispatch.")
        actions.append("Activate digital message signs on approaching highway corridor.")
        actions.append("Deploy traffic police towing unit for lane clearance.")
    elif "power" in cause_label.lower():
        actions.append("Notify Electrical Utility Grid Operations of suspected substation trip.")
        actions.append("Deploy backup power generators to nearest public hospital infrastructure.")
    else:
        actions.append("Dispatch field verification team to confirm conditions.")
        actions.append("Maintain active monitoring of live sensor feeds.")

    lines.append("\n📋 **Recommended Operator Actions**:")
    for a in actions:
        lines.append(f"- {a}")

    return "\n".join(lines), actions
