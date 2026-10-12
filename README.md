# 🚀 Hackathon Project Template

Welcome to the team repository! This project is organized for a 4-person hackathon team using **Antigravity**.

---

## 👥 Team Roles & Ownership Matrix

| Role | Member Name / GitHub Handle | Assigned Sandbox Directory | Responsibilities |
| :--- | :--- | :--- | :--- |
| **Pro 1: Lead Architect / Integrator** | `@lead_architect` | `src/core/`, Root configs | App setup, routing, state/APIs, code reviews, merging PRs |
| **Pro 2: Frontend & UI Lead** | `@ui_lead` | `src/components/common/`, `src/styles/` | Design system, global styling, layout integration |
| **Beginner 1: Feature Alpha** | `@beginner_1` | `src/features/feature-alpha/` | Dedicated feature screen/module A |
| **Beginner 2: Feature Beta** | `@beginner_2` | `src/features/feature-beta/` | Dedicated feature screen/module B |

> ⚠️ **Golden Rule for Hackathon Success:**  
> Beginners modify **ONLY** files inside their assigned `src/features/...` folder.  
> Never edit root files (`package.json`, global router, configs) without Pro 1 or Pro 2 approval!

---

## 📁 Repository Structure

```text
├── .agents/
│   └── rules/
│       └── hackathon_roles.md     # Antigravity AI rule: keeps agents inside assigned folders
├── .github/
│   ├── CODEOWNERS                 # Auto-assigns reviewers on PRs
│   └── pull_request_template.md   # Checklists for safe merging
├── src/
│   ├── core/                      # [Pro 1] API clients, state management, router setup
│   ├── components/common/         # [Pro 2] Shared buttons, cards, headers, styling
│   └── features/
│       ├── feature-alpha/         # [Beginner 1] Isolated feature sandbox
│       └── feature-beta/          # [Beginner 2] Isolated feature sandbox
├── docs/                          # Pitch notes, demo scripts, architecture diagrams
├── TEAM_WORKFLOW.md               # Quick Git & Antigravity cheatsheet for the team
└── README.md
```

---

## ⚡ Quick Start for Team Members

1. **Clone the repo:**
   ```bash
   git clone <REPO_URL>
   cd <REPO_NAME>
   ```
2. **Read the workflow:** Open [TEAM_WORKFLOW.md](TEAM_WORKFLOW.md) for step-by-step instructions on making changes and opening Pull Requests without merge conflicts.
