# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lakira Backend is an Express.js REST API built with TypeScript using Domain-Driven Design (DDD) with feature slices. It uses Sequelize ORM with PostgreSQL, JWT authentication, Zod validation, and Redis caching.

**Node version**: 20.x (see `.nvmrc`)
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

- `docs/reference/commands.md` — canonical npm scripts (do not keep a second copy elsewhere)
- `docs/reference/configuration.md` — all 69 env vars
- `docs/explanation/decisions/` — 44 ADRs, one per file; check **Status** before trusting one
- `docs/reference/api/lakira-backend-openapi.json` — generated, CI-drift-gated, never hand-edited

`docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md` is the live risk status (as of 2026-09-24: no open P0s, all C1–C6 caveats closed).

## Task Defaults

Before proposing model, effort, plan mode, or subagent strategy for a non-trivial task, consult the **effort + model matrix** in user memory (`feedback-effort-model-matrix`). It was introduced as an experimental trial through **2026-07-02**; that date has passed and no review outcome is recorded here, so confirm with the user before treating it as settled. Keep flagging friction (delegation misfires, re-work, context loss).

**Commit & PR ownership:** Claude does not run `git commit`, `git push`, or `gh pr create`. Only the user does these manually. End every completed task with a ready-to-use PR message instead. Full rule: `.claude/rules/workflow.md` § Commit & PR Ownership.
