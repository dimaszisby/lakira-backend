# ADR-0083 — Validation runs on zod 4, and answers in zod 3's words

- **Status:** Accepted
- **Date:** 2026-10-24
- **Related:** `.claude/rules/validation.md`; `.claude/rules/api-design.md` § Response Format (the
  error envelope this keeps)
- **Origin:** `D-01` and `D-03` in the zod-4-migration kit —
  [`zod-4-migration`](../../internal/initiatives/zod-4-migration/decisions.md); register row B-92,
  advisory GHSA-mrhx-c7xc-m3w5

---

## Context

`npm audit` began reporting GHSA-mrhx-c7xc-m3w5 (High, CVSS 7.5) against `zod` 3.25.76 on
2026-10-23: an array schema with no length limit collects an issue for every failing element, so
a large array can exhaust memory. Every release before 4.6.6 is affected, and no 3.x release is
patched. `@asteasolutions/zod-to-openapi` 7 was reported with it, through its `zod` dependency.
Both are production dependencies, so the security gate stopped every branch and `dev` itself.

No request schema here holds an array and bodies are capped at 1 MB, so the advisory was not
reachable from a request. The gate cannot see that, and accepting the risk had no mechanism: the
delta check marks every npm finding open.

zod 4 is not a drop-in upgrade. Run over the same 1.43 million inputs, our 105 request schemas
answered differently in five ways: a missing cursor parameter was refused, a partial update reset
`displayOptions` to their defaults, test UUIDs that break RFC 9562 were refused, a union no option
matched was reported as one bare issue, and every default message was reworded ("Invalid input:
expected string, received undefined" for "Required").

## Decision

1. **`zod` moves to 4.x (4.6.7) and `@asteasolutions/zod-to-openapi` to 9.x (9.1.0).** No
   waiver.
2. **Parsing behaves as it did.** Each of the first three differences is fixed in the schema
   (kit D-04, D-05, D-08, D-09). The corpus diff is the proof: the same inputs pass and fail,
   with the same output and on the same fields.
3. **Messages are zod 3's.** Every parse passes `{ error: zod3Messages }`
   (`src/shared/utils/zod3-messages.ts`), an error map that words each issue as zod 3 did. A
   message a schema sets itself still wins. There is no global `z.config`: what is configured is
   visible at each parse.
4. **A union reports the fields of its closest object option** (`zod-error-formatter.ts`). zod 3
   did this only when the option failed a refinement, and otherwise answered `body: Invalid
input`; this names the field in both cases. It is the one place where the answer differs from
   zod 3's, and only by being more specific.
5. **Logs carry zod 4's issue codes** (`invalid_value` where zod 3 wrote `invalid_enum_value`).
   They reach no client.

## Options considered

- _A time-boxed waiver in the security gate, and the migration later._ It needed a new exception
  mechanism in the gate, and the owner preferred to fix the cause.
- _Accept zod 4's messages._ Every 400 a client has seen would change its text, for no gain to the
  client.
- _A global error map through `z.config`._ Fewer lines, but a side effect at import time, and a
  parse that ran before the import would answer in other words.
- _zod-to-openapi 8._ 9 differs from it only in two TypeScript types, and is the newest.

## Consequences

- The advisory is cleared; `npm audit --omit=dev` reports only the accepted `uuid` moderates.
- A new parse site passes `{ error: zod3Messages }`, or it answers in zod 4's words.
- A default that a transform follows is written `.prefault(...)`: zod 4's `.default` returns its
  value without parsing it. The security gate's two default rules read either spelling.
- The OpenAPI document keeps its meaning: three duplicate `null` entries go, the update request
  no longer claims a `displayOptions` default it never applied, and six parameters carry their
  description. Generated client types do not change.
- The `[ENV_ERROR]` line's issue objects lose zod 3's `received` field; their paths and messages
  are unchanged.

## Enforcement

`__tests__/unit/shared/utils/zod3-messages.test.ts` holds each message to zod 3's text;
`__tests__/unit/shared/utils/zod-error-formatter.test.ts` holds the union and type-error rules;
`__tests__/unit/features/metric-settings/infrastructure/http/schema.zod.test.ts` fails if an update
fills `displayOptions` it was not sent.

## Links

- Kit: [`zod-4-migration`](../../internal/initiatives/zod-4-migration/README.md)
- Advisory: <https://github.com/advisories/GHSA-mrhx-c7xc-m3w5>
