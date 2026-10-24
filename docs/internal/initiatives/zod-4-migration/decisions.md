# Decisions — zod-4-migration

D-04 to D-10 were taken during implementation on 2026-10-24, each forced by a corpus diff named in
its context, and written down at the end of that day's implementation rather than as each was
taken.

## D-01 — Migrate to zod 4 rather than waive the advisory

- **Status:** Proposed
- **Date:** 2026-10-24

Promoted to the architecture decision registry as **[ADR-0083](../../../explanation/decisions/adr-0083-zod-4-with-zod-3-error-text.md)**.
That file is authoritative; this entry is a pointer.

---

## D-02 — zod-to-openapi 9.1.0, not 8

- **Status:** Proposed
- **Date:** 2026-10-24

**Context.** zod-to-openapi 8 is the first major to take zod 4 (peer `zod ^4.0.0`); 9.0.0 and
9.1.0 take the same.
**Decision.** 9.1.0. Its release notes list two TypeScript-only breaks against 8
(`ResponseConfig.description` and `ZodMediaTypeObject.schema` optional), neither of which this
repo relies on, and 9.1.0 adds `z.guid()` support, which D-08 uses.
**Options considered.** _8.5.0:_ one major behind for no gain.
**Consequences.** The lockfile also moves `openapi3-ts` 4.5.0 to 4.6.2 and `yaml` 2.8.3 to 2.9.1.

---

## D-03 — Every parse answers in zod 3's words

- **Status:** Proposed
- **Date:** 2026-10-24

Promoted to the architecture decision registry as **[ADR-0083](../../../explanation/decisions/adr-0083-zod-4-with-zod-3-error-text.md)**.
That file is authoritative; this entry is a pointer.

---

## D-04 — A default a transform follows is `.prefault`

- **Status:** Proposed
- **Date:** 2026-10-24

**Context.** In zod 3, `z.string().transform(Number).default("5000")` fed `"5000"` through the
transform. zod 4's `.default` returns its value as the output, unparsed, and must be of the output
type: typecheck refused 33 of them in `zodEnv.ts`. The security gate's two default rules
(`CFG-SWAGGER-001`, `CFG-RATE-LIMIT-001`) match `.default("true")` and `.default("false")` in the
source, and failed once those read `.prefault`.
**Decision.** Those 33 are `.prefault`, zod 4's name for zod 3's behaviour. A default no transform
follows stays `.default`, where both mean the same. The two gate rules match either spelling.
**Options considered.** _Rewrite each as `.default(<parsed value>)`:_ 33 values to retype by hand,
each a chance to change a default; `.prefault` keeps the source value. _Leave the gate rules and
keep `.default` on those two variables:_ two spellings for one idea in one file.
**Consequences.** The env run gives the same keys, values and types for both env examples under
each `NODE_ENV`.

---

## D-05 — The settings update takes display options with no default

- **Status:** Proposed
- **Date:** 2026-10-24

**Context.** The update schema held `zDisplayOptions.optional()`, and `zDisplayOptions` ends in
`.default({...})`. zod 3 stopped at `.optional()` when the key was missing; zod 4 runs the inner
default. The corpus caught it: an update sending only `alertEnabled` came back with
`displayOptions` reset to the defaults, and an empty update passed "Provide at least one field".
**Decision.** `zod-rules.ts` exports `zDisplayOptionsObject`, the object with its per-field
defaults, and `zDisplayOptions` is that with the whole-object default. The update takes
`zDisplayOptionsObject.optional()`.
**Options considered.** _`.optional()` around a `.prefault`:_ still applied.
**Consequences.** An update sent `displayOptions: { priority: 5 }` still gets the other three
fields' defaults, as before. A test fails if an update fills options it was not sent.

---

## D-06 — A union names the fields of its closest object option

- **Status:** Proposed
- **Date:** 2026-10-24

**Context.** zod 4 reports a union no option matched as one `invalid_union` at the union's path.
The metric-settings bodies are a union (goal on, goal off), so any bad field answered
`body: Invalid input`. zod 3 named the field when an option failed only a refinement, and also
answered `body: Invalid input` otherwise: 24,536 corpus cases, among them an empty create body.
zod 4 also runs a length check on a value of the wrong type, so `password: []` drew a second issue.
**Decision.** `formatZodIssues` and `describeZodIssues` replace an `invalid_union` with the issues
of its closest object option (fewest issues, first on a tie), under the union's path. A union of
primitives stays one "Invalid input". A field with an `invalid_type` issue keeps only that one.
**Options considered.** _Re-create zod 3's rule exactly:_ it depends on which checks zod 3
aborted on, and zod 4 classes some of them differently (`.int()` is now a type); the result would
be a copy of a rule that told the client less. _Leave zod 4's bare issue:_ a regression on every
settings field.
**Consequences.** The one place the client sees a different answer: the field instead of `body`,
on metric-settings create and update. The envelope is unchanged.

---

## D-07 — Logs carry zod 4's issue codes

- **Status:** Proposed
- **Date:** 2026-10-24

**Context.** zod 4 renamed issue codes: `invalid_enum_value` and `invalid_literal` are
`invalid_value`, `invalid_string` is `invalid_format`. `describeZodIssues` logs them; no client
sees them.
**Decision.** Keep zod 4's codes. Two tests that named `invalid_enum_value` now name
`invalid_value`.
**Options considered.** _Map them back:_ code for a log no alert reads.
**Consequences.** A log search for the old codes finds nothing from 2026-10-24.

---

## D-08 — A request UUID is checked with `.guid()`

- **Status:** Proposed
- **Date:** 2026-10-24

**Context.** zod 3's `.uuid()` took any 8-4-4-4-12 hex string. zod 4's follows RFC 9562, so the
corpus's `11111111-1111-1111-1111-111111111111` was refused by schemas that use `.uuid()` alone,
where zod 3 let it reach a 404. `zUUID` and `UuidSchema` add a v1 to v5 regex, so they already
refused it.
**Decision.** Every request schema uses `.guid()`, zod 4's name for zod 3's check:
`zod-rules.ts`, the metric-category, metric-log and analytics params, the trend params, and
`UuidSchema` and `SwitchOrgRequest`, which `GetByIdParamSchema` and the switch body parse with.
`.guid()` emits no `format`, so the six spec places that lost `format: "uuid"` set it in
`.openapi()`. Response-only schemas keep `.uuid()`.
**Options considered.** _Keep `.uuid()`:_ an id that is not RFC 9562 would get a 400 instead of a
404, a change outside this task.
**Consequences.** None visible.

---

## D-09 — The cursor lists' `q` and `after` are optional keys

- **Status:** Proposed
- **Date:** 2026-10-24

**Context.** `q` and `after` are `z.union([z.string(), z.undefined(), z.null()]).transform(...)`.
zod 3 accepted a missing key there; zod 4 does not treat a union holding `z.undefined()` as an
optional key, and every cursor list without `q` and `after` failed ("expected nonoptional").
**Decision.** `.optional()` after the union, in the metric, metric-log and metric-category
schemas.
**Options considered.** _`z.string().nullish()`:_ a number would answer "Expected string" instead
of "Invalid input".
**Consequences.** None visible.

---

## D-10 — The spec's remaining differences are kept

- **Status:** Proposed
- **Date:** 2026-10-24

**Context.** With D-08's formats restored, the regenerated spec differs from `dev`'s in eleven
places, compared as parsed JSON with key order ignored: three duplicate `{"type": "null"}` gone
from `goalType`, the `displayOptions` default gone from both update request options, and six
parameters carrying their schema's description. The rest of the 319-line text diff is key order.
**Decision.** Keep all eleven. The duplicates said nothing; the update never applied that default,
zod 3 included (D-05); the descriptions are documentation.
**Options considered.** _Normalise key order in `normalize-openapi.ts`:_ a larger diff now, to
save one.
**Consequences.** Generated client types do not change, so no Notion record: the frontend has
nothing to act on.

---

## D-11 — Take the `body-parser` patch here, through the lockfile

- **Status:** Proposed
- **Date:** 2026-10-24

**Context.** CI on this branch's PR failed the security gate on a second new High:
GHSA-27r3-jxmh-p828, published 2026-10-23 20:53 UTC, a denial of service in `body-parser` before
1.20.9 through trailing bytes after a compressed request body. `body-parser` 1.20.8 parses every
JSON body (`http-pipeline.ts`), as a direct dependency (`^1.20.4`) and through Express 4.22.3
(`~1.20.5`). 1.20.9 is inside both ranges.
**Decision.** `npm update body-parser`: the lockfile moves to 1.20.9, `package.json` does not.
Taken on this branch, whose job is to make the gate pass again, and logged in this kit, not in
`npm-audit-findings`, where #220 adds D-10 to the same place.
**Options considered.** _A branch of its own:_ this PR would stay red until it merged, and so
would every other. _`npm audit fix`:_ reaches for the accepted `uuid` moderates, as
`npm-audit-findings` D-05 recorded.
**Consequences.** `npm ls --omit=dev --all` differs only in `body-parser`'s two lines. One full
integration run failed two analytics `GET` tests with `socket hang up`; they passed alone three
times and in the next full run, a sighting of B-11 recorded in its todo.
