# Todo — relative ranges leave out today; lifecycle timestamps are shifted

- **Status:** Open (P2). Waiting on the owner's confirmation that today should be included
- **Created:** 2026-10-13
- **Owner:** unassigned
- **Origin:** lakira-frontend, on the Notion page "FE and BE messages", Part 1, raised 2026-10-07
  and updated 2026-10-08. The backend's answer was written there on 2026-10-13

---

## What

Three behaviours of the two analytics routes, each read in the code at `bf72b58`:

1. A relative range (`last=7d`) ends at the start of the current bucket in UTC, so a value logged
   today is left out until tomorrow.
2. `firstLogAt` and `lastLogAt` are local wall-clock times serialised with a `Z`.
3. The fallback range ends at `lastLogAt` exclusively, so it leaves out its newest log.

## Where it is worked out

Root cause, options, the recommended fix and its acceptance criteria are in
[the analysis](../initiatives/backend-debt-register/analysis-analytics-relative-range.md). This
file does not repeat them. Register row B-02.

## Open question

Whether "complete buckets only" was ever intended. The analysis takes it as a side effect of
stabilising the cache key and lays out the other reading (its § 3).
