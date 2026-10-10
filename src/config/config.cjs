const path = require("path");
const dotenv = require("dotenv");

const envFile = `.env.${process.env.NODE_ENV || "development"}`;
dotenv.config({ path: path.resolve(envFile) });

const NODE_ENV = process.env.NODE_ENV || "development";

const buildSslOptions = () => ({
  require: true,
  rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
});

const config = {
  development: {
    url: process.env.DEVELOPMENT_DATABASE_URL,
    dialect: "postgres",
    logging: console.log,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialectOptions: { ssl: false },
  },
  test: {
    url: process.env.TEST_DATABASE_URL,
    dialect: "postgres",
    logging: false,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialectOptions: { ssl: false },
  },
  staging: {
    url: process.env.STAGING_DATABASE_URL,
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl: buildSslOptions(),
    },
  },
  production: {
    url: process.env.PRODUCTION_DATABASE_URL,
    dialect: "postgres",
    // Never in production: statement text carries values. The schema refuses
    // DB_LOGGING=true there, but sequelize-cli reads this file without it.
    logging: false,
    dialectOptions: {
      ssl: buildSslOptions(),
    },
  },
};

if (!Object.prototype.hasOwnProperty.call(config, NODE_ENV)) {
  throw new Error(
    `[ERROR]: No configuration found for environment: ${NODE_ENV}`,
  );
}

if (NODE_ENV === "staging" || NODE_ENV === "production") {
  const urlVar = `${NODE_ENV.toUpperCase()}_DATABASE_URL`;
  if (!process.env[urlVar]) {
    throw new Error(
      `[ERROR]: ${urlVar} is required for NODE_ENV="${NODE_ENV}" but is not set.`,
    );
  }
}

module.exports = config;
