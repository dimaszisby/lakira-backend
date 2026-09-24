---
paths:
  - "__tests__/**"
  - "jest.config.*"
  - "jest.setup*"
---

# Testing Conventions

## Jest Projects

Three separate projects in `jest.config.mjs`:

- **unit** (`__tests__/unit/**/*.test.ts`) — no DB, lightweight setup via `jest.setup.unit.ts`
- **integration** (`__tests__/integration/**/*.test.ts`) — full DB, server on port 4000+workerId via `jest.setup.ts`
- **e2e** (`__tests__/e2e/**/*.test.ts`) — end-to-end

Run a single test: `npx jest --runInBand --selectProjects unit -- path/to/test`

## Coverage Thresholds (CI-enforced)

- Unit: 60% statements, 40% branches, 55% functions, 60% lines
- Integration: 70% statements, 45% branches, 70% functions, 70% lines

## Environment Access in Tests

Never use `process.env` directly in test files — ESLint blocks this.

- Unit tests: use `withTestEnv(async () => { ... })` helper
- Integration tests: env loaded via `jest.setup.ts`
- Reset cached env: `resetEnvCacheForTesting()` from `src/config/envManager.ts`

## Unit Test Structure

Use factory-style setup with mocked dependencies:

```typescript
function build() {
  const repo = {
    findById: jest.fn(),
    save: jest.fn(),
  } as jest.Mocked<XRepository>;
  const sut = new MyUseCase(repo);
  return { sut, repo };
}

describe("MyUseCase", () => {
  it("should do something when given valid input", async () => {
    const { sut, repo } = build();
    repo.findById.mockResolvedValue(makeMetric({ id: "abc" }));
    const result = await sut.execute({ id: "abc" });
    expect(result).toBeDefined();
  });
});
```

## Integration Test Setup

- Server auto-starts on `jest.setup.ts` (port 4000+workerId)
- All tables truncated before each test (except `SequelizeMeta` and `SequelizeData`)
- Use `supertest` for HTTP assertions
- DB fixtures in `__tests__/integration/helpers/db-fixtures.ts` (`createUserRow`, `createMetricRow`,
  `truncateAllTables`, …)
- There are no shared domain factories: unit tests build entities locally (e.g. `makeUser` inside
  each auth test); `__tests__/unit/factories/` holds only `metric-settings.ts`

## Test File Relaxations

ESLint allows in test files only:

- `@typescript-eslint/no-explicit-any: "off"`
- `@typescript-eslint/no-unused-vars: "off"`
- `@typescript-eslint/no-require-imports: "off"`
