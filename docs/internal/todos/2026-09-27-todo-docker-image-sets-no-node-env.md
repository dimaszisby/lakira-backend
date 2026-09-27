# Todo — the production image runs as `development` unless `NODE_ENV` is set

- **Status:** Open
- **Created:** 2026-09-27
- **Owner:** unassigned
- **Origin:** found while planning the `email-adapters-log-pii` kit

---

## What

Neither `Dockerfile` nor `Dockerfile.dev` sets `NODE_ENV`, and the production image's `CMD` is
`node dist/server.js`, not `npm start` (which would set `NODE_ENV=production`). `src/config/zodEnv.ts`
defaults `NODE_ENV` to `development`. So an image started without `NODE_ENV` in its environment runs
as development, and every refusal in ADR-0036, ADR-0048 and ADR-0049 is off. That includes
`DISABLE_RATE_LIMITING`, `SWAGGER_REQUIRE_AUTH=false` and `EMAIL_PROVIDER=console`. The logger also
picks its development format.

Render sets `NODE_ENV` itself, and the ADR-0042 VPS Compose stack will set it in its service
environment, so nothing is exposed today. But the safety of every guard rests on each deployer
remembering one variable.

## Suggested fix

Set `ENV NODE_ENV=production` in the `Dockerfile` runtime stage, so the image fails safe and
staging overrides it explicitly. Alternatively, make the schema refuse to default `NODE_ENV` when it
detects it is running from `dist/`. Either way, record the choice beside ADR-0036 and check
`npm run docker:build` plus a container start.
