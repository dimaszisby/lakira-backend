# Todo — a fork deployed without `APP_NAME` is branded as the template

- **Status:** Fixed. The owner chose the third option below on 2026-10-06, in the form "default to
  the package name" (Lean kit
  [`app-name-from-package`](../initiatives/app-name-from-package/README.md);
  [ADR-0060](../../explanation/decisions/adr-0060-the-app-takes-its-name-from-its-package.md);
  commits carry `refs: app-name-from-package`). The package is named `lakira-backend` upstream, so
  the template's own behaviour does not change, which answers the objection recorded under that
  option. Not yet confirmed by a dated run
- **Created:** 2026-10-06
- **Owner:** the repository owner
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-10-05-b.md` § 6, U2; kit
  [`saas-reaudit-2026-10-05-b`](../initiatives/saas-reaudit-2026-10-05-b/decisions.md) D-05

---

## What

`src/config/app-name.ts:4` reads `process.env.APP_NAME ?? "lakira-backend"`. `bootstrap-fork.sh`
writes `APP_NAME` to `.env` and nowhere else, and `.dockerignore` keeps `.env` out of the image. So
a fork that is deployed without `APP_NAME` set as a platform variable logs as
`service=lakira-backend`, sets a `lakira_refresh` cookie, sends email signed "Lakira", names its
queues `lakira.*` and titles its served spec "Lakira API". Nothing warns or refuses. Reproduced on
a fork's build: with no `.env` and no variable the module gives the template's names; with
`APP_NAME=acme-api` it gives the fork's.

## Why this is a decision and not just a fix

C2 was closed by the owner's decision on 2026-09-24
([`saas-audit-closeout` D-01](../initiatives/saas-audit-closeout/decisions.md)). That entry
considered this case by name, "a fork with no `.env` and no platform variable", and accepted it. It
rejected a production refusal because a fork that copies `.env.example` has `APP_NAME` set to the
template's name and would pass the check. `docs/tutorials/fork-and-rebrand.md` tells the forker to
set the variable in every deployed environment.

The dated run of 2026-10-05 (second) put C2 to an independent grader for the first time since. The
grader knew that history and graded C2 open. The run recorded the grade and did not overrule it.

## The options

- **Reaffirm the decision.** Add a dated line to `saas-audit-closeout` D-01 saying it covers a
  deployed fork with no platform variable. The next dated run cites it, and C2 is closed by
  decision again.
- **Make it loud.** Log a warning at startup when `APP_NAME` is unset and `NODE_ENV` is
  `production`, or refuse to start (ADR-0036 style). The objection of 2026-09-24 was about a copied
  `.env.example`; an image has no `.env`, so in a deployment the check would catch what it is meant
  to. A refusal adds a production-required variable, which is an interface change and needs an ADR.
- **Change the default** to something no one would ship by accident, for example the package name
  read at build time. That changes the upstream's own behaviour when the variable is unset.
