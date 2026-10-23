import "./loadEnv.js";
import { z } from "zod";
import { isIanaTimeZone } from "@/utils/time-zone.js";
import { zod3Messages } from "@/shared/utils/zod3-messages.js";

// Tokens are HS256, so the secret's strength is the signature's. Both are checked in
// the superRefine below, in production and staging (ADR-0036; kit
// jwt-secret-minimum-length, D-01).
/** A PEM certificate frame; the TLS handshake judges what is inside it. */
const PEM_CERTIFICATE =
  /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/;

const JWT_SECRET_MIN_LENGTH = 32;
// The value .env.example ships. It is longer than the minimum, so it needs a rule of
// its own. scripts/bootstrap-fork.sh matches on the same string.
const JWT_SECRET_TEMPLATE_PLACEHOLDER = "replace-with-a-long-random-secret";

// The shape of a DSN @sentry/core will parse: its DSN_REGEX in utils/dsn.js. A value
// it cannot parse is printed whole with console.error and Sentry stays off, so one is
// refused here first, by name (kit log-redaction-coverage, D-17).
const SENTRY_DSN_SHAPE =
  /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+)?)?@)((?:\[[:.%\w]+\]|[\w.-]+))(?::(\d+))?\/(.+)/;

const nodeEnvSchema = z
  .preprocess(
    (val) => (typeof val === "string" ? val.toLowerCase() : val),
    z.enum(["development", "test", "staging", "production"]),
  )
  .default("development");

type NodeEnv = z.infer<typeof nodeEnvSchema>;

/**
 * Define the environment schema using Zod.
 * Ensures type safety while allowing transformation.
 *
 * Built per parse from the normalized NODE_ENV, so a default that depends on it
 * sees `production` for `NODE_ENV=Production`, and is read when the environment is,
 * not once at import (kit log-redaction-coverage, D-17).
 */
const buildEnvSchema = (nodeEnv: NodeEnv) =>
  z
    .object({
      // Node Environment
      NODE_ENV: nodeEnvSchema,

      // Server
      PORT: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed)) {
            throw new Error("PORT must be a valid number");
          }
          return parsed;
        })
        .prefault("5000"),

      // Security
      JWT_SECRET: z.string().min(1, { message: "JWT_SECRET is required" }),
      ACCESS_TOKEN_TTL_SEC: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error("ACCESS_TOKEN_TTL_SEC must be a positive number");
          }
          return parsed;
        })
        .prefault("900"),
      REFRESH_TOKEN_TTL_DAYS: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error("REFRESH_TOKEN_TTL_DAYS must be a positive number");
          }
          return parsed;
        })
        .prefault("30"),

      // CORS
      // Comma-separated list of allowed origins. Single origin still works
      // (parses to a 1-element array). Empty entries are dropped after trimming.
      CORS_ORIGIN: z
        .string()
        .optional()
        .transform((val) => {
          if (val === undefined) return undefined;
          const parsed = val
            .split(",")
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0);
          return parsed.length > 0 ? parsed : undefined;
        }),

      // Database URLs (separate environment variables for dev/test/prod)
      DATABASE_URL: z.string().optional(),
      DEVELOPMENT_DATABASE_URL: z.string().optional(),
      TEST_DATABASE_URL: z.string().optional(),
      STAGING_DATABASE_URL: z.string().optional(),
      PRODUCTION_DATABASE_URL: z.string().optional(),

      // IF you rely on a DB_HOST/DB_PORT approach:
      DB_HOST: z.string().default(nodeEnv === "test" ? "db" : "127.0.0.1"),
      DB_PORT: z
        .string()
        .transform((val) => parseInt(val, 10))
        .prefault("5432"),
      DB_LOGGING: z.string().default("false"), // Allows enabling/disabling logging

      // Winston log level. Declared here as the fail-fast contract and the documentation;
      // src/utils/logger.ts re-reads process.env.LOG_LEVEL directly because it loads before
      // envManager is initialised (see app-name.ts:1-3). Default follows the house pattern of
      // a NODE_ENV-dependent default. Production defaults to "http" rather than "info" so the
      // ADR-0041 access-log lines (winston npm level 3) are included; at "info" (2) they are
      // silently dropped. Note DB_LOGGING routes SQL through logger.debug, so it only
      // produces output when this is "debug" or lower.
      LOG_LEVEL: z
        .enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
        .default(nodeEnv === "production" ? "http" : "debug"),
      // Verifies the database's TLS certificate. Production refuses false; staging
      // defaults to true and may opt out, with a warning (database-tls-and-staging-refusals D-01).
      DB_SSL_REJECT_UNAUTHORIZED: z
        .string()
        .transform((val) => val.toLowerCase() !== "false")
        .prefault(
          nodeEnv === "production" || nodeEnv === "staging" ? "true" : "false",
        ),
      // The CA certificate (PEM) the database connection trusts, beside Node's
      // default bundle, in staging and production. A literal \n is read as a
      // newline, for a platform that stores a variable on one line (D-04).
      DB_SSL_CA: z
        .string()
        .optional()
        .transform((val) =>
          val && val.trim() ? val.replace(/\\n/g, "\n") : undefined,
        ),

      // Redis
      REDIS_URL: z.string().optional(),
      REDIS_HOST: z
        .string()
        .default(nodeEnv === "test" ? "redis" : "127.0.0.1"),
      REDIS_PORT: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed)) {
            throw new Error("REDIS_PORT must be a valid number");
          }
          return parsed;
        })
        .prefault("6379"),
      REDIS_PASSWORD: z.string().optional(),
      REDIS_REQUIRED: z
        .string()
        .transform((val) => val === "true") // Convert string to boolean
        .prefault(nodeEnv === "test" ? "false" : "true"),
      ENABLE_REDIS_INTEGRATION: z
        .string()
        .transform((val) => val === "true")
        .prefault("false"),
      RATE_LIMIT_GLOBAL_MAX: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error("RATE_LIMIT_GLOBAL_MAX must be a positive number");
          }
          return parsed;
        })
        .prefault("100"),
      RATE_LIMIT_USER_MAX: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error("RATE_LIMIT_USER_MAX must be a positive number");
          }
          return parsed;
        })
        .prefault("50"),

      // Jest
      JEST_TIMEOUT: z.string().transform(Number).prefault("30000"),

      // Database
      DB_USER: z
        .string()
        .min(1, {
          message:
            "DB_USER is required. Set an explicit value in your .env file.",
        })
        .optional(),
      DB_PASSWORD: z
        .string()
        .min(1, {
          message:
            "DB_PASSWORD is required. Set an explicit value in your .env file.",
        })
        .optional(),
      DB_NAME: z
        .string()
        .min(1, {
          message:
            "DB_NAME is required. Set an explicit value in your .env file.",
        })
        .optional(),

      ENABLE_DUMMY_ENDPOINTS: z
        .string()
        .transform((val) => val === "true")
        .prefault(["development", "test"].includes(nodeEnv) ? "true" : "false"),

      RATE_LIMIT_ANALYTICS_MAX: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(
              "RATE_LIMIT_ANALYTICS_MAX must be a positive number",
            );
          }
          return parsed;
        })
        .prefault("30"),

      RATE_LIMIT_SWITCH_ORG_MAX: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(
              "RATE_LIMIT_SWITCH_ORG_MAX must be a positive number",
            );
          }
          return parsed;
        })
        .prefault("10"),

      DISABLE_RATE_LIMITING: z
        .string()
        .transform((val) => val === "true")
        .prefault("false"),

      ALLOW_TEST_HTTP_SERVER: z
        .string()
        .transform((val) => val === "true")
        .prefault("false"),

      // Skips the database bootstrap at startup. Test-only: jest.setup.ts and the
      // contract runners set it so suites do not pay for a DB lifecycle they mock.
      // Previously read straight off process.env in server.ts, which kept it out of
      // the fail-fast contract entirely (twelve-factor TF-6).
      SKIP_DB_LIFECYCLE: z
        .string()
        .transform((val) => val === "true")
        .prefault("false"),

      // RabbitMQ
      RABBITMQ_URL: z.string().optional(),
      RABBITMQ_ENABLED: z
        .string()
        .transform((val) => val === "true")
        .prefault("false"),
      RABBITMQ_HOST: z.string().default("127.0.0.1"),
      RABBITMQ_PORT: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed)) {
            throw new Error("RABBITMQ_PORT must be a valid number");
          }
          return parsed;
        })
        .prefault("5672"),
      RABBITMQ_USER: z.string().default("guest"),
      RABBITMQ_PASSWORD: z.string().default("guest"),
      RABBITMQ_VHOST: z.string().default("/"),
      RABBITMQ_PREFETCH: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error("RABBITMQ_PREFETCH must be a positive number");
          }
          return parsed;
        })
        .prefault("10"),
      RABBITMQ_MAX_RETRIES: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed < 0) {
            throw new Error(
              "RABBITMQ_MAX_RETRIES must be a non-negative number",
            );
          }
          return parsed;
        })
        .prefault("5"),
      // First retry delay; doubles per retry, capped at 5 minutes (ADR-0005).
      RABBITMQ_RETRY_BASE_DELAY_MS: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(
              "RABBITMQ_RETRY_BASE_DELAY_MS must be a positive number",
            );
          }
          return parsed;
        })
        .prefault("2000"),

      // Observability
      // Blank or unset leaves Sentry off. The message names the variable only.
      SENTRY_DSN: z
        .string()
        .refine((val) => val === "" || SENTRY_DSN_SHAPE.test(val), {
          message:
            "SENTRY_DSN is not a DSN Sentry can read; copy it again from the project's Client Keys, or remove it to turn Sentry off",
        })
        .optional(),
      SENTRY_TRACES_SAMPLE_RATE: z
        .string()
        .transform((val) => {
          const parsed = parseFloat(val);
          return isNaN(parsed) ? 0 : parsed;
        })
        .prefault("0"),
      // Release identity (ADR-0039 Part 1). CI/platform supplies the commit SHA via
      // APP_RELEASE; Render also auto-sets RENDER_GIT_COMMIT from the branch tip it builds,
      // used as a fallback when APP_RELEASE is unset — APP_RELEASE always wins when both are
      // set. Defaults to "unknown" for local development, tests, and a fresh fork. An empty
      // value counts as unset, as the logger already reads it: `.env.example` shipped
      // `APP_RELEASE=`, and /health reported "" (release-and-retry-after D-03).
      APP_RELEASE: z
        .string()
        .optional()
        .transform((val) => val || process.env.RENDER_GIT_COMMIT || "unknown"),

      // HTTP
      // Hops of proxy in front of the app; req.ip, and so every per-IP limiter, depends
      // on it. A whole number only: coercion read a blank value as 0, which trusts no
      // proxy, and 1.5 as two hops (kit register-rate-limiter, D-05).
      TRUST_PROXY: z
        .string()
        .trim()
        .regex(/^\d+$/, {
          message:
            "TRUST_PROXY must be a whole number of proxy hops, or be removed to use 1",
        })
        .default("1")
        .transform(Number),
      REQUEST_BODY_LIMIT: z.string().default("1mb"),
      SWAGGER_REQUIRE_AUTH: z
        .string()
        .transform((val) => val !== "false")
        .prefault("true"),

      // Email / Password Reset
      EMAIL_PROVIDER: z
        .preprocess(
          (val) => (typeof val === "string" ? val.toLowerCase() : val),
          z.enum(["console", "resend", "mailpit"]),
        )
        .default(
          ["development", "test"].includes(nodeEnv) ? "console" : "resend",
        ),
      RESEND_API_KEY: z.string().optional(),
      // Base URL of a Mailpit instance, used only when EMAIL_PROVIDER=mailpit (ADR-0048).
      MAILPIT_URL: z.string().url().default("http://localhost:8025"),
      EMAIL_FROM: z.string().default("onboarding@resend.dev"),
      FRONTEND_RESET_URL: z
        .string()
        .url()
        .default("http://localhost:3000/reset-password"),
      FRONTEND_VERIFY_URL: z
        .string()
        .url()
        .default("http://localhost:3000/verify-email"),
      FRONTEND_INVITE_URL: z
        .string()
        .url()
        .default("http://localhost:3000/invites/accept"),
      INVITE_TOKEN_TTL_DAYS: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error("INVITE_TOKEN_TTL_DAYS must be a positive number");
          }
          return parsed;
        })
        .prefault("7"),
      EMAIL_VERIFICATION_TTL_SEC: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(
              "EMAIL_VERIFICATION_TTL_SEC must be a positive number",
            );
          }
          return parsed;
        })
        .prefault("86400"),
      RATE_LIMIT_EMAIL_VERIFICATION_EMAIL_MAX: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(
              "RATE_LIMIT_EMAIL_VERIFICATION_EMAIL_MAX must be a positive number",
            );
          }
          return parsed;
        })
        .prefault("3"),
      RATE_LIMIT_EMAIL_VERIFICATION_IP_MAX: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(
              "RATE_LIMIT_EMAIL_VERIFICATION_IP_MAX must be a positive number",
            );
          }
          return parsed;
        })
        .prefault("10"),
      RATE_LIMIT_PASSWORD_RESET_EMAIL_MAX: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(
              "RATE_LIMIT_PASSWORD_RESET_EMAIL_MAX must be a positive number",
            );
          }
          return parsed;
        })
        .prefault("3"),
      RATE_LIMIT_PASSWORD_RESET_IP_MAX: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(
              "RATE_LIMIT_PASSWORD_RESET_IP_MAX must be a positive number",
            );
          }
          return parsed;
        })
        .prefault("10"),
      // POST /auth/login, per IP per 15 minutes (api-tooling-residuals D-08).
      RATE_LIMIT_LOGIN_MAX: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error("RATE_LIMIT_LOGIN_MAX must be a positive number");
          }
          return parsed;
        })
        .prefault("50"),
      // POST /auth/refresh and /auth/logout, per IP per 15 minutes (api-tooling-residuals D-08).
      RATE_LIMIT_AUTH_SESSION_MAX: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(
              "RATE_LIMIT_AUTH_SESSION_MAX must be a positive number",
            );
          }
          return parsed;
        })
        .prefault("50"),
      // POST /auth/register, per IP per hour (ADR-0053).
      RATE_LIMIT_REGISTER_IP_MAX: z
        .string()
        .transform((val) => {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(
              "RATE_LIMIT_REGISTER_IP_MAX must be a positive number",
            );
          }
          return parsed;
        })
        .prefault("10"),

      // Analytics / Visualization
      VIZ_MAX_BUCKETS: z.coerce.number().int().positive().default(400),
      VIZ_DASH_MAX_METRICS: z.coerce.number().int().positive().default(24),
      VIZ_DEFAULT_TTL_SEC: z.coerce.number().int().positive().default(120),
      VIZ_FALLBACK_GUARD_BUCKETS: z.coerce
        .number()
        .int()
        .positive()
        .default(96),
      // An offset is read with opposite signs by Intl and Postgres
      // (api-tooling-residuals D-01).
      DEFAULT_TZ: z
        .string()
        .default("Asia/Jakarta")
        .refine(isIanaTimeZone, "DEFAULT_TZ must be an IANA time zone or UTC"),
    })
    .superRefine((data, ctx) => {
      // ADR-0036: a switch whose value weakens a production security control must be
      // refused at the schema layer, so the process fails fast at startup instead of
      // serving traffic with the control silently disabled.
      //
      // Reads the normalized `data.NODE_ENV` rather than raw process.env so that
      // `NODE_ENV=Production` is caught too (the schema lowercases it on the way in).
      const refuse = (path: string, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

      // Never quoted: the message names the variable only.
      if (
        data.DB_SSL_CA !== undefined &&
        !PEM_CERTIFICATE.test(data.DB_SSL_CA)
      ) {
        refuse(
          "DB_SSL_CA",
          "DB_SSL_CA must hold a PEM certificate, from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----.",
        );
      }

      // ADR-0049: the console adapter logs every email body, reset and invite tokens
      // included, so it may only run where logs stay on a developer's machine. This one
      // also covers staging, so it sits above the production-only return below.
      if (
        data.EMAIL_PROVIDER === "console" &&
        data.NODE_ENV !== "development" &&
        data.NODE_ENV !== "test"
      ) {
        refuse(
          "EMAIL_PROVIDER",
          `EMAIL_PROVIDER cannot be "console" when NODE_ENV=${data.NODE_ENV} — it logs every email body, reset and invite tokens included (ADR-0049). Use "resend", or "mailpit" in staging.`,
        );
      }

      // Whoever can guess the secret can mint a token for any user, and staging is
      // reachable from the internet, so this covers it too. Neither message quotes the
      // value: envManager prints the issues with console.error, unredacted.
      if (data.NODE_ENV === "production" || data.NODE_ENV === "staging") {
        if (data.JWT_SECRET.length < JWT_SECRET_MIN_LENGTH) {
          refuse(
            "JWT_SECRET",
            `JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters when NODE_ENV=${data.NODE_ENV} — a short secret lets access tokens be forged.`,
          );
        }
        if (data.JWT_SECRET.trim() === JWT_SECRET_TEMPLATE_PLACEHOLDER) {
          refuse(
            "JWT_SECRET",
            `JWT_SECRET cannot be the placeholder from .env.example when NODE_ENV=${data.NODE_ENV} — it is published with the template. Generate a random one.`,
          );
        }
      }

      // Staging is reachable from the internet, so it takes these refusals too
      // (database-tls-and-staging-refusals D-02). Only mailpit stays allowed there.
      if (data.NODE_ENV !== "production" && data.NODE_ENV !== "staging") return;
      const where = `NODE_ENV=${data.NODE_ENV}`;

      if (data.NODE_ENV === "production" && !data.DB_SSL_REJECT_UNAUTHORIZED) {
        refuse(
          "DB_SSL_REJECT_UNAUTHORIZED",
          "DB_SSL_REJECT_UNAUTHORIZED cannot be false when NODE_ENV=production — the database connection would accept any certificate.",
        );
      }

      if (data.DISABLE_RATE_LIMITING) {
        refuse(
          "DISABLE_RATE_LIMITING",
          `DISABLE_RATE_LIMITING cannot be true when ${where} — it disables every rate limiter, including auth brute-force protection.`,
        );
      }

      if (data.ALLOW_TEST_HTTP_SERVER) {
        refuse(
          "ALLOW_TEST_HTTP_SERVER",
          `ALLOW_TEST_HTTP_SERVER cannot be true when ${where}.`,
        );
      }

      if (!data.SWAGGER_REQUIRE_AUTH) {
        refuse(
          "SWAGGER_REQUIRE_AUTH",
          `SWAGGER_REQUIRE_AUTH cannot be false when ${where} — it would expose the API docs unauthenticated.`,
        );
      }

      // Sequelize's statement text inlines the values of a WHERE clause, and it is
      // logged as a message, which redaction never scans (kit log-redaction-coverage,
      // D-11). Development keeps the switch.
      if (data.DB_LOGGING === "true") {
        refuse(
          "DB_LOGGING",
          `DB_LOGGING cannot be true when ${where} — it writes SQL statements to the log with their values, email addresses included.`,
        );
      }

      if (data.SKIP_DB_LIFECYCLE) {
        refuse(
          "SKIP_DB_LIFECYCLE",
          `SKIP_DB_LIFECYCLE cannot be true when ${where} — the app would start without its database bootstrap.`,
        );
      }

      if (data.LOG_LEVEL === "silly") {
        refuse(
          "LOG_LEVEL",
          `LOG_LEVEL cannot be "silly" when ${where} — it is a firehose and would bury real signal in the log stream.`,
        );
      }

      if (data.NODE_ENV === "production" && data.EMAIL_PROVIDER === "mailpit") {
        refuse(
          "EMAIL_PROVIDER",
          'EMAIL_PROVIDER cannot be "mailpit" when NODE_ENV=production — every email, tokens included, would go to a local catcher instead of its recipient (ADR-0048).',
        );
      }

      if (data.RABBITMQ_ENABLED) {
        // Judged on the login the connection will use, which is the URL's whenever
        // RABBITMQ_URL is set (audit 2026-10-12, W4). The messages name the variable
        // and never quote the URL. A URL that cannot be read is not judged here:
        // normalizeRabbitMQConfig rejects it straight after.
        let login: RabbitMQLogin | undefined;
        try {
          login = rabbitMQLogin(data);
        } catch {
          login = undefined;
        }
        if (login?.fromUrl) {
          if (login.user === "guest") {
            refuse(
              "RABBITMQ_URL",
              `RABBITMQ_URL cannot log in as the default "guest" user when ${where} and RABBITMQ_ENABLED=true. A URL that names no user and password logs in as guest too.`,
            );
          }
          if (login.password === "guest") {
            refuse(
              "RABBITMQ_URL",
              `RABBITMQ_URL cannot log in with the default "guest" password when ${where} and RABBITMQ_ENABLED=true.`,
            );
          }
        } else if (login) {
          if (login.user === "guest") {
            refuse(
              "RABBITMQ_USER",
              `RABBITMQ_USER cannot be the default "guest" when ${where} and RABBITMQ_ENABLED=true.`,
            );
          }
          if (login.password === "guest") {
            refuse(
              "RABBITMQ_PASSWORD",
              `RABBITMQ_PASSWORD cannot be the default "guest" when ${where} and RABBITMQ_ENABLED=true.`,
            );
          }
        }
      }
    });

/**
 * Infer the TypeScript type from the validated schema
 */
type RawEnv = z.infer<ReturnType<typeof buildEnvSchema>>;
type Env = RawEnv &
  Required<Pick<RawEnv, "DB_USER" | "DB_PASSWORD" | "DB_NAME">>;

/**
 * A connection URL holds a password, so an error about one names the variable and
 * the reason and never quotes the value. envManager prints the message with
 * console.error and Node prints it again when the throw goes uncaught; neither
 * path is redacted (kit log-redaction-coverage, D-10).
 */
class InvalidUrlError extends Error {}

const invalidUrl = (variable: string, reason: string) =>
  new InvalidUrlError(`[ERROR] ${variable} is invalid: ${reason}`);

/** Anything else thrown while reading a URL's parts, such as a malformed escape. */
const asInvalidUrl = (variable: string, error: unknown) =>
  error instanceof InvalidUrlError
    ? error
    : invalidUrl(variable, "it could not be read");

const parseConnectionUrl = (variable: string, value: string): URL => {
  try {
    return new URL(value);
  } catch {
    // Node's own error carries the input on its `input` property.
    throw invalidUrl(variable, "it is not a valid URL");
  }
};

type RabbitMQLogin = { user: string; password: string; fromUrl: boolean };

/**
 * The user and password the broker connection will use. RabbitMQConnection.ts
 * connects with RABBITMQ_URL as given whenever it is set and ignores the two
 * fields, and the client logs in as guest/guest when the URL names neither a user
 * nor a password. The production refusal above and the normaliser below both read
 * this, so what is refused is what would have connected.
 */
const rabbitMQLogin = (data: {
  RABBITMQ_URL?: string;
  RABBITMQ_USER: string;
  RABBITMQ_PASSWORD: string;
}): RabbitMQLogin => {
  if (!data.RABBITMQ_URL) {
    return {
      user: data.RABBITMQ_USER,
      password: data.RABBITMQ_PASSWORD,
      fromUrl: false,
    };
  }
  const url = parseConnectionUrl("RABBITMQ_URL", data.RABBITMQ_URL);
  if (!url.username && !url.password) {
    return { user: "guest", password: "guest", fromUrl: true };
  }
  return {
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    fromUrl: true,
  };
};

const DATABASE_URL_KEYS = {
  development: "DEVELOPMENT_DATABASE_URL",
  test: "TEST_DATABASE_URL",
  staging: "STAGING_DATABASE_URL",
  production: "PRODUCTION_DATABASE_URL",
} as const satisfies Record<RawEnv["NODE_ENV"], keyof RawEnv>;

const normalizeDatabaseConfig = (parsedEnv: RawEnv): Env => {
  const envName = parsedEnv.NODE_ENV;
  const envSpecificKey = DATABASE_URL_KEYS[envName];

  const connectionUrl =
    parsedEnv[envSpecificKey] ?? parsedEnv.DATABASE_URL ?? null;

  if (connectionUrl) {
    const urlKey =
      parsedEnv[envSpecificKey] != null ? envSpecificKey : "DATABASE_URL";
    try {
      const url = parseConnectionUrl(urlKey, connectionUrl);
      if (url.username) {
        parsedEnv.DB_USER =
          parsedEnv.DB_USER ?? decodeURIComponent(url.username);
      }
      if (url.password) {
        parsedEnv.DB_PASSWORD =
          parsedEnv.DB_PASSWORD ?? decodeURIComponent(url.password);
      }
      if (url.hostname) {
        parsedEnv.DB_HOST = url.hostname;
      }
      // `new URL` has already refused a port that is not a number from 0 to 65535.
      if (url.port) {
        parsedEnv.DB_PORT = Number(url.port);
      }
      const dbName = url.pathname.replace(/^\//, "");
      if (dbName) {
        parsedEnv.DB_NAME = parsedEnv.DB_NAME ?? decodeURIComponent(dbName);
      }
      parsedEnv[envSpecificKey] = parsedEnv[envSpecificKey] ?? connectionUrl;
    } catch (error) {
      throw asInvalidUrl(urlKey, error);
    }
  }

  if (!parsedEnv.DB_USER || !parsedEnv.DB_PASSWORD || !parsedEnv.DB_NAME) {
    throw new Error(
      "[ERROR] Database configuration is incomplete. Provide DATABASE_URL or DB_USER/DB_PASSWORD/DB_NAME.",
    );
  }

  return parsedEnv as Env;
};

const normalizeRedisConfig = (parsedEnv: RawEnv): RawEnv => {
  if (!parsedEnv.REDIS_URL) {
    return parsedEnv;
  }

  try {
    const url = parseConnectionUrl("REDIS_URL", parsedEnv.REDIS_URL);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      throw invalidUrl("REDIS_URL", "protocol must be redis:// or rediss://");
    }

    if (url.hostname) {
      parsedEnv.REDIS_HOST = url.hostname;
    }

    if (url.port) {
      parsedEnv.REDIS_PORT = Number(url.port);
    }

    if (url.password) {
      parsedEnv.REDIS_PASSWORD =
        parsedEnv.REDIS_PASSWORD ?? decodeURIComponent(url.password);
    }

    return parsedEnv;
  } catch (error) {
    throw asInvalidUrl("REDIS_URL", error);
  }
};

const normalizeRabbitMQConfig = (parsedEnv: RawEnv): RawEnv => {
  if (!parsedEnv.RABBITMQ_URL) {
    return parsedEnv;
  }

  try {
    const url = parseConnectionUrl("RABBITMQ_URL", parsedEnv.RABBITMQ_URL);
    if (url.protocol !== "amqp:" && url.protocol !== "amqps:") {
      throw invalidUrl("RABBITMQ_URL", "protocol must be amqp:// or amqps://");
    }

    if (url.hostname) parsedEnv.RABBITMQ_HOST = url.hostname;
    if (url.port) parsedEnv.RABBITMQ_PORT = Number(url.port);
    const login = rabbitMQLogin(parsedEnv);
    parsedEnv.RABBITMQ_USER = login.user;
    parsedEnv.RABBITMQ_PASSWORD = login.password;
    const vhost = url.pathname.replace(/^\//, "");
    if (vhost) parsedEnv.RABBITMQ_VHOST = decodeURIComponent(vhost);

    return parsedEnv;
  } catch (error) {
    throw asInvalidUrl("RABBITMQ_URL", error);
  }
};

const buildEnv = (): Env => {
  // NODE_ENV first, on its own path, so a bad value is reported as NODE_ENV.
  const { NODE_ENV } = z
    .object({ NODE_ENV: nodeEnvSchema })
    .parse({ NODE_ENV: process.env.NODE_ENV }, { error: zod3Messages });
  const parsedEnv = buildEnvSchema(NODE_ENV).parse(process.env, {
    error: zod3Messages,
  });
  const withDatabaseConfig = normalizeDatabaseConfig(parsedEnv);
  const withRedisConfig = normalizeRedisConfig(withDatabaseConfig) as RawEnv;
  return normalizeRabbitMQConfig(withRedisConfig) as Env;
};

/**
 * NOTE: this module deliberately does NOT parse the environment at import time.
 *
 * It used to end with `const env: Env = buildEnv()`, evaluated during module load.
 * That meant a schema rejection — including the ADR-0036 production refusals above —
 * threw while `envManager.js` was still importing this module, before
 * `loadEnvOrExit()`'s try/catch existed. The failure surfaced as a raw ZodError
 * stack instead of the structured `[ENV_ERROR]` line that log monitoring watches for.
 *
 * `envManager.loadEnvOrExit()` is the single entry point that parses and caches the
 * environment, and nothing imported this module's `env` binding, so it was removed
 * rather than made lazy. Import `env` from `@/config/envManager.js`.
 */
export { Env, buildEnv };
