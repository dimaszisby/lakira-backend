# Decisions — single-token-signer

## D-01 — The seed signs through `JwtTokenProvider`; `token-generator.ts` is deleted

- **Status:** Proposed
- **Date:** 2026-10-22

**Context.** `src/utils/token-generator.ts` called `jwt.sign` with a fixed `expiresIn: "7d"` and
no pinned algorithm, beside the app's `JwtTokenProvider`, which pins HS256 both ways (B-07, B-17,
#162). Its only callers were `scripts/seed-contract-tests.ts` and its own unit test (B-64).
**Decision.** The seed signs both users' tokens with `JwtTokenProvider`, and the generator and its
test are deleted. `architecture.test.ts` fails on a `jwt.sign` anywhere else under `src/` or
`scripts/`.
**Options considered.** _Move the generator under `scripts/` and pin HS256:_ a second copy of the
claim shape stays, which is how this one drifted from `TokenPayload` (it never carried
`username`).
**Consequences.** One algorithm and one claim shape for every token the repo issues, the
contract fixtures' included.

---

## D-02 — The seed's tokens keep a seven-day life, stated where they are signed

- **Status:** Proposed
- **Date:** 2026-10-22

**Context.** Schemathesis sends the seeded token as a fixed bearer for its whole run
(`tests/contract/schemathesis/scripts/run-local.js:182`), and `tmp/contract-seed.json` is reused
locally between runs. The provider's default life is `ACCESS_TOKEN_TTL_SEC`, 900 seconds.
**Decision.** The seed constructs the provider with `SEED_TOKEN_TTL = "7d"`, the life the generator
gave, named and explained beside the call.
**Options considered.** _The default 900 seconds:_ a contract run that outlasts it would fail on
401 partway through, and a reused seed file would be stale within the hour.
**Consequences.** The fixture tokens live longer than a user's. They are signed with the test
environment's secret and written only to `tmp/`.
