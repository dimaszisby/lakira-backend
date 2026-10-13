# Boundary rule residuals — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Metric's types move into the metric feature

- **Status:** Accepted
- **Date:** 2026-10-04

**Context.** `src/types/dtos/metric.dto.ts` and `src/types/domain/metric.domain.ts` import other
features' internals: a Zod schema, three response DTO types and a domain entity. Every file that
imports either of them is in the metric feature (2 and 6 files). The boundary rule covers
`src/features/**` only, so these imports pass (audit S5).
**Decision.** `metric.dto.ts` moves to `metric/infrastructure/http/` and `metric.domain.ts` to
`metric/domain/`, with `git mv`. Their cross-feature references go through the siblings'
`public.ts`, which gain type-only exports.
**Options considered.** Leaving them in `src/types/` and importing `public.ts` from there: rejected,
shared code would still depend on features, in the wrong direction. Dissolving all of `src/types/`
into the features: rejected for this change, the other eleven files import no feature and moving
them is churn the rule does not ask for.
**Consequences.** `src/types/` holds only types no feature owns alone, plus three feature-shaped
files (`metric-log`, `metric-settings`, `user` domain types) that are imported across features and
stay for now. The siblings' `public.ts` grow by a type each.

## D-02 — Shared code imports no feature

- **Status:** Accepted
- **Date:** 2026-10-04

Promoted to the architecture decision registry as **[ADR-0058](../../../explanation/decisions/adr-0058-inner-layers-and-shared-code-import-rules.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — The application layer imports no infrastructure

- **Status:** Accepted
- **Date:** 2026-10-04

Promoted to the architecture decision registry as **[ADR-0058](../../../explanation/decisions/adr-0058-inner-layers-and-shared-code-import-rules.md)**.
That file is authoritative; this entry is a pointer.

## D-04 — Use cases own their input types

- **Status:** Accepted
- **Date:** 2026-10-04

**Context.** `UpdateDisplayOptions`, `UpdateMetricSettings` and `UpdateMetric` type their input with
DTO types from `infrastructure/http/`, two of them inferred from Zod schemas.
**Decision.** Each use case declares the input it accepts. The controller passes the validated
body, and the compiler proves the two shapes agree.
**Options considered.** Moving the Zod-inferred DTO types into `application/`: rejected, it drags
the HTTP schema with them.
**Consequences.** A field added to a request schema has to be added to the use case's input before
the use case can read it. The two shapes can drift apart in the permissive direction: a schema
field the use case does not declare is passed and ignored.

## D-05 — The message a handler receives is an application type

- **Status:** Accepted
- **Date:** 2026-10-04

**Context.** `GenerateDummyMetricLogsHandler.handle` takes `amqplib`'s `ConsumeMessage` and
`MessageContext` from `RabbitMQConsumer.ts`. It reads two things from the message: `content` and
`properties.messageId`.
**Decision.** `src/shared/application/ports/MessageHandlerPort.ts` declares `IncomingMessage` with
those two fields, `MessageContext` and `MessageHandler`. `amqplib`'s message satisfies
`IncomingMessage` structurally, so `RabbitMQConsumer` passes it straight through.
**Options considered.** An adapter per handler that parses the message first: rejected, more moving
parts for one handler.
**Consequences.** A handler that needs another message field adds it to the port first. That is the
intended friction.

## D-06 — Exchange and routing-key names belong beside the queue port

- **Status:** Accepted
- **Date:** 2026-10-04

**Context.** `GenerateDummyMetricLogs` imports `EXCHANGES` and `ROUTING_KEYS` from
`src/shared/infrastructure/queue/topology.ts`, which also holds the code that declares queues on a
broker channel. `MessageQueuePort.publish(exchange, routingKey, …)` already takes those names.
**Decision.** The name constants move to `src/shared/application/messaging/`. `topology.ts`
re-exports them and keeps the code that talks to the broker.
**Options considered.** A feature-owned "enqueue job" port with a RabbitMQ adapter: rejected for
this change. It is the cleaner shape, but it changes a constructor and its wiring for no rule this
task needs.
**Consequences.** The application layer still speaks in exchanges and routing keys, because the
port does. Hiding them is the rejected option above, for a later task.

## D-07 — The `AppError` rule matches the file name, in both domain layers

- **Status:** Accepted (merged in #153, `47f3aff`)
- **Date:** 2026-10-11

**Context.** The audit of 2026-10-10 kept caveat C4 open on finding V4. `DOMAIN_LAYER_HTTP_ERROR`
in `eslint.config.mjs` listed three globs, and two spellings of the import got past them from a
feature's domain file: `@utils/AppError.js` and `@utils/AppError`, through the `@utils/*` alias. The
rule was not in the block for `src/shared/domain` at all, and no test had a case for it. No file in
`src/` uses any of this today. ADR-012 of the audit folder names V4 as the one route C4 closes on.
**Decision.** The rule is one regex, `(?:^|/)AppError(?:\.js)?$`: any import whose last path segment
is `AppError` or `AppError.js`. It is listed for `src/features/*/*/domain/**` as before and now for
`src/shared/domain/**`, which gets a block of its own. `feature-boundaries.lint.test.ts` holds the
negative cases, per spelling and per layer.
**Options considered.** Two more globs: rejected, a list of spellings is how the gap arose, and the
next alias would be missed the same way. The same rule for the application layer: rejected here, it
is not V4 and use cases raise `AppError` today. A rule on the imported name: rejected, `AppError` is
a default export and the importer picks the local name.
**Consequences.** A domain file may not import any file named `AppError`, wherever it lives. None
exists besides `src/utils/AppError.ts`. The rule still cannot see a re-export under another file
name; nothing re-exports the class today.

## D-08 — No dynamic import and no import type under `src/`

- **Status:** Accepted (merged in #155, `fffe796`)
- **Date:** 2026-10-11

**Context.** Every boundary rule is a `no-restricted-imports` pattern, and that rule reads static
`import` and `export … from` only. The review of D-07 found that
`() => import("@/utils/AppError.js")` in a domain file reports nothing, and the build rewrites the
`@/` alias inside `import()`, so it would run. The feature-boundary, inner-layer and shared-code
rules have the same hole. So does the TypeScript type `import("…").Name`, which is a dependency
across the boundary the rule does not read either. Nothing under `src/` uses either form. It is
not a caveat's route (ADR-012 of the audit folder); it is a finding in its own right, at P2.
**Decision.** Both forms are refused in every `src/**/*.ts` file, by `no-restricted-syntax` on the
`ImportExpression` and `TSImportType` nodes. `feature-boundaries.lint.test.ts` holds the cases.
**Options considered.** A selector per boundary pattern: rejected. A selector matches a literal
specifier only, so `import(path)` or a template string passes it, and six blocks with different
pattern sets would have to be mirrored and kept in step. A text scan in `architecture.test.ts`:
rejected, it would parse specifiers by regex where the linter already has the syntax tree.
**Consequences.** A file that needs a lazy import gets a block of its own that names it and says
why, as the config's other exceptions do. `__tests__/` and `scripts/` are outside `src/` and keep
`import()`.
**Added in review.** The reviewer graded `createRequire` part of the same finding: a `require`
built from it loads a file by relative path with no import statement. The same block now refuses
any import from node's `module` package under `src/`. The plan had listed it as not covered. Still
not covered: `process.getBuiltinModule("module")`, which reaches the same function without an
import; a module re-exported under another file name; and `src/config/config.cjs`, the one
CommonJS file in `src/`, which the `*.ts` glob does not match.

## D-09 — The domain layer imports no application code, and the transaction type is declared once

- **Status:** Accepted (merged in #165, `6429fda`)
- **Date:** 2026-10-13

Micro entry for register row B-10 (finding R11 of `audit-2026-09-29.md`, found again and rated P2
by the grader of `audit-2026-10-12.md` § 4.3), on `fix/domain-imports-no-application`. Written
before any code.

**Context.** The rule is that the domain depends on nothing outward. Five domain repository
interfaces import `PersistenceTransaction` from an `application/` path: three in auth, and one
each in metric and metric-log. The type is declared four times, always as `unknown`: in the two
features' `TransactionPort.ts`, in `src/shared/application/ports/MessageIdempotencyPort.ts`, and
in auth's `RefreshTokenRepository.ts`. The transaction port was added in the application layer,
where the use case that opens a transaction lives, and the repository interfaces that take the
handle were pointed at it. No lint rule or test refuses the import.
**Decision.** Three points.

1. `PersistenceTransaction` is declared once, in `src/shared/domain/PersistenceTransaction.ts`.
   Every file that names it imports it from there, and nothing re-exports it.
2. The name stays. It is opaque (`unknown`), and a repository is itself a persistence idea that
   lives in the domain.
3. A `domain/` file may import nothing with an `application` path segment. One pattern in
   `eslint.config.mjs`, in the feature domain block and the shared kernel's, with its cases in
   `feature-boundaries.lint.test.ts`.

**Options considered.** One declaration per feature: rejected, three copies of one alias stay.
Recording that a domain interface may import its own feature's application ports: rejected, the
rule is then weaker than its name. Re-exporting the type from each `TransactionPort.ts`: rejected,
it keeps the application path alive as a second source. Renaming it to `UnitOfWorkHandle`, which
the analysis offered: rejected, the same 21 files change for no change in what the code says. A
check in `architecture.test.ts` in place of the lint rule: rejected, the other layer rules are
lint rules, and lint is what an editor shows while the import is typed.
**Consequences.** No runtime behaviour changes: the type is erased at build. A domain file that
needs a type an application file declares has to move the type inward. ADR-0058 gains the rule and
a dated note; no new record, since it adds one rule to that record's set.
**What the build showed.** `dist/` was built at `7cbe2db` and on the branch, and every file's
checksum compared. No `.js` file differs. Nine `.js.map` files differ, each for a file whose
import lines moved, and two files are new: `shared/domain/PersistenceTransaction.js`, which holds
`export {}`, and its map. The plan expected the new module to be the only difference; the source
maps were not foreseen and change nothing that runs.
**From the review,** my own. Three of the five new lint and architecture cases fail on the tree at
`7cbe2db`; the other two show what stays allowed. Auth's `RefreshTokenRepository.ts` also declares
a `TransactionPort` interface of its own beside the one in `application/ports/`; it is not the
alias and is left alone, as the plan left merging the ports out. Not graded by anyone else.
