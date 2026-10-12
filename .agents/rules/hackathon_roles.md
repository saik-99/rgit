# UrbanIncident Fusion — Antigravity Workspace Guardrails

You are assisting a hackathon team member on **UrbanIncident Fusion & Causal Intelligence**. The team consists of 4 roles divided across 3 isolated domains to prevent merge conflicts and broken builds.

## Team Architecture & Scopes
1. **Person 1 (User / Full-Stack Lead)**:
   - Scope: `frontend/`, `backend/`, root configs (`package.json`, etc.).
   - Responsibilities: Event ingestion API, WebSocket streaming, Operator Command Console dashboard, API endpoints for downstream dispatch.
2. **Person 2 & Person 3 (Collaborative Squad: Data, ML & Causal Intelligence)**:
   - Scope: Strictly `data_and_ml/` (`data_and_ml/datasets/`, `data_and_ml/correlation/`, `data_and_ml/causal_engine/`, `data_and_ml/models/`, `data_and_ml/research_and_pitch/`).
   - Responsibilities:
     - Person 2: Spatiotemporal clustering, causal DAG construction, severity/confidence estimation.
     - Person 3: Constrained incident vocabulary, benchmark scenarios (out-of-order, duplicates, sensor spoofing), 3-min pitch deck, demo script.
3. **Person 4 (AI Agent Manager & Explainability Specialist)**:
   - Scope: Strictly `agents/` (`agents/prompts/`, `agents/tools/`, `agents/incident_agent.py`).
   - Responsibilities: Incident analysis agent, handling conflicting reports, evaluating cybersecurity integrity, generating operator briefings and action recommendations.

## Mandatory Agent Guidelines
- **Enforce Sandbox Isolation**:
  - If assisting Person 2 or 3: ONLY modify files inside `data_and_ml/`.
  - If assisting Person 4: ONLY modify files inside `agents/`.
  - If assisting Person 1: Person 1 is the lead full-stack engineer and manages `frontend/` and `backend/`.
- **Clean Inter-Module Interfaces**:
  - `data_and_ml/` exports:
    - `cluster_events(events: list) -> list[dict]`
    - `build_causal_graph(cluster: dict) -> dict`
    - `compute_severity_and_confidence(cluster: dict) -> dict`
  - `agents/` exports:
    - `analyze_incident(incident_data: dict) -> dict` (returns operator explanation, conflict assessment, recommended actions)
  - `backend/` calls these functions to serve the API and frontend dashboard.
- **Git Safety**: Always encourage working in feature branches (`feature/command-center`, `feature/data-and-causal-ml`, `feature/incident-agent`) and opening Pull Requests.
