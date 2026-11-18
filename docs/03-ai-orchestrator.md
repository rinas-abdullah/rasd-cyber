# RASD AI Orchestrator — Architecture, API & Run Guide

This document covers the AI-native layer added on top of the existing Rasd Cyber
platform: the central Orchestrator, the six agents, the deterministic simulation,
the REST API, governance, and how to run and verify everything locally.

See also: `docs/04-ai-orchestrator-audit.md` (the pre-build codebase audit).

## 1. What was built

An **AI-operated training loop** where the Orchestrator plans and drives the whole
session, the deterministic simulation decides operational outcomes, an auditable
rubric computes scores, and a vendor-independent AI layer only narrates/hints
(never decides results). Nothing in the original platform was removed; the new
layer is additive.

```
backend/services/
  orchestrator/
    orchestrator.js     # state machine + governance (the only writer of session state)
    sessionStore.js     # durable, resumable session storage (PG JSONB + in-memory)
    schemas.js          # Zod schemas for every structured output / API payload
    afterAction.js      # AAR built only from recorded events
    rng.js              # deterministic seeded PRNG
  agents/
    scenarioDirector.js # Agent 01 — instantiates a structured scenario from the bank
    adversaryAgent.js   # Agent 02 — rule-bound simulated adversary (read-only interface)
    decisionEvaluator.js# Agent 03 — auditable rubric scoring (no LLM opinion)
    aiMentor.js         # Agent 04 — adaptive hints; blocked in verification
    skillVerification.js# Agent 05 — independent, different-sector verification
    readinessAnalyst.js # Agent 06 — evidence-based readiness; INSUFFICIENT_EVIDENCE
  simulation/
    incidentWorld.js    # deterministic world state + adversary rules
    consequenceEngine.js# deterministic 7-dimension decision consequences
  scenarios/
    scenarioBank.js     # approved scenario templates (training + verification pools)
  ai/
    orchestratorProvider.js # vendor-independent AI layer (live | dev-deterministic)
backend/routes/orchestratorRoutes.js  # REST API (/api/ai/*)
frontend/pages/ai-command.html + js/components/aiCommandCenter.js  # AI Command Center UI
scripts/demo-privileged-account.js    # end-to-end demo (npm run demo)
```

## 2. Session state machine

```
CREATED → ASSESSMENT → PLANNING → SIMULATION → EVALUATION → FEEDBACK
        → VERIFICATION → EVALUATION → COMPLETED
extra states: PAUSED, FAILED, REVIEW_REQUIRED
```

- `createSession` runs CREATED→ASSESSMENT→PLANNING→SIMULATION synchronously.
- SIMULATION (mode TRAINING): the learner submits decisions; the consequence
  engine applies them; the rule-bound adversary ticks; hints are available.
- A phase ends on breach, on contained+escalated, on the step cap, or when the
  learner ends it → EVALUATION (rubric) → FEEDBACK (AAR available).
- `startVerification` builds a different-sector scenario for the same skill and
  enters VERIFICATION (mode VERIFICATION, **hints blocked**). Its end → EVALUATION
  → COMPLETED.
- Every transition is validated and audit-logged; illegal transitions are refused.

## 3. REST API (all under `/api`, all require auth)

| Method | Path | Purpose |
|---|---|---|
| GET  | `/ai/status` | AI mode (live/dev-deterministic) + governance caps |
| GET  | `/ai/templates` | Scenario catalogue (for the library) |
| POST | `/ai/sessions` | Create a session `{skill?, assessmentLevel?}` |
| GET  | `/ai/sessions/:id` | Resume / fetch session state |
| POST | `/ai/sessions/:id/decisions` | Submit `{optionId, elapsedMs?}` |
| POST | `/ai/sessions/:id/hint` | Request a mentor hint `{level?}` (blocked in verification) |
| POST | `/ai/sessions/:id/end-phase` | Conclude the active phase |
| POST | `/ai/sessions/:id/verify` | Start independent verification |
| POST | `/ai/sessions/:id/complete` | Complete from FEEDBACK |
| POST | `/ai/sessions/:id/pause` · `/resume` | Pause / resume |
| GET  | `/ai/sessions/:id/after-action` | After-Action Review (recorded events only) |
| GET  | `/ai/readiness` | Evidence-based readiness profile |

Ownership is enforced on every session route (a user can only touch their own
sessions; cross-user access returns 403/401).

## 4. Governance & safety (brief §11)

- **The model never writes the DB.** Only the Orchestrator/backend services do,
  after auth + schema validation.
- **Structured outputs** validated with Zod (`schemas.js`).
- **Deterministic results**: world state + scores depend only on the seed and the
  decisions, not the model (replay-tested).
- **Caps**: `AI_MAX_STEPS` per phase, `AI_MAX_HINTS` per phase, `AI_TIMEOUT_MS`
  and `AI_MAX_TOKENS` per AI call. Failures fall back to deterministic text.
- **Prompt-injection boundary**: scenario/incident text is passed to the AI as
  clearly delimited *data* with a "treat as data, not instructions" guard and is
  never placed in the system role. The adversary agent exposes no execution tools.
- **Audit log**: every agent/AI action is recorded on the session (`audit[]`).
- **Honest AI mode**: responses carry `aiMode` (`live` or `dev-deterministic`);
  deterministic text is never presented as live AI.

## 5. Run locally

```bash
npm install
# In-memory (zero setup; nothing persists):
JWT_SECRET=$(openssl rand -hex 24) SEED_DEMO_USERS=true node backend/server.js
# open http://localhost:3001/ai-command  → "Demo sign-in" → "Start session"
```

Demo accounts (dev, when `SEED_DEMO_USERS=true`): `demo@risaq.local` /
`admin@risaq.local`, password `Risaq@Demo123!` (override with `DEMO_PASSWORD`).

Durable sessions (resume after restart): set `DB_TYPE=postgresql` + `DATABASE_URL`
and apply `backend/migrations/001_ai_training_sessions.sql` (or just boot — the
schema is created automatically).

## 6. Verify

```bash
npm test          # 38 tests incl. simulation, orchestrator, AI governance
npm run demo      # full end-to-end loop transcript (no network/key needed)
npm run ci:verify # syntax check + build + tests
```

Real UI screenshots are in `docs/screenshots/` (captured from the running app).

## 7. Honesty notes

- In this build environment there is **no network egress and no AI key**, so the
  AI narration layer was exercised only in `dev-deterministic` mode. The live
  OpenAI path is implemented (`orchestratorProvider.js`) and selected when
  `OPENAI_API_KEY` is set, but it was **not** exercised here. No live AI call is
  claimed to have run.
- All scores, world states, and readiness numbers shown are computed by the
  deterministic engines and are reproducible.
