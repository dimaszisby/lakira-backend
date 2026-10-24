# zod 4 migration — Plan

- **Status:** Approved
- **Appetite:** 3 days — past that, cut what remains into its own row rather than extend
- **Date:** 2026-10-24

## Context and goals

On 2026-10-23 #220 (B-91) failed CI for a reason that was not its own: `npm audit` began reporting
GHSA-mrhx-c7xc-m3w5 (High, CVSS 7.5) against `zod` 3.25.76, and through it against
`@asteasolutions/zod-to-openapi` 7.3.4. An array schema with no length limit collects an issue for
every failing element, so a large array can exhaust memory. Every `zod` before 4.6.6 is affected,
and there is no 3.x fix. Both are production dependencies, so the security gate stopped `dev` and
every branch.

Exposure was low: no request schema uses `z.array`, `z.set`, `z.record` or `z.map`, and bodies are
capped at 1 MB. The gate cannot see that. The owner chose (2026-10-24) to migrate rather than
waive.

Read on `dev` at `d1ff8da`: 25 files import `zod` or `zod-to-openapi`. Known breaks: `ZodError.errors`
is gone, `required_error` is gone, `z.record` needs a key schema, `.default` no longer parses its
value, `.uuid()` follows RFC 9562, and every default message is reworded.

## Acceptance criteria

- **AC-1** — `zod` is at least 4.6.6 and `zod-to-openapi` is the newest major that supports it;
  `npm audit --omit=dev` and the security delta gate report no High. _Why:_ the advisory.
- **AC-2** — Every request that passed validation still passes with the same output, and every
  one that failed still fails on the same field, without loosening a test's field or status. The
  one exception is D-06, where a union now names the field zod 3 left as `body`. _Why:_ a
  dependency upgrade must not change the API.
- **AC-3** — Every message a client sees is the one it saw. _Why:_ the frontend shows them.
- **AC-4** — The regenerated OpenAPI document is valid, and each difference is reverted at the
  source or recorded; a change the frontend must act on gets a Notion record. _Why:_ the
  frontend generates its types from it.
- **AC-5** — `buildEnv` gives the same keys, values and types for each committed env example,
  under each `NODE_ENV`. _Why:_ a changed default is a changed deployment.
- **AC-6** — An ADR records the migration; `.claude/rules/validation.md` and
  `.claude/rules/environment.md` match the code. _Why:_ the next schema is written from them.
- **AC-7** — Every gate passes, image smoke included. _Why:_ a production dependency changes.

## Open questions

None.

## Out of scope

- Replacing zod 4's deprecated but working APIs (`z.string().email()`, `.superRefine`, `.merge`).
- An exception mechanism for the security gate.
- Length limits for arrays: no request schema has one to limit.
- The dependency policy's audit snapshot: #220 writes one dated 2026-10-24 that is true once
  this lands, and two branches editing the same section would conflict.

## Decisions expected

All taken during the work: [decisions.md](decisions.md) D-01 to D-11.

## Phases

- **Phase 0** — branch; baselines on `dev` (a corpus of 1.43 million inputs through 105 schemas,
  the parsed env, the spec).
- **Phase 1** — the upgrade and the type errors.
- **Phase 2** — behaviour: diff the corpus, fix each cause in the schema.
- **Phase 3** — messages and issue reporting.
- **Phase 4** — the spec diff.
- **Phase 5** — tests, gates, review, docs.

## Risks and trade-offs

- D-06 changes the text of some 400s, for the better. A client that matched `body: Invalid input`
  on a metric-settings body sees the field instead.
- A parse site added later without `{ error: zod3Messages }` answers in zod 4's words (D-03).

## Security and data

The advisory is a denial of service. Nothing else about the trust boundary changes: the same
inputs are refused. zod 4 leaves an input out of its issues unless asked, so neither the 400 body
nor the `[ENV_ERROR]` line gains a value.

## References

- Advisory: <https://github.com/advisories/GHSA-mrhx-c7xc-m3w5>
- zod 4 changelog: <https://zod.dev/v4/changelog>
