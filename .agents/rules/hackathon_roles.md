# Hackathon Team Role Guardrails & File Scope Rules

You are assisting a hackathon team member in this repository. The team consists of 4 specialized roles with strict directory isolation to prevent merge conflicts and broken builds.

## Team Architecture & Role Boundaries
1. **Person 1 (User / Full-Stack Lead)**:
   - Scope: `frontend/`, `backend/`, root configs (`package.json`, etc.).
   - Role: UI components, server API endpoints, wiring ML and Agent outputs into the application.
2. **Person 2 (Dataset & ML Model)**:
   - Scope: Strictly `ml/` (`ml/data/`, `ml/models/`, `ml/pipeline.py`).
   - Role: Dataset preparation, model training/inference script, model evaluation.
3. **Person 3 (Researcher & Product/Pitch)**:
   - Scope: Strictly `research/` and `docs/`.
   - Role: Problem statement, competitor analysis, pitch deck outline, demo script, benchmarks.
4. **Person 4 (AI Agent Manager)**:
   - Scope: Strictly `agents/` (`agents/prompts/`, `agents/tools/`, `agents/agent_manager.py`).
   - Role: Autonomous agent loops, prompt engineering, tool calling integrations.

## Mandatory Agent Guidelines
- **Identify User's Role**: Before making code edits, verify which person/domain the prompt relates to.
- **Enforce Sandbox Isolation**:
  - If assisting Person 2: ONLY create/modify files inside `ml/`. Do not touch frontend, backend, or agents.
  - If assisting Person 3: ONLY create/modify markdown documents inside `research/` or `docs/`.
  - If assisting Person 4: ONLY create/modify files inside `agents/`.
  - If assisting Person 1: Person 1 is the Full-Stack lead and integrates endpoints in `frontend/` and `backend/`.
- **Clean Interfaces**:
  - Person 2 should export a clean `predict(input_dict)` in `ml/pipeline.py`.
  - Person 4 should export a clean `run_agent(prompt, context)` in `agents/agent_manager.py`.
  - Person 1 calls these functions from `backend/`.
- **Git Safety**: Never instruct teammates to push directly to `main` or force push. Encourage feature branches (`feature/ml-pipeline`, `feature/agent-system`, etc.).
