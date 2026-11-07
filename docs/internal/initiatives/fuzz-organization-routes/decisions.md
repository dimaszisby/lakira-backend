# Fuzz the organization routes — Decisions Log

`D-NN` entries scoped to this kit. No entry is expected to need promotion: this is test
infrastructure, with no API, data or security-boundary change.

---

## D-01 — Include the `Organizations` tag; exclude single operations by name

- **Status:** Accepted (the user's decision, taken at plan approval)
- **Date:** 2026-09-29

**Context.** `run-local.js` selects operations by `--include-tag`. The spec has no `operationId`s,
and Schemathesis 4.4.4 can exclude one operation with `--exclude-name`.

**Decision.** Add `Organizations` to `DEFAULT_TAGS`. Keep an `EXCLUDED_OPERATIONS` list in
`run-local.js`, each entry passed as `--exclude-name` with a one-line reason beside it.

**Options considered.** _Include the organization operations one by one._ Rejected: a new
organization route would again be unfuzzed by default, which is how this gap arose.

**Consequences.** New organization routes are fuzzed unless someone excludes them and writes down why.

## D-02 — `POST /organizations/{id}/invites` is fuzzed

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** Unset, the path id is random (403), and a repeated email is a 409 pending-invite
conflict.

**Decision.** The hook sets `{id}` to the primary org and gives each case a unique invitee address
(`invitee-<suffix>@example.com`), keeping a valid `role`.

**Options considered.** _Exclude it._ Rejected: the gate passes with it included and exercises the
real create path.

**Consequences.** Every case returned 201 (18 of 18 in the gate run). The server runs with
`NODE_ENV=test`, so invite mail goes to the `console` adapter, which ADR-0049 allows in test.

## D-03 — `PATCH /memberships/{id}` is fuzzed against a seeded member

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** Re-roling needs a non-owner membership in the token's organization. The seed had none.

**Decision.** The seed adds 41 users with `member` memberships in the primary org (deterministic
`f1f1…`/`f2f2…` ids, following the existing id-pool constants). Index 0 is `patchMembershipId`,
which the hook uses for every PATCH, with a valid `role`.

**Options considered.** _Target the owner's own membership._ Rejected: the last-owner rule refuses
it, so fuzzing would only test that refusal.

**Consequences.** 18 of 18 PATCHes returned 200.

## D-04 — `DELETE /memberships/{id}` is fuzzed from a seeded pool

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** Each delete consumes a membership.

**Decision.** Indexes 1..40 of the seeded members form `deletable.membershipIds`, and the hook takes
one per DELETE with the existing `_pop_deletable` pattern.

**Options considered.** _A smaller pool._ Rejected: the gate issued 17 deletes, and a spent pool
turns into skipped cases.

**Consequences.** 17 of 17 DELETEs returned 200.

## D-05 — `POST /invites/accept` is excluded by name

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** A valid token exists only in an invite email; the fuzzer can only send random ones.
The plan predicted the gate would fail on it. **It does not:** included once, the gate passed
(43/47), every one of 19 requests got 400, and Schemathesis added a fourth "schema validation
mismatch" warning.

**Decision.** Exclude it with `--exclude-name`, with the observed reason beside it in
`run-local.js`.

**Options considered.** _Include it._ Rejected: it would test only the 400 path, and it would add a
warning to a set whose treatment is still an open decision
(`2026-09-01-todo-schemathesis-gate-warnings`). _Seed a pool of single-use invites and hand real
tokens to the hook._ Deferred: each token is single-use, and an accepted invite is unique per
(user, organization), so it needs one seeded organization per case. The integration tests already
cover the accept path end to end.

**Consequences.** The gate selects 42 of 47. The accept path's coverage is the integration suite.
