# Todo — `DB_LOGGING` writes SQL with its values to the log

- **Status:** Open (P2). Reproduced on 2026-10-10
- **Created:** 2026-10-10
- **Owner:** unassigned
- **Origin:** finding V2 of
  [`audit-2026-10-10.md`](../audits/saas-readiness/audit-2026-10-10.md), raised by the security
  grader; it is one of the two routes that keep caveat C6 open
  ([`saas-reaudit-2026-10-10` D-03](../initiatives/saas-reaudit-2026-10-10/decisions.md))

## The defect

With `DB_LOGGING=true`, `src/config/db.ts` hands Sequelize's statement text to `logger.debug`. The
text is a message, and redaction is by metadata key and never scans a message. Sequelize inlines
the values of a `WHERE` clause, so with `LOG_LEVEL=debug` a login writes the email address it
looked up. `src/config/config.cjs` does the same with `console.log` for migrations.

The production refusals in `src/config/zodEnv.ts` (ADR-0036) do not include `DB_LOGGING`.

## Reproduction

On the scratch fork's built server, `NODE_ENV=development DB_LOGGING=true LOG_LEVEL=debug`:
`POST /auth/login` for `dbl-victim@example.com` wrote one `debug` line holding the address, inside
`Executing (default): SELECT … WHERE …`. The password was not written. That production accepts
the two settings is read from the schema, not run.

## Options

- Refuse `DB_LOGGING=true` when `NODE_ENV=production`, beside the other refused switches. One line
  and a test; staging stays exposed.
- Log the statement with placeholders and never the values, in every environment.
- Both.
