# 🏆 Hackathon 4-Role Playbook & Step-by-Step Guides

Welcome to the team! This repository is organized into 4 specialized domains.  
Each team member has an isolated workspace and clear deliverables so everyone can work in parallel in **Antigravity** without stepping on each other's code.

---

## 👥 Role Summary Matrix

| Role | Domain | Assigned Folder | Primary Deliverable |
| :--- | :--- | :--- | :--- |
| **Person 1 (Lead)** | Frontend & Backend | `frontend/`, `backend/` | Full-stack app, REST/WebSocket APIs, UI, system integration |
| **Person 2** | Dataset & ML Model | `ml/` | Cleaned data, model weights/prompts, inference script/API |
| **Person 3** | Research & Pitch/Product | `research/`, `docs/` | Problem statement, competitive analysis, pitch deck, demo script |
| **Person 4** | AI Agent Manager | `agents/` | Agent definitions, tool routing, prompt chains, agent orchestration |

---

## 🧭 Person 1: Frontend & Backend Lead (Full-Stack Engineer)

> **Goal**: Build the user-facing application, expose endpoints for ML and Agents, and assemble everything into a demoable product.

### 📁 Your Domain
- `frontend/`: UI screens, layouts, client state, styling, user interactions.
- `backend/`: Server application (Express/FastAPI/Flask), database models, API routing.
- Root configuration files (`package.json`, environment configs).

### 🛠️ Key Tasks
1. **Set up the App Skeleton**: Provide a clean UI container and backend server.
2. **Define API Contracts**:
   - Create endpoints that call Person 2's ML model (e.g. `POST /api/ml/predict`).
   - Create endpoints that trigger Person 4's AI Agents (e.g. `POST /api/agents/run`).
3. **Connect the Pieces**: Import Person 2's model predictions and Person 4's agent responses to show on the UI.
4. **Git Responsibilities**: Review and merge Pull Requests from teammates into `main`.

### 💡 Antigravity Prompting Tip
> *"I am Person 1 (Full-stack lead). Build an endpoint in `backend/` that accepts a payload and passes it to the agent runner in `agents/agent_manager.py`."*

---

## 🧠 Person 2: Dataset & ML Model Engineer

> **Goal**: Prepare training/validation data, build or fine-tune models, and provide a single clean function/script that runs inference.

### 📁 Your Domain
- `ml/data/`: Datasets, raw data samples, CSV/JSON loaders.
- `ml/models/`: Model weights, checkpoints, tokenizer configs, pickled artifacts.
- `ml/pipeline.py`: Data preprocessing, feature engineering, and inference runner.

### 🛠️ Key Tasks
1. **Curate the Hackathon Dataset**: Store a clean sample dataset in `ml/data/sample_dataset.json`.
2. **Implement Inference**: Write a clean, self-contained Python function in `ml/pipeline.py`:
   ```python
   def predict(input_data: dict) -> dict:
       # Process input and return prediction
       return {"prediction": "...", "confidence": 0.95}
   ```
3. **Expose or Export**: Either export the model (ONNX, PyTorch, Scikit-learn) or provide a lightweight local FastAPI/Flask microservice for Person 1 to call.

### 🛡️ Safety Rule for Person 2
- **Stay inside `ml/`**: Never edit `frontend/` or `backend/`.
- Provide Person 1 with the exact input/output JSON schema for your model.

### 💡 Antigravity Prompting Tip
> *"I am Person 2 (ML engineer). Please write a clean data loader and inference script STRICTLY inside `ml/pipeline.py`. Use dummy/synthetic data if the model isn't finished yet."*

---

## 🔍 Person 3: Researcher & Product Strategist

> **Goal**: Define the problem statement, conduct competitor/domain research, design the live pitch deck, and script the winning demo.

*(Hackathons are won by the presentation and clear problem-solution fit just as much as the code!)*

### 📁 Your Domain
- `research/`: Market research, academic papers/summaries, competitor matrices, user persona.
- `research/PITCH_DECK_OUTLINE.md`: Slide-by-slide outline and speaker talking points.
- `research/DEMO_SCRIPT.md`: Second-by-second live demo workflow for the judges.
- `research/BENCHMARKS_AND_EVALS.md`: Qualitative and quantitative metrics showing your solution works.

### 🛠️ Key Tasks
1. **The Hook & Problem Statement**: Clarify why existing solutions fail and what gap your team fills.
2. **Draft the Pitch Deck**: Outline the 3-minute pitch (Problem ➔ Solution ➔ Tech Architecture ➔ Market Potential ➔ Team).
3. **Script the 90-Second Demo**: Work with Person 1 to define the exact sequence of clicks for the presentation.
4. **Supply Test Cases**: Provide realistic prompts, edge cases, and sample queries for Person 2 and Person 4.

### 🛡️ Safety Rule for Person 3
- Work entirely in markdown files inside `research/` and `docs/`.
- You don't need to touch any code files!

### 💡 Antigravity Prompting Tip
> *"I am Person 3 (Researcher). In `research/PITCH_DECK_OUTLINE.md`, draft a compelling 7-slide pitch deck structure for our hackathon project, focusing on the pain point and value proposition."*

---

## 🤖 Person 4: AI Agent Manager & Integrator

> **Goal**: Design system prompts, tool functions, agent orchestration, and guardrails for the autonomous agents.

### 📁 Your Domain
- `agents/prompts/`: System instructions, role definitions, few-shot examples.
- `agents/tools/`: Tool definitions, search tools, code execution wrappers, custom APIs.
- `agents/agent_manager.py`: The agent loop, multi-agent orchestration, and execution runner.

### 🛠️ Key Tasks
1. **Define Agent Personas & Prompts**: Write robust system prompts in `agents/prompts/system_prompts.md`.
2. **Implement Agent Tools**: Write callable python functions in `agents/tools/` that the agent can execute.
3. **Create the Agent Interface**:
   ```python
   def run_agent(task_prompt: str, context: dict = None) -> dict:
       # Agent decision loop / tool execution
       return {"response": "...", "steps_taken": [...]}
   ```
4. **Handoff to Person 1**: Ensure Person 1 can simply import `run_agent` in the backend API.

### 🛡️ Safety Rule for Person 4
- **Stay inside `agents/`**: Keep all agent logic isolated so updates to prompts or tools don't break the frontend or backend.

### 💡 Antigravity Prompting Tip
> *"I am Person 4 (Agent Manager). Help me implement a multi-step agent workflow in `agents/agent_manager.py` that parses a user query, selects a tool from `agents/tools/`, and returns structured JSON output."*

---

## 🚀 Git Cheatsheet for Team Members (Beginner-Friendly)

Each member creates their own branch:

```bash
# Person 1:
git checkout -b feature/fullstack-core

# Person 2:
git checkout -b feature/ml-pipeline

# Person 3:
git checkout -b feature/research-pitch

# Person 4:
git checkout -b feature/agent-system
```

### Making and Pushing Changes:
```bash
# 1. Stage only your assigned folder:
git add ml/             # (or research/ or agents/ or frontend/)

# 2. Commit:
git commit -m "feat: updated my module"

# 3. Push to your branch on GitHub:
git push -u origin HEAD

# 4. Go to https://github.com/saik-99/rgit and open a Pull Request!
```
