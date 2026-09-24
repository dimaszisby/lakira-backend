# Common Commands Reference

**Canonical list: [`docs/reference/commands.md`](../../docs/reference/commands.md).**

That file is the single source of truth. Nothing checks it against `package.json` automatically, so
update it in the same change as any script. This file used to
carry a second copy, which drifted — it documented `npm run migrate:dev` and
`npm run migrate:undo:dev`, neither of which has ever existed. Do not reintroduce a copy here;
link instead.

The handful worth memorising:

```bash
npm run dev                     # dev server, port 5000
npm run migrate:development     # apply migrations (note: :development, not :dev)
npm test                        # unit then integration — do not combine the projects
npm run lint && npm run typecheck && npm run format:check && npm run docs:openapi:check
```

Those four gates are what CI runs; run them before proposing a change is complete.
