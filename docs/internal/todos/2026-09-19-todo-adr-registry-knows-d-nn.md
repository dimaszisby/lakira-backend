# Todo — teach the ADR registry about `D-NN`

- **Status:** Open
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
`ADR-NNNN` — so a promotion reads `D-03 → ADR-0044`. The registry has not been told:

- its **Origin** column records kit-local references in the old `ADR-003` style
- its **Adding one** section says nothing about `D-NN` at all

## Scope

- Update the **Adding one** section to say a promoted kit decision records its origin as `D-NN`
  plus the kit slug.
- Use `D-NN` for **new rows only**.

**Existing Origin values are immutable history — do not renumber them.** They record what the
entries were actually called at the time, and the same reasoning is why the kit templates carry a
dated cutover rather than a retrofit.

## Done when

- [ ] `README.md` § Adding one names the `D-NN → ADR-NNNN` promotion shape
- [ ] The Origin column's format is stated for new rows
- [ ] No existing row is altered
- [ ] `npm run format:check`
