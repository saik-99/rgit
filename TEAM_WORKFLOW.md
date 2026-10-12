# 🛡️ UrbanIncident Fusion — Team Workflow & Safe Contribution Guide

This guide ensures all 4 team members can work simultaneously in **Antigravity** on **UrbanIncident Fusion & Causal Intelligence** without creating merge conflicts, breaking the build, or overwriting each other's work.

---

## 🎯 The Strategy: "Domain Isolation"

- **Person 1 (Lead Full-Stack)** works in `frontend/` & `backend/`.
- **Person 2 & 3 (Data, ML & Research Squad)** collaborate in `data_and_ml/`.
- **Person 4 (AI Agent Manager)** works in `agents/`.
- **Nobody pushes directly to `main`**: Everyone works on their own feature branch and opens a Pull Request (PR).

---

## 💻 Git Branch Setup for Each Member

When you start working, open your terminal in Antigravity (`Ctrl + \``) and create your branch:

```bash
# Person 1 (Lead Full-Stack):
git checkout -b feature/command-center

# Person 2 & 3 (Data, ML & Research Squad):
git checkout -b feature/data-and-causal-ml

# Person 4 (AI Agent Manager):
git checkout -b feature/incident-agent
```

---

## 🤖 Antigravity AI Prompting Guide

Since your team is using **Antigravity**, always tell the AI your role and folder boundary so it doesn't touch other domains:

- **Person 1**:  
  > *"I am Person 1 (Full-stack lead). Work strictly inside `frontend/` and `backend/`."*
- **Person 2 & 3**:  
  > *"We are Person 2 & 3 working on data, ML, and research. Work strictly inside `data_and_ml/`."*
- **Person 4**:  
  > *"I am Person 4 (AI Agent Manager). Work strictly inside `agents/`."*

---

## 🚀 Committing and Pushing Safely

```bash
# 1. Stage only your assigned folder:
git add frontend/ backend/       # (Person 1)
# OR
git add data_and_ml/            # (Person 2 & 3)
# OR
git add agents/                 # (Person 4)

# 2. Commit your progress:
git commit -m "feat: update my module"

# 3. Push to your branch on GitHub:
git push -u origin HEAD

# 4. Open a Pull Request on GitHub:
# Go to https://github.com/saik-99/rgit and click "Compare & pull request".
# Person 1 will review and merge it into main.
```

---

## 🔄 Getting the Latest Updates from Teammates

```bash
# Pull latest main into your feature branch safely:
git pull origin main
```
