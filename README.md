> **V3 Command Experience:** The premium bilingual command interface, authenticated session archive, pause/resume, and keyboard palette are documented in [docs/06-command-experience-v3.md](docs/06-command-experience-v3.md).

# رصد سايبر | Rasd Cyber

Adaptive cybersecurity training platform: hands-on scenarios, an AI mentor, gamified progress tracking, and institutional analytics — built on Node.js/Express with PostgreSQL (or a zero-setup in-memory mode for a quick trial).

## 🧠 RASD AI Orchestrator (AI-native training)

The platform now includes an **AI-operated training loop**: a central Orchestrator
plans and runs each session through an explicit state machine
(`CREATED → ASSESSMENT → PLANNING → SIMULATION → EVALUATION → FEEDBACK → VERIFICATION → COMPLETED`),
coordinating six agents and a **deterministic incident simulation**.

- **Six agents** (logical roles, cost-shared): Scenario Director, Adversary Agent,
  Decision Evaluator, AI Mentor, Skill Verification, Readiness Analyst.
- **Deterministic core**: the Adaptive Incident World + the 7-dimension Decision
  Consequence Engine compute all operational results — reproducible and testable.
  The AI only narrates/explains/hints; it never decides outcomes or scores.
- **Skill verification**: after training, an **independent, different-sector**
  scenario measures skill *transfer* (no answer leakage); hints are blocked.
- **Evidence-based readiness**: shows `INSUFFICIENT_EVIDENCE` rather than inventing
  numbers, and separates training performance from verified skills.
- **Governance**: the model never writes the DB; Zod-validated structured outputs;
  per-phase step/hint caps; per-call token/time caps; a prompt-injection boundary;
  an audit log; and an honest `aiMode` (`live` vs `dev-deterministic`).

Try it:

```bash
npm install
JWT_SECRET=$(openssl rand -hex 24) SEED_DEMO_USERS=true node backend/server.js
# open http://localhost:3001/ai-command  → "Demo sign-in" → "Start session"
npm run demo    # full end-to-end loop transcript (no network/key needed)
npm test        # 38 tests (simulation, orchestrator, AI governance)
```

Full design, API reference and run guide: **[docs/03-ai-orchestrator.md](docs/03-ai-orchestrator.md)**
· pre-build audit: [docs/04-ai-orchestrator-audit.md](docs/04-ai-orchestrator-audit.md)
· UI screenshots: [docs/screenshots/](docs/screenshots/).

> Note: this environment has no AI key or network egress, so the AI narration
> layer ran only in `dev-deterministic` mode; the live OpenAI path is implemented
> but was not exercised here. All scores shown are from the deterministic engines.

---

## Quick start

```bash
npm install
cp .env.example .env
npm start
# open http://127.0.0.1:3001
```

By default `DB_TYPE=in-memory` — nothing to install, but data (accounts, progress, mentor history) doesn't persist across restarts, and features that need real relational storage (the paths/modules/tasks admin system, institution-level accuracy reports, AI-generated technical résumés) return a clear "needs PostgreSQL" response instead of working.

Two demo accounts are seeded in in-memory mode:

| Username | Email | Password |
|---|---|---|
| `admin` | admin@risaq.local | `Risaq@Demo123!` |
| `demo` | demo@risaq.local | `Risaq@Demo123!` |

### Running against real PostgreSQL

```bash
# .env
DB_TYPE=postgresql
DATABASE_URL=postgresql://user:pass@host:5432/risaq
```

The schema (18 tables) is created automatically on boot — see `backend/db.js#createTables()`, mirrored for manual setup in `setup_db.sql`.

### AI mentor

Set a real `OPENAI_API_KEY` in `.env` to use OpenAI (`backend/services/aiMentorEngine.js`). Without one, the mentor runs on a built-in bilingual (EN/AR) mock/knowledge-base engine (`backend/services/ai/mockAiService.js`) — same API shape, so nothing else changes.

## What's actually implemented

- **Auth** — JWT + bcrypt, working in both in-memory and PostgreSQL modes.
- **Interactive labs** — a hand-authored attack-scenario library (`backend/services/attackSimulator.js`) plus AI-generated dynamic scenarios, served through a terminal-style UI (`/terminal`, `/practice`).
- **AI mentor** — Socratic-style hints (not direct answers), real OpenAI integration with a genuine knowledge-base fallback.
- **Adaptive difficulty** — scenario difficulty adjusts from submitted attempts (`backend/services/adaptiveLearningEngine.js`).
- **Gamification** — points, levels, streaks, achievements, leaderboard.
- **Paths / modules / tasks** — an admin-authorable structured curriculum (requires PostgreSQL).
- **Analytics** — institution/compliance/engagement reports (in-memory demo data) and per-institution accuracy reports (requires PostgreSQL).
- **i18n** — Arabic/English with RTL support.

## Project structure

```
backend/
  server.js            Express app, static/page serving
  db.js                Connection + schema (createTables, both DB modes)
  routes/              api.js (main), authRoutes, aiRoutes, scenarioRoutes, ...
  services/            attackSimulator, aiMentorEngine, adaptiveLearningEngine,
                        pathService, aiCoreService, risk/behavior analysis, ...
  data/                in-memory stores (progress, ai logs, demo users, courses)
  middleware/          auth, validation (zod), rate limiting, requirePostgres
frontend/pages/        one HTML file per screen (dashboard, terminal, admin, ...)
js/, css/              vanilla frontend — no bundler, served as-is
docs/                  product scope, environments/CI, architecture decisions (ADRs)
setup_db.sql           manual PostgreSQL schema (mirrors backend/db.js)
```

## Development

```bash
npm run dev              # nodemon
npm test                 # unit tests (constants + environment parsing)
npm run build             # produce dist/ (mirrors this layout, ready to deploy)
npm run serve:dist        # cd dist && npm install && npm start
```

CI (`.github/workflows/ci.yml`) runs `npm ci`, syntax checks, a production build, and the test suite on every push/PR.

## Known limitations

- Test coverage is limited to config/constants — no automated tests exercise routes, auth, or the DB layer yet.
- In-memory mode is for local trial only: single-process, non-persistent.
- The `/attempts/submit` → adaptive-difficulty pipeline expects scenario ids from the static scenario library (slugs like `network-scanning`), not the numeric ids in the AI-generated `scenarios` table — these are two separate scenario catalogs today.

See `docs/01-product-and-boundaries.md` for product scope and what's explicitly out of scope for v1, and `docs/decisions/` for architecture decisions.

## License

ISC
