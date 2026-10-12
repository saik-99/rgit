"""
Repo contract entry point (see .agents/rules/hackathon_roles.md):
    from agents.incident_agent import analyze_incident

Run a demo on the team's synthetic stream:
    python -m agents.incident_agent
"""
import json
import os
import sys

from agents.agent_manager import analyze_incident, run_agent  # noqa: F401


def _demo():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, "data_and_ml", "datasets", "synthetic_city_stream.json")
    with open(path, encoding="utf-8") as f:
        events = json.load(f)
    result = analyze_incident({"incident_id": "INC-DEMO-1", "events": events})
    if "--json" in sys.argv:
        print(json.dumps(result, indent=2))
        return
    print("\n=== OPERATOR BRIEFING ===\n" + result["briefing"])
    print(f"\nRoot cause : {result['root_cause']}")
    print(f"Confidence : {round(result['confidence'] * 100)}% ({result['confidence_label']})")
    print(f"Severity   : {result['severity']}")
    print("\nSteps taken:")
    for s in result["steps_taken"]:
        print(f"  {s['step']:>2}. {s['tool']:<20} {s['summary']}")


if __name__ == "__main__":
    _demo()
