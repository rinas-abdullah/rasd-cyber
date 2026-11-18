# RASD Cyber V3 deployment

Public URL: https://rasd-cyber-v3-live.netlify.app
Command center: https://rasd-cyber-v3-live.netlify.app/ai-command
Netlify site ID: 9b8e978e-3552-4159-a065-604cefa978b2
Verified deployment: 6afc8404860969d0b0f0a1ba

## Platform hardening update

- AI training sessions enforce both user ownership and institution context on
  read, decision, hint, pause, resume, verification and readiness operations.
- PostgreSQL session listing is filtered by user and institution.
- Institution analytics and administration endpoints require an institution
  assignment in the authenticated token.
- Every request now carries an `X-Request-Id` correlation header and structured
  request logs.
- `/health` reports database readiness and returns HTTP 503 if PostgreSQL is
  configured but unavailable.
- Automated coverage now includes cross-institution session isolation.

## Verification

Google sign-in integration has been added. Its activation is pending the real
GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET production settings. The provider
remains disabled until configured. The user confirmed an existing Google Cloud
project and Web OAuth client; see docs/google-sign-in.md for the exact callback.
All 48 automated tests now pass, including the eight Google OAuth flow/security
tests. Google verification uses mocked provider responses; a real Google account
sign-in remains unverified until credentials are configured.

- All 40 local automated tests passed, including serverless JSON registration and malformed JSON handling.
- The live HTTP acceptance check passed: registration, login, profile, training creation, hints, pause/resume, decisions, after-action review, independent verification, completed-session retrieval, archive, and readiness.
- Public HTML, CSS and JavaScript returned HTTP 200.
- Backend source, package.json and setup_db.sql returned HTTP 404; unauthenticated session access returned HTTP 401.
- PostgreSQL is managed by Netlify. Its runtime connection is loaded by the modern Functions runtime and @netlify/database. No manually retrieved database-owner credential was saved for this site.
- The schema migration creates the project's 22 tables before publication.

Browser automation was unavailable in this session; live verification used HTTPS requests. OPENAI_API_KEY is not configured, so narration uses the clearly labeled deterministic mode.

## Operations

Use the current Netlify CLI and the current project directory:

    npm ci
    npm run netlify:check
    npx netlify-cli@latest deploy --prod
    node scripts/smoke-http.js https://rasd-cyber-v3-live.netlify.app

The local .netlify/state.json links this source to the site above. Keep the local Git repository metadata so Netlify resolves package paths from this project rather than the user's home directory. The prior rasd-cyber-v3.netlify.app site belongs to a different account and is superseded by the live URL above.
