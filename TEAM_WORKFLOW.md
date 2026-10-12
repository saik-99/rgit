# 🛡️ Hackathon Team Workflow & Safe Contribution Guide

This guide ensures all 4 team members can work simultaneously in **Antigravity** without creating merge conflicts, breaking the build, or overwriting each other's work.

---

## 🎯 The Strategy: "Sandbox Isolation"

During a hackathon, merge conflicts waste precious hours. To avoid them:
- **Each beginner is given a dedicated folder ("sandbox")**:
  - Beginner 1 works **only** in `src/features/feature-alpha/`
  - Beginner 2 works **only** in `src/features/feature-beta/`
- **Pros handle integration**:
  - Pro 1 & Pro 2 create the shell, routing, and shared components.
  - When a beginner finishes their feature component, Pro 1 or Pro 2 imports it into the main app.
- **Nobody pushes directly to `main`**:
  - Everyone works on their own branch and opens a Pull Request (PR).

---

## 🤖 Antigravity AI Prompting Rules for Beginners

Since you are using **Antigravity**, the AI agent can accidentally edit files across the whole project if you don't constrain it.

### ✅ What Beginners should prompt Antigravity:
> *"I am working ONLY on Feature Alpha. Please create and modify files STRICTLY inside `src/features/feature-alpha/`. Do NOT modify any root files, `package.json`, or other feature folders."*

### ❌ What Beginners should NEVER say:
> *"Fix the entire app so my feature works"* (This causes Antigravity to rewrite root files, breaking everyone else's work).

---

## 💻 Beginner Git Cheatsheet (Step-by-Step)

### Step 1: Create and switch to your feature branch
Before writing any code, open the terminal in Antigravity (`Ctrl + \``) and run:

```bash
# For Beginner 1:
git checkout -b feature/alpha

# For Beginner 2:
git checkout -b feature/beta
```

### Step 2: Work on your files
- Create your UI, logic, components, and assets **only** inside your assigned directory:
  - `src/features/feature-alpha/` OR `src/features/feature-beta/`

### Step 3: Check what files you touched before saving
Run:
```bash
git status
```
> 🔍 **Safety Check:** If you see any files outside your folder (like `package.json`, `index.html`, etc.), ask your team leads (Pro 1 or Pro 2) before committing!

### Step 4: Commit your changes
```bash
git add src/features/feature-alpha/
git commit -m "feat(alpha): add core UI and interactions"
```

### Step 5: Push to GitHub
```bash
# Push your branch (NEVER push to main)
git push -u origin HEAD
```

### Step 6: Open a Pull Request (PR) on GitHub
1. Go to the repository on GitHub.
2. You will see a yellow banner: **"feature/... had recent pushes"** -> Click **"Compare & pull request"**.
3. Set base to `main` and compare to your branch.
4. Add Pro 1 or Pro 2 as a Reviewer.
5. Click **"Create pull request"**.

---

## 🔄 How to Get Latest Updates from Teammates

When Pro 1 or Pro 2 updates `main`, beginners can safely update their branch:

```bash
# 1. Commit or stash any pending work
git add .
git commit -m "wip: save progress"

# 2. Pull the latest main into your feature branch
git pull origin main
```
If Git reports a conflict inside your feature folder, ask your team lead or prompt Antigravity:
> *"Help me resolve this merge conflict inside my feature folder `src/features/feature-alpha/`."*

---

## 👑 Pro 1 & Pro 2 Integration Protocol

1. **Review incoming PRs**:
   - Check the **"Files changed"** tab on GitHub.
   - Confirm the beginner did **not** touch other folders or core configs.
2. **Import Beginner Features**:
   - In `src/core/router.js` or `App.jsx`, import the completed component:
     ```javascript
     import { FeatureAlpha } from '../features/feature-alpha';
     import { FeatureBeta } from '../features/feature-beta';
     ```
3. **Merge**:
   - Use **"Squash and merge"** on GitHub to keep Git history clean.
