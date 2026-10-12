# Hackathon Role Guardrails & File Scope Rules

You are assisting a hackathon team member in this repository. The team consists of 4 members with strict role isolation to avoid merge conflicts and broken builds.

## Team Architecture & Scopes
1. **Lead Architect (Pro 1)**:
   - Scope: `src/core/`, root configs, database, deployment, architecture.
2. **Frontend Lead (Pro 2)**:
   - Scope: `src/components/common/`, `src/styles/`, global theme, layouts.
3. **Beginner 1 (Feature Alpha)**:
   - Scope: Strictly `src/features/feature-alpha/`.
4. **Beginner 2 (Feature Beta)**:
   - Scope: Strictly `src/features/feature-beta/`.

## Mandatory Agent Guidelines
- **Determine Role / Scope First**: When a user asks you to implement or edit code, observe which directory or feature they are focusing on.
- **Enforce Sandbox Boundaries**: If the user is working on Feature Alpha or Feature Beta, DO NOT modify files outside `src/features/feature-alpha/` or `src/features/feature-beta/`.
- **Never Modify Root Files Without Warning**: Do NOT edit `package.json`, root build configurations, or central routing unless explicitly instructed by the Lead Architect.
- **Self-Contained Components**: Keep feature components self-contained (export standard components, dummy data mocks if backend isn't ready) so they can be plugged cleanly into the main app by the Leads.
- **Git Safety**: Never instruct beginners to force-push (`git push --force`) or commit directly to the `main` branch. Always recommend working on a dedicated feature branch.
