# SaaS Readiness — Decisions Log

ADR-style entries for standards adopted in response to the SaaS-base readiness audit. New decisions append at the bottom; do not rewrite history. Each entry references the originating audit run and concrete file paths.

---

## ADR-001 — Adopt formal SaaS-base readiness criteria (Accepted 2026-05-01)

**Context:** The Lakira backend is intended to be reusable as a forkable SaaS base. Until now, "ready to fork" has been a feeling, not a measurable threshold. The first audit (`audit-2026-05-01.md`) needed a binary gate to grade against.

**Decision:** A repo is "fork-ready" only when **all four** of:

1. Zero P0 gaps remaining in the latest audit.
2. All six empirical commands green: `typecheck`, `lint`, `format:check`, `test`, `security:delta:check`, `docs:openapi:generate`.
3. Categories 1 (Auth), 4 (Security), 6 (DX), 7 (Testing), 8 (CI/CD), 11 (Forkability) at ≥80% items.
4. `LICENSE` and `.env.example` present at repo root.

**Options considered:**

- _Single threshold (e.g., ≥90% across all categories)._ Rejected: hides gaps in critical categories behind strong scores in others. A perfect testing stack does not compensate for a missing license.
- _Pure P0-zero gate._ Rejected: a P0-free audit could still ship without a `LICENSE` if no auditor flagged it as P0; an explicit file check is more robust.
- _Stakeholder sign-off._ N/A for a single-developer portfolio repo.

**Consequences:**

- Re-audits produce a deterministic verdict.
- Audit progress is diffable across dated files in this folder.
- New categories require an explicit decision to amend this gate (append a follow-on ADR).

**Links:**

- `docs/internal/audits/saas-readiness/audit-2026-05-01.md`
- `docs/internal/audits/saas-readiness/README.md`
- `docs/internal/todos/2026-05-01-promt-saas-readiness-audit.md`

---

## ADR-002 — Audit cadence + storage convention (Accepted 2026-05-01)

**Context:** Treating the audit as a one-shot artifact would let drift creep back in. Treating it as a living spreadsheet would lose historical signal.

**Decision:** Each audit run is written to a new dated file `audit-YYYY-MM-DD.md` in this folder. Prior audits are immutable — they are the trail. The repo-root `SAAS-BASE-CHECKLIST.md` always points to the **most recent** audit and shows that audit's scorecard + verdict + top 5 P0/P1 gaps.

Cadence: re-audit on demand (whenever a P0 closes, or before publishing the repo as a base), and at minimum quarterly while the project is unreleased.

**Options considered:**

- _Single rolling audit file overwritten each run._ Rejected: loses ability to diff progress.
- _Per-category files._ Rejected: scorecard cohesion suffers; each audit run is a single observation.

**Consequences:**

- The folder grows by one file per re-audit. Acceptable.
- The root checklist is the only mutable surface; everything else is append-only.

**Links:**

- `docs/internal/audits/saas-readiness/README.md`
- `SAAS-BASE-CHECKLIST.md` (repo root)

---

## ADR-003 — Where the canonical DDD layout lives

Promoted to the architecture decision registry as **[ADR-0011](../../../explanation/decisions/adr-0011-where-the-canonical-ddd-layout-lives.md)**. That file is authoritative; this entry is a pointer.

## ADR-004 — Multi-tenancy direction for the SaaS base

Promoted to the architecture decision registry as **[ADR-0012](../../../explanation/decisions/adr-0012-multi-tenancy-direction-for-the-saas-base.md)**. That file is authoritative; this entry is a pointer.

## ADR-005 — Phase order and kit scaffolding for SaaS-readiness remediation (Accepted 2026-05-02)

**Context:** The 2026-05-01 audit produced 7 P0 + 17 P1 + 11 P2 gaps. Doing the work iteratively without a roadmap risks (a) starting the cheapest item last, (b) two phases stomping on each other (e.g., refresh tokens vs. multi-tenancy on the same auth surface), and (c) rediscovering the same context repeatedly when picking work back up. A scaffolded roadmap captures the order and the kit-folder layout once.

**Decision:** Adopt eight phases, each scoped to a doc kit (or an ADR entry for the cheapest sweep). The mapping is held in `iteration-plan.md` in this folder and is the single source of truth for "which kit closes which audit gap." The user-confirmed conventions:

1. Refresh-token remediation extends the existing `docs/internal/initiatives/jwt/` kit (Micro → Standard).
2. Architecture drift cleanup appends a new tracker under the existing `docs/internal/initiatives/feature-vertical-slice-migration/` kit.
3. P0 and P1 phases are scaffolded up front; P2-only items wait until they're up next.
4. Each kit's `README.md` ends with a fixed-shape References block (audit gaps closed, owning ADRs, effort, status, predecessor) so audit re-runs can mechanically diff progress.

**Options considered:**

- _All-in-one mega-plan inside `saas-readiness/`._ Rejected: violates `.claude/rules/documentation.md` placement (architecture topics live at `architecture/<topic>/`); buries reusable topics like multi-tenancy behind an audit-shaped folder.
- _Per-phase numeric prefix on folder names (`1-jwt/`, `2-observability/`)._ Rejected: existing convention under `architecture/` uses kebab-case topic names with no numeric prefix. The phase order belongs in `iteration-plan.md`, not folder names.
- _Scaffold every gap up front (including P2)._ Rejected: scaffolds for P2 items would sit empty for months and rot.

**Consequences:**

- Six new kit folders + two extensions of existing kits + one tracker file (`iteration-plan.md`) + two new ADRs (this one + ADR-006).
- Future audit re-runs read `iteration-plan.md` to mark closed gaps mechanically.
- Adding new P0/P1 work later requires a follow-on ADR amending the phase list.

**Links:**

- `docs/internal/audits/saas-readiness/iteration-plan.md`
- All eight kit folders referenced in `iteration-plan.md`.

---

## ADR-006 — Phase 0 cheap-P0 sweep (Accepted 2026-05-02)

**Context:** Four P0 audit items are individually small (S effort each) but each blocks a different fork-ready exit criterion. Bundling them into a single sweep is faster than four separate kits with their own README/plan/checklist overhead.

**Decision:** Phase 0 of the iteration plan ships as a single PR with no dedicated kit. It closes:

- **P0-11.1** — add `LICENSE` (ISC text matching `package.json:75`, or upgrade both to MIT).
- **P0-6.2** — add root `README.md` (project pitch, prerequisites, 5-min local boot, env-vars link, feature inventory).
- **P0-6.1** — add root `.env.example` generated from `src/config/zodEnv.ts` (write `scripts/generate-env-example.ts` and a CI sync-check).
- **P0-4.1** — add `app.set("trust proxy", env.TRUST_PROXY ?? 1)` in `src/server.ts`; add `TRUST_PROXY` to `zodEnv.ts`; add HTTPS-redirect middleware gated by `NODE_ENV === "production"`.

The PR title is `chore: cheap-P0 sweep (LICENSE, README, .env.example, trust-proxy)`. After merge, append a row to this ADR with the commit SHA and update `iteration-plan.md` Phase 0 status to Pass Done.

**Options considered:**

- _Four separate PRs._ Rejected: creates four review cycles for ~1 day of total work; the items are independent in code but share a "fork-readiness scaffolding" theme.
- _Skip the sweep and roll the items into Phase 6 (forkability)._ Rejected: trust-proxy is a security item, not forkability; bundling delays a real bug fix.

**Consequences:**

- Closes 4 of 7 P0s in one PR.
- Flips fork-ready exit criterion #4 (`LICENSE` + `.env.example` present) immediately after merge.
- Three P0s remain after Phase 0: refresh tokens (Phase 1), request-ID propagation (Phase 2), multi-tenancy (Phase 4).

**Links:**

- `audit-2026-05-01.md` § [P0-6.1], [P0-6.2], [P0-11.1], [P0-4.1]
- `iteration-plan.md` § Phase 0
- After merge, this entry will be amended with: `Commit: <sha>`, `PR: <link>`.

**Completed:** P0-4.1 implemented (TRUST_PROXY env var + HTTPS redirect). P0-11.1 (LICENSE), P0-6.2 (README.md), P0-6.1 (.env.example) were fulfilled by earlier phases. PR: (to be filled in by user after merge).

---

## ADR-007 — CORS_ORIGIN accepts a comma-separated allowlist

Promoted to the architecture decision registry as **[ADR-0034](../../../explanation/decisions/adr-0034-cors-origin-allowlist.md)**. That file is authoritative; this entry is a pointer.

## ADR-008 — Accept "GOLD WITH CAVEATS" as the gone-gold verdict (Accepted 2026-05-24)

**Context:** An independent, deliberately-skeptical "gone-gold" review (`audit-2026-05-24-independent.md`) re-ran all six empirical gates (green), pressure-tested the security- and multi-tenancy-critical Pass-graded claims by reading code rather than trusting the 2026-05-20 self-audit, ran an architectural-drift sweep, and performed a live forkability dry-run. It confirmed the strict ADR-001 fork-ready gate now **passes** (zero P0; Cat 1/4/6/7/8/11 ≥80% — Cat 4 at 87.5% after P1-4.2 + P2-4.5 both closed; `LICENSE` + `.env.example` present), with no exploitable P0 remaining. It also found six industry-standard quality gaps (C1–C6), each scoped to ≤1 day, that an outside reviewer would close before recommending the repo as a base. A decision is needed: declare the repo publishable now, or hold until every caveat closes.

**Decision:** Accept the verdict **GOLD WITH CAVEATS** — the repo is publishable as a forkable SaaS base **today**, with C1–C6 tracked as visible ≤1-day follow-ups in `FINAL-AUDIT-SUMMARY.md`. The repo is re-stated as a clean **GOLD** (and a new dated `audit-YYYY-MM-DD.md` produced per ADR-002) only when C1–C6 are closed. The two caveats a forker / API consumer hits first — **C1** (the bootstrap-fork flow does not work as printed: secret rotation no-ops on a fresh clone and `npm test` fails without an undocumented `.env.test`) and **C3** (the error envelope is inconsistent, violates `api-design.md`, and is undocumented in the OpenAPI contract) — lead the punch list.

**Options considered:**

- _Hold until clean GOLD (close C1–C6 first)._ Rejected: there is no P0 blocker, the ADR-001 gate already passes, and the caveats are quality/DX/contract gaps rather than security holes. Blocking publication on ≤1-day polish items delays a usable base for no risk reduction.
- _Declare clean GOLD now, fold the caveats silently into the backlog._ Rejected: C1 and C3 are real and would visibly trip a forker; suppressing them would repeat the friendly-self-audit failure mode this independent review exists to correct. The caveats must be tracked in the open.
- _Re-open the iteration plan with a "Phase 9: gone-gold hardening."_ Deferred: the six caveats are small and cross-cutting; a tracked punch list in `FINAL-AUDIT-SUMMARY.md` § 4 is lighter-weight than a full kit. Promote to a phase only if the list grows.

**Consequences:**

- The repo may be published/forked now; the C1–C6 punch list governs the path to a clean GOLD verdict.
- `SAAS-BASE-CHECKLIST.md` (repo root) is updated to point at `audit-2026-05-24-independent.md` and reflect the GOLD WITH CAVEATS verdict + re-graded scorecard.
- Audit cadence (ADR-002 unchanged): produce a new dated audit when C1–C6 close, and re-state the verdict.
- The independent scorecard is intentionally stricter than the 2026-05-20 self-audit (47 pass / 14 partial / 4 fail vs 52 / 9 / 4) because the review downgraded items the self-audit over-credited (error envelope, architecture-test rigor, runtime branding leak, Sentry PII scrubbing, log-redaction coverage). This is expected: the independent grade is the conservative one of record.

**Links:**

- `audit-2026-05-24-independent.md` (evidence of record)
- `FINAL-AUDIT-SUMMARY.md` § 4 (the C1–C6 punch list with fix-status checkboxes)
- `decisions.md` § ADR-001 (the fork-ready gate this verdict clears), § ADR-002 (audit cadence + checklist convention), § ADR-007 (the CORS closure that completed criterion #3)
- `SAAS-BASE-CHECKLIST.md` (repo root, updated alongside this ADR)

---

## ADR-009 — Tenant scoping is required on every cache key

Promoted to the architecture decision registry as **[ADR-0035](../../../explanation/decisions/adr-0035-tenant-scoped-cache-keys.md)**. That file is authoritative; this entry is a pointer.

## ADR-010 — Production-unsafe env switches must be refused at schema layer

Promoted to the architecture decision registry as **[ADR-0036](../../../explanation/decisions/adr-0036-refuse-production-unsafe-env-switches.md)**. That file is authoritative; this entry is a pointer.

## ADR-011 — Resolve the canonical-DDD-layout disagreement

Promoted to the architecture decision registry as **[ADR-0037](../../../explanation/decisions/adr-0037-resolve-canonical-ddd-layout-disagreement.md)**. That file is authoritative; this entry is a pointer.
