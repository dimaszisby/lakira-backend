# Contributing

## Branch Model

All changes flow through a promotion chain — never PR directly into `staging` or `main`:

```
<type>/<slug>  →  dev  →  staging  →  main
```

- **work branches**: branch off `dev`, named `<type>/<slug>` with a Conventional Commits type (`feat/`, `fix/`, `docs/`, `chore/`, `ci/`, `refactor/`), and target `dev` in your PR. See `.claude/rules/workflow.md` § Branching Convention.
- **dev → staging**: promoted via CI after passing all checks.
- **staging → main**: promoted after manual sign-off.

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

feat(metric-log): add cursor-based pagination
fix(auth): prevent token reuse after logout
refactor(analytics): extract shared cache port
docs(readme): add forking section
```

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`.

## Code Style

Follow `.claude/rules/code-style.md`:

- 2-space indent, double quotes, semicolons, trailing commas everywhere (Prettier 3 default `all`).
- ESM imports with `.js` extensions, path aliases (`@/*`, `@utils/*`).
- camelCase for variables/functions, PascalCase for classes/types, kebab-case for files.

Run `npm run lint:fix && npm run format:write` before committing.

## Testing

See `docs/explanation/testing-strategy.md` for the full approach.

Quick reference:

```bash
npm test                    # unit + integration
npm run test:unit           # unit only
npm run test:integration    # integration (requires Docker services)
npm run typecheck           # TypeScript check
```

New features require tests. Bug fixes should include a regression test where feasible.

## External PRs

This project is currently maintained by a single developer. External pull requests are welcome but response time is best-effort. Open an issue first for significant changes to discuss approach before writing code.
