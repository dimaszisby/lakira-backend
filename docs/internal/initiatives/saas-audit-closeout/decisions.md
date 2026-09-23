# SaaS audit closeout — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — C2 is closed by decision, not by a code change

- **Status:** Accepted (approved by the user at checklist approval, 2026-09-24)
- **Date:** 2026-09-24

**Context.** C2 reads _"`src/config/app-name.ts:4` defaults to `"lakira-backend"`; because C1's
`APP_NAME` write misses, a fresh fork brands logs/OpenAPI/queues/emails as 'lakira-backend'."_ The
stated cause is gone: `8adf7b8` fixed C1, and `bootstrap-fork.sh:183-191` now writes `APP_NAME` into
`.env`, creating that file from `.env.example` when it is absent. The 2026-09-17 note on the C2 row
leaves one residual: a fork that _skips_ the script inherits the template's name.

**Decision.** Close C2 as a decision. `bootstrap-fork.sh` is the documented fork path, and it
rebrands the runtime correctly. Leave the `app-name.ts` default as it is.

**Options considered.**

- _Refuse a missing `APP_NAME` when `NODE_ENV=production`,_ in the style of the ADR-0036 refusals.
  This was the recommendation going into this kit. It was **rejected on checking**, because it does
  not close the residual. `.env.example:10` ships `APP_NAME=lakira-backend`, and `loadEnv.ts` loads
  `.env` in every environment. A fork that skips the script but copies `.env.example`, which is the
  obvious manual step, has `APP_NAME` explicitly set to the template's name and passes the check.
  The only case the refusal catches is a fork with no `.env` and no platform variable, which is the
  narrowest version of the problem. It would also add a new production-required variable (an
  interface change needing its own ADR) and stretch ADR-0036, whose rule covers switches that
  _weaken a security control_. Branding is not one.
- _Refuse the literal `"lakira-backend"` in production._ Rejected: the template itself is
  deployed under that name, so its own production would refuse to boot.
- _Drop the default, so `APP_NAME` is required everywhere._ Rejected: `app-name.ts` bypasses
  `envManager` on purpose (`logger.ts` imports it at load time), so the failure would be an
  unstructured throw at import. It would also break every test and tool that loads the logger
  without a `.env`, and it still would not catch the copied-`.env.example` case above.

**Consequences.** The C2 row flips to Fixed, citing this entry rather than a SHA. With
it, all six of C1–C6 are closed. The residual stays documented in the C2 note, so a later audit
that disagrees can reopen it deliberately.

## D-02 — ADR-008 decides the condition for a clean GOLD verdict; § 8's wording does not

- **Status:** Accepted
- **Date:** 2026-09-24

**Context.** `FINAL-AUDIT-SUMMARY.md` gives two conditions for restating the verdict as GOLD. The
fix-status convention under § 4 says _"when all six are closed"_ (C1–C6). § 8 item 6 says _"when
the 2026-06-05 punch list closes"_, and that list also carries N4, N6–N11 and F4–F7.

**Decision.** C1–C6 decides it. ADR-008 in `saas-readiness/decisions.md` is the verdict authority
(`SAAS-BASE-CHECKLIST.md:7` names it) and says the verdict is restated _"only when C1–C6 are
closed."_ The 2026-06-05 re-audit's own revised order names only N1 + N2 + F1 as blocking clean
GOLD, and all three closed on 2026-08-23. § 8 is rewritten so it no longer contradicts ADR-008.

**Consequences.** The remaining N- and F-rows stay tracked as open findings, but they do not gate
the verdict. The next dated audit run can surface them again, or regrade them.
