# Decisions — database-tls-and-staging-refusals

## D-01 — The database certificate is verified in production and, by default, in staging

Promoted to the architecture decision registry as an amendment of
**[ADR-0036](../../../explanation/decisions/adr-0036-refuse-production-unsafe-env-switches.md)**
(its note of 2026-10-21). That file is authoritative; this entry is a pointer.

## D-02 — Staging takes the production refusals, `mailpit` excepted

Promoted to the architecture decision registry as an amendment of
**[ADR-0036](../../../explanation/decisions/adr-0036-refuse-production-unsafe-env-switches.md)**
(its note of 2026-10-21). That file is authoritative; this entry is a pointer.

## D-03 — Staging's environment is the owner's to check before the deploy

- **Status:** Accepted (merged in #199, `5818042`)
- **Date:** 2026-10-21

**Context.** The repository cannot read staging's Render environment, so it cannot show whether a
switch D-02 now refuses is set there, or whether staging's database certificate verifies (D-01).

**Decision.** Not coded around. The PR body names what to check: the seven switches, and whether
`DB_SSL_REJECT_UNAUTHORIZED` must be set to `false` on staging.

**Options considered.** A grace period that warns instead of refusing on staging: a refusal that
waits is a refusal nobody acts on, and the failure at startup names the variable already.

**Consequences.** The first staging deploy after this change may need one change in the dashboard.

## D-04 — `DB_SSL_CA`: the CA a verified connection trusts

Promoted to the architecture decision registry as an amendment of
**[ADR-0036](../../../explanation/decisions/adr-0036-refuse-production-unsafe-env-switches.md)**
(its note of 2026-10-21). That file is authoritative; this entry is a pointer.
