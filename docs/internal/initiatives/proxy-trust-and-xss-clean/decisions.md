# Decisions — proxy-trust-and-xss-clean

## D-01 — The HTTPS gate reads `req.secure` and nothing else

- **Status:** Accepted (#206, `00fb2d2`)
- **Date:** 2026-10-22

**Context.** In production the HTTPS gate in `mountHttpPipeline` passed a request when
`req.secure` was true **or** its `x-forwarded-proto` header read `https` (X12). Express already
derives `req.secure` from that header, but only when `trust proxy` says the peer that sent it is a
proxy, and `app.ts` sets `trust proxy` from `TRUST_PROXY` (ADR-0063). The raw-header test was a
second path around that setting: with `TRUST_PROXY=0`, a client could claim HTTPS for itself.
**Decision.** The gate tests `req.secure` alone. A forwarded protocol counts only from a hop that
`TRUST_PROXY` trusts, which is the same rule `req.ip`, and so every per-IP limiter, already follows.
**Options considered.** _Keep the header test, but only when `TRUST_PROXY` is above 0:_ it
re-implements Express's hop logic beside the real one, and a second copy is what drifted here.
_Read the left-most `x-forwarded-proto` value:_ that is the client's own value, the one a proxy
appends to rather than replaces.
**Consequences.** Behind Render (one hop, the default) nothing changes. A deployment that sets
`TRUST_PROXY=0` behind a TLS-terminating proxy now gets 403 on every non-probe route, which is the
setting saying what it means. The probes are mounted above the gate and stay reachable.

---

## D-02 — Remove `xss-clean`, with nothing in its place

- **Status:** Accepted (#206, `00fb2d2`)
- **Date:** 2026-10-22

Promoted to the architecture decision registry as
**[ADR-0082](../../../explanation/decisions/adr-0082-text-is-stored-as-sent-and-encoded-where-rendered.md)**.
That file is authoritative; this entry is a pointer.

---

## D-03 — The local app port binds to loopback unless `APP_BIND_ADDRESS` says otherwise

- **Status:** Accepted (#206, `00fb2d2`)
- **Date:** 2026-10-22

**Context.** `docker-compose.yml` published the app as `"8001:5000"`, on every interface, so that
another device on the network could reach the API (X12, second half). Every other service in the
file is bound to `127.0.0.1`. Docker writes its own iptables rules for a published port, so on
Linux a port on `0.0.0.0` is reachable past ufw or firewalld. The file is forked as a template, and
a fork inherits the default, not the reason for it.
**Decision.** `"${APP_BIND_ADDRESS:-127.0.0.1}:8001:5000"`. Loopback by default;
`APP_BIND_ADDRESS=0.0.0.0` in the shell or in `.env` opens it to the network for device testing.
**Options considered.** _Loopback only, with an override file for device testing:_ the opt-in costs
a new file instead of one variable. _Keep every interface and record it as deliberate:_ the owner
judged it a defect for a forkable codebase (2026-10-22).
**Consequences.** `APP_BIND_ADDRESS` is read by Compose only. The app never sees it, so it is not
one of the app's environment variables and is not in `zodEnv.ts` or `configuration.md`.
