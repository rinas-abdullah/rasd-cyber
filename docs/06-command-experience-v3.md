# RASD Command Experience — V3

## Scope delivered

This update is applied to the **existing** platform, retaining its Express routes, orchestrator, deterministic world, AI governance, assessments, verification, and readiness scoring. It introduces an original premium Command Center interface inspired by contemporary 21st.dev design patterns, not copied code/assets.

### Functional additions

- Premium responsive command-shell, animated scanning radar, navigation, metric strip, improved cards, and bilingual direction-aware content.
- Keyboard navigation palette: `/` or `Ctrl/Cmd+K`, Escape to close.
- Session archive: `GET /api/ai/sessions` returns only learner-owned, institution-scoped summaries from sessionStore (including PostgreSQL-backed sessions).
- Load a previously saved session via authenticated `GET /api/ai/sessions/:id`. The browser stores only the session identifier; the real state comes from the backend.
- Pause/resume via existing `POST /api/ai/sessions/:id/pause` and `/resume`, respecting the orchestrator's state machine.
- Honest runtime indicators: dynamic session count, session state, actual computed evaluation score, and AI mode. No fake analytics figures.
- Reduced motion preference and mobile layout adaptation.

### Verification performed

- `npm test`: 38/38 passing on this copy at build time.
- `npm run build`: success.
- HTTP: `/ai-command`, `/css/command-premium.css`, `/js/components/commandExperience.js` returned 200.
- HTTP: demo account login succeeded; authenticated empty archive returned 200, unauthenticated archive returned 401.

### Constraints / next production requirements

- This is a substantial **Command Center vertical slice**, not a redesign of every legacy page. Other pages retain their existing design.
- Production durability requires PostgreSQL and the existing migration; the in-memory development database is not persistent across server restart.
- This release does not claim live LLM calls or real-world threat telemetry. Dev AI mode remains explicitly marked.
- Identity service hardening, organization administration, accessibility audits, deployment secrets, observability and production load testing remain to be addressed before accepting institutional users.

## Run

`npm install` (source-only archive), then `JWT_SECRET=your-long-secret SEED_DEMO_USERS=true npm start` in a local development environment. Open `http://localhost:3001/ai-command`. Do not enable demo users in a public production deployment.
