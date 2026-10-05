import { PACKAGE_NAME } from "./openapi-spec-path.js";

/**
 * The committed OpenAPI spec describes the package, so the generator's app name
 * is the package name, whatever the shell or an `.env` says. The spec's title
 * and its refresh cookie's name are built from `APP_NAME` in
 * `src/config/app-name.ts`, which reads it when first imported.
 *
 * Import this before anything from `src/`. It used to be the import order alone
 * that decided the name: the logger pulled in `app-name.ts` before any `.env`
 * was loaded, so a fork's spec kept the upstream's title and cookie name, and
 * its gate failed as soon as `APP_NAME` was exported (audit 2026-10-05, T2).
 *
 * `scripts/bootstrap-fork.sh` renames the package and rewrites the same strings
 * in the spec, so the two agree before a fork has installed anything.
 */
process.env.APP_NAME = PACKAGE_NAME;
