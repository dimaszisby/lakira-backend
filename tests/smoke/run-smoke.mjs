/**
 * Post-deploy smoke suite.
 *
 * Fixture-free apart from one account: it needs a base URL and, for the session, the
 * credentials of a dedicated smoke account (ADR-0095). No seeded data, no stored auth
 * token, no fixture UUIDs. The staging contract job it replaced required twelve
 * environment variables, of which CI supplied one, and one of those (a stored auth token)
 * could never work against a 900-second token TTL. The session logs in afresh each run.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT
 *
 * The four checks prove the target is healthy: serving, with Postgres and Redis reachable
 * from the deployed process, and with the auth middleware mounted.
 *
 * The session (SMOKE_EMAIL and SMOKE_PASSWORD) proves one user's round trip: log in,
 * refresh with the cookie, read the profile, create a metric and delete it, log out, and
 * see the pre-logout cookie refused. It is the pre-production sequence of
 * docs/how-to/ci-cd/run-the-pre-production-smoke-sequence.md, which used to be run by hand.
 * It is one round trip, not a regression suite, and it calls the API directly, not
 * through lakira-frontend's proxy.
 *
 * Release identity (ADR-0039 Part 1): when SMOKE_EXPECTED_RELEASE is set, this suite
 * polls /health until the reported `release` matches it, treating a timeout as failure. It
 * deliberately does NOT assert strict equality against a single fetch compared to
 * github.sha — a deploy is not instantaneous, and Render deploys with zero downtime, so
 * the old release can still legitimately answer for a window after CI triggers the new
 * one. Asserting on the first response would produce false failures on nothing more than
 * a slow rollout, or on a second push landing before the first deploy finishes — in which
 * case waiting out the timeout and failing is correct: the suite was told to expect a
 * commit that never became the one actually running. Every CI invocation MUST set
 * SMOKE_EXPECTED_RELEASE (see smoke_staging and the pre-deploy gate in backend-ci.yml) so
 * this assertion can never be silently skipped in CI. Locally, and on a fresh fork,
 * SMOKE_EXPECTED_RELEASE is unset and the check is skipped: APP_RELEASE defaults to
 * "unknown" outside CI and there is nothing meaningful to compare it against.
 *
 * Nothing the session handles is logged: no token, cookie, password or email address.
 *
 * Usage:  SMOKE_BASE_URL=https://host/api/v1 [SMOKE_EXPECTED_RELEASE=<sha>]
 *         [SMOKE_EMAIL=<address> SMOKE_PASSWORD=<password>] node tests/smoke/run-smoke.mjs
 */

import logger from "../../scripts/logger.js";

const RAW_BASE =
  process.env.SMOKE_BASE_URL ?? process.env.STAGING_BASE_URL ?? "";
const WAIT_TIMEOUT_MS = Number(process.env.SMOKE_WAIT_TIMEOUT_MS ?? 180_000);
const REQUEST_TIMEOUT_MS = Number(
  process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 10_000,
);
const EXPECTED_RELEASE = process.env.SMOKE_EXPECTED_RELEASE ?? "";
const SMOKE_EMAIL = process.env.SMOKE_EMAIL ?? "";
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD ?? "";
// Every CI provider sets CI=true; GitHub Actions also sets GITHUB_ACTIONS.
const IS_CI =
  process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

if (!RAW_BASE) {
  logger.error(
    "[smoke] SMOKE_BASE_URL (or STAGING_BASE_URL) is required, e.g. https://host/api/v1",
  );
  process.exit(1);
}

/**
 * The release check skips when SMOKE_EXPECTED_RELEASE is unset, which is right locally
 * — APP_RELEASE is "unknown" outside CI and there is nothing to compare against. In CI
 * that same skip would be indistinguishable from a pass, so a future smoke invocation
 * added without the variable would gate green while verifying nothing. Refuse instead:
 * the requirement was previously a comment, and a comment cannot fail a build.
 */
if (IS_CI && !EXPECTED_RELEASE) {
  logger.error(
    "[smoke] SMOKE_EXPECTED_RELEASE is required in CI — without it the release " +
      "assertion is skipped and the run proves only that some release is healthy. " +
      "Set it to the commit being deployed (see smoke_staging in backend-ci.yml).",
  );
  process.exit(1);
}

/**
 * The session needs both credentials. One without the other is a mistake in how the run
 * was set up, not a choice to skip, so it fails rather than skipping quietly.
 */
if (Boolean(SMOKE_EMAIL) !== Boolean(SMOKE_PASSWORD)) {
  logger.error(
    "[smoke] SMOKE_EMAIL and SMOKE_PASSWORD go together: set both to run the session, " +
      "or neither to skip it.",
  );
  process.exit(1);
}

/**
 * In CI a skipped session would read as a pass, for the same reason as the release check
 * above (ADR-0095).
 */
if (IS_CI && !SMOKE_EMAIL) {
  logger.error(
    "[smoke] SMOKE_EMAIL and SMOKE_PASSWORD are required in CI — without them the " +
      "session is skipped and the run never logs in. Set them from the " +
      "STAGING_SMOKE_EMAIL and STAGING_SMOKE_PASSWORD secrets (see smoke_staging in " +
      "backend-ci.yml).",
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

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown, headers?: Record<string, string> }} [options]
 * @returns {Promise<{status: number, body: any, headers: Headers}>}
 */
const request = async (path, { method = "GET", body, headers = {} } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed, headers: response.headers };
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
        // Unreachable in CI — the startup guard above exits first.
        return "skipped (SMOKE_EXPECTED_RELEASE not set, not running in CI)";
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

/**
 * The refresh cookie's name carries the app's short name (`<short>_refresh`), which a
 * fork changes and this plain script cannot import, so it is matched by suffix. A cleared
 * cookie (an empty value) is not a cookie to send.
 *
 * @param {Headers} headers
 * @returns {string | null} `name=value`, ready for a Cookie header
 */
const refreshCookieFrom = (headers) => {
  for (const line of headers.getSetCookie()) {
    const match = /^([^=;\s]+_refresh)=([^;]*)/.exec(line);
    if (match && match[2] !== "") return `${match[1]}=${match[2]}`;
  }
  return null;
};

/**
 * What the session carries from step to step. An empty string is "not yet".
 *
 * @typedef {object} SessionState
 * @property {string} token the current access token
 * @property {string} cookie the current refresh cookie, `name=value`
 * @property {string} metricId the metric the session created
 * @property {boolean} metricDeleted
 * @property {boolean} loggedOut
 */

/**
 * @typedef {object} Step
 * @property {string} name
 * @property {string} detail
 */

/** @param {SessionState} state */
const bearer = (state) => ({ authorization: `Bearer ${state.token}` });

/**
 * One user's round trip, in order. Each step needs the one before it, so the session
 * stops at its first failure. What it created or opened is cleaned up afterwards whatever
 * happened (`cleanUpSession`).
 *
 * @type {Array<Step & { run: (state: SessionState) => Promise<string> }>}
 */
const sessionSteps = [
  {
    name: "session: log in",
    detail:
      "POST /auth/login as the smoke account — a token and a refresh cookie",
    run: async (state) => {
      const { status, body, headers } = await request("/auth/login", {
        method: "POST",
        body: { email: SMOKE_EMAIL, password: SMOKE_PASSWORD },
      });
      if (status === 429) {
        throw new Error(
          "got 429 — a rate limit, or a lockout after failed logins; wait 15 minutes",
        );
      }
      if (status !== 200) {
        throw new Error(
          `expected 200, got ${status} — check the smoke account's credentials`,
        );
      }
      if (!body?.data?.token) throw new Error("no token in the response");
      const cookie = refreshCookieFrom(headers);
      if (!cookie) throw new Error("no refresh cookie was set");
      state.token = body.data.token;
      state.cookie = cookie;
      return "token and refresh cookie received";
    },
  },
  {
    name: "session: refresh with the cookie",
    detail: "POST /auth/refresh — the cookie is rotated and a token returned",
    run: async (state) => {
      const { status, body, headers } = await request("/auth/refresh", {
        method: "POST",
        headers: { cookie: state.cookie },
      });
      if (status !== 200) throw new Error(`expected 200, got ${status}`);
      if (!body?.data?.token) throw new Error("no token in the response");
      const cookie = refreshCookieFrom(headers);
      if (!cookie) throw new Error("no rotated refresh cookie was set");
      if (cookie === state.cookie) {
        throw new Error("the refresh cookie was not rotated");
      }
      state.token = body.data.token;
      state.cookie = cookie;
      return "cookie rotated";
    },
  },
  {
    name: "session: read the profile",
    detail:
      "GET /auth/profile — the token reads the smoke account's own profile",
    run: async (state) => {
      const { status, body } = await request("/auth/profile", {
        headers: bearer(state),
      });
      if (status !== 200) throw new Error(`expected 200, got ${status}`);
      const email = String(body?.data?.email ?? "");
      if (email.toLowerCase() !== SMOKE_EMAIL.toLowerCase()) {
        throw new Error("the profile is not the smoke account's");
      }
      return "profile matches the account";
    },
  },
  {
    name: "session: create a metric",
    detail: "POST /metrics — the database write path",
    run: async (state) => {
      // Unique per run: two runs at once (a staging deploy and a production gate), or a
      // run that died before its delete, would otherwise make this create answer 409.
      const suffix = Math.random().toString(36).slice(2, 8);
      const { status, body } = await request("/metrics", {
        method: "POST",
        headers: bearer(state),
        body: {
          name: `smoke check ${new Date().toISOString()}-${suffix}`,
          defaultUnit: "count",
        },
      });
      if (status !== 201) throw new Error(`expected 201, got ${status}`);
      if (!body?.data?.id) throw new Error("no metric id in the response");
      state.metricId = body.data.id;
      return `metric ${state.metricId}`;
    },
  },
  {
    name: "session: delete the metric",
    detail: "DELETE /metrics/:id, then GET it — 200, then 404",
    run: async (state) => {
      const path = `/metrics/${state.metricId}`;
      const deleted = await request(path, {
        method: "DELETE",
        headers: bearer(state),
      });
      if (deleted.status !== 200) {
        throw new Error(`delete: expected 200, got ${deleted.status}`);
      }
      state.metricDeleted = true;
      const after = await request(path, { headers: bearer(state) });
      if (after.status !== 404) {
        throw new Error(`read after delete: expected 404, got ${after.status}`);
      }
      return "deleted, then 404";
    },
  },
  {
    name: "session: log out",
    detail: "POST /auth/logout with the refresh cookie",
    run: async (state) => {
      // The cookie is sent explicitly. Its path is /api/v1/auth/refresh, so a client that
      // honours it, as a browser does, never sends it here, and logout then revokes
      // nothing (#290, ADR-0095). This proves the revoke path works
      // when the cookie arrives; once the cookie path is fixed, send it as a browser would.
      const { status } = await request("/auth/logout", {
        method: "POST",
        headers: { cookie: state.cookie },
      });
      if (status !== 200) throw new Error(`expected 200, got ${status}`);
      state.loggedOut = true;
      return "200";
    },
  },
  {
    name: "session: the logged-out cookie is refused",
    detail: "POST /auth/refresh with the pre-logout cookie — 401",
    run: async (state) => {
      const { status } = await request("/auth/refresh", {
        method: "POST",
        headers: { cookie: state.cookie },
      });
      if (status !== 401) {
        throw new Error(
          `expected 401, got ${status} — the refresh token was not revoked`,
        );
      }
      return "401 as expected";
    },
  },
];

/**
 * Whatever a failed session left behind: an undeleted metric, an open refresh family.
 * Best effort; a failure here is logged and does not change the result.
 *
 * @param {SessionState} state
 */
const cleanUpSession = async (state) => {
  if (state.metricId && !state.metricDeleted && state.token) {
    try {
      const { status } = await request(`/metrics/${state.metricId}`, {
        method: "DELETE",
        headers: bearer(state),
      });
      logger.info(
        `[smoke] cleanup: deleted metric ${state.metricId} (HTTP ${status})`,
      );
    } catch (error) {
      logger.warn(
        `[smoke] cleanup: could not delete metric ${state.metricId}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (state.cookie && !state.loggedOut) {
    try {
      await request("/auth/logout", {
        method: "POST",
        headers: { cookie: state.cookie },
      });
      logger.info("[smoke] cleanup: logged out");
    } catch (error) {
      logger.warn(
        "[smoke] cleanup: could not log out: " +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
};

/**
 * @param {Step} step
 * @param {unknown} error
 * @param {string[]} failures
 */
const reportFailure = (step, error, failures) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`[smoke] FAIL  ${step.name}`);
  logger.error(`              ${step.detail}`);
  logger.error(`              ${message}`);
  failures.push(step.name);
};

/**
 * @param {string[]} failures
 * @returns {Promise<number>} how many session checks count toward the total
 */
const runSession = async (failures) => {
  if (!SMOKE_EMAIL) {
    // Unreachable in CI — the startup guard above exits first.
    logger.info(
      "[smoke] SKIP  session (SMOKE_EMAIL and SMOKE_PASSWORD not set, not running in CI)",
    );
    return 0;
  }

  /** @type {SessionState} */
  const state = {
    token: "",
    cookie: "",
    metricId: "",
    metricDeleted: false,
    loggedOut: false,
  };
  let ran = 0;
  try {
    for (const step of sessionSteps) {
      ran += 1;
      try {
        const note = await step.run(state);
        logger.info(`[smoke] PASS  ${step.name}${note ? ` (${note})` : ""}`);
      } catch (error) {
        reportFailure(step, error, failures);
        const skipped = sessionSteps.length - ran;
        if (skipped > 0) {
          logger.error(
            `[smoke] the session stopped; ${skipped} later step(s) not run`,
          );
        }
        break;
      }
    }
  } finally {
    await cleanUpSession(state);
  }
  return sessionSteps.length;
};

const main = async () => {
  logger.info(`[smoke] target: ${baseUrl}`);
  await waitUntilReachable();

  /** @type {string[]} */
  const failures = [];
  for (const check of checks) {
    try {
      const note = await check.run();
      logger.info(`[smoke] PASS  ${check.name}${note ? ` (${note})` : ""}`);
    } catch (error) {
      reportFailure(check, error, failures);
    }
  }

  const total = checks.length + (await runSession(failures));

  if (failures.length > 0) {
    logger.error(
      `\n[smoke] ${failures.length} of ${total} checks failed: ${failures.join("; ")}`,
    );
    process.exit(1);
  }

  logger.info(`\n[smoke] all ${total} checks passed against ${baseUrl}`);
};

main().catch((error) => {
  logger.error(
    `[smoke] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
