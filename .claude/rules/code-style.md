# Code Style

## Formatting (Prettier defaults via ESLint)

- Semicolons: always required
- Quotes: double quotes (`"`, with `avoidEscape: true`)
- Indentation: 2 spaces
- Trailing commas: everywhere (Prettier 3 default, `all`; there is no Prettier config overriding it)
- Print width: 80 characters (Prettier default)

## ESM Imports

- Always use `.js` extension in import paths, even for TypeScript files (ESM convention)
- Use ES module syntax (`import`/`export`), never CommonJS (`require`/`module.exports`)
- Use path aliases: `@/*` for `src/*`, `@utils/*` for `src/utils/*`, `@config/*` for `src/config/*`

## Naming Conventions

- **Variables/functions**: camelCase (`getUserById`, `isActive`)
- **Classes/types/interfaces**: PascalCase (`AuthUser`, `ResponseDTO`)
- **Constants**: UPPER_SNAKE_CASE (`UUID_PATTERN`, `METRIC_NAME_RULE`)
- **Files**: kebab-case for features/modules, PascalCase for entity classes (`AuthUser.ts`)
- **Feature directories**: kebab-case (`metric-settings`, `metric-log`)
- **Booleans**: `is*` or `has*` prefix (`isPublicProfile`, `goalEnabled` for domain flags)
- **Enum values**: lowercase strings (`"owner" | "admin" | "member"`, `"manual" | "automatic"`)

## Logging

- Use Winston logger (`src/utils/logger.ts`) in application code
- Logs go to **stdout only** — the app creates and retains no log files (ADR-0041). Collection is
  the platform's job. `LOG_LEVEL` controls verbosity; see
  `docs/how-to/development/read-application-logs.md`
- `console.log` with `[DB PROCESS]`/`[DB ERROR]` prefix is acceptable only in migration files
- ESLint warns on bare `console.log` everywhere it lints, tests included. It is off for
  `scripts/**` and `src/config/config.cjs`; `src/migrations/**` is not linted at all
