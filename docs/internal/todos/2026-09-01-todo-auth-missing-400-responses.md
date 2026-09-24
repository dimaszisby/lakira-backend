# Todo — three auth operations don't document their 400

- **Status:** Complete (2026-09-01) — delivered by #77 (`6ee8417`)
- **Created:** 2026-09-01
- **Owner:** dimaszisby

Small and fully characterised. Everything below was verified against a running stack on 2026-09-01,
not inferred.

---

## The gap

**23 of 26 body-accepting operations document a `400`. Three do not:**

| Operation                        | Registered at                         |
| -------------------------------- | ------------------------------------- |
| `POST /auth/logout`              | `src/lib/openapi/openapi-docs.ts:215` |
| `POST /auth/refresh`             | `src/lib/openapi/openapi-docs.ts:237` |
| `POST /auth/resend-verification` | `src/lib/openapi/openapi-docs.ts:406` |

This is a consistent omission across three sibling auth routes — the same shape as N5, where two
dummy endpoints were undocumented while the third sibling was fine.

## Where the 400 comes from — reproduced, not assumed

Malformed JSON is rejected by the body parser before the handler runs. Measured against
`http://localhost:8001/api/v1`:

| Route                       | malformed JSON | empty body `{}` | no body |
| --------------------------- | -------------- | --------------- | ------- |
| `/auth/logout`              | **400**        | 200             | 200     |
| `/auth/refresh`             | **400**        | 401             | 401     |
| `/auth/resend-verification` | **400**        | 401             | 401     |

Note the handler's own missing-token path throws **401**, not 400
(`auth/infrastructure/http/controller.ts:171`) — so this is not an auth-logic defect. The
documented 200/401 behaviour is correct; only the 400 is missing.

## Why CI is green while the local gate is red

Schemathesis's default `quick` profile runs `phases: examples` — it sends only documented example
values, so it never produces a malformed body. The `gate` and `full` profiles add the `fuzzing`
phase, which does. So `npm run contract:local:gate` fails `status_code_conformance` locally while CI
stays green.

A gate that is red for a known-benign reason is one people learn to ignore, which is the actual cost
here.

## The fix

Add to each of the three operations' `responses`, matching what the other 23 already do:

```ts
400: { $ref: "#/components/responses/BadRequestError" },
```

The component is already defined in `openapi-config.ts` — no new component needed. Then
`npm run docs:openapi:generate`.

**The emitted body already conforms**, so nothing in `src/` needs changing. Verified:

```
emitted:    {"status":"fail","errors":[{"field":"body","message":"Malformed JSON payload…"}]}
documented: properties status, message, errors — required: (none, all optional)
```

Because no property is required, the absent top-level `message` does not break
`response_schema_conformance`.

## Verification

```bash
npm run docs:openapi:generate     # runs docs:openapi:validate; every $ref must resolve
npm run docs:openapi:check        # clean after committing the regenerated spec
npm run lint && npm run typecheck && npm run format:check
npm test

# The one that proves the point — currently red, must go green:
docker compose up -d
npm run build && npm run db:migrate:test && npm run seed:contract-tests
npm run contract:local:gate
```

Expect the spec to stay at **46 operations** and Schemathesis at **37/46 selected** — adding a
response to an existing operation changes neither. If either number moves, something else changed.

## Conventions

Plan mode is not needed for a change this size. Branch off `dev`; Conventional Commits (enforced by
a `commit-msg` hook and in CI); never blanket-stage (a `pre-commit` hook rejects staged `.env*`);
commit message goes to `$(git rev-parse --git-dir)/COMMIT_DRAFT`, is shown in chat, and is applied
with `git commit -F`. No Claude attribution in messages or PRs. The user opens and merges PRs.
Record the outcome by flipping this file's Status to Complete.

---

## Outcome

Three `400: { $ref: "#/components/responses/BadRequestError" }` entries added to the operations at
`openapi-docs.ts:215`, `:237`, `:406`; spec regenerated. No `src/` change was needed — the emitted
body already conformed.

| Check                                     | Result                                             |
| ----------------------------------------- | -------------------------------------------------- |
| Body-accepting operations documenting 400 | **26 of 26** (was 23)                              |
| Total operations                          | **46** — unchanged, as expected                    |
| Schemathesis selection                    | **37 / 46** — unchanged                            |
| `$ref` resolution                         | 343 refs, all resolve                              |
| **`npm run contract:local:gate`**         | **exit 0 — 1371 generated, 1371 passed** (was red) |
| lint / typecheck / format:check           | 0                                                  |
| `test:unit`                               | 540 passed, 86 suites                              |

The gate run is the result that matters: it exercised the `fuzzing` phase that produces malformed
bodies, which is what the default `quick` profile never reaches and why CI stayed green while the
local gate failed.

Schemathesis emits two advisory notes — "Authentication failed: 2 operations" and "Schema validation
mismatch: 2 operations" — on the gate profile. These are informational, the run exits 0, and they
predate this change. Worth a look eventually, but not part of this fix.
