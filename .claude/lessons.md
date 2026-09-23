# Claude Lessons — Lakira Backend

Persistent record of corrections and patterns learned on this project.
Updated after any correction per `.claude/rules/workflow.md`.

---

<!-- Entries added below as lessons are learned. Format:
## [YYYY-MM-DD] <short title>
**Mistake**: what went wrong
**Rule**: the pattern to follow instead
**Why**: reason / context
-->

## [2026-04-22] Regenerate OpenAPI spec and update tests after endpoint schema changes

**Mistake**: Removed `metricId` from the request body schema but (1) did not regenerate the OpenAPI spec, causing a typecheck failure in CI, and (2) did not update unit tests that still passed `metricId` in `req.body` instead of `req.params`.
**Rule**: After any change to endpoint structure (params, body, query, response shape):

1. Run `npm run docs:openapi:generate` and commit the updated spec.
2. Update all unit and integration tests — check mock `req` objects for any field that moved (e.g. body → params) and update assertions accordingly.
   **Why**: `openapi-schemas.ts` examples must match the current Zod schema shape or typecheck fails. Unit test `req` mocks must reflect the actual request structure or controller assertions will fail. Both are CI gates.

## [2026-04-22] Never PR directly into staging — all changes must flow through dev first

**Mistake**: Hotfixes (Render TLS fix, security tightening) were PR'd directly into `staging`, causing it to diverge from `dev`. The next `dev → staging` merge produced conflicts across CI config, security docs, and `package-lock.json`.
**Rule**: All changes must flow `feature-branch → dev → staging → main`. If a hotfix is applied directly to `staging`, immediately cherry-pick it back to `dev` so the branches don't diverge.
**Why**: Once `staging` has commits `dev` has never seen, every future `dev → staging` PR will have conflicts. With both branches protected (no direct push, no merge commits), resolving this requires a temp `conflict/` branch, squash merge, and a replacement PR — all avoidable overhead.

## [2026-04-22] Resolving conflicts between two protected branches

**Mistake**: Tried to push conflict resolution directly to `staging` and `dev` — both rejected because they require PRs and no merge commits.
**Rule**: When two protected branches conflict, use a temp branch:

1. `git checkout -b conflict/<name> origin/<base-branch>`
2. `git merge --squash origin/<head-branch>`
3. Resolve conflicts, commit (regular commit, not a merge commit)
4. `git push origin conflict/<name>`
5. Open a PR from `conflict/<name>` → `<base-branch>` and close the original conflicted PR
   **Why**: Protected branches block direct pushes and merge commits. A squash commit on a temp branch is the only path that satisfies both constraints.

## [2026-04-22] Never compact or reformat security audit docs — they are schema-validated

**Mistake**: Security audit documents (`findings-log.md`, `portfolio-summary.md`, `index.md`, etc.) were manually condensed to reduce token count. This stripped required table columns (`finding_id`, `title`, `domain`, `severity`, etc.) and section headers, breaking the `security-framework.validation.test.ts` CI gate.
**Rule**: Never reformat, condense, or restructure files under `docs/internal/audits/security/`. Their column names, section headers, and table structure are enforced by automated tests.
**Why**: `security-framework.validation.test.ts` validates the schema of live audit docs — required columns, traceability links, portfolio section headers, and index folder references. Any structural change that doesn't match the framework schema fails CI.

## [2026-04-22] Always add an example to OpenAPI path params that use zUUID

**Mistake**: The `{metricId}` path parameter on the dummy endpoint was registered with only `format: uuid`, no example. Schemathesis generated UUIDs that pass `.uuid()` but fail the strict RFC 4122 variant-1 regex in `zUUID` (`[89abAB]` required in group 4), causing 400s in contract tests.
**Rule**: Any path parameter validated by `zUUID` (or any other strict regex rule) must include a concrete `.openapi({ example: "..." })` value in `openapi-docs.ts`. Use the same known-good UUID pattern used elsewhere (`55555555-eeee-4eee-8eee-000000000005`).
**Why**: Schemathesis uses the OpenAPI spec to generate test inputs. Without an example, it generates its own UUIDs from the `format: uuid` hint — these are structurally valid but not guaranteed to satisfy stricter application-level regex patterns.

## [2026-08-23] A dependency timeout at startup is a client-config suspect before it is a platform suspect

**Mistake**: A Render staging deploy died repeatedly on `Connection timeout` from `@redis/client`.
After confirming the URL, region, and instance status were all correct, I concluded the cause was
Render free-tier instances lacking private-network access to Key Value — a platform-policy theory I
could not test. The actual cause was local to the code: the first connect takes ~15s on a cold
instance, past node-redis's 5s default `connectTimeout`, and `redis-client.ts` calls
`process.exit(1)` from the `error` event handler, killing the process before `reconnectStrategy`
could retry into the success that was seconds away. Proven the moment `REDIS_REQUIRED=false` let the
process survive: `[REDIS] Connected to Redis` appeared 15s after boot.
**Rule**: When a service dies at startup on a dependency, exhaust the client's own configuration —
connect timeouts, retry strategy, and whether error handlers kill the process before retries run —
before advancing any theory about platform networking. Prefer the diagnostic that produces
evidence over the hypothesis that cannot be tested: connecting to the external CloudAMQP URL from
the local machine settled the RabbitMQ question in one command (`403 ACCESS-REFUSED`, stale
credentials), while the untestable Redis theory sent the investigation sideways.
**Why**: `process.exit(1)` inside an `error` handler makes a recoverable, transient failure look
exactly like a hard network block — the retry that would have disproved the theory never runs, so
the logs contain no evidence against it.

## [2026-09-24] A kit checklist is not presented until the user has seen it, through plan mode

**Mistake**: For the `saas-audit-closeout` Lean kit, I wrote the checklist and decisions to disk,
then asked the user to "approve the checklist" while showing only a summary of it. The user had to
ask where the checklist was. I had also skipped plan mode, even though `workflow.md` requires it for
any non-trivial task, and this one had six work items.
**Rule**: For any task of three or more steps, enter plan mode before drafting the kit, and present
the checklist's acceptance criteria and work items through `ExitPlanMode`, in full rather than as a
summary. A file path is not a presentation. The approval pause in § Task Flow is the plan-mode exit.
**Why**: The pause after the checklist is the cheapest point to catch the wrong thing being built,
and it only works if the user can see what they are approving. Reading my own checklist back in plan
mode turned up two template violations (gate commands copied in, integration tests wrongly skipped)
that the summary had hidden.
