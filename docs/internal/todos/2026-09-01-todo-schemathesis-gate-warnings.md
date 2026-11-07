# Todo — the four Schemathesis gate warnings, characterised

- **Status:** Issue #248 (was register row B-48). Investigated — decision needed, no code change proposed
- **Created:** 2026-09-01
- **Owner:** unassigned

`npm run contract:local:gate` exits **0** with 1371/1371 passing, but prints four operations under a
WARNINGS heading. This records what they are so the warnings are either acted on or accepted
deliberately, rather than becoming noise people scroll past.

They are **not defects**, which is the opposite of the first read. See the correction below.

---

## What the run prints

```
Authentication failed: 2 operations returned authentication errors
  401 Unauthorized:  POST /auth/refresh
  403 Forbidden:     POST /auth/switch-org

Schema validation mismatch: 2 operations mostly rejected generated data
  POST /auth/reset-password
  POST /auth/verify-email
```

## Correction to the first assessment

These were initially read as "the published contract is looser than the actual API" — a real
contract defect with a downstream consumer, since `lakira-frontend` generates types from this spec.

**That was wrong.** Reading the schemas shows the constraints Schemathesis is tripping on are ones
**OpenAPI cannot express**, not ones anybody forgot to write down:

- `ResetPasswordRequest` documents `token`, `password`, `passwordConfirmation` — all required,
  password `minLength: 6`. That is accurate. The rule the API actually enforces beyond it is a
  **cross-field refinement**, `auth/infrastructure/http/schema.zod.ts:23`:
  `password === passwordConfirmation`. JSON Schema has no way to say that. Schemathesis generates
  two independent random strings, they never match, everything is rejected.
- `VerifyEmailRequest` documents `token` with `minLength: 1`, which is also accurate. The real
  constraint is that the token must **exist in the database**. No schema can express that either.

So the schema is not too loose; the constraint is not schema-shaped. Nothing here would fix by
tightening the spec, and tightening it (say, a `pattern` on `token`) would document a falsehood.

The same applies to the auth pair: `/auth/refresh` reads a refresh **cookie**
(`controller.ts:168`), while Schemathesis authenticates with a Bearer token, so it can only ever
reach 401. `/auth/switch-org` returns 403 because the seeded contract user is not a member of the
target organisation.

**All four are operations whose validity depends on cross-field agreement or database state.**
Fuzzing them can only ever exercise the rejection path.

## The decision to make

Not "how do we fix these" but **"should these four stay in the fuzzed selection?"**

There is precedent either way in this repo. `/api/v1/admin/_ping` was deliberately tagged outside
`DEFAULT_TAGS` (commit `638d75b`) on exactly this reasoning — _"the seeded contract fixtures hold no
admin role, so fuzzing it would only produce 403s."_ The three dummy-data endpoints were later given
a `Dummy Data` tag for the same reason.

Options, roughly:

1. **Accept the warnings.** They are honest output: the run passes, and the notes describe a real
   limitation. Cost is that four permanent warnings train people to ignore the WARNINGS block, which
   is the failure mode the missing-400 fix just cleared.
2. **Exclude the four from the selected set**, following the `_ping` precedent. Cost is that
   Schemathesis then covers less, and the exclusion needs a comment explaining why or it looks like
   someone hiding a failure.
3. **Give Schemathesis what it needs** — a refresh cookie, an org membership, seeded tokens — so the
   operations are genuinely exercised. Most work, most coverage, and the only option that increases
   what the suite proves.

Option 3 is the only one that makes the suite better rather than quieter. It is also the only one
that costs real effort, and part of it (a valid `verify-email` token) means seeding state that the
test then consumes.

## Not an ADR

Deliberately a todo. `documentation.md` reserves ADRs for decisions that constrain how the system is
built; this is a local choice about tag selection in one test runner, and the two prior instances of
the same choice were made inline without records. There are already 17 `Proposed` ADRs; another
would add to that pile without earning it.

## Reproducing

```bash
docker compose up -d
npm run build && npm run db:migrate:test && npm run seed:contract-tests
npm run contract:local:gate      # exit 0; read the WARNINGS block
```

The default `quick` profile does not surface these — it runs `phases: examples` only. `gate` and
`full` add `fuzzing`, which is what generates the rejected payloads.
