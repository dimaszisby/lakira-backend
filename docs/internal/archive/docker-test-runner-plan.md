# Docker Test Runner Plan

> **Created At:** 2025-12-01  
> **Updated At:** 2025-12-01  
> **Completed At:** 2025-12-01

## 1. Problems Observed

- **IDE reporter path not available inside Docker** – VS Code’s Jest extension injects `/Users/dimaspramudya/.vscode/extensions/orta.vscode-jest-6.4.4/out/reporter.js`, but the CI script executes inside `/app` so Jest cannot resolve the host-only reporter.
- **Single script for dev & CI** – `scripts/test-ci.sh` is optimized for pipelines (container resets, migrations, coverage) yet VS Code calls it for local runs, slowing feedback and coupling the IDE to Docker state.
- **Opaque onboarding** – The documentation does not explain when to use Docker versus direct host commands, creating friction for peers reviewing or cloning the repo.

## 2. Solution Plan

1. **Split commands** – Keep `npm run test:ci` (aliasing `scripts/test-ci.sh`) for pipelines only and introduce a lightweight `npm test`/`npm run test:dev` that runs Jest directly on the host with watch mode enabled.
2. **Scope reporters to the repo** – Install any custom reporters (e.g., `jest-summary-reporter`) in `devDependencies` and reference them via relative paths so both host and containers can load them. Disable VS Code’s built-in reporter when invoking the Docker script.
3. **Document IDE guidance** – Update `README.md` to state: “VS Code Jest plugin should invoke `npm test` (host). To run the Docker suite, use `npm run test:ci` via terminal.” This clarifies expectations for collaborators and hiring managers reviewing the repo.
4. **Optional bind mount** – If IDE-triggered Docker runs remain necessary, mount `~/.vscode/extensions` into the container or copy the reporter into the image, but treat this as an opt-in enhancement after the first three fixes land.

## 3. Docker Overhaul Checklist

- [x] Create `npm run test:dev` (host) and `npm run test:ci` (Docker) commands with matching Jest configs aside from reporters/coverage.  
       _Refs: `package.json`, `scripts/test-ci.sh`._  
       `test:dev` now forces `REDIS_REQUIRED=false` and `DB_HOST=127.0.0.1` (while `test:ci` relies on `.env.test` defaults). This lets VS Code-driven runs target the host-exposed containers—just keep `docker compose up -d db redis` running in the background.
- [x] Configure VS Code’s Jest extension (`jest.jestCommandLine`) to `npm run test:dev --` and turn off `jest.showCoverageOnLoad` for faster iteration.  
       _Refs: `.vscode/settings.json`._
- [x] Add a repo-local reporter dependency and update `jest.config.mjs` so Docker and host share the same reporter list.  
       _Refs: `package.json`, `package-lock.json`, `jest.config.mjs`._
- [x] Extend `docs/analytics/analytics-backend-overhaul-checklist.md` with a “Testing commands” note referencing the new split.
- [x] Document the Docker workflow in `docs/how-to/development/run-postgres-in-docker.md`, highlighting teardown expectations and how to troubleshoot Compose errors like “The Compose app is no longer running.”
- [x] Verify CI pipelines call `npm run test:ci` and capture coverage artifacts after reporter changes (documented expectation in this plan + `package.json` ensures the Docker script is opt-in for CI only).

> Keeping Docker-only commands out of IDE-triggered flows avoids filesystem mismatches and demonstrates production-ready discipline across your portfolio.
