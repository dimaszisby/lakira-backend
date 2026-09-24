# Contract Pipeline Overview (Postman/Newman)

**Status:** Superseded — Newman was retired in #75 (`a4635f3`); see this folder's `README.md`
**Last updated:** 2026-04-13

## Pipeline Position

`checks -> unit -> integration -> contract_local -> deploy_staging -> contract_staging`

## Contract Jobs

- `contract_local`
  - runs local Newman suite
  - publishes local contract artifacts
  - should remain a required merge gate

- `contract_staging`
  - runs against staging URL with `STAGING_*` inputs
  - depends on successful staging deploy + healthy environment
  - publishes staging contract artifacts

## Operational Notes

- Keep workflow and report paths aligned with runner scripts.
- If job names or paths change, update docs + branch protection rules in same PR.
- For staging setup and secret rotation, follow `STAGING_RUNBOOK.md`.
