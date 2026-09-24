# Forkability Kit

Make the repository a one-command-fork template: centralize branding, add a bootstrap script, document the fork workflow, and tighten module swappability so forkers inherit clean seams.

## Scope

- Centralize `APP_NAME` into `src/config/app-name.ts` (env-driven, default `"lakira-backend"`).
- Update the ~13 lakira-branded files to read from the centralized constant.
- Add `scripts/bootstrap-fork.sh` (`--name` flag) that sed-replaces remaining branding, rotates `JWT_SECRET`, renames the RabbitMQ topology prefix.
- Write `CONTRIBUTING.md` (or note in README that external contributions are not solicited).
- Consolidate per-feature `CachePort` interfaces into a single shared generic at `src/shared/application/ports/CachePort.ts`.

## Out of Scope

- `TokenProvider.verify()` extension — handled in the JWT kit (Phase 1, Phase D).
- Sequelize types leaking into the application layer — handled in the drift-cleanup phase (Phase 5).
- Per-org subdomains or vanity URLs — deferred to multi-tenancy kit.

## References

- **Closes audit gaps:** [P1-11.2], [P1-11.3], [P1-11.4], [P2-11.5] in `docs/internal/audits/saas-readiness/audit-2026-05-01.md`
- **Owning ADRs:** ADR-005 (phase order) in `docs/internal/audits/saas-readiness/decisions.md`; (kit-local) ADR-001 in `./decisions.md`
- **Effort:** M (aggregate)
- **Status:** Mostly done — #49 (`69224ba`), #50 (`b4916e6`), #67 (`8adf7b8`); P2-11.5 (CachePort consolidation) still partial
- **Predecessor / dependency:** Independent — can run in parallel with other phases. `TokenProvider.verify()` consolidation deferred to JWT kit.
