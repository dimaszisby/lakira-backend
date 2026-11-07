# Security Exceptions Policy

## Purpose

Allow temporary risk acceptance in controlled cases without losing traceability or creating indefinite exposure.

## When Exceptions Are Allowed

- No immediate fix is available without high release risk.
- Upstream dependency fix is not yet released.
- A compensating control reduces immediate exploitability.

Exceptions are not allowed for convenience-only deferrals.

## Required Exception Fields

- Finding ID(s)
- Severity
- Business justification
- Compensating controls
- Approver (owner)
- Approved date (UTC)
- Expiry date (UTC)
- Review checkpoint date (UTC)

## Approval Matrix

- Critical: Engineering lead + product owner + explicit incident note.
- High: Engineering lead approval required.
- Medium/Low: Backend owner approval required.

## Expiry Rules

- Mandatory expiry for every exception.
- Maximum default validity: 90 days.
- Renewal requires re-approval and updated rationale.

## CI Gate Interaction

A high-severity accepted finding passes the gate only if:

- Status is `Accepted`
- Exception metadata is complete
- Expiry date is in the future
- Severity is allowed by gate policy

Expired exceptions are treated as unresolved findings.

## Audit Logging Rules

- Log each exception in `decisions.md` of the relevant audit run.
- Link exception entries from `findings-log.md` and `remediation-plan.md`.
- Portfolio summaries must mention exception counts, not sensitive technical detail.
