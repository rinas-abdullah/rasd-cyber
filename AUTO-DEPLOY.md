# Auto-deploy: GitHub → Netlify

Every push to `main` on GitHub rebuilds and publishes
https://rasd-cyber-v3-live.netlify.app automatically (Netlify Git integration).
Pull requests get their own preview URL; GitHub Actions (`.github/workflows/ci.yml`)
runs the test suite on every push and PR.

## Day-to-day

```bash
git add -A
git commit -m "Describe the change"
git push
```

Netlify picks up the push within a few seconds; the deploy log is under
**Netlify → Site → Deploys**.

## One-time setup (already done once per site)

1. Netlify → *rasd-cyber-v3-live* → **Site configuration → Build & deploy →
   Continuous deployment → Link repository** → GitHub → choose this repo.
2. Branch to deploy: `main`. Build command and publish/functions directories are
   read from `netlify.toml` — leave the UI fields empty.
3. Environment variables already set on the site (JWT_SECRET, DB_TYPE, …) are
   kept; nothing secret lives in this repository.

## Notes

- CSS/JS cache-busting is automatic: the server stamps every `?v=` with a hash
  of the shipped assets, so no manual version bumps are needed.
- Run `npm test` locally before pushing; CI runs the same suite.
