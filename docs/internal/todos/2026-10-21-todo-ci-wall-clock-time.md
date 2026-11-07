# Todo — CI takes 11 to 15 minutes before a PR can merge

- **Status:** Closed by #204 (`a311214`), branch `ci/tests-in-parallel`
  ([`tests-in-parallel`](../initiatives/tests-in-parallel/README.md), ADR-0081). Candidates 1 to 3
  done; 4 not taken
- **Created:** 2026-10-21
- **Owner:** unassigned
- **Origin:** the owner; a CI Q&A session's handoff on the Notion page "Handoff", section "BE CI
  Handoff" (2026-10-21 09:21 UTC). Register row B-85

---

## What

The owner finds `backend-ci.yml` slow: about 12 to 15 minutes before a PR can merge, and wants
more of it to run in parallel. Measured on run 39563144122 (`pull_request`, branch
`fix/auth-infrastructure-errors-are-5xx`): about 11.5 minutes end to end; the rest is probably
queue time (unconfirmed).

```
checks (1m04s) ---------+
                        +--> tests (9m12s) --> contract_local (1m15s) --> deploy jobs
security_delta (24s) ---+
```

Inside `tests`, on one runner, in order: setup about 50 s, `test:unit` 2m29s,
`test:integration` 1m35s, `test:unit:coverage` 2m28s, `test:integration:coverage` 1m46s. The
`:coverage` scripts are the plain ones plus `--coverage`, so every test runs twice.

## Candidates (not decisions)

1. Drop the plain test runs and keep the `:coverage` ones, which enforce the thresholds
   (`coverage-thresholds-enforced` D-01). Check nothing reads the plain runs' JUnit output.
2. Run unit and integration as separate jobs; the unit job may need no service containers
   (`SKIP_DB_LIFECYCLE=true`).
3. Let `contract_local` stop waiting on `tests`; it builds, migrates and seeds its own server.
4. Letting the tests start before `security_delta` passes changes the rule in
   `.claude/rules/security.md` § Security CI Pipeline, so it needs an ADR. Probably not worth about
   a minute.

Splitting or renaming `Unit & Integration Tests` breaks branch protection's required check until
the owner updates it. `.github/workflows/` edits are blocked by a hook: the file is written in the
scratchpad and the owner copies it in. Wall-clock time falls, runner minutes stay flat or rise.

Estimated result of 1 to 3: 3 to 4 minutes on the critical path (an estimate, not a
measurement). Stage it: 1, measure, then 2 and 3.
