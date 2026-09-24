# Run the test suites

**Status:** Active
**Last updated:** 2026-09-24

How to run the Lakira backend tests locally, and where each test layer is documented. The strategy
itself is in `docs/explanation/testing-strategy.md`.

## Before you run anything

`npm test` reads `.env.test`, which is gitignored and absent on a fresh clone:

```bash
cp .env.test.example .env.test
```

`scripts/bootstrap-fork.sh` creates it for you; a plain clone does not.

## Running them

```bash
docker compose up -d db redis rabbitmq   # integration tests need these
npm test                                 # unit, then integration — never combine the projects
npm run test:unit
npm run test:integration
npm run test:unit:coverage               # with coverage thresholds
```

**Running one file or one test.** A bare path after `--` does **not** filter; pass it explicitly:

```bash
npm run test:integration -- --runTestsByPath __tests__/integration/api/auth.test.ts
npm run test:unit -- --runTestsByPath __tests__/unit/config/app-name.test.ts -t "strips a trailing"
```

Stop the Compose `worker` before `npm test` if it is running (`docker compose stop worker`): it
consumes the integration tests' queue messages. Full command list: `docs/reference/commands.md`.

## Canonical Start Points

1. `docs/explanation/testing-strategy.md`
2. `docs/internal/initiatives/tests-1-static-checks/README.md`
3. `docs/internal/initiatives/tests-2-unit-tests/README.md`
4. `docs/internal/initiatives/tests-3-integration-tests/README.md`
5. `docs/internal/initiatives/tests-4-contract-tests/README.md`

## Test Layers

Each layer's working docs live in a kit under `docs/internal/initiatives/`:

- `tests-1-static-checks/`: lint, typecheck, formatting, OpenAPI drift checks.
- `tests-2-unit-tests/`: in-memory/domain/use-case/controller unit tests with mocks.
- `tests-3-integration-tests/`: real app + Postgres, Redis and RabbitMQ tests.
- `tests-4-contract-tests/`: Schemathesis API contract enforcement (Newman was retired in #75).
- `tests-overhaul/`: historical restructuring artifacts.

## Update Rules

- Keep commands aligned with `package.json` scripts and CI workflow behavior.
- Prefer updating existing canonical docs over adding new overlapping docs.
- When a layer’s command, gate, or ownership changes, update that layer README and `docs/explanation/testing-strategy.md` in the same PR.
- Treat dated `YYYY-MM-DD` docs as historical unless explicitly reactivated.

## LLM Context Guidance

For test-task prompts, include only:

- `docs/explanation/testing-strategy.md`
- the specific layer README (`1-static`, `2-unit`, `3-integration`, or `4-contract`)
- any directly relevant checklist/plan file for that layer

Exclude by default:

- `docs/internal/initiatives/tests-overhaul/**`
- dated historical docs (`test-*-2025-*.md`) unless the task asks for history.
