# Per-Feature ORM Bootstrap Reference

- Timestamp: 2025-12-04T10:30:00Z

## Summary

- Phase 4 replaces the legacy `src/infrastructure/db/sequelize.ts` singleton with a thin composer at `src/infrastructure/db/models.ts`.
- Each feature owns its Sequelize models under `src/features/<audience>/<feature>/infrastructure/persistence/models/*.sequelize.ts` and exposes `register*/associate*` helpers.
- `src/infrastructure/db/models.ts` iterates those helpers, caches the initialized models, and re-exports both `loadModels()` and the shared `sequelize` instance from `src/config/db.ts`.

## How Bootstrapping Works Now

1. **Registration:** Feature models export `register<Feature>Models(sequelize)` and `associate<Feature>Models(models)` helpers.
2. **Composition:** `loadModels()` iterates the helper arrays, merges the returned models into a shared object, runs associations, then caches the result so repeated calls are idempotent.
3. **Consumption:** Application code that needs raw Sequelize classes imports `{ models }` (or `sequelize`) from `@/infrastructure/db/models`. Server/bootstrap code can call `loadModels()` explicitly for clarity, but the cached implementation prevents double initialization.
4. **Elimination of legacy loader:** `src/infrastructure/db/sequelize.ts` has been deleted. Any module that previously imported `db` must now import the specific feature model or the shared `sequelize`.

## Adding a New Feature Model

1. Create the model under `src/features/<audience>/<feature>/infrastructure/persistence/models/<name>.sequelize.ts`.
2. Export `register<Feature>Models()` (returning `{ <ModelName> }`) and `associate<Feature>Models()` (accepting the `DbModels` map).
3. Append the helpers to the arrays in `src/infrastructure/db/models.ts`.
4. Import the model via `@/infrastructure/db/models` inside repositories/use cases.
5. Update the feature README + docs so teammates know where the ORM code lives.

## Testing & Tooling Notes

- Jest setup now imports `sequelize` from `src/config/db.ts` and relies on server bootstrap to call `loadModels()`. No more legacy `db` singleton.
- `jsconfig.json` includes only the feature/infrastructure folders so IDE navigation reflects the vertical slices.
- When writing tests that stub Sequelize models, import them from `@/infrastructure/db/models` to reuse the cached initialization rather than mocking the entire module.
