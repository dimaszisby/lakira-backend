# Todo — remove the orphaned OpenAPI schemas

- **Status:** Complete (2026-09-10) — delivered by #83 (`9d8e090`); all 16 removed, and the gate that would have caught them exists
- **Created:** 2026-09-10
- **Owner:** unassigned
- **Origin:** follow-up 2 from the C3 error-envelope work
  ([`2026-09-01-todo-error-envelope.md`](./2026-09-01-todo-error-envelope.md)), which aligned
  `components/schemas/ValidationError` rather than deleting it, to keep the cross-repo type change
  to a single rename

---

## What C3 reported, and what is actually there

C3's review named **two** unreferenced schemas, `Error` and `ValidationError`. A census of the
generated spec finds **sixteen** schemas with zero `$ref`s — but only **seven** of those are dead.
The distinction matters, because deleting the other nine would break the spec.

### Genuinely dead — registered, referenced by nothing, imported by nothing (7)

| Schema                       | Note                                                            |
| ---------------------------- | --------------------------------------------------------------- |
| `Error`                      | superseded by the seven response components                     |
| `ValidationError`            | duplicates `BadRequestError`; aligned by C3 rather than deleted |
| `GetTrendRequest`            | —                                                               |
| `MetricListResponse`         | superseded by cursor pagination (`MetricCursorResponse`)        |
| `MetricCategoryListResponse` | same                                                            |
| `MetricLogListResponse`      | same                                                            |
| `MetricSettingsListResponse` | same                                                            |

Verified two ways: zero `"#/components/schemas/<name>"` occurrences anywhere in the generated
document, and zero importers of the corresponding `<name>Schema` export outside its own definition
in `src/lib/openapi/openapi-schemas.ts`.

### NOT dead — registered and used, but inlined rather than `$ref`'d (9)

**Do not delete these.** They are query-parameter schemas, and `zod-to-openapi` inlines parameter
schemas into each operation instead of emitting a `$ref`. Each is used twice in
`src/lib/openapi/openapi-docs.ts`, so the spec would fail to generate without them:

`DashboardVisualizationQueryParams`, `MetricCategoryCursorQueryParams`, `MetricCursorQueryParams`,
`MetricDetailQueryParams`, `MetricIdQuery`, `MetricIdRequiredQuery`, `MetricLogCursorQueryParams`,
`MetricSettingsCursorQueryParams`, `VisualizationQueryParams`

They appear in `components/schemas` only because `registerSchema()` puts them there. That is the
cosmetic artifact, not a defect — but it is exactly the trap a naive "delete every unreferenced
schema" pass would fall into.

## Why it is worth doing

Low stakes, but not zero. `lakira-frontend` generates its types from this spec, so every orphan
becomes an exported TypeScript type nobody can use — `Error` and `ValidationError` are especially
misleading there, since both look like the error envelope and neither is. The frontend has a
hand-written `ApiFailure` that already drifted from the real shape; competing near-identical
definitions are how that happens.

`ValidationError` is also the second copy of the `path`-vs-`field` mistake C3 fixed. It carried
`path: string[]` for as long as it existed, and no response has ever sent it. C3 aligned it to
`field` rather than deleting it, deliberately, to keep that PR's cross-repo surface to one rename.
Deleting it now finishes that thought.

## Scope

Remove the seven dead schema definitions from `src/lib/openapi/openapi-schemas.ts` and regenerate
the spec. Nothing else imports them, so no call sites change.

**Sequence this after the frontend sync lands.** `lakira-frontend`'s snapshot is currently a week
behind and its `api-contract` CI job is red until it catches up; shipping a second spec change
mid-sync gives that work a moving target. Once the sync is merged, this is a clean follow-on and the
frontend picks it up on its next sync.

## The open question worth deciding at the same time

`scripts/validate-openapi.ts` has three checks — every `$ref` resolves and none is external,
operation ids are unique, no operation has empty responses. **It does not detect orphans**, which is
why seven accumulated silently.

Adding a fourth check is the obvious move, and this repo's recurring lesson is that a gate which
cannot fail is worse than none — `docs:openapi:check` validated drift but not validity,
`contract_staging` never issued a request, the error components validated `{}`. But a naive orphan
check flags all sixteen, including the nine live parameter schemas, so it needs a decision first:

1. **Allowlist the parameter schemas.** Simple, but a hand-maintained list drifts — the same failure
   mode being fixed.
2. **Stop registering parameter schemas.** If they do not call `registerSchema()` they never enter
   `components/schemas`, and the orphan check becomes exact with no allowlist. Requires confirming
   `zod-to-openapi` inlines them identically when unregistered — likely, since it already inlines
   them today, but it must be verified against a regenerated spec rather than assumed.
3. **Do not add a gate.** Delete the seven and accept that orphans can recur.

Option 2 is the better shape and the reason to think about it now rather than after the deletion:
it removes the artifact instead of documenting around it. It is also the only one of the three that
could turn out to be impossible, so verify before committing to it.

## Verification

```bash
npm run docs:openapi:generate
npm run lint && npm run typecheck && npm run format:check && npm run docs:openapi:check

# The census, which must show 9 remaining — the live parameter schemas — and none of the 7:
python3 -c "
import json; s=json.load(open('docs/reference/api/lakira-backend-openapi.json'))
blob=json.dumps(s)
dead=[n for n in s['components']['schemas'] if blob.count(f'\"#/components/schemas/{n}\"')==0]
print(len(s['components']['schemas']), 'schemas,', len(dead), 'unreferenced')
for n in sorted(dead): print('  -', n)
"
```

Operation count must stay **46** and Schemathesis selection **37/46**. Removing an unreferenced
schema must move neither; a change in either means something referenced was deleted.

---

## Review — completed 2026-09-10

Branch `fix/orphaned-openapi-schemas` off `dev` @ `fa1933e`.

**All 16 unreferenced schemas are gone, not the 7 planned.** The nine query-parameter schemas were
unregistered rather than deleted — option 2 from the open question — which removes them from
`components/schemas` while leaving every operation untouched.

### The open question resolved by experiment, before any of the work

The todo flagged option 2 as "the only one of the three that could turn out to be impossible".
Tested it first, on a throwaway edit: unregistered `MetricIdQuery` alone, regenerated, diffed.

```
components.schemas   64 → 63
operations           46 → 46      unchanged
metricId parameters   7 →  7      unchanged
spec diff            8 deletions — the schema definition, nothing else
```

`zod-to-openapi` inlines parameter schemas identically whether or not they are registered, so
registering them only ever added an unreferenced entry. Reverted, then did the real work knowing the
answer rather than hoping for it.

### Result

```
schemas        64 → 48     (7 dead deleted, 9 parameter schemas unregistered)
operations     46          unchanged
$refs         342 → 333
unreferenced   16 → 0
```

`paths` is **byte-identical** to `origin/dev`, `components.responses` is identical, and no surviving
schema definition changed. Verified by parsing both documents and comparing, not by reading the
diff.

### The gate, which can actually fail

`scripts/validate-openapi.ts` grew a fourth check: every `components/schemas` entry must be reachable
by `$ref`. It is **exact, with no allowlist**, because unregistering the parameter schemas removed
the only category that would have needed one — a hand-maintained exception list is the same drift
this check exists to stop.

Proven by injecting a `DeliberateOrphan` schema into the generated spec:

```
[OpenAPI] Specification is invalid — 1 problem(s):
  - unreferenced schema "DeliberateOrphan" — delete it, or $ref it from an operation
exit 1
```

and `exit 0` once removed. This repo has shipped three gates that could not fail
(`docs:openapi:check` validating drift but not validity, `contract_staging` never issuing a request,
the error components validating `{}`), so a new check is not credible until it has been seen to
reject something.

`docs:openapi:validate` already runs inside `docs:openapi:generate`, so `docs:openapi:check` enforces
this in CI with no workflow change.

### Cross-repo

`lakira-frontend` regenerates from this spec and loses 16 exported types it never used, `Error` and
`ValidationError` among them — both looked like the error envelope and neither was, which is exactly
how its hand-written `ApiFailure` drifted in the first place. Its `api-contract` job will flag the
snapshot as stale on the next PR; the fix there is the documented
`npm run api:spec:sync && npm run api:types:generate`.

### Also in this branch

A correction to `2026-09-10-todo-contract-gate-reproducibility.md`'s Review. It recorded the
intermittent `PATCH /metric-settings/{id}/display` failure as triggered by "a bare space"; a space is
`0x20` and `hasInvalidControlChars` rejects `< 0x20`, so that cannot be it. The real trigger is
`hasUnpairedSurrogates`, which no JSON Schema `pattern` can express — making it a fifth instance of
the class in `2026-09-01-todo-schemathesis-gate-warnings.md` rather than a spec-versus-code mismatch.
Details there.
