# Retire test:ci

**Status:** Complete — gates green, awaiting PR (the `docker-compose.test.yml` removal is in the
handover).
**Slug:** `retire-test-ci` · **Branch:** `chore/retire-test-ci`

Lean kit — no plan; acceptance criteria live in the checklist.

`npm run test:ci` could not have worked since at least 2025-12. It built the production image
(no source, tests or devDependencies), pointed the database at `127.0.0.1` inside a container, and
ran `down -v` against the dev stack's own Compose project. CI never used it. This kit removes it,
and keeps the one thing it did that nothing else does: building the production `Dockerfile`
locally.

- [Checklist](retire-test-ci-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries
