# RASD Cyber V3 on Netlify

Live site: https://rasd-cyber-v3-live.netlify.app

This is the existing full-stack Express project. Netlify deploys netlify/functions/rasd.mjs, a modern Web Request handler that adapts requests to backend/netlifyHandler.js and the existing Express app.

## Build and storage

- npm run build creates dist/ and the generated backend/public-assets.json dependency used to retain HTML, CSS, JavaScript, and images in the function package.
- Netlify Database provisions PostgreSQL and applies netlify/database/migrations before publishing.
- The modern function runtime initializes the managed database binding; @netlify/database resolves the connection without storing a separate owner credential in project files.
- The static publish directory contains no backend source. Page responses pass through Express for per-request CSP nonces.
- package-lock.json is included for reproducible dependency installation.
- Keep local Git metadata to anchor Netlify package tracing to the project root on Windows.

## Production configuration

Configured on the current site: NODE_ENV=production, DB_TYPE=postgresql, DB_ENABLED=true, TRUST_PROXY=true, SEED_DEMO_USERS=false, SITE_URL=https://rasd-cyber-v3-live.netlify.app, and a generated private production JWT_SECRET.

OPENAI_API_KEY remains optional. Without it, narration is deterministic and explicitly labeled rather than presented as live AI.

## Verification

npm run netlify:check passes all 40 automated tests. The live command below passed registration, login, training, pause/resume, decisions, independent verification, archive and readiness:

    node scripts/smoke-http.js https://rasd-cyber-v3-live.netlify.app

See DEPLOYMENT-STATUS.md for the verified deployment ID and verification limits.
