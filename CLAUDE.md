# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lakira Backend is an Express.js REST API built with TypeScript using Domain-Driven Design (DDD) with feature slices. It uses Sequelize ORM with PostgreSQL, JWT authentication, Zod validation, and Redis caching.

**Node version**: 24.x (see `.nvmrc`)
**Module system**: ESM (`"type": "module"`)

## Rules & Conventions

Detailed rules are in `.claude/rules/`:

- `architecture.md` — Feature-Slice DDD patterns, dependency rules, entity conventions
- `code-style.md` — Formatting, naming, ESM imports, logging
- `testing.md` — Jest setup, test structure, coverage thresholds
- `security.md` — Middleware stack, auth flow, rate limiting, sensitive data
- `api-design.md` — HTTP conventions, Zod schemas, DTO patterns
- `database.md` — Sequelize models, migrations, query patterns
- `validation.md` — Input validation rules
- `environment.md` — Env var handling
- `commands.md` — All development, test, build, and migration commands
- `workflow.md` — Plan mode, task management, core principles
- `documentation.md` — Doc kit rules: when to create docs, folder placement, kit sizing, todos convention

## Architecture

Feature-Slice DDD with manual dependency injection. Entry point: `src/server.ts`. Path aliases: `@/*` → `src/*`, `@utils/*`, `@config/*`.

## Documentation

`docs/` is organised by reader purpose (Diátaxis). **Placement rules: `.claude/rules/documentation.md`** —
consult it before creating any document.

|                     |                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `docs/tutorials/`   | Learning — getting started, first feature slice, fork & rebrand                          |
| `docs/how-to/`      | Task recipes — development, testing, ci-cd, security                                     |
| `docs/reference/`   | Lookup — API spec, DB schema, configuration, commands, CI, security controls             |
| `docs/explanation/` | Understanding — C4 architecture, **ADR registry**, testing strategy, product scope       |
| `docs/internal/`    | Working material — doc kits, audit runs, incidents, todos, archive. **Deleted on fork.** |

Frequently needed:

- **GitHub Issues** — every open item, ranked by labels; **"what's next" is
  `gh issue list --state open --label state:ready`** (`.claude/rules/workflow.md` § What's next,
  `docs/reference/issue-tracker.md`). Every task starts from an issue (ADR-0085)
- `docs/internal/initiatives/backend-debt-register/register.md` — frozen on 2026-10-29; its first
  table maps each old `B-NN` and `O-NN` to its issue
- `docs/reference/commands.md` — canonical npm scripts (do not keep a second copy elsewhere)
- `docs/reference/configuration.md` — all 74 env vars
- `docs/explanation/decisions/` — 86 ADRs, one per file; check **Status** before trusting one
- `docs/reference/api/lakira-backend-openapi.json` — generated, CI-drift-gated, never hand-edited

`docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md` is the live risk status (as of 2026-10-25: GOLD WITH CAVEATS; no open P0; every caveat, C1 to C6, is confirmed closed on the routes ADR-012 names. The dated run of 2026-10-20 held back a clean GOLD on two P1 findings in the queue worker, X62 (B-75, email jobs stalled on the connection pool) and X60 (B-74, the consumer cancel did nothing), and listed six open P2 findings: X1, X20, X40, X41, X61, X63. All eight are fixed (#198 to #203, register rows B-74 to B-80) but none is confirmed by a dated run yet, so GOLD is not restated until one is run).

## Task Defaults

Before proposing model, effort, plan mode, or subagent strategy for a non-trivial task, consult the **effort + model matrix** in user memory (`feedback-effort-model-matrix`). It was introduced as an experimental trial through **2026-07-02**; that date has passed and no review outcome is recorded here, so confirm with the user before treating it as settled. Keep flagging friction (delegation misfires, re-work, context loss).

**Commit & PR ownership:** Claude does not run `git commit`, `git push`, or `gh pr create`. Only the user does these manually. End every completed task with a ready-to-use PR message instead. Full rule: `.claude/rules/workflow.md` § Commit & PR Ownership.
