# B-10 — Five domain repository interfaces import a type from the application layer

Register row [B-10](register.md). Read at `bf72b58`. First recorded as R11 on 2026-09-29; the
architecture grader of 2026-10-12 found it again and rated it P2.

## 1. What is wrong

The dependency rule is that the domain depends on nothing outward. Five domain files import from
`application/`:

- `src/features/public/metric/domain/repositories/MetricRepository.ts:2`
- `src/features/shared/auth/domain/repositories/UserRepository.ts:2`
- `src/features/shared/auth/domain/repositories/MembershipRepository.ts:6`
- `src/features/shared/auth/domain/repositories/OrganizationRepository.ts:2`
- `src/features/public/metric-log/domain/repositories/MetricLogRepository.ts:2`

Each imports `PersistenceTransaction`. The type is declared four times, all as `unknown`:
`src/features/shared/auth/application/ports/TransactionPort.ts:1`,
`src/features/shared/auth/domain/repositories/RefreshTokenRepository.ts:3`,
`src/features/public/metric/application/ports/TransactionPort.ts:1` and
`src/shared/application/ports/MessageIdempotencyPort.ts:2`. No lint rule or test forbids a domain
file importing its feature's application layer; the rule text at
`.claude/rules/architecture.md:35` says only "zero infrastructure imports".

## 2. Root cause

The transaction port was added in the application layer, where the use case that opens a
transaction lives, and the repository interfaces that accept the handle were then pointed at it.
An opaque handle passed to a repository is a domain-level idea; it was filed one layer up.

## 3. Options

- **A. One declaration in `src/shared/domain/`**, imported by every repository interface and by
  the transaction ports. Removes three duplicates and all five outward imports.
- **B. Declare it per feature in that feature's domain.** Keeps features independent; leaves
  three declarations of the same alias.
- **C. Record that a domain interface may import its own feature's application ports**, and leave
  the code. Cheapest, and it makes the rule weaker than its name.
- **D. A, plus a lint rule** that a `domain/` file may not import from `application/`, with a
  negative case.

## 4. Recommendation

**D.** The alias is `unknown` everywhere, so moving it changes no behaviour and no compiled
output. The rule is what stops it coming back, and the audit's caveat C4 was about exactly this:
rules that exist in prose and not in the lint config.

## 5. Acceptance criteria for the fix

- **AC-1** — `PersistenceTransaction` is declared once. _Why:_ the todo of 2026-09-20.
- **AC-2** — No file under any `domain/` folder imports from an `application/` path; `eslint src`
  reports nothing. _Why:_ R11.
- **AC-3** — Synthetic source importing `../../application/ports/X.js` from a domain file is
  rejected by lint, in a feature and in `src/shared/domain`, and the lint test pins it.
  _Why:_ a rule with no negative case is what kept C4 open.
- **AC-4** — `git diff` of `dist/` before and after shows type-only changes, or none.
  _Why:_ this is a move, and should be shown to be one.

## 6. Size and shape

≤½ day. Micro entry in `boundary-rule-residuals/decisions.md`; ADR-0044 or ADR-0058 gains a
sentence, since the rule set changes. Gates: typecheck, lint, format, tests, build.

## 7. Depends on, unblocks

Depends on nothing. Closes R11 and the todo
`2026-09-20-todo-unify-auth-persistence-transaction-type.md`. Sits beside B-28 and B-29, which
widen the same lint blocks; doing them together would save one round of the lint tests.

## 8. Not verified

- Whether `src/shared/domain` may hold a persistence-flavoured name without that reading as a
  leak; a neutral name (`UnitOfWorkHandle`) avoids the question.
- The count of 21 files that mention the type was taken by grep, not by reading each.
