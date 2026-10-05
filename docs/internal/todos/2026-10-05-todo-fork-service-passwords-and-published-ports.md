# Todo — a fork keeps predictable service passwords, and Compose publishes on all interfaces

- **Status:** Open (P2)
- **Created:** 2026-10-05
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-10-03.md` § 6, S10; still open in
  `audit-2026-10-05.md` § 4.2. Split out of
  [`2026-10-03-todo-fork-openapi-gate-and-bootstrap-order.md`](2026-10-03-todo-fork-openapi-gate-and-bootstrap-order.md),
  whose other items are closed

---

## What

`scripts/bootstrap-fork.sh` rotates `JWT_SECRET` and nothing else. On a fork named `acme-api` the
database password is `acme_password`, Redis has none, and RabbitMQ is `guest`/`guest`.
`docker-compose.yml:21,49,71` publish 5432, 6379 and 5672 as `"5432:5432"` and so on, which binds
every interface, so on a shared network those services are reachable with credentials anyone can
guess.

## Suggested fix

Bind the published ports to `127.0.0.1` in `docker-compose.yml`. Have bootstrap generate the
database password as it does `JWT_SECRET`, writing it to `.env` and `.env.test` together so the
two still match. Say in the fork tutorial that an existing Postgres volume keeps the old role and
password.
