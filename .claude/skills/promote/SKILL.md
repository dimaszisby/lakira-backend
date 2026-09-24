---
name: promote
description: Promote dev branch to staging by creating a PR. Use when the user says "promote", "push to staging", "deploy to staging", or wants to move dev changes to the staging environment.
disable-model-invocation: true
---

# Promote Dev to Staging

Create a promotion PR from `dev` → `staging` following the project's deployment workflow.

## Prerequisites Check

1. **Verify current branch** is `dev` or a feature branch merged into `dev`:

   ```bash
   git branch --show-current
   ```

2. **Ensure CI has passed** on the dev branch:

   ```bash
   gh run list --branch dev --limit 3
   ```

   If the latest run failed or is in progress, warn the user and stop.

3. **Check for existing promotion PR**:
   ```bash
   gh pr list --base staging --head dev --state open
   ```
   If one exists, report the PR URL instead of creating a duplicate.

## Create Promotion PR

If no existing PR and CI passes:

```bash
gh pr create \
  --base staging \
  --head dev \
  --title "chore(ci): promote dev to staging" \
  --body "$(cat <<'EOF'
Automated promotion PR.

## Changes
<!-- List key changes being promoted -->

## Verification
- [ ] CI passed on dev branch
- [ ] No blocking security findings
- [ ] Contract tests passed

Merge this PR to promote the latest `dev` changes into `staging`.
EOF
)"
```

## After Creation

Report the PR URL and remind:

- The promotion workflow (`.github/workflows/promote-dev-to-staging.yml`) normally creates this PR automatically after CI passes on dev
- Manual promotion is for when you need to promote before the automation triggers
- After merging, staging deployment triggers automatically via the CI pipeline
- Post-deploy, the smoke suite runs against live staging (`smoke_staging` job); contract tests run pre-deploy in `contract_local`
