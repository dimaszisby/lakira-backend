# Todo — teach the ADR registry about `D-NN`

- **Status:** Complete (2026-09-20) — delivered by #102 (`5e9f20b`)
- **Created:** 2026-09-19
- **Owner:** unassigned
- **Prepared for:** a fresh Claude Code session — Sonnet, medium effort
- **Origin:** fallout from `docs(rules): specify what goes inside a kit`, which introduced `D-NN`
  numbering for kit-local decisions in [`.claude/rules/documentation.md`](../../../.claude/rules/documentation.md)

---

## Time-sensitive — it activates on first use

This should land **before the first kit built under the new templates**, not "sometime". The moment
a new kit writes `D-01`, [`docs/explanation/decisions/README.md`](../../explanation/decisions/README.md)
documents a convention the kits have already abandoned, and the next promotion has no stated way to
record where it came from.

## The problem

The rules file now says kit-local decisions are numbered `D-01`, `D-02`, and the registry keeps
`ADR-NNNN` — so a promotion reads `D-03 → ADR-0044`. The registry has not been told.

**Correction (2026-09-20).** This todo was filed claiming the Origin column records kit-local
references in the old `ADR-003` style. It does not — that is true of lakira-frontend, not of this
repo. Here Origin has always held kit and audit **names**: `rabbitmq`, `password-reset`,
`saas-readiness`, `twelve-factor`. So no existing row was wrong or about to become wrong, and none
needed touching. The real gaps were narrower, and one was somewhere this todo never looked:

- Origin named the kit but not **which entry** in it. `D-NN` gives a stable id for that.
- **Adding one** said nothing about kits or promotion at all, so someone reading the registry to
  add a record had no way to learn the kit path exists. That gap predated `D-NN`.
- `docs/explanation/documentation-standards.md`'s ADR template — the thing people actually copy —
  gave the Origin line as the stale kit-local `ADR-00N`, and used an `ADR-00NN` placeholder where
  the rest of the repo uses `ADR-NNNN`. It also described Origin as always naming a kit, though 11
  of 42 records originate from audit programmes.

## Scope

- Update the **Adding one** section to say a promoted kit decision records its origin as `D-NN`
  plus the kit slug.
- Use `D-NN` for **new rows only**.

**Existing Origin values are immutable history — do not renumber them.** They record what the
entries were actually called at the time, and the same reasoning is why the kit templates carry a
dated cutover rather than a retrofit.

## Done when

- [x] `README.md` § Adding one names the `D-NN → ADR-NNNN` promotion shape, and explains that most
      records arrive by promotion while an audit-born record written here directly is normal
- [x] The Origin column's format is stated for new rows — `rabbitmq D-03`, kit or audit name plus
      the entry id
- [x] No existing row is altered
- [x] `documentation-standards.md`'s ADR template corrected — `D-NN` origin, `ADR-NNNN` placeholder,
      audit-origin case named (not in the original scope; found by the grep this todo asked for)
- [x] `npm run format:check`
