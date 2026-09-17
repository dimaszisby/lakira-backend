/**
 * Post-deploy smoke suite.
 *
 * Deliberately fixture-free: it needs a base URL and nothing else. No seeded data, no
 * auth token, no fixture UUIDs. That is the whole point — the staging contract job it
 * replaces required twelve environment variables, of which CI supplied one, and one of
 * those (a stored auth token) could never work against a 900-second token TTL.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT
 *
 * It proves the target is healthy: serving, with Postgres and Redis reachable from the
 * deployed process, and with the auth middleware mounted.
 *
 * Release identity (ADR-0039 Part 1) closes the gap this header used to describe: when
 * SMOKE_EXPECTED_RELEASE is set, this suite also polls /health until the reported
 * `release` matches it, treating a timeout as failure. It deliberately does NOT assert
 * strict equality against a single fetch compared to github.sha — a deploy is not
 * instantaneous, and Render deploys with zero downtime, so the old release can still
 * legitimately answer for a window after CI triggers the new one. Asserting on the first
 * response would produce false failures on nothing more than a slow rollout, or on a
 * second push landing before the first deploy finishes — in which case waiting out the
 * timeout and failing is correct: the suite was told to expect a commit that never became
 * the one actually running. Every CI invocation MUST set SMOKE_EXPECTED_RELEASE (see
 * smoke_staging and the pre-deploy gate in backend-ci.yml) so this assertion can never be
 * silently skipped in CI. Locally, and on a fresh fork, SMOKE_EXPECTED_RELEASE is unset
 * and the check is skipped: APP_RELEASE defaults to "unknown" outside CI and there is
 * nothing meaningful to compare it against.
 *
 * Usage:  SMOKE_BASE_URL=https://host/api/v1 [SMOKE_EXPECTED_RELEASE=<sha>] node tests/smoke/run-smoke.mjs
 */

import logger from "../../scripts/logger.js";

const RAW_BASE =
  process.env.SMOKE_BASE_URL ?? process.env.STAGING_BASE_URL ?? "";
const WAIT_TIMEOUT_MS = Number(process.env.SMOKE_WAIT_TIMEOUT_MS ?? 180_000);
const REQUEST_TIMEOUT_MS = Number(
  process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 10_000,
);
const EXPECTED_RELEASE = process.env.SMOKE_EXPECTED_RELEASE ?? "";

if (!RAW_BASE) {
  logger.error(
    "[smoke] SMOKE_BASE_URL (or STAGING_BASE_URL) is required, e.g. https://host/api/v1",
  );
  process.exit(1);
}

/**
 * STAGING_BASE_URL is documented as already including /api/v1
 * (docs/reference/environments.md:202), but a bare origin is the more natural thing to
 * pass locally. Accept either rather than making the caller remember which.
 */
const baseUrl = (() => {
  const trimmed = RAW_BASE.replace(/\/+$/, "");
  return /\/api\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
})();

/** @param {string} path @returns {Promise<{status: number, body: any}>} */
const request = async (path) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * The deploy is fire-and-forget: deploy_staging POSTs the Render hook and the step ends,
 * so this can start while the platform is still rolling out. Poll before asserting, or
 * every check becomes a race.
 */
const waitUntilReachable = async () => {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let attempt = 0;
  let lastError = "no attempt made";

  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const { status } = await request("/health");
      if (status === 200) {
        logger.info(`[smoke] reachable after ${attempt} attempt(s)`);
        return;
      }
      lastError = `HTTP ${status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const delay = Math.min(5000, 500 * attempt, Math.max(remaining, 0));
    logger.info(
      `[smoke] not reachable yet (${lastError}); retrying in ${delay}ms`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error(
    `Target never became reachable within ${WAIT_TIMEOUT_MS}ms — last error: ${lastError}`,
  );
};

const checks = [
  {
    name: "deployed release matches expected commit",
    detail:
      "GET /health — release must match SMOKE_EXPECTED_RELEASE within the wait budget",
    run: async () => {
      if (!EXPECTED_RELEASE) {
        return "skipped (SMOKE_EXPECTED_RELEASE not set)";
      }

      const deadline = Date.now() + WAIT_TIMEOUT_MS;
      let lastSeen = "(no response yet)";

      while (Date.now() < deadline) {
        const { status, body } = await request("/health");
        if (status === 200 && body?.release === EXPECTED_RELEASE) {
          return `release=${body.release}`;
        }
        lastSeen = status === 200 ? String(body?.release) : `HTTP ${status}`;

        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(3000, remaining)),
        );
      }

      throw new Error(
        `release never matched "${EXPECTED_RELEASE}" within ${WAIT_TIMEOUT_MS}ms — ` +
          `last seen: ${lastSeen}`,
      );
    },
  },
  {
    name: "readiness reports every backing service healthy",
    detail:
      "GET /ready — Postgres and Redis reachable from the deployed process",
    run: async () => {
      const { status, body } = await request("/ready");
      if (status !== 200) {
        throw new Error(
          `expected 200, got ${status} — body: ${JSON.stringify(body)}`,
        );
      }
      const checksBody = body?.checks ?? {};
      const unhealthy = Object.entries(checksBody)
        .filter(([, value]) => value !== "ok")
        .map(([key, value]) => `${key}=${value}`);
      if (unhealthy.length > 0) {
        throw new Error(`unhealthy dependencies: ${unhealthy.join(", ")}`);
      }
      if (Object.keys(checksBody).length === 0) {
        throw new Error(
          `no dependency checks reported — body: ${JSON.stringify(body)}`,
        );
      }
      return Object.keys(checksBody).join(", ");
    },
  },
  {
    name: "health endpoint serves",
    detail: "GET /health — the process is up and knows its environment",
    run: async () => {
      const { status, body } = await request("/health");
      if (status !== 200) throw new Error(`expected 200, got ${status}`);
      if (body?.status !== "ok") {
        throw new Error(
          `expected status "ok", got ${JSON.stringify(body?.status)}`,
        );
      }
      if (!body?.environment) throw new Error("no environment reported");
      return `environment=${body.environment}`;
    },
  },
  {
    name: "protected routes reject unauthenticated requests",
    detail: "GET /metrics without a token — the auth middleware is mounted",
    run: async () => {
      const { status } = await request("/metrics");
      if (status !== 401) {
        throw new Error(
          `expected 401, got ${status} — auth middleware may not be mounted`,
        );
      }
      return "401 as expected";
    },
  },
];

const main = async () => {
  logger.info(`[smoke] target: ${baseUrl}`);
  await waitUntilReachable();

  const failures = [];
  for (const check of checks) {
    try {
      const note = await check.run();
      logger.info(`[smoke] PASS  ${check.name}${note ? ` (${note})` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[smoke] FAIL  ${check.name}`);
      logger.error(`              ${check.detail}`);
      logger.error(`              ${message}`);
      failures.push(check.name);
    }
  }

  if (failures.length > 0) {
    logger.error(
      `\n[smoke] ${failures.length} of ${checks.length} checks failed: ${failures.join("; ")}`,
    );
    process.exit(1);
  }

  logger.info(
    `\n[smoke] all ${checks.length} checks passed against ${baseUrl}`,
  );
};

main().catch((error) => {
  logger.error(
    `[smoke] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
