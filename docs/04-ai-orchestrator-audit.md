# RASD AI-Native Platform — Codebase Audit & Build Plan

> Phase 1 deliverable. This maps what exists, what is incomplete, and what depends on
> static/simulated data, then defines the new AI-orchestrated layer built on top of it
> **without** replacing working engines or changing the framework/DB.

## 1. Existing functionality map

| Area | File(s) | Status | Notes |
|---|---|---|---|
| HTTP server, CSP nonce, static, pages | `backend/server.js` | **Works** | Express 5, strict CSP, httpOnly-cookie-ready. Kept as-is; new routes mounted. |
| Config / env | `backend/config/environment.js` | **Works** | Frozen config, prod validation. Extended with AI provider + orchestrator caps. |
| DB layer | `backend/db.js` | **Works** | PG via `query()`, in-memory fallback has **no** query. New state uses dual-store pattern. |
| Auth (JWT + cookie) | `backend/middleware/auth.js` | **Works** | `requireAuth`/`requireRole`/`issueToken`. Reused unchanged. |
| Dual storage pattern | `backend/data/*.js` | **Works** | in-memory array + PG row. New `sessionStore` follows it exactly. |
| Adversary engines | `services/adversaryEngine.js`, `adversaryProposer.js`, `attackSimulator.js`, `scripts/eval-adversary.js` | **Partial / overlapping** | Issue #1 & #13.1 — several engines, inconsistent IDs. New `agents/adversaryAgent.js` is the **single simulation-bound** adversary; old ones left for the legacy terminal labs but no longer the source of truth for AI sessions. |
| Adaptive / mentor | `adaptiveEngine.js`, `adaptiveLearningEngine.js`, `adaptiveLearningService.js`, `aiMentorEngine.js`, `aiMentorService.js`, `aiTutor.js` | **Partial / overlapping** | Issue #4 & #5. Consolidated behind the Orchestrator; mentor logic unified in `agents/aiMentor.js` with TRAINING/VERIFICATION modes. |
| AI provider | `services/ai/aiProvider.js`, `ai/mockAiService.js` | **Partial** | OpenAI + silent Mock fallback. Issue #4 — mock not clearly labelled. Wrapped by new vendor-independent `ai/orchestratorProvider.js` that exposes an explicit `mode` (`live` vs `dev-deterministic`). |
| Behavioral fingerprint | `services/behavioralFingerprintEngine.js`, `behavioralAnalyzer.js` | **Works (narrow)** | Issue #7 — kept, extended by `agents/readinessAnalyst.js` which adds skill-transfer signals from recorded sessions. |
| Readiness index | `services/readinessService.js` | **Works** | Server-computed weights. Reused; AI sessions feed it new evidence. |
| Forensics / after-action | `data/trainingRuns.js` | **Works (lab-only)** | New `orchestrator/afterAction.js` builds AAR **only** from recorded session events. |
| Tests | `test/*.test.js` (14) | **Thin** | Issue #6 — no session/agent/sim coverage. New suites add it. |
| Frontend pages | `frontend/pages/*.html` (13) | **Works (legacy)** | Kept. New `ai-command.html` drives the full AI loop against real endpoints. |

## 2. Confirmed issues (from the brief's §13) and resolution

1. Multiple inconsistent adversary engines → new single simulation-bound `adversaryAgent` is the source of truth for AI sessions; legacy engines untouched for legacy labs.
2. Scenario IDs differ between services → AI layer uses one canonical `scenarioId` + `templateId` from the bank, carried through world, evaluation and AAR.
3. In-memory instead of durable state → `sessionStore` persists full session state to PG (`ai_training_sessions`) when available; resumable. In-memory fallback for dev/demo is explicitly labelled.
4. Unclear Mock AI dependency → provider exposes `mode`; responses carry `aiMode`. Operational results never depend on the model.
5. Non-unified skill evaluation → one auditable `decisionEvaluator` rubric engine; AI only explains.
6. Thin backend tests → new suites for sessions, simulation, consequences, agents, governance, injection.
7. Auth/permission gaps → every orchestrator route is `requireAuth` + ownership + institution isolation.
8. Weak AI failure handling → provider has timeout/budget caps, retries, and deterministic fallback.
9. Lost training state → persisted state machine; `GET /sessions/:id` resumes exactly.
10. Training vs verification not separated → distinct state (`SIMULATION` vs `VERIFICATION`), distinct scenario pools, mentor hints blocked in verification.

## 3. New AI-native architecture (built in Phases 2–6)

```
RASD AI Orchestrator (state machine + governance)
  CREATED → ASSESSMENT → PLANNING → SIMULATION → EVALUATION → FEEDBACK → VERIFICATION → COMPLETED
                                   (+ PAUSED, FAILED, REVIEW_REQUIRED)
  │
  ├─ Agent 01 Scenario Director   → instantiates a structured scenario from the bank
  ├─ Agent 02 Adversary Agent     → deterministic, rule-bound simulated adversary
  ├─ Agent 03 Decision Evaluator  → auditable rubric scoring (not LLM opinion)
  ├─ Agent 04 AI Mentor           → adaptive hints; TRAINING only, blocked in VERIFICATION
  ├─ Agent 05 Skill Verification  → new different-context scenario, same skill
  └─ Agent 06 Readiness Analyst   → evidence-based profile; INSUFFICIENT_EVIDENCE when thin

Deterministic core (never LLM):
  simulation/incidentWorld.js     → virtual org/network/assets/accounts/controls/evidence/adversary/business-impact
  simulation/consequenceEngine.js → 7-dimension, replayable decision consequences

AI layer (optional, labelled):
  ai/orchestratorProvider.js      → vendor-independent; live (OpenAI if key) or dev-deterministic
```

### Governance invariants
- The model never writes the DB; all writes go through backend services with auth checks.
- Scenario text and incident logs are **untrusted**: never fed back as system instructions (prompt-injection guard).
- Per-session caps: max agent steps, max tokens, max wall-clock; audit log for every AI decision.
- Deterministic results: same seed + same decisions ⇒ identical world + scores (tested).
