"""
Social Media Agent (Person 4)

Reads social media posts, keeps only real incident reports, turns them into
city events, groups them by place, and hands each group to the Incident Agent.

    from agents import run_social_agent
    out = run_social_agent()                       # demo: sample posts, no keys
    out = run_social_agent(posts=my_posts)          # posts from Person 1/2
    out = run_social_agent(query="#MumbaiRains", use_live=True)   # needs X_BEARER_TOKEN

Demo:  python -m agents.social_agent
"""

from __future__ import annotations

import json
import sys

from agents.agent_manager import analyze_incident
from agents.tools import social_tools as st


def run_social_agent(posts: list[dict] | None = None, query: str | None = None,
                     use_live: bool = False, use_llm: bool = True,
                     analyze: bool = True) -> dict:
    steps = []

    # 1. Get posts
    source = "given list"
    if posts is None:
        if use_live and query:
            try:
                posts, source = st.fetch_x_posts(query), "X API (live)"
            except Exception as e:  # no token, no credits, no internet
                steps.append({"step": 1, "tool": "fetch_x_posts",
                              "summary": f"live fetch failed ({e}); using sample posts"})
                posts, source = st.load_posts(), "sample file"
        else:
            posts, source = st.load_posts(), "sample file"
    steps.append({"step": len(steps) + 1, "tool": "load_posts",
                  "summary": f"{len(posts)} posts from {source}"})

    # 2. Extract place + incident type from each post (LLM first, rules as backup)
    events, skipped, llm_count = [], [], 0
    for p in posts:
        found = (st.extract_llm(p.get("text", "")) if use_llm else {}) or \
            st.extract_rules(p.get("text", ""))
        if found.get("method") == "llm":
            llm_count += 1
        if not found:
            skipped.append({"post_id": p.get("post_id"), "reason": "no Mumbai place or incident"})
            continue
        # arrival time = when the platform delivered it (if known), else post time
        received = p.get("received_at") or p.get("created_at") or st.now_iso()
        events.append(st.post_to_event(p, found, received))
    steps.append({"step": len(steps) + 1, "tool": "extract_incidents",
                  "summary": f"{len(events)} incident posts, {len(skipped)} ignored, "
                             f"{llm_count} via Gemini"})

    # 3. Group by place
    groups: dict[str, list] = {}
    for ev in events:
        groups.setdefault(ev["location"]["neighborhood"], []).append(ev)
    steps.append({"step": len(steps) + 1, "tool": "group_by_place",
                  "summary": ", ".join(f"{k} ({len(v)})" for k, v in groups.items())})

    # 4. Analyse each place with the Incident Agent
    incidents = []
    if analyze:
        for place, evs in groups.items():
            res = analyze_incident({"incident_id": f"SOC-{place.upper().replace(' ', '-')}",
                                    "events": evs}, use_llm=use_llm)
            incidents.append(res)
        incidents.sort(key=lambda r: r.get("confidence", 0), reverse=True)
        steps.append({"step": len(steps) + 1, "tool": "analyze_incident",
                      "summary": f"{len(incidents)} incident(s) analysed"})

    return {"events": events, "skipped": skipped, "incidents": incidents,
            "steps_taken": steps}


def _demo():
    out = run_social_agent(use_llm="--llm" in sys.argv)
    if "--json" in sys.argv:
        print(json.dumps(out, indent=2))
        return
    print("=== SOCIAL MEDIA AGENT ===")
    for s in out["steps_taken"]:
        print(f"  {s['step']}. {s['tool']:<18} {s['summary']}")
    for inc in out["incidents"]:
        print(f"\n[{inc['incident_id']}] {inc['root_cause']} - "
              f"{round(inc['confidence'] * 100)}% - {inc['severity']}")
        print("  " + inc["briefing"])


if __name__ == "__main__":
    _demo()
