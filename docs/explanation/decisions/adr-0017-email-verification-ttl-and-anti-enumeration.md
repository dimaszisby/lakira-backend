# ADR-0017 — 24-hour TTL + anti-enumeration response shape

- **Status:** Accepted (2026-09-24 — implementation verified in code; see the status note)
- **Date:** 2026-05-02
- **Origin:** `ADR-001` in the Email verification kit — [`email-verification`](../../internal/initiatives/email-verification/decisions.md)

> **Status note (2026-09-24).** Moved from Proposed by the `docs-sweep` kit
> ([D-03](../../internal/initiatives/docs-sweep/decisions.md)): the decision below is in the code.
> Evidence: `VERIFICATION_TOKEN_TTL_SEC = 86400` (`RequestEmailVerification.ts`); one generic
> message for every `/verify-email` failure (`VerifyEmail.ts`); `/resend-verification` always
> answers 200 with the same body (`controller.ts`).

---

## Context

The password-reset kit uses a 15-minute TTL because users typically click the reset link immediately after triggering the flow. Email verification has a different user pattern: the email arrives during signup, but users may close the tab and finish later. A 15-minute TTL would force most users into the resend loop.

Anti-enumeration matters here because a public `/verify-email` endpoint could leak whether a token-hash exists if the response shape varies between "token unknown" / "token expired" / "token already used".

## Decision

1. **TTL: 24 hours.** Long enough for "verify after work", short enough to limit a stolen-link blast radius.
2. **Generic 400 for all `/verify-email` failure modes.** Identical body for token-not-found, token-expired, token-already-used. The body is `{ status: "error", message: "Verification link is invalid or has expired.", data: null, success: false }`.
3. **Always-200 on `/resend-verification`.** When the JWT subject is already verified, when the JWT subject is unverified (token issued + email sent), and when the JWT subject doesn't exist (impossible if the JWT is valid, but defensively returns 200). Body: `{ status: "success", message: "If your email is unverified, we sent a fresh verification link.", data: null, success: true }`.

## Options considered

- _15-minute TTL._ Rejected: forces too many resends for the typical signup pattern.
- _72-hour TTL._ Rejected: stolen-link blast radius too long; abandoned signups accumulate active tokens.
- _Distinct error messages for invalid vs. expired vs. used._ Rejected: enables verification-link enumeration. Aligns with the same anti-enumeration rule in the password-reset kit.

## Consequences

- Users who don't verify within 24 hours must hit `/resend-verification` (which requires they be logged in, which they can do because registration also issues a JWT). Future kit may relax this if forks complain.
- The integration test must explicitly verify all three failure modes return identical bodies + 400.

## Links

- `audit-2026-05-01.md` § [P1-1.2] in `docs/internal/audits/saas-readiness/`
- `docs/internal/initiatives/features/password-reset/decisions.md` (anti-enumeration precedent).

---
