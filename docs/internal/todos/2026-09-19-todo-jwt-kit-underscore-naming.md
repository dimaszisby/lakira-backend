# Todo — the jwt kit uses underscores against the kebab-case rule

- **Status:** Open — lowest priority of the three filed 2026-09-19
- **Created:** 2026-09-19
- **Owner:** unassigned
- **Prepared for:** whoever next has reason to touch the jwt kit
- **Origin:** noticed during the kit-format survey; deliberately left alone at the time

---

## The problem

[`docs/internal/initiatives/jwt/`](../initiatives/jwt/) contains `jwt_overhaul_plan.md` and
`jwt_overhaul_checklist.md`. Every other kit uses kebab-case and the `<slug>-plan.md` /
`<slug>-checklist.md` shape that `.claude/rules/documentation.md` now states as the template.

Filed so it is not rediscovered as a surprise by someone who assumes it is precedent. **It is not
precedent.** New kits follow the templates.

## Why this is not an easy rename

- Renaming touches inbound links from `README.md`, `decisions.md`, and anything outside the kit
  that points at either file. Grep before moving: `grep -rn "jwt_overhaul" docs/ .claude/`
- The kit predates the cutover, and the rules say earlier kits are left as written — records are
  immutable. A rename is defensible as a naming correction, but it is genuinely optional.

## Options

1. **Leave it.** Consistent with the cutover rule. Costs nothing; the inconsistency stays visible.
2. **Rename with `git mv` and fix every inbound link** in the same commit. Do not do half of this.

## Done when

Either the files are renamed with all inbound links updated and `npm run format:check` passing, or
this todo is closed with a note that option 1 was chosen deliberately.
