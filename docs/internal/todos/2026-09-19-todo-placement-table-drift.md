# Todo — re-sync the PLACEMENT-TABLE block

- **Status:** Done on `docs/placement-table-drift` (off `origin/dev` cb99f50), 2026-09-24
- **Created:** 2026-09-19
- **Owner:** unassigned
- **Prepared for:** a fresh Claude Code session — Sonnet, low effort. Small, but do not batch it
  into an unrelated PR; the point is that the block is auditable on its own.
- **Origin:** noticed while adding the traceability rules (#99) and the kit templates

---

## The problem

The block fenced by `<!-- PLACEMENT-TABLE:START/END -->` is required to stay **byte-identical**
between [`.claude/rules/documentation.md`](../../../.claude/rules/documentation.md) and
[`.claude/agents/doc-writer.md`](../../../.claude/agents/doc-writer.md) — the rules file says so in
the marker itself. It is not.

`documentation.md`'s copy carries an extra paragraph about validity-gating (`docs:openapi:validate`
resolving every `$ref`, checking operation ids and responses) that `doc-writer.md` lacks. The
`documentation.md` version is the correct one — it reflects a real gate, and
[`2026-08-27-todo-openapi-validity-gate.md`](2026-08-27-todo-openapi-validity-gate.md) is where that
gate came from.

## Why it survived this long

It is a regression, not an original defect. `documentation-overhaul`'s CHECKLIST.md Phase 8 records
both files being written with the same table byte-identical, marked done 2026-08-16; the validity
paragraph was added to one copy afterwards. It has now survived three PRs passing over the file,
each of which correctly declined to fix it as out of scope — which is exactly how a drift defect
becomes permanent.

## Scope

Copy the validity-gating paragraph into `doc-writer.md`'s block. Nothing else in either file.

## Done when

- [x] The two blocks are byte-identical — verify mechanically, not by eye:
      `python3 -c "import re,io;b=lambda p:io.open(p).read().split('PLACEMENT-TABLE:START')[1].split('PLACEMENT-TABLE:END')[0];print(b('.claude/rules/documentation.md')==b('.claude/agents/doc-writer.md'))"`
- [x] `npm run format:check`
- [x] Consider whether this check belongs in CI, so the next regression is caught rather than noticed

## Outcome

The validity-gating paragraph was copied into `doc-writer.md`; the check above prints `True`.

The CI question was considered and deliberately left out of this PR, which the scope above limits
to the one paragraph. If it is picked up, a unit test comparing the two blocks would run under the
existing `npm test` job without touching `.github/workflows/*`. It has not been filed as its own
todo.
