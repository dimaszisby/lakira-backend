# Todo — lint for floating promises

- **Status:** Open (P3)
- **Created:** 2026-10-02
- **Owner:** unassigned
- **Origin:** kit `drainable-background-work`, out of scope

---

## What

ADR-0054 says work started after the response goes through `runInBackground`, never a bare
promise. Nothing enforces it: the two call sites that caused audit finding R3 were found by
reading. `@typescript-eslint/no-floating-promises` would catch the next one. Typed linting is
already configured (`eslint.config.mjs` sets `parserOptions.project`), so the rule can be switched
on without new tooling.

## Suggested fix

Enable `@typescript-eslint/no-floating-promises` for `src/**`, with `void` allowed for the
deliberate cases (`void shutdown(...)` in `src/server.ts` and `src/worker.ts`,
`src/utils/catch-async.ts`). Run it first to size the sweep; fix or annotate what it reports.
Lean kit unless the sweep turns up a real defect.
