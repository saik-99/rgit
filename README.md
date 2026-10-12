# 🚀 Hackathon Project

A collaborative AI-powered hackathon project built by a 4-person team using **Antigravity**.

---

## 👥 The 4-Person Team Roles

| Role | Member | Focus Area | Directory Scope |
| :--- | :--- | :--- | :--- |
| **Person 1** | @saik-99 (Lead) | **Frontend & Backend** | `frontend/`, `backend/`, Root integration |
| **Person 2** | Teammate 2 | **Dataset & ML Model** | `ml/` (data, models, inference) |
| **Person 3** | Teammate 3 | **Researcher & Pitch/Product** | `research/`, `docs/` |
| **Person 4** | Teammate 4 | **Managing & Integrating AI Agents** | `agents/` (prompts, tools, loops) |

👉 **Read the comprehensive step-by-step role guides:** [ROLE_GUIDE.md](ROLE_GUIDE.md)  
👉 **Read Git & Antigravity contribution workflow:** [TEAM_WORKFLOW.md](TEAM_WORKFLOW.md)

---

## 📁 Repository Structure

```text
├── .agents/
│   └── rules/
│       └── hackathon_roles.md   # Antigravity AI guardrail rule
├── .github/
│   ├── CODEOWNERS               # Auto-assigns reviewers per domain
│   └── pull_request_template.md # PR pre-merge checklist
├── frontend/                    # [Person 1] Web UI application
├── backend/                     # [Person 1] API server & DB connections
├── ml/                          # [Person 2] Machine learning & datasets
│   ├── data/                    # Raw & preprocessed datasets
│   ├── models/                  # Model weights / artifacts
│   └── pipeline.py              # Clean predict() inference runner
├── research/                    # [Person 3] Market research, pitch deck, demo script
│   ├── PITCH_DECK_OUTLINE.md
│   ├── DEMO_SCRIPT.md
│   └── BENCHMARKS_AND_EVALS.md
├── agents/                      # [Person 4] AI Agents management & workflows
│   ├── prompts/                 # System prompts & few-shot instructions
│   ├── tools/                   # Agent tool functions
│   └── agent_manager.py         # Agent orchestrator loop
├── ROLE_GUIDE.md                # Detailed guide for each member
├── TEAM_WORKFLOW.md             # Git cheatsheet & safety protocol
└── README.md
```

---

## ⚡ Quick Start for Team Members

1. **Clone the repository:**
   ```bash
   git clone https://github.com/saik-99/rgit.git
   cd rgit
   ```
2. **Switch to your assigned branch:**
   - Person 1: `git checkout -b feature/fullstack`
   - Person 2: `git checkout -b feature/ml-pipeline`
   - Person 3: `git checkout -b feature/research-pitch`
   - Person 4: `git checkout -b feature/ai-agents`
3. **Open the repository in Antigravity IDE.** Antigravity will automatically adhere to the guardrails configured in `.agents/rules/hackathon_roles.md`.
