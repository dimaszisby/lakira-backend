# Risk Scoring Model

## Purpose

Define a consistent method for rating findings severity, assigning SLA timelines, and determining closure criteria.

## Inputs

Each finding must capture:

- Likelihood: Low, Medium, High
- Impact: Low, Medium, High, Critical
- Business risk statement
- CVSS score (if available)

## Severity Decision Matrix

| Likelihood \ Impact | Low    | Medium | High     | Critical |
| ------------------- | ------ | ------ | -------- | -------- |
| Low                 | Low    | Low    | Medium   | High     |
| Medium              | Low    | Medium | High     | Critical |
| High                | Medium | High   | Critical | Critical |

## CVSS Alignment Guidance

- 9.0 - 10.0: default Critical
- 7.0 - 8.9: default High
- 4.0 - 6.9: default Medium
- 0.1 - 3.9: default Low

If matrix and CVSS disagree, use the higher severity unless documented and approved in `decisions.md`.

## SLA Policy

- Critical: mitigation plan within 24 hours
- High: mitigation plan within 7 days
- Medium: mitigation plan within 30 days
- Low: planned backlog within 90 days

## Status Model

- Open: finding confirmed; remediation not started
- In Progress: remediation underway
- Mitigating: compensating controls active
- Accepted: temporary exception approved with expiry
- Verified: fix validated with evidence
- Closed: archived in next audit cycle or superseded

## Closure Criteria

A finding can move to Verified/Closed only when:

- Reproduction no longer succeeds.
- Evidence references are attached (code diff, test artifact, or scan report).
- Control mapping and remediation link are updated.

## Gate Interaction

CI soft gate fails on unresolved Critical/High findings.
Resolved means either:

- Verified/Closed, or
- Accepted with valid exception approval and non-expired date per policy.
