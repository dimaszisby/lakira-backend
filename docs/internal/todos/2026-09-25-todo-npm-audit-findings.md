# Todo — triage the `npm audit` findings on `dev`

- **Status:** Open
- **Created:** 2026-09-25
- **Owner:** unassigned
- **Origin:** found by the `node-24-runtime` kit, when `npm install` on 2026-09-25 reported the
  audit summary

---

## What

On 2026-09-25, with `dev`'s lockfile plus only the Node 24 changes, `npm install` reported
**13 vulnerabilities (1 low, 8 moderate, 4 high)**. The same command on 2026-09-24 reported 10
(1 high), and the lockfile did not change between the two runs, so the difference is most likely
newly published advisories. That has not been confirmed.

`npm audit fix` was tried on the `node-24-runtime` branch and reverted, so that the runtime change
ships on its own. It bumped, within existing ranges: `express` 4.22.2 to 4.22.3, `body-parser`
1.20.6 to 1.20.8, `qs` 6.15.3 to 6.16.0 and `morgan` 1.11.0 to 1.12.1 (production), plus
`@eslint/eslintrc`, `@humanfs/*` and `joi` (dev). After it, `npm audit` still reported 3 moderate
and 4 high:

| Severity | Package                       | Fix per `npm audit`                     |
| -------- | ----------------------------- | --------------------------------------- |
| high     | `@eslint/eslintrc`            | available                               |
| high     | `@istanbuljs/load-nyc-config` | available                               |
| high     | `cosmiconfig`                 | available                               |
| high     | `js-yaml`                     | available                               |
| moderate | `jest-junit`                  | breaking (`jest-junit@17.0.0`)          |
| moderate | `sequelize`                   | breaking (a downgrade to 3.30.0; wrong) |
| moderate | `uuid`                        | breaking (via `jest-junit@17.0.0`)      |

Several highs say a fix is available that `audit fix` did not apply. Those are likely nested ranges
that need an `overrides` entry or a parent bump.

## Suggested fix

On its own branch: run `npm audit fix`, then read each remaining advisory rather than reaching for
`--force`. The `sequelize` suggestion is a major downgrade and must not be taken. Run the security
delta gate and record the before and after.
