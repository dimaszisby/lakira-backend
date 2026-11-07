# ADR registry hygiene — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `b45c4f3` (#212).

## Acceptance criteria

- **AC-1** — ADR-0056, 0061, 0067, 0069, 0070, 0073 and 0074 each carry a 2026-10-23 status note
  that names the sentence that no longer holds and links the record that changed it. _Why:_ A1020
  § 4.5 (D-01).
- **AC-2** — ADR-0061 and ADR-0070 link ADR-0072. _Why:_ X46 (D-01).
- **AC-3** — Every code name a note cites exists under `src`, and none of `installMetricLogFeature`,
  `installAuthFeature` or `installOrgFeature` does. _Why:_ a note must not go stale itself.
- **AC-4** — Every relative link in a touched file resolves. _Why:_ a broken link is a new stale
  statement.
- **AC-5** — B-83 is in Closed; B-88 stays open; "As of" is `b45c4f3`; #212's loose ends are done.
  _Why:_ D-02.
- **AC-6** — Prettier is clean on every touched file.

## Phase 0 — kit and branch

- [x] `docs/adr-registry-hygiene` cut with `--no-track` from `origin/dev` at `b45c4f3`; HEAD and
      upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 and D-02
- [x] #212's loose ends: `architecture-boundaries` D-01 to D-07 Accepted, README Done; "As of"
      `b45c4f3`

## Phase 1 — notes

- [x] ADR-0056: decision 3 and § Consequences (the `install*` hooks, "only metric-log")
- [x] ADR-0061: decision 2 (`server.ts` calls it), X46
- [x] ADR-0067: decision 1 (the retry queue), § Consequences (reset and invite)
- [x] ADR-0069: § Consequences (the invite email)
- [x] ADR-0070: the wiring paragraph (`installAuthFeature`, `installOrgFeature`), X46
- [x] ADR-0073: § Consequences ("about nine retry queues")
- [x] ADR-0074: decisions 1 and 6

## Phase 2 — gates, review, register

- [x] Gates, below
- [x] Each note re-read against the code it names. ADR-0056's note said decisions 1, 2 and 4
      hold, leaving out the rest of decision 3, which holds too; it now says so. ADR-0070's
      paragraph sits at the end of § Decision, not above it; the note names it that way
- [x] Register: B-83 to Closed
- [x] Notion Part 2: none

## Discovered

- Nothing.

## Acceptance

- [x] AC-1 — the seven notes, each above its record's first `---`
- [x] AC-2 — ADR-0061's and ADR-0070's notes link ADR-0072
- [x] AC-3 — `buildWiredFeatures`, `buildWiredAuthFeature`, `createApp`, `assertRetryTier`,
      `assertWorkQueue`, `retryDelaysMs` found under `src`; the three `install*` names found nowhere;
      defaults `"5"` and `"2000"` in `src/config/zodEnv.ts`
- [x] AC-4 — the link gate below
- [x] AC-5 — B-83 in Closed, B-88 open, "As of" `b45c4f3`
- [x] AC-6 — the format gate below

## Gates

- [x] format — `prettier --check` on every touched file: clean
- [x] links — every relative link in a touched file resolves: 138 checked, none missing
- [ ] typecheck — skipped: no code change
- [ ] lint — skipped: no code change
- [ ] tests — skipped: no code change
- [ ] build — skipped: no code change
- [ ] OpenAPI — skipped: no route or schema change
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
