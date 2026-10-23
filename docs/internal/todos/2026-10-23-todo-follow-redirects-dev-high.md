# Todo — `npm audit` reports a High in `follow-redirects`, dev-only

- **Status:** Fixed by `fix/follow-redirects-dev-high`: 1.16.1 in the lockfile
  ([`npm-audit-findings` D-10](../initiatives/npm-audit-findings/decisions.md), register row B-91)
- **Created:** 2026-10-23
- **Owner:** unassigned
- **Origin:** the gates of `api-tooling-residuals` (#218), run on Node 24.22.1

---

## What

`npm audit` reports `follow-redirects@1.16.0` as High, under two advisories:

- GHSA-q3jh-wrc6-jgq8: array-form headers bypass the cross-origin credential stripping
- GHSA-8r9p-f939-6h3c: `sensitiveHeaders` regex escaping can expose credential headers

It is reached only through `wait-on@9.0.4` → `axios@1.20.0`, a devDependency, so the production
image does not hold it and `security:delta:gate`, which reads production dependencies, passes.
`wait-on` polls local ports in scripts; it sends no credentials across origins.

## Suggested fix

`npm audit` reports a fix within the declared ranges (`fixAvailable: true`): a lockfile-only bump
of `follow-redirects`. Run `npm audit fix` on a branch of its own, confirm `npm ls --omit=dev` is
unchanged, and run the security delta gate.
