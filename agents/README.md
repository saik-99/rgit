# 🤖 AI Agent Management & Integration
**Assigned Owner**: Person 4

---

## 🎯 Role & Project Scope: UrbanIncident Fusion
Your job is to manage, design, and integrate the autonomous AI Agents that reason over the evolving incident graph and provide operator-ready intelligence.

### Key Requirements
1. **System Prompts & Personas**: Define instructions for incident reasoning, conflict analysis, and evidence evaluation.
2. **Conflict Resolution**: Reason through contradictions (e.g. citizen reports "clear road" while IoT sensors and camera detect inundation).
3. **Operator Briefing Generation**: Generate natural-language, confidence-aware operational summaries explaining:
   - What is happening (inferred root cause).
   - How confident the system is and why uncertainty exists.
   - What action should be taken next (e.g., dispatch public works crew).
4. **Handoff**: Provide a clean function or API for Person 1 to call from the backend.

---

## ✅ Implemented (feature/incident-agent)

**Rule: tools decide, LLM only explains.** Cause, confidence, severity and actions come from deterministic Python tools. Gemini (optional) only rewrites the facts as a briefing, and its output is rejected if it changes the confidence number.

### How Person 1 calls it
```python
from agents import analyze_incident, run_agent

result = analyze_incident({"incident_id": "INC-1", "events": events})
result["briefing"]            # operator text
result["root_cause"], result["confidence"], result["severity"]
result["conflicts"], result["integrity_flags"], result["recommended_actions"]
result["steps_taken"]         # audit trail of every tool call

out = run_agent("Explain INC-1", {"incident": {"events": events}})
out["response"], out["steps_taken"]
```
Also accepts `{"causal_graph": {"nodes": [...]}}`, plus optional `confidence` / `severity` from the ML engine (the agent blends them as a cross-check).

### Files
| File | What it does |
| --- | --- |
| `agent_manager.py` | Orchestrator: runs tools in order, records steps, writes briefing |
| `incident_agent.py` | Repo-contract entry + demo (`python -m agents.incident_agent`) |
| `tools/graph_tools.py` | 9 tools: dedupe, reorder, rank causes, conflicts, integrity, silent sensors, confidence, severity, actions |
| `prompts/system_prompts.md` | Gemini system prompt + few-shot example |
| `tests/test_incident_agent.py` | 3 README demo scenarios + interface tests |

### Run
```bash
python -m agents.incident_agent          # demo on synthetic stream
python -m unittest discover -s agents/tests -t .
```
No extra packages needed. Optional Gemini: `pip install google-genai` and set `GEMINI_API_KEY` (model via `GEMINI_MODEL`, default `gemini-2.5-flash`).

---

## 📱 Social Media Agent (v2)

Turns posts (X/Twitter etc.) into city events in the same format as the synthetic stream, groups them by Mumbai locality, and runs the incident agent on each group.

```python
from agents import run_social_agent
out = run_social_agent()                                   # sample posts, no keys
out = run_social_agent(posts=my_posts)                     # posts you supply
out = run_social_agent(query="#MumbaiRains", use_live=True)  # live X, needs X_BEARER_TOKEN
out["events"], out["incidents"], out["skipped"], out["steps_taken"]
```

| Piece | No key (default) | Optional key |
| --- | --- | --- |
| Posts | `agents/data/sample_mumbai_posts.json` (synthetic, demo handles) | `X_BEARER_TOKEN` - X API is paid pay-per-use |
| Extraction | Keyword rules + list of ~20 Mumbai localities | `GEMINI_API_KEY` - output accepted only if place/signal are from our fixed lists |

Official accounts get trust 0.9 and `integrity_verified=true`; citizens get 0.6. "Roads clear" posts become `ConflictingReport`.

Demo: `python -m agents.social_agent`
