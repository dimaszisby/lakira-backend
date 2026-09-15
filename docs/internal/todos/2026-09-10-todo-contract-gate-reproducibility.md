# Todo — make `contract:local:gate` reproducible

- **Status:** Complete (2026-09-10) — delivered by `fa1933e` (#82)
- **Created:** 2026-09-10
- **Owner:** unassigned
- **Prepared for:** a fresh Claude Code session
- **Origin:** discovered while verifying the C3 error-envelope handoff
  ([`2026-09-01-todo-error-envelope.md`](./2026-09-01-todo-error-envelope.md)), whose stated baseline
  turned out to be a single sample from a non-deterministic command

---

## The defect

`contract:local:gate` runs Schemathesis with the `fuzzing` phase enabled and **no seed**, so
Hypothesis draws a fresh one per run and the command can return different verdicts on an unchanged
tree.

`SCHEMATHESIS_LOCAL_SEED` is read at `tests/contract/schemathesis/scripts/run-local.js:216` and
appended as `--seed` at `:258`. It is **set nowhere in the repo** — the only occurrence of the name
is that read. The plumbing is otherwise sound: `scripts/run-contract-local-full.mjs:35` spreads
`process.env` into each step, so a seed exported in the shell already reaches the CLI. Nothing
supplies one.

### Evidence, from the reports the runner already writes

`tests/contract/schemathesis/reports/local/*/schemathesis-local.xml`, same tree:

| Run (UTC)              | Failures | Failing check                               |
| ---------------------- | -------- | ------------------------------------------- |
| 2026-08-31 02:52       | 1        | `POST /auth/refresh` — undocumented 400     |
| 2026-08-31 02:54       | 0        | —                                           |
| 2026-09-01 09:37       | 1        | `POST /auth/refresh` — JSON deserialization |
| 2026-09-01 09:38       | 0        | —                                           |
| 2026-09-01 17:47–17:53 | 1 (×4)   | same                                        |
| 2026-09-01 17:55–18:01 | 0 (×2)   | —                                           |

**09:37 red → 09:38 green is fifty-nine seconds apart.** That is not an
edit-rebuild-remigrate-reseed cycle. The same operation fails in every red run, and the failure mode
migrated after PR #77 documented the 400 — from `status_code_conformance` to
`content_type_conformance` — which is the underlying event surfacing through whichever check was
still able to catch it.

### Why it matters more than "the number moves a bit"

A failure the gate does find **cannot be reproduced from its own report**. The JUnit message ends:

```
Reproduce with:
  curl -X POST -H 'Authorization: [Filtered]' -H 'Cookie: [Filtered]' \
    http://localhost:4000/api/v1/auth/refresh
```

The malformed `Cookie` value _is_ the input that triggered the failure, and it is redacted. Without
the seed there is no route back to the failing case — you re-run and hope. The seed is not a nicety
here; it is the only reproduction mechanism the tool offers.

This already cost something: the C3 brief quoted "gate exits 0 with 1371/1371" as a baseline. That
was one real observation from one run of an unseeded fuzzer, and the C3 instance had to disprove it
by stashing its whole change set and re-running on a pristine tree.

### Blast radius is local, not CI

CI runs `npm run test:contract:schemathesis:local` with no profile set, and `resolveLocalProfile`
defaults to `quick` (`run-local.js:129`), whose phases are `examples` only — no `fuzzing`. So the
pipeline is not flaky. What is unreliable is every number a human or an agent quotes from a local
`gate` or `full` run, which is exactly how this reached a brief.

## VERIFY FIRST — this may be smaller than it looks

**Check whether Schemathesis 4.4.4 already reports the seed it chose** (`schemathesis run --help`,
and the tail of a real run's stdout). Several Hypothesis-backed tools print `--seed <n>` on failure
precisely so the run can be replayed. If 4.4.4 does, most of the fix is capturing and surfacing what
is already emitted rather than generating and threading a seed of our own.

Do this before designing anything. Building seed plumbing that duplicates what the CLI already
prints would be the wrong shape, and the premise is cheap to test.

## The decision to make

There is a real tension, and the PR should say which side it took and why:

- A **pinned** seed makes the gate reproducible but replays identical inputs forever, so it stops
  finding new things — a fuzzer degraded into a fixture.
- A **random** seed keeps exploring but makes every run's verdict a sample, which is the current
  problem.

The shape worth arguing for, unless the verification above says otherwise:

1. **Always print the effective seed**, in the runner's own log line and ideally into the report
   directory, so any run can be replayed. `run-local.js:283-285` already logs the resolved profile
   and the full arg list — the seed belongs in that same breath, and today it is absent from the args
   entirely because none is passed.
2. **Let `gate` pin a default** so a gate verdict is a verdict, while `full` and `exploratory` stay
   random and keep their exploratory value. `LOCAL_PROFILE_PRESETS` (`run-local.js:52`) is already
   the right place — it carries per-profile `mode`, `checks`, `phases`, `workers`, `maxExamples`,
   `maxFailures`, `suppressHealthChecks`, and every one is overridable by a matching
   `SCHEMATHESIS_LOCAL_*` variable. A `seed` key follows the existing pattern exactly.

Do not silently change what the profiles test. Operation count must stay **46** and selection
**37/46**.

## Scope

`tests/contract/schemathesis/scripts/run-local.js`, plus whatever documentation names the profiles.
No `src/` change. No CI workflow change — CI runs `quick`, which has no fuzzing phase, and widening
CI's profile is a separate decision that should not ride along with this one.

**Out of scope:** the four Schemathesis advisory warnings
(`2026-09-01-todo-schemathesis-gate-warnings.md` — they are not defects), and the pre-existing
`POST /auth/refresh` failure visible in the table above, which PR #79 already fixed via
`src/shared/middleware/client-error.ts`.

## Verification

The point of the change is that this stops being a coin flip, so verify it by repetition:

```bash
docker compose up -d
npm run build && npm run db:migrate:test
npm run seed:contract-tests

# Establish today's behaviour first — 3 runs, unchanged tree. Record each verdict.
npm run contract:local:gate
npm run contract:local:gate
npm run contract:local:gate

# After the change — 3 more runs. Identical verdicts and identical counts.
npm run contract:local:gate
npm run contract:local:gate
npm run contract:local:gate

# And the seed must be visible in the runner's output, not inferred.
```

Report the before-and-after verdicts as a table. If all three "before" runs agree, say so plainly —
that is weaker evidence against the defect than it looks (the reports above show agreement is
common and disagreement intermittent), but it is honest, and the seed-visibility half of the fix
stands on its own regardless.

## Review

**VERIFY FIRST result:** Schemathesis 4.4.4 already prints the effective seed unconditionally at the
end of every run — `OutputHandler.display_seed()`
(`.venv-schemathesis/lib/python3.12/site-packages/schemathesis/cli/commands/run/handlers/output.py:1568-1576`)
is called from the final summary (`:1669`) regardless of pass/fail, and `Config.seed`
(`.../schemathesis/config/__init__.py:112-115`) lazily generates a random 128-bit value the first
time it's read if none was passed — it is never absent. So this did not need custom seed-generation
logic. The gap was narrower: nothing ever pinned a seed for `gate`, and the printed `Seed: <value>`
line only ever reached the terminal (`stdio: "inherit"`), never a durable location.

**Change:** `tests/contract/schemathesis/scripts/run-local.js` —

- `gate` preset gets a fixed `seed: "42"`; `full`/`exploratory` unchanged (stay random by design).
- `SCHEMATHESIS_LOCAL_SEED ?? preset.seed` — the existing per-preset override pattern, unchanged for
  every other field.
- The runner's `Profile "..." resolved to ...` log line now includes the effective seed (or an
  explicit "unset" note for `full`/`exploratory`).
- `runCommand` now optionally captures stdout (still streamed live to the terminal unchanged) so the
  CLI's own `Seed: <value>` line can be written to `<reportDir>/seed.txt`, captured on both success
  and failure.

Also updated `docs/internal/initiatives/tests-4-contract-tests/schemathesis/README.md` with a "Seed /
reproducibility" section.

**Verification — before (unchanged tree, 3 runs):**

| Run | Verdict | Test cases                       | Failing check                                                                                                                             | Seed (printed, unused)                  |
| --- | ------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | ✅ pass | 1369 generated, 1369 passed      | —                                                                                                                                         | 332935362757454943535769103405316754424 |
| 2   | ✅ pass | 1370 generated, 1370 passed      | —                                                                                                                                         | 249507818271592478822377287030058576965 |
| 3   | ❌ fail | 1362 generated, 1 unique failure | `PATCH /metric-settings/{id}/display` — API rejected schema-compliant request (400: `displayOptions.color` "contains invalid characters") | 285743832185050430886247269922914328681 |

All three: 46 operations, 37/46 selected. The three "before" runs did **not** all agree — 2 green,
1 red on an identical tree — which is direct, first-hand confirmation of the defect described above,
not just the historical evidence in the table earlier in this doc. The run 3 failure is a distinct,
previously-unseen finding (not the `POST /auth/refresh` case PR #79 already fixed); it is logged here
as evidence and is otherwise out of scope for this change — no fix attempted.

**Correction, 2026-09-10 — the trigger is not a space, and this is not a new defect class.** A space
is `0x20`, and `hasInvalidControlChars` (`src/shared/utils/text-validation.ts:9`) rejects
`code === 0x7f || code < 0x20`, so a space passes. It also satisfies the documented pattern. The spec
is accurate here: `UpdateDisplayOptionsRequest.displayOptions.color` carries
`pattern: "^[^\u0000-\u001F\u007F]*$"`, and Schemathesis honours patterns when generating, so it
would not produce a control character in the first place.

The remaining trigger is `hasUnpairedSurrogates` (`text-validation.ts:19`) — a lone `\uD800`–`\uDBFF`
or `\uDC00`–`\uDFFF`. Such a code unit is not inside `\u0000-\u001F\u007F`, so it satisfies the
documented pattern while the code rejects it, and no JSON Schema `pattern` can express "no unpaired
surrogates".

That makes this a **fifth instance of the class already characterised** in
[`2026-09-01-todo-schemathesis-gate-warnings.md`](./2026-09-01-todo-schemathesis-gate-warnings.md) —
a constraint OpenAPI cannot state — rather than a spec-versus-code mismatch. Tightening the spec
would fix nothing. Fold it into whatever decision that todo reaches.

One consequence of pinning worth recording: seed 42 passes, so `gate` will not surface this case
again. That is the fuzzer-as-fixture tradeoff accepted above, and it holds only while `full` or
`exploratory` actually get run — nothing currently schedules either.

**Verification — after (same tree, code change applied, 3 runs):**

| Run | Verdict | Test cases                  | Seed (pinned) | `seed.txt` written |
| --- | ------- | --------------------------- | ------------- | ------------------ |
| 1   | ✅ pass | 1370 generated, 1370 passed | 42            | yes, matches       |
| 2   | ✅ pass | 1371 generated, 1371 passed | 42            | yes, matches       |
| 3   | ✅ pass | 1371 generated, 1371 passed | 42            | yes, matches       |

All three: 46 operations, 37/46 selected — unchanged. All three verdicts agree (pass, 0 failures),
and the runner's log line and `reports/local/<timestamp>/seed.txt` both show `42` in every run,
confirmed by reading the file contents directly rather than inferring it. The generated test-case
count still varies slightly run to run (1370–1371) even with a pinned seed — expected, since the
`coverage` phase partly reacts to live server responses rather than being purely seed-driven — but
the verdict itself, which is what the gate checks, no longer flaps.

**Conclusion:** the defect is real (caught it live, not just from historical reports) and the fix
addresses both halves called out in the brief: reproducibility (`gate` now pins a seed) and
visibility (the effective seed is logged and persisted next to the reports it belongs to, instead of
scrolling off the terminal).
