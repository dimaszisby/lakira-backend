# Todo — intermittent `Parse Error: Expected HTTP/` in the integration suite

- **Status:** Open — seen once, not reproduced; act only if it recurs
- **Created:** 2026-09-25
- **Owner:** unassigned
- **Origin:** the `node-24-runtime` kit's gate runs

---

## What

One full `npm test` run on Node 24.21.0 failed a single integration test:

```
FAIL integration __tests__/integration/api/metric-settings.test.ts
  ● Metric Settings API › validates payload combinations
    Parse Error: Expected HTTP/, RTSP/ or ICE/
```

The error comes from Node's HTTP client (`llhttp`), which received bytes that were not an HTTP
status line. The test uses `request(app)` from `__tests__/integration/helpers/test-utils.ts`, so
each request gets its own ephemeral server. That rules out an obvious shared-port collision.

## What was tried

| Run                                               | Result                           |
| ------------------------------------------------- | -------------------------------- |
| full `npm test`, Node 24, first run after install | 1 failed (this one), 195 passed  |
| the suite alone, Node 24, three times             | 12/12 each time                  |
| full integration, Node 24, five more times        | 196 passed, 5 skipped, each time |
| full integration, Node 20.20.2, three times       | 196 passed, 5 skipped, each time |

One failure in six full Node 24 runs, against zero in three on Node 20, does not tell a Node 24
regression apart from a pre-existing flake. The failing run was the first after `node_modules` was
reinstalled.

## If it recurs

Record the Node version, whether it was the first run after an install, and whether the same test
failed. Two occurrences on 24 and none on 20 would justify bisecting; a hit on 20 settles it as
pre-existing. Compare [`2026-09-24-todo-queue-test-intermittent-401.md`](2026-09-24-todo-queue-test-intermittent-401.md),
the other intermittent integration failure seen once.
