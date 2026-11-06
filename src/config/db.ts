import { Sequelize } from "sequelize";
import { env } from "./envManager.js"; // Use validated env variables
import logger from "@/utils/logger.js";

const sqlLogger = (message: unknown) => {
  logger.debug(message);
};

/** The TLS options of a staging or production connection (D-01, D-04). */
export const sslOptions = (rejectUnauthorized: boolean, ca?: string) => ({
  require: true,
  rejectUnauthorized,
  ...(ca ? { ca } : {}),
});

/**
 * The pool each process opens (issue #239, ADR-0086): its size from
 * `DB_POOL_MAX` and `DB_POOL_MIN`, and Sequelize's own idle and acquire
 * timeouts, written out so the whole pool reads in one place.
 */
export const poolOptions = (max: number, min: number) => ({
  max,
  min,
  idle: 10_000,
  acquire: 60_000,
});

const dbConfig = {
  development: {
    dialect: "postgres",
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    logging: env.DB_LOGGING === "true" ? sqlLogger : false,
    dialectOptions: {
      ssl: false,
    },
  },
  test: {
    dialect: "postgres",
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    logging: false,
    dialectOptions: {
      ssl: false,
    },
  },
  staging: {
    dialect: "postgres",
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    logging: false,
    dialectOptions: {
      ssl: sslOptions(env.DB_SSL_REJECT_UNAUTHORIZED, env.DB_SSL_CA),
    },
  },
  production: {
    dialect: "postgres",
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    logging: env.DB_LOGGING === "true" ? sqlLogger : false,
    dialectOptions: {
      ssl: sslOptions(env.DB_SSL_REJECT_UNAUTHORIZED, env.DB_SSL_CA),
    },
  },
};

// Ensure valid environment
const envMode = (env.NODE_ENV || "development") as keyof typeof dbConfig;
const config = dbConfig[envMode];

// if (!config.url) {
//   throw new Error(`[ERROR] Database URL is missing for environment: ${envMode}`);
// }

/**
 * Staging may turn verification of the database certificate off; production
 * refuses it at the schema (database-tls-and-staging-refusals D-01). Says so at
 * every start of the server and the worker, naming the variable, never the URL.
 */
export const warnWhenTlsUnverified = (
  nodeEnv: string,
  rejectUnauthorized: boolean,
  warn: (message: string) => void = (message) => logger.warn(message),
): boolean => {
  if (nodeEnv !== "staging" || rejectUnauthorized) return false;
  warn(
    "[DB] DB_SSL_REJECT_UNAUTHORIZED=false: the database certificate is not verified, so the connection accepts any server.",
  );
  return true;
};

warnWhenTlsUnverified(envMode, env.DB_SSL_REJECT_UNAUTHORIZED);

// Initialize Sequelize
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    dialect: "postgres",
    host: config.host,
    port: config.port,
    logging: config.logging,
    dialectOptions: config.dialectOptions,
    pool: poolOptions(env.DB_POOL_MAX, env.DB_POOL_MIN),
    define: {
      freezeTableName: false,
      underscored: true,
      timestamps: true,
    },
  },
);

export default sequelize;
