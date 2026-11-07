/**
 * Auth's cross-feature surface: its HTTP middleware.
 *
 * Other features import this, never `index.ts` or `feature.ts` — those are the
 * composition root, for src/server.ts only, and ESLint rejects a sibling importing
 * them. `authMiddleware` builds its dependencies on first request, not on import.
 * See ADR-0045.
 */
export { authMiddleware } from "./infrastructure/http/authMiddleware.js";
export {
  assertHasOrgRole,
  requireOrgRole,
} from "./infrastructure/http/assertHasOrgRole.js";
export { requireVerifiedEmail } from "./infrastructure/http/requireVerifiedEmail.js";
