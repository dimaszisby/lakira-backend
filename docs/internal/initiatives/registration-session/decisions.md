# Registration session — Decisions Log

`D-NN` entries scoped to this kit. Promoted entries collapse to a pointer at the ADR registry.

---

## D-01 — Registration issues a full session

Promoted to the architecture decision registry as
**[ADR-0043](../../../explanation/decisions/adr-0043-session-issuance-at-every-authenticated-entry-point.md)**.
That file is authoritative; this entry is a pointer.

---

## D-02 — One transaction for the whole use case, via a new auth `TransactionPort`

- **Status:** Accepted
- **Date:** 2026-09-20

**Context.** `RegisterUser` writes a user, an organization and a membership as three independent,
untransacted writes. D-01 adds a fourth. Adding it untransacted makes partial registration more
likely, not less — and the auth feature has no transaction abstraction at all.

**Decision.** Wrap all four writes in one transaction. Introduce
`src/features/shared/auth/application/ports/TransactionPort.ts` and a
`SequelizeTransactionPort` adapter, copying the metric feature's existing pattern. Thread an
**optional** `tx?: PersistenceTransaction` through `create()` on the three repository ports.

**Options considered.**

- _Add the fourth write untransacted, matching `LoginUser`._ Rejected: smaller diff, but it widens a
  known failure mode. `LoginUser` is not a precedent — it performs one write, not four.
- _Reuse `RefreshTokenRepository.runInTransaction` (`RefreshTokenRepositorySequelize.ts:81-87`)._
  Rejected: it works, but opening a transaction spanning the user, organization and membership
  aggregates through the refresh-token repository is a layering violation.
- _Make `tx` a required parameter._ Rejected: would force edits to fifteen existing unit-test
  doubles and every current caller, for a guarantee the type system still would not enforce where it
  matters.

**Consequences.** Three shared repository port signatures change, additively. Two new files in the
auth slice. Registration becomes atomic (AC-4). The optional parameter is a weaker guarantee than a
required one — a future caller can forget it and write outside the transaction. Whether the other
multi-write auth use cases should adopt the port is Q-1 in the plan.

---

## D-03 — No OpenAPI change; the analytics 304 is un-batched

- **Status:** Accepted
- **Date:** 2026-09-20

**Context.** The brief warned that either fix changes `POST /auth/register`'s documented response,
requiring a spec regeneration and turning `lakira-frontend`'s `api-contract` job red until it syncs.
On that basis it recommended shipping together with the pending analytics 304 change so the frontend
syncs once.

**Decision.** Ship no spec change here, and ship the analytics 304 as its own PR.

**Options considered.**

- _Batch the analytics 304 into this PR._ Rejected once the premise was checked. `grep` for
  `Set-Cookie` across `src/lib/openapi/openapi-docs.ts` returns nothing: **none** of the four
  cookie-setting endpoints documents the header. Register's 201 body is unchanged
  (`LoginResponseSchema`, `openapi-docs.ts:86-92`), so this change produces no spec diff, there is
  no cross-repo cost, and there is nothing to batch with. `2026-08-31-todo-analytics-304-etag.md`
  § "Left undone deliberately" already argued the 304 deserves its own small PR.
- _Document `Set-Cookie` on register only._ Rejected: it would make the existing gap less
  consistent, not more. Documenting all four is a coherent change and is filed as a follow-up todo.

**Consequences.** AC-5 asserts `docs:openapi:check` reports **no** diff — if it reports one, this
decision's premise is wrong and the plan needs revisiting. `lakira-frontend` needs no sync for this
work.
