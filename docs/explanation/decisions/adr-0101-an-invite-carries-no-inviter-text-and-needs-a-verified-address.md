# ADR-0101 — An invite carries no text of the inviter's, and needs a verified address

- **Status:** Accepted
- **Date:** 2026-11-27
- **Related:**
  - issue #311 (finding Y11 of the dated run of 2026-11-14; #299);
  - amends [ADR-0018](./adr-0018-verification-middleware-not-applied-to-existing-routes.md) for one
    route, and with it the reading of it in
    [ADR-0043](./adr-0043-session-issuance-at-every-authenticated-entry-point.md);
  - keeps [ADR-0070](./adr-0070-the-invite-email-is-a-queued-job.md) (the invite email is a queued
    job).
- **Origin:** the owner chose, on 2026-11-27:
  - in the plan for #311: all three fixes, and a username that is a handle;
  - after its review: an email that names no organization, and an unchanged username accepted as
    it is.

---

## Context

The organization's name is the registering user's username (`RegisterUser.ts`), and the username
had only a minimum length. `POST /organizations/:id/invites` emails any address the caller names.
The invite email wrote that name raw into its subject and text part. No route needed a verified
address (ADR-0018). Every new account owns its organization, so a fresh account could send 50
emails of its own wording per 15 minutes from the deployment's sending domain.

## Decision

1. **The invite email names no organization**, in its subject or its body. It says
   "You've been invited to join an organization", with the link and its expiry. The invitee sees
   which organization in the app, after following the link. The template takes no name, so
   nothing the inviter wrote reaches the address they chose. This holds for organizations named
   before this change too, without a migration.
2. **Inviting needs a verified address.** `requireVerifiedEmail` runs on
   `POST /organizations/:id/invites`, after `authMiddleware` and the per-user limiter, before the
   body is read, and answers 403 "Email address is not verified".
   - It goes after the limiter, so a refused attempt still counts.
   - It is the one route the base gates itself, because it is the one that emails an address the
     caller names. Every other route keeps ADR-0018: forks wire the middleware where they need it.
3. **A username is a handle:** 3 to 50 characters, letters, digits, `.`, `_` and `-`, with at
   least one letter or digit (`USERNAME_RULE`, `src/shared/constants/username-rule.ts`).
   - Registration checks it through `zUsername`, and the spec's request schemas use the same
     rule.
   - A username change checks it in `UpdateProfile`, and only when the name changes. A username
     from before the rule, sent back unchanged with another field, is accepted as it is.
   - With a maximum of 50, a username also always fits the organization's `name` column (100).

## Options considered

- **Keep naming the organization in the body, escaped.** Rejected after review: a valid handle can
  still be a domain (`pay-overdue-invoice.example.com`), which mail clients turn into a link, and
  organizations named before the rule keep free text.
- **Drop `.` from the handle**, so it cannot be a domain. Rejected: it breaks handles like
  `jane.doe` and does nothing for existing names.
- **Cap the subject's length.** Rejected: a short lure still fits.
- **A free-text username with no control characters.** Rejected by the owner: a short phishing
  line still fits.
- **No verification gate.** Rejected: an unverified account could still send 50 emails per 15
  minutes to any address.
- **Refuse a legacy username on every profile save.** Rejected: such a user could not save any
  profile change until they renamed.

## Consequences

- An unverified owner or admin is answered 403 on inviting until they verify. The frontend handles
  that answer, and the registration and profile forms follow the username rule.
- The invite email no longer tells the invitee which organization invites them.
- Existing usernames that break the rule are kept. They can be sent back unchanged, and changed
  only to a handle.
- Invite jobs queued before the deploy, or waiting in a retry tier, still send: the worker's job
  does not know the inviter. The window is bounded by the retry schedule, and the email they send
  already names no organization.

## Links

- `src/shared/constants/username-rule.ts`; `src/constants/zod/zod-rules.ts` (`zUsername`)
- `src/features/shared/auth/infrastructure/email/templates/organization-invite.ts`
- `src/features/shared/auth/infrastructure/http/organization.router.ts`;
  `src/features/shared/auth/application/use-cases/UpdateProfile.ts`
- `__tests__/unit/constants/username-rule.test.ts`,
  `__tests__/unit/features/auth/infrastructure/email/organization-invite.test.ts`,
  `__tests__/unit/features/auth/application/UpdateProfile.test.ts`
- `__tests__/integration/api/organization-membership.test.ts` › "refuses an unverified inviter with
  403, then invites once verified"; `__tests__/integration/api/auth.test.ts`
- `__tests__/unit/architecture.test.ts` › "the invite route requires a verified address, after
  authMiddleware"
