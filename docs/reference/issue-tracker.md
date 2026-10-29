# Issue tracker

**Purpose:** what the GitHub labels and issue forms of this repository mean, and how a fork gets
them.
**Owner:** whoever changes `.github/labels.json` or `.github/ISSUE_TEMPLATE/`.

The tracker is defined in the repository
([ADR-0084](../explanation/decisions/adr-0084-open-work-moves-to-github-issues.md)). It is the
same setup as lakira-frontend's, adapted to this repository's register.

**Until the register's open rows move to issues** (ADR-0084, step 2), "what's next" is still read
from [the debt register](../internal/initiatives/backend-debt-register/register.md), as
`.claude/rules/workflow.md` says, and an issue filed through a form is not ranked by it.

## Labels

`.github/labels.json` is the whole set. An issue carries one `type:` label, and one each of
`tier:`, `sev:` and `state:` once it is triaged.

| Label                           | Means                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `type:task`, `type:bug`         | Work to do; something that does not work as it should                                                           |
| `type:decision`                 | A question the owner must answer first; the register's `O-NN` rows                                              |
| `tier:1` to `tier:5`            | The register's ranking tiers, defined in its [D-01](../internal/initiatives/backend-debt-register/decisions.md) |
| `sev:P1`, `sev:P2`, `sev:P3`    | The severity the source graded. Ungraded work has none                                                          |
| `state:ready`                   | Nothing blocks it                                                                                               |
| `state:owner`, `state:frontend` | Waiting on the owner's decision, or on lakira-frontend                                                          |
| `state:upstream`                | Waiting on a package's maintainers                                                                              |
| `state:unexplained`             | Seen, not reproduced or explained; a sighting with evidence is what moves it                                    |
| `state:deferred`                | Considered and set aside until something changes, such as a row kept on purpose                                 |

## Forms

New issues open from a form; blank issues are off (`.github/ISSUE_TEMPLATE/config.yml`).

| Form     | Labels it applies              | Asks for                                                 |
| -------- | ------------------------------ | -------------------------------------------------------- |
| Task     | `type:task`                    | Why, the source, acceptance criteria, a size             |
| Bug      | `type:bug`                     | What happened, what was expected, steps, the environment |
| Decision | `type:decision`, `state:owner` | The question, the options, what it blocks                |

A security problem is never an issue: the form chooser links to private vulnerability reporting,
as [`SECURITY.md`](../../SECURITY.md) says. Pull requests open with
`.github/pull_request_template.md`, which asks for the gates by name.

## Syncing the labels

```bash
npm run labels:sync                  # print the plan, write nothing
npm run labels:sync -- --apply       # create, update and delete
```

It needs the GitHub CLI signed in with the `repo` scope, and acts on `gh`'s current repository
unless `--repo owner/name` says otherwise. A label `labels.json` does not list is deleted, and
deleting a label removes it from every issue and pull request carrying it, so read the dry run
first. `__tests__/unit/github-tracker.test.ts` checks the file and the forms in the unit gate.

## In a fork

Forking copies `.github/` but not the labels. After `scripts/bootstrap-fork.sh`, which renames the
repository in the form chooser's security link and in `SECURITY.md`:

1. Change the owner in those two links from `dimaszisby` to yours.
2. Turn on private vulnerability reporting in the fork's settings (Security, then "Private
   vulnerability reporting").
3. Run `npm run labels:sync -- --apply` once.
