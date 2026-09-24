---
name: new-test
description: Generate unit or integration test boilerplate. Use when the user wants to create tests, add test coverage, or write test cases for a feature, use case, repository, or endpoint.
disable-model-invocation: true
argument-hint: "[unit|integration] [path/to/source/file]"
---

# Generate Tests

Create test files following this project's testing conventions.

## Determine Test Type

- **Unit test** (`$0` = "unit" or source is in `application/`, `domain/`): Place in `__tests__/unit/features/{feature}/...`
- **Integration test** (`$0` = "integration" or source is in `infrastructure/`): Place in `__tests__/integration/features/{feature}/...`

Read `.claude/rules/testing.md` for full conventions.

## Unit Test Template

Read existing tests in `__tests__/unit/` for reference patterns, then create:

```typescript
import { jest } from "@jest/globals";

// Import the SUT (subject under test) and its dependencies
// import { MyUseCase } from "@/features/{feature}/application/use-cases/MyUseCase.js";
// import type { MyRepository } from "@/features/{feature}/domain/repositories/MyRepository.js";

// Factory helpers for domain entities
// import { makeEntity } from "./helpers.js";  // or inline

function build() {
  const repo = {
    findById: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    // ... match the repository interface
  } as jest.Mocked<MyRepository>;

  // Add other mocked ports/services as needed
  const sut = new MyUseCase(repo);
  return { sut, repo };
}

describe("MyUseCase", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("execute", () => {
    it("should succeed when given valid input", async () => {
      const { sut, repo } = build();
      repo.findById.mockResolvedValue(/* domain entity */);

      const result = await sut.execute({
        /* input */
      });

      expect(result).toBeDefined();
      expect(repo.findById).toHaveBeenCalledWith(/* expected args */);
    });

    it("should throw AppError when resource not found", async () => {
      const { sut, repo } = build();
      repo.findById.mockResolvedValue(null);

      await expect(
        sut.execute({ id: "nonexistent" }),
      ).rejects.toThrow(/* AppError or specific message */);
    });

    // Add edge cases: invalid input, authorization failures, duplicate conflicts
  });
});
```

## Integration Test Template

Read existing tests in `__tests__/integration/` and the helpers in `__tests__/integration/helpers/` (`test-utils.ts` for HTTP-level setup, `db-fixtures.ts` for direct rows) for reference, then create:

```typescript
import { models } from "@/infrastructure/db/models.js";

// Import fixtures and helpers
// import { createUserRow, truncateAllTables } from "../../helpers/db-fixtures.js";

describe("FeatureName (integration)", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it("should create and retrieve a resource", async () => {
    // Seed data using fixtures
    // const user = await createUserRow({ email: "test@example.com" });
    // Exercise the real repository/endpoint
    // const result = await repo.findById(user.id);
    // Assert against real DB state
    // expect(result).toBeDefined();
    // const row = await models.MyModel.findByPk(result.id);
    // expect(row).not.toBeNull();
  });
});
```

## Key Conventions

- **`build()` factory** returns SUT + all mocked deps — one source of truth for test setup
- **`jest.resetAllMocks()`** in `beforeEach` — prevents test pollution
- **Entity helpers**: build entities through their real factories, in a local `makeX()` helper in the test file (there are no shared `makeUser()`/`makeMetric()`; `__tests__/unit/factories/` holds only `metric-settings.ts`)
- **Never use `process.env` directly** — use `withTestEnv()` helper for unit tests
- **Test names**: describe behavior, not implementation ("should return 404 when metric not found")
- **Coverage targets**: Unit 60% statements, Integration 70% statements

## After Creating Tests

Run the new test to verify:

```bash
npx jest --runInBand --selectProjects $0 -- path/to/new.test.ts
```
