/**
 * Auth's HTTP middleware, as a public entrypoint separate from `index.ts`.
 *
 * `index.ts` eagerly constructs the auth routers, which pulls the feature's
 * composition root and, transitively, the model registry. A sibling feature's router
 * importing middleware from there is evaluated mid-cycle and receives `undefined` —
 * observed as "Route.post() requires a callback function but got [object Undefined]".
 *
 * This module imports nothing but the middleware itself, so it has no such cycle.
 * See docs/internal/initiatives/feature-boundaries/decisions.md D-05.
 */
export { authMiddleware } from "./infrastructure/http/authMiddleware.js";
export {
  assertHasOrgRole,
  requireOrgRole,
} from "./infrastructure/http/assertHasOrgRole.js";
export { requireVerifiedEmail } from "./infrastructure/http/requireVerifiedEmail.js";
