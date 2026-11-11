---
name: review
description: Review code for DDD compliance, validation coverage, error handling, security, and test coverage. Use when the user says "review", "code review", "check my code", or wants feedback on their changes.
context: fork
agent: Explore
argument-hint: "[file-or-feature-path]"
---

# Code Review

Perform a thorough code review of `$ARGUMENTS` (or all uncommitted changes if no path specified).

## Review Checklist

### 1. Architecture & DDD Compliance

- Domain entities have private constructors + static factories
- Domain layer has zero infrastructure imports
- Repository interfaces defined in `domain/repositories/`
- Use cases receive dependencies via constructor injection
- No imports from banned paths (`src/services/`, `src/controllers/`, `src/routes/`)
- Feature wired correctly in `feature.ts` with manual DI
- Exports through `index.ts` only

### 2. Validation & Input Handling

- All endpoints have Zod schemas in `schema.zod.ts`
- Schemas use base rules from `src/constants/zod/zod-rules.ts`
- Error messages reference `ZodMessages` (not inline strings)
- `validate(schema)` middleware applied before controller
- Controller uses `pickValidated()`, not `req.body` directly
- OpenAPI metadata attached via `.openapi()`

### 3. Error Handling

- Async handlers wrapped in `catchAsync()`
- Known errors thrown as `AppError(message, statusCode)`
- No bare `throw new Error()` in application/infrastructure code
- HTTP status codes match semantics (201 create, 404 not found, 409 conflict)
- `methodNotAllowed()` catch-all on every route path

### 4. Security

- Protected routes use `authMiddleware`
- `assertAuthenticated(req)` used before accessing `req.user`
- `requireJsonObjectBody()` on POST/PUT/PATCH routes
- No sensitive data logged (passwords, tokens, PII)
- Rate limiting applied where appropriate

### 5. Database & Persistence

- Repository returns domain entities, never Sequelize models
- Mapper handles `snake_case` ↔ `camelCase` translation
- Migrations use transactions in both `up` and `down`
- Model registered in `src/infrastructure/db/models.ts`

### 6. Code Style

- `.js` extensions on all imports
- Double quotes, semicolons
- Winston logger used (not `console.log` in app code)
- The path alias `@/` used, the only one (ADR-0092)

### 7. Test Coverage

- Unit tests exist for use cases and queries
- Integration tests for repository implementations
- Factory pattern (`build()`) used in unit tests
- Coverage thresholds met (unit: 60%, integration: 70%)

## Output Format

For each issue found, report:

- **File:line** — what's wrong
- **Severity** — critical / warning / suggestion
- **Fix** — what to change

End with a summary: total issues by severity, and an overall assessment.
