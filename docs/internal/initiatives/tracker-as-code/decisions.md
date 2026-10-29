# Decisions — tracker-as-code

## D-01 — Open work moves to GitHub Issues, with the tracker kept as code

- **Status:** Accepted (#230, `f1ddd7c`)
- **Date:** 2026-10-28

Promoted to the architecture decision registry as **[ADR-0084](../../../explanation/decisions/adr-0084-open-work-moves-to-github-issues.md)**.
That file is authoritative; this entry is a pointer.

---

## D-02 — The labels follow the backend register's tiers and states

- **Status:** Accepted (#230, `f1ddd7c`)
- **Date:** 2026-10-28

**Context.** The frontend's `labels.json` encodes its register: tier 2 is "owed to the backend", a
row can wait on the backend, and Dependabot applies two labels there. The backend register's
tiers are its own D-01, its rows wait on the frontend, and two of its states have no frontend
label: `unexplained` (B-11, B-54, B-55) and the deliberate "kept on purpose" / "deliberately not
built" (B-26, B-41). The backend has no Dependabot.
**Decision.** The same `type:` and `sev:` labels. `tier:1` to `tier:5` carry the backend's D-01
wording. `state:frontend` replaces `state:backend`; `state:unexplained` is added; `state:deferred`
takes the two deliberate states. No `dependencies` or `github_actions` label.
**Options considered.** _Copy the frontend's file unchanged:_ its tier 2 and `state:backend` would
describe the other repository. _Keep Dependabot's two labels:_ nothing here applies them, and the
sync would keep two labels nobody uses.
**Consequences.** A row's register state maps to one label each, so step 2 can label every issue
from the row alone. If Dependabot is turned on later, its two labels go into `labels.json` first,
or the sync deletes them.

---

## D-03 — The pull request template keeps the backend's gates and security checklist

- **Status:** Accepted (#230, `f1ddd7c`)
- **Date:** 2026-10-28

**Context.** The backend's template is a checklist of commands; the frontend's asks for What,
Changes and a table of gates, and names the issue it closes. The backend's security checklist
(the security framework, the audit artifacts, the release SOP) has no frontend counterpart.
**Decision.** One template: What (with `Closes #N`, the kit and the ADRs), Changes, Verification as
a table of the gates `.claude/rules/workflow.md` names, the security checklist, and the reviewers'
note on the security artifact, all kept from today's.
**Options considered.** _Replace it with the frontend's:_ loses the security checklist. _Keep the
backend's:_ no place for `Closes #N`, which step 3 makes every PR carry.
**Consequences.** A PR body written from the template reports gates by name, as the rules already
ask.

---

## D-04 — `SECURITY.md`, and private vulnerability reporting turned on

- **Status:** Accepted (#230, `f1ddd7c`)
- **Date:** 2026-10-28

**Context.** The issue forms send a security problem to GitHub's private vulnerability reporting
and to `SECURITY.md`. On this public repository reporting was off
(`gh api repos/dimaszisby/lakira-backend/private-vulnerability-reporting` → `false`) and there was
no `SECURITY.md`.
**Decision.** Owner's choice, 2026-10-27: add `SECURITY.md`, modelled on the frontend's, and turn
reporting on after merge with
`gh api -X PUT repos/dimaszisby/lakira-backend/private-vulnerability-reporting`. Bootstrap renames
the repository in it and in the forms' link, as it does in `package.json`.
**Options considered.** _`SECURITY.md` pointing at the owner's profile, reporting left off:_ no
private channel on GitHub. _Neither:_ the forms would name a route that does not exist.
**Consequences.** A fork's `SECURITY.md` and link name the fork's repository but the template's
owner; the fork tutorial says to change it, and to turn reporting on in the fork.

---

## D-05 — What step 1 left out is finished before step 2

- **Status:** Proposed
- **Date:** 2026-10-29
- **Size:** Micro — single commit. Commits carry `refs: tracker-as-code`. Branch
  `docs/tracker-as-code-leftovers`.

**Context.** Read against lakira-frontend's step 1 (#154), #230 left two things out:
`CONTRIBUTING.md` still said "Open an issue first" with no word of the forms, and the Notion
record that offered the setup was never filed in the register, as every Notion record is, so steps
2 to 4 were tracked only in Notion. The owner asked for step 1 to be complete before step 2.
**Decision.** `CONTRIBUTING.md` points at `docs/reference/issue-tracker.md` and `SECURITY.md`.
Register row B-101 holds steps 2 to 4, so step 2 carries what is left of it into an issue.
ADR-0084 is Accepted with a status note, as the frontend's ADR-0042 was after its step 1.
**Options considered.** _Fold these into step 2:_ the owner chose to finish step 1 first.
**Consequences.** The frontend's own kit index and `workflows.md` line have no counterpart here:
there is no kit index, and the fork tutorial and `issue-tracker.md` already say a fork syncs its
labels.
