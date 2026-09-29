# Todo — the `esbuild` override crosses `tsx`'s declared range

- **Status:** Open — kept deliberately; revisit when `tsx` widens its range
- **Created:** 2026-09-29
- **Owner:** unassigned
- **Origin:** the `npm-audit-findings` kit, D-03

---

## What

`package.json` `overrides` pins `"esbuild": "0.28.2"`. Its only consumer, `tsx@4.21.0`, declares
`esbuild ~0.27.0`. In 0.x a minor bump is a breaking range, so the pin breaks rule 1 (same major
only) of `docs/reference/security/dependency-policy.md` § Transitive Overrides.

It is kept because removing it resolves `esbuild` 0.27.7, which `npm audit` flags low (arbitrary
file read via the dev server). Dev-only; `tsx` runs scripts and the contract seed, all green on
0.28.2.

## When to act

When a `tsx` release declares `esbuild >=0.28` (check `npm view tsx dependencies.esbuild`), bump
`tsx`, remove the override, and confirm `npm audit` stays clear. If `esbuild` publishes a patched
0.27.x first, removing the override is enough on its own.
