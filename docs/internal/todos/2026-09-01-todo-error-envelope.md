# Todo — unify and document the error envelope (C3)

- **Status:** Complete (2026-09-03) — delivered by `75cfdaa` (#79)
- **Created:** 2026-09-01
- **Owner:** unassigned
- **Prepared for:** a fresh Claude Code session with a full context window
- **Origin:** `C3` in the SaaS-readiness audit —
  [`FINAL-AUDIT-SUMMARY.md:126`](../audits/saas-readiness/FINAL-AUDIT-SUMMARY.md), P1, sized ≤1d,
  open and unchanged across three audit rounds (2026-05-01, 2026-05-24, 2026-06-05)

The audit entry reads: _"Error envelope inconsistent + undocumented — `error.ts` hand-rolls 3 shapes
(incl. an undocumented `fail` status), bypassing `errorResponse()`, violating `api-design.md`;
OpenAPI documents no 4xx/5xx schema (only 429)."_

Two clauses of that are now stale, and the finding is **larger** than it describes. Corrections are
in the next section — read them before trusting the audit row.

---

## Corrections to the audit entry, measured 2026-09-01

**"3 shapes" undercounts. There are 8 emission sites across 6 files**, and `error.ts` is only half
of them:

| Site                           | Emits                                                                  |
| ------------------------------ | ---------------------------------------------------------------------- |
| `error.ts:32` malformed JSON   | `{status:"fail", errors:[{field,message}]}`                            |
| `error.ts:46` Zod              | `{status:"fail", errors:[{field,message}]}`                            |
| `error.ts:74` **production**   | `{status:"error", message:"Something went wrong!"}`                    |
| `error.ts:79` dev/test         | `{status, message, stack?}`                                            |
| `validation.ts:16`             | `{status:"fail", errors:[{field,message}]}` — duplicates `error.ts:46` |
| `method-guard.ts:15,32`        | `{status:"fail", …}` at **405**                                        |
| `require-json-object.ts:12`    | `{status:"fail", …}`                                                   |
| `server.ts:181` `/ready` catch | `{status:"error"}` — **no `message` at all**                           |

**"OpenAPI documents no 4xx/5xx schema (only 429)" is no longer true.** Seven response components
now exist in `openapi-config.ts` (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`,
`NotFoundError`, `ConflictError`, `TooManyRequestsError`, `InternalServerError`) and are `$ref`'d
across the spec: 43 operations document a 400, 45 a 500, 41 a 401. The problem is no longer absence
— it is that **what they document is wrong, and structurally cannot fail**.

**`errorResponse()` has zero production callers.** `api-design.md:39` mandates it; `grep` finds only
its own definition (`response-formatter.ts:61`) and its unit test. Its sibling `successResponse()`
has **52**. So the success path is consistent and the error path was never wired up — the helper is
aspirational, not a migration target. Decide whether to wire it in or delete it; do not assume.

## The three defects worth fixing

### 1. `errors[].field` is emitted; `errors[].path` is documented

`zod-error-formatter.ts:9-12` produces a **dotted string**:

```ts
export const formatZodIssues = (error: ZodError): FormattedIssue[] =>
  error.errors.map((issue) => ({
    field: issue.path.join(".") || "body",
    message: issue.message,
  }));
```

`openapi-config.ts` `BadRequestError` declares `errors[].path` as `{type:"array", items:{type:"string"}}`.

This reaches a consumer. `lakira-frontend` generates its types from this spec, and
`src/types/api/generated/lakira-backend.d.ts:3079-3082` has:

```ts
errors?: { message?: string; path?: string[] }[];
```

`path` is always `undefined` at runtime, and `field` is not typed at all.

**Direction of the fix: change the spec to match the code, not the reverse.** `field` is what 30
integration assertions already expect, and a dotted string is more useful to a form than a segment
array. This is also the precedent already set in this file — see the comment above
`TooManyRequestsError`, which deliberately documents the number `status` the rate limiter really
sends and cites this very caveat by name.

**Why now rather than later:** no frontend code reads `errors` at runtime yet. The `errors` hits in
`InviteMemberForm.tsx` and `MetricForm.tsx` are react-hook-form's local `formState.errors`, not API
payloads. Both forms are one feature away from wanting server-side field mapping, and
`lakira-frontend/src/types/generics/ApiResponse.ts:18` already hand-declares a **third** shape,
`errors?: string[]`. Fix it while nothing depends on the wrong answer.

### 2. Production returns the wrong body for every 4xx

`error.ts:74` is not conditioned on status code:

```ts
if (env.NODE_ENV === "production") {
  res.status(appError.statusCode).json({
    status: "error",
    message: "Something went wrong!",
  });
}
```

So in production a 404 answers `{"status":"error","message":"Something went wrong!"}` while the spec
promises `{"status":"fail","message":"Resource not found"}`. Same for 400, 403, 409. The client is
told nothing actionable about an error that is entirely its own fault, and dev and production return
**different envelopes for the same request** — a Factor X parity break on top of the contract break.

`AppError` already computes the right discriminator (`AppError.ts:16`):

```ts
this.status = statusCode >= 400 && statusCode < 500 ? "fail" : "error";
```

The dev branch at `:79` uses it. The production branch throws it away.

**Preserve the masking for 5xx.** It exists so internal failures do not leak messages or stack
traces, and that is correct — `error.ts:79` appends `stack` in development only. The fix is to gate
the masking on `statusCode >= 500`, not to remove it. A security reviewer should confirm no 4xx
`AppError` message anywhere in `src/` embeds a database string or internal identifier before this
lands; `UniqueConstraintError` is mapped to a fixed `"Duplicate value"` at `error.ts:63`, which is
the one that would otherwise be a candidate.

### 3. `response_schema_conformance` is a gate that cannot fail

Every one of the seven components declares `properties` and **no `required`**, and none sets
`additionalProperties: false`:

```
UnauthorizedError     required=<none>
ForbiddenError        required=<none>
NotFoundError         required=<none>
BadRequestError       required=<none>
ConflictError         required=<none>
InternalServerError   required=<none>
TooManyRequestsError  required=<none>
```

A JSON Schema with no `required` and no `additionalProperties` validates `{}`. It validates
`{"anything":1}`. So Schemathesis's `response_schema_conformance` check passes trivially for all
seven error responses across 46 operations.

This is not hypothetical. PR #77 reported that the malformed-JSON body _"already conforms to the
existing `BadRequestError` component, which declares no required properties"_ — technically true and
substantively empty. It is the same shape as `docs:openapi:check` validating drift but not validity
(fixed 2026-08-27), and `contract_staging` having never issued a request (fixed 2026-08-29). **A
gate that proves less than it appears to is the recurring defect class in this repo.**

Adding `required` is what converts the fix into something CI can defend.

## THE TRAP: adding `required` will turn the local gate red, and that is the point

`npm run contract:local:gate` currently exits 0 with 1371/1371 passing. Tighten the schemas **before**
unifying the emitters and it will fail immediately — every 400 that omits `message`, every 405 that
has no documented response at all.

Do it in this order, and the red is diagnostic rather than confusing:

1. **Unify the emitters first**, so one shape is actually produced.
2. **Then tighten the schemas** to require exactly that shape.
3. **Then re-run the gate.** It should return to green with the checks now doing real work.

Reversing steps 1 and 2 means debugging a red gate with two candidate causes — the same reasoning
that kept the analytics 304 fix out of the newman PR
(`2026-08-31-todo-analytics-304-etag.md`).

**405 is emitted and entirely undocumented.** A status-code census of the generated spec returns
`{200, 201, 202, 400, 401, 403, 404, 409, 429, 500}` — no 405, though `method-guard.ts` returns one
on two paths. Either document it with a `MethodNotAllowedError` component or accept it explicitly;
tightening the other schemas without deciding will surface it as a mystery failure.

**`/health` and `/ready` are in no path in the spec.** `server.ts:181`'s `{status:"error"}` is
therefore unvalidated by anything. Out of scope — noted so it is not mistaken for a regression when
the census above does not mention them. `tests/smoke/run-smoke.mjs` exercises both.

## Scope

**Unify** — one envelope, emitted from one place. The eight sites collapse to a single helper. The
shape should be the one the code already predominantly sends and the tests already assert:

```json
{ "status": "fail" | "error", "message": "...", "errors": [{ "field": "...", "message": "..." }] }
```

`errors` present only where there are field-level issues. Decide `message`'s status deliberately: it
is currently **absent** from both `fail` bodies (`error.ts:33`, `:47`, `validation.ts:16`), which is
why `BadRequestError` cannot require it today. Requiring it means adding it at those sites.

**Then document** — set `required` on all seven components, rename `path` → `field`, and decide 405.

**Then reconcile the consumer** — regenerate `lakira-backend.d.ts` in `lakira-frontend` and collapse
its hand-written `ApiResponse.ts:18` `errors?: string[]` onto the generated type. That is a separate
PR in a separate repo, but the backend PR should say it is needed, because the last spec defect that
crossed this boundary (a dangling `$ref` to `TooManyRequestsError`) broke frontend type generation
and had to be fixed there in PR #68.

**Do not touch** — `successResponse()` and its 52 callers. The success envelope is consistent and is
not what C3 is about.

### Test blast radius, measured

- **29** `expect(res.body.status).toBe("fail")` assertions across eight files in
  `__tests__/integration/api/` (`auth`, `metric`, `metric-category`, `metric-log`,
  `metric-settings`, `analytics`, `analytics-caching`, `json-body-guard`), plus **1** in
  `__tests__/integration/docs/swagger.test.ts:7` — 30 in total
- **4** unit suites assert bodies directly: `error.test.ts` (`:56`, `:74`, `:88-89` — including the
  literal `"Something went wrong!"`), `validation.test.ts:99`, `method-guard.test.ts:27`,
  `response-formatter.test.ts:65,79`

`error.test.ts:88-89` is the one that encodes defect 2. Inverting it is the proof the fix landed;
if it still passes unchanged, production 4xx masking was not actually addressed.

## Current state, verified 2026-09-01

- `dev` @ `6ee8417` (PR #77), clean; `main` still on `Initial commit`
- `contract:local:gate` exits 0 — 1371 generated, 1371 passed, 4 advisory warnings characterised in
  `2026-09-01-todo-schemathesis-gate-warnings.md` (they are **not** defects; do not try to fix them
  as part of this)
- 46 operations, Schemathesis selects 37 — **neither number should move**
- `npm audit`: 3 moderate, 0 high/critical; `overrides` block is 3 entries
- `lakira-frontend` is checked out at `../lakira-frontend` and its generated types are readable

## Conventions this repo expects

- **Plan mode** for anything 3+ steps (`.claude/rules/workflow.md`)
- **Branch off `dev`.** Verify with `git rev-parse --abbrev-ref HEAD` **before** committing — a
  recent handover wrote the commit onto the previous branch because this was not checked, and a
  squash merge silently carried two unrelated commits into one PR
- **Conventional Commits**, enforced by a `commit-msg` hook and in CI since PR #74
- **Never blanket-stage.** A `pre-commit` hook rejects staged `.env*`; name explicit paths
- Commit messages go to `$(git rev-parse --git-dir)/COMMIT_DRAFT`, are shown in chat for review, and
  are applied with `git commit -F`. No `Co-Authored-By` or Claude references
- The user opens PRs and merges — Claude does not commit, push, or open PRs
- Record the outcome as a Review section appended to **this** file

## Verification the PR must show

```bash
npm run lint && npm run typecheck && npm run format:check && npm run docs:openapi:check
npm test

# The load-bearing check — the gate must be green with schemas that can now actually fail.
docker compose up -d
npm run build && npm run db:migrate:test
npm run seed:contract-tests
npm run contract:local:gate     # expect exit 0, 46 operations, 37 selected

# Prove the tightened schemas are not still vacuous:
python3 -c "
import json; s=json.load(open('docs/reference/api/lakira-backend-openapi.json'))
for k,v in s['components']['responses'].items():
    sch=v['content']['application/json']['schema']
    print(k, 'required=', sch.get('required','<NONE — NOT FIXED>'))
"
```

The last command is the one that distinguishes this work from cosmetic tidying. If any component
still prints `<NONE — NOT FIXED>`, the gate remains incapable of failing and defect 3 is unaddressed
regardless of how consistent the emitters became.

State the production-4xx behaviour change explicitly in the PR body: it changes what deployed
clients receive, and it is the only part of this work that is not backward compatible.

---

## Review — completed 2026-09-02

- **Branch:** `fix/error-envelope`, cut from `origin/dev` @ `d27e78d` with `--no-track`
- **Status:** Done. All three defects fixed; both open questions answered; one defect found that
  this brief's census missed, fixed here because it blocked the brief's own exit criterion.

## What changed

**One helper, `src/shared/utils/error-envelope.ts`.** `sendError(res, statusCode, message, {errors, stack})`
builds `{status, message, errors?, stack?}` and writes it. `status` is _derived_ from the status
code by `envelopeStatus()` and is never passed in, so the `fail`/`error` discriminator cannot drift
between call sites. `AppError.ts:16` no longer computes it independently — it imports
`envelopeStatus`, so there is exactly one copy of the rule.

All eight sites in the census now call it, plus a ninth found during verification:

| Site                       | Before                                 | After                                     |
| -------------------------- | -------------------------------------- | ----------------------------------------- |
| `error.ts` malformed JSON  | `{status, errors}` — no `message`      | `+ message: "Malformed JSON payload…"`    |
| `error.ts` Zod             | `{status, errors}` — no `message`      | `+ message: "Validation failed"`          |
| `error.ts` production      | masked **all** statuses                | masks **5xx only**                        |
| `error.ts` dev/test        | `{status, message, stack?}`            | unchanged in shape, now via the helper    |
| `validation.ts`            | `{status, errors}` — no `message`      | `+ message: "Validation failed"`          |
| `method-guard.ts` ×2 (405) | `{status, message}`                    | byte-identical, now via the helper        |
| `require-json-object.ts`   | `{status, errors}` — no `message`      | `+ message` (the guard's own message)     |
| `server.ts` `/ready` catch | `{status}` — **no message at all**     | `+ message: "Readiness check failed"`     |
| **`clientError` (new)**    | Node's bodyless 400, no `Content-Type` | the envelope — see "The ninth site" below |

`errors` entries keep their existing content byte for byte; only a top-level `message` was added.
That is what makes `message` requirable, which is what makes defect 3's fix possible.

## The three defects

**1. `path` → `field`.** Changed the spec to match the code, as the brief directed. Found a
**second** wrong copy the brief did not list: `components/schemas/ValidationError`
(`openapi-schemas.ts:58`) declared the same `path: string[]` shape. It is referenced by zero
operations but is still emitted into the spec and still generates a frontend type, so it was
aligned too. A scan of the generated spec now finds no `errors[].path` anywhere.

**2. Production 4xx.** Masking is gated on `statusCode >= 500`. `error.test.ts` now asserts the
inverse of what it used to: a 409 in production returns its real message, a 500 returns
`"Something went wrong!"`. Both directions are covered.

Security check the brief asked for: every 4xx `AppError` message in `src/` is a string literal or a
module constant. The only interpolated message is
`ResendEmailSender.ts:34` — `` `Resend email send failed: ${error.message}` `` — which is a **500**
and therefore still masked. `UniqueConstraintError` remains the fixed `"Duplicate value"` at 409.
Nothing leaks.

**3. The vacuous gate.** All seven response components now declare `required: ["status","message"]`,
and `BadRequestError`'s `errors` items declare `required: ["field","message"]`.

`additionalProperties: false` was deliberately **not** set. The handler appends `stack` in
development, so closing the schemas would fail against a dev server, and it would turn any future
additive field into a breaking change. `required` is what converts the check from "validates `{}`"
into one that can actually fail; that is the fix the brief asked for.

## The ninth site — found during verification, not in the census

`npm run contract:local:gate` **is red on `dev` today**, before any of this work. Verified by
stashing the entire change set and running the gate on the pristine tree: identical failure,
identical operation, identical cause.

```
POST /auth/refresh — JSON deserialization error + Missing Content-Type header
[400] Bad Request: <EMPTY>
```

The response carried exactly one header, `connection: close`, and no body — not an Express response
at all. **Node's HTTP parser** rejects a request with an illegal byte in a header (Schemathesis
fuzzes the `Cookie` value) and answers before any middleware runs, so the error handler never sees
it. Reproducible directly:

```
printf 'POST /api/v1/auth/refresh HTTP/1.1\r\nHost: x\r\nCookie: a=\x7f\r\n\r\n' | nc localhost 4000
```

This is an error response the API emits that does not carry the envelope, so it is a C3 defect —
just one invisible to a `grep` for `.json(` in `src/`, which is why the census has eight rows and
not nine. It is fixed by `src/shared/middleware/client-error.ts`, which answers the socket by hand
with the same envelope. That is a scope addition beyond the brief; it is included because the
brief's own exit criterion (`contract:local:gate` exits 0) is unreachable without it, and landing
the tightened schemas onto an already-red gate would have left the next person with exactly the
two-candidate-causes problem THE TRAP warns about.

`attachClientErrorHandler(server)` is called from both `startServer()` and `jest.setup.ts`. A server
that skips it silently reverts to Node's bodyless 400, so it is a named export rather than an inline
`server.on(...)`.

**Note the brief's baseline "gate exits 0 with 1371/1371" no longer held as written on 2026-09-01.**
The run is unseeded, so whether the fuzzer generates a malformed cookie varies; it failed on 3 of 3
runs during this work, including the pristine-tree run.

## Open question: `errorResponse()` — deleted, not wired in

**Deleted**, along with its `ErrorResponse` interface and its two unit tests.

Wiring it in would have meant rewriting it completely, at which point nothing of the original
remained. Its body was `{status:"error", message, error, code, errors, data:null, success:false}` —
a fourth shape, incompatible in three separate ways:

- hardcoded `status:"error"`, so every 4xx would be mislabelled — the exact defect 2 being fixed
- `errors?: string[]`, not `{field,message}[]` — the exact defect 1 being fixed
- an `error: unknown` field serialising the raw error object to the client, which is a leak the 5xx
  masking exists to prevent

More to the point, the architecture it implied was never the one this codebase has. Errors here are
**thrown** (`AppError`) and rendered centrally; that is a better design than 52 controllers each
hand-formatting a body, and it is what `successResponse()`'s 52 callers do _not_ have an equivalent
of by accident. `api-design.md:39` mandated a helper describing an architecture that was never
built. The rule was rewritten to document the real contract; `.claude/skills/new-feature/SKILL.md:30`
was corrected to match.

## Decision: 405 stays undocumented, deliberately

No `MethodNotAllowedError` component was added. 405 is only ever returned for a method/path pair
that is **not an operation in this spec** — `TRACE` anywhere via `disallowTraceMethod`, or
`methodNotAllowed([...])` catch-alls such as `DELETE /auth/login`. There is no operation to hang the
response on, OpenAPI cannot describe a response for an undefined method, and Schemathesis never
generates such a request. An unreferenced component would be dead weight here and would generate an
unused type in `lakira-frontend`. The status-code census is unchanged and still omits 405; the
reasoning is recorded in a comment in `openapi-config.ts` so the next reader does not re-open it.
The body it sends is the same envelope as everything else.

## Verification

```
npm run lint            PASS
npm run typecheck       PASS
npm run format:check    PASS
npm run docs:openapi:check   PASS (spec generation confirmed idempotent — regenerating twice is a no-op)
npm test                PASS 556 unit (88 suites) + 182 integration (26 suites, 5 skipped)
npm run contract:local:gate  PASS exit 0 — 1370 generated, 1370 passed, 46 operations, 37 selected
```

Neither 46 nor 37 moved, as required.

```
UnauthorizedError    required= ['status', 'message']
ForbiddenError       required= ['status', 'message']
NotFoundError        required= ['status', 'message']
BadRequestError      required= ['status', 'message']
InternalServerError  required= ['status', 'message']
ConflictError        required= ['status', 'message']
TooManyRequestsError required= ['status', 'message']
```

No `<NONE — NOT FIXED>`. Defect 3 is addressed.

### One warning count moved, and it is explained

The gate now reports `Schema validation mismatch: 3 operations` where the brief characterised 2. The
third is `POST /auth/refresh`, which was **already** in the warning set under the _other_ heading
(401, cookie-based auth — `2026-09-01-todo-schemathesis-gate-warnings.md`). It now appears under
both because malformed-cookie requests receive a documented 400 rejection instead of aborting at the
protocol layer. Still the same four operations; no new operation entered the set, and the four
remain not-defects.

## Follow-ups, not done here

1. **`lakira-frontend` must regenerate `lakira-backend.d.ts`.** `src/types/api/generated/lakira-backend.d.ts:3079-3082`
   currently types `errors?: {message?: string; path?: string[]}[]`; `path` becomes `field`, and
   `status`/`message` become required rather than optional. Nothing reads `errors` at runtime yet
   (the hits in `InviteMemberForm.tsx` / `MetricForm.tsx` are react-hook-form's local
   `formState.errors`), and no hand-written code references the `ValidationError` type, so this is a
   type-surface change only. `src/types/generics/ApiResponse.ts:18`'s hand-declared
   `errors?: string[]` should collapse onto the generated type in the same PR. Flagging it because
   the last spec defect to cross this boundary broke `api:types:generate` and had to be fixed in
   frontend PR #68.
2. **`components/schemas/Error` and `ValidationError` are referenced by zero operations.** They were
   aligned rather than deleted, to keep this PR's cross-repo type-surface change to the single
   `path` → `field` rename. Removing them is a reasonable follow-up, best done with the frontend
   regeneration above.
3. **The rate limiters remain the one deliberate exception.** `express-rate-limit` renders its own
   `message` option and sends `status` as the number `429`, not the string `"fail"`.
   `TooManyRequestsError` documents that truthfully and now requires it. Routing the limiters through
   `sendError` would change a deployed response shape for no gain C3 was about.
4. **`/health` and `/ready` are still in no path in the spec**, as the brief noted. `/ready`'s error
   branch now carries a `message`, but nothing validates it beyond `tests/smoke/run-smoke.mjs`.
