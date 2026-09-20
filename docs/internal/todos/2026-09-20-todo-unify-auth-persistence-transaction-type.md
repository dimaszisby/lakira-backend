# Todo — `PersistenceTransaction` is declared twice in the auth slice

- **Status:** Open
- **Created:** 2026-09-20
- **Owner:** unassigned
- **Origin:** discovered implementing the `registration-session` kit, see its checklist
  § Discovered

---

## What

The auth slice now has two declarations of the same type:

- `src/features/shared/auth/application/ports/TransactionPort.ts` — added by the
  registration-session work, mirroring `src/features/public/metric/application/ports/TransactionPort.ts`
- `src/features/shared/auth/domain/repositories/RefreshTokenRepository.ts` — pre-existing

Both are `export type PersistenceTransaction = unknown`, so they are structurally identical and
interoperate freely. Nothing is broken. It is a naming collision that will read as a mistake to the
next person, and the two could drift if either is ever narrowed from `unknown` to a real type.

## Why it was not fixed inline

Reconciling means editing `RefreshTokenRepository` and `IssueRefreshToken`, both of which the
registration-session kit listed as out of scope — the refresh-token rotation and revocation paths
are working and tested, and widening that PR's blast radius to tidy a type alias was not a good
trade.

## Scope

Delete the declaration in `RefreshTokenRepository.ts` and import from
`application/ports/TransactionPort.js` instead, matching what `MetricRepository.ts` already does
(`src/features/public/metric/domain/repositories/MetricRepository.ts:2`). Touches
`RefreshTokenRepository.ts`, `RefreshTokenRepositorySequelize.ts`, `IssueRefreshToken.ts` and
`RotateRefreshToken.ts`.

Note this has a domain layer importing a type from the application layer. That is the established
pattern in the metric slice, but it is worth a deliberate look rather than copying it further —
which is the other reason this is its own ticket and not a drive-by.

## Verification

`npm run typecheck && npm run lint && npm test`. No behaviour change, so no new test is owed; the
existing refresh-token suites are the regression net.
