# Evidence Standard

## Purpose

Define the minimum evidence quality for security audits so findings are reproducible, defensible, and review-ready.

## Evidence Quality Bar

Each finding must include:

1. Technical evidence

- File reference(s) with exact path and line anchor when possible.
- Command output and/or tool report artifact.

2. Impact evidence

- A concise impact statement tied to an asset and threat scenario.

3. Verification evidence

- Proof of fix or compensating control.

## Required Reference Format

- File/code reference: `path/to/file.ts:line`
- Command reference: inline command + output artifact path
- Artifact reference: `tmp/security/<artifact>.json` or audit report path

## Evidence Levels

- Level 1 (minimum): static code/config proof.
- Level 2: static proof + runtime/scan output.
- Level 3 (preferred for high/critical): reproducible scenario + before/after verification.

## Command Output Requirements

For each audit cycle, retain outputs for at least:

- `npm audit --production --json`
- Security delta script JSON report
- Gate evaluation JSON report
- Relevant contract/fuzz security result references

## Traceability Rules

- Every finding row must reference at least one control ID and one evidence item.
- Every remediation item must link back to one or more finding IDs.
- Exceptions must include approver, expiry, and rationale.

## Definition of Done (Evidence)

Evidence is complete when:

- Another engineer can reproduce the finding state and verify mitigation outcome.
- References are stable and located under repo-tracked paths or generated artifact paths.
- Sensitive secrets are redacted before publishing portfolio-facing artifacts.
