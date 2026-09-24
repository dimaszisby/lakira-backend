# Lakira Backend

REST API backend for Lakira, a personal metrics tracking platform. Built with Express.js, TypeScript, and PostgreSQL using Domain-Driven Design (DDD) with feature slices.

## Tech Stack

- **Runtime**: Node.js 20 (ESM)
- **Framework**: Express.js + TypeScript
- **ORM**: Sequelize (PostgreSQL)
- **Auth**: JWT (HS256 via `jsonwebtoken`) — short-lived access token plus a rotating refresh token in an httpOnly cookie
- **Validation**: Zod
- **Cache**: Redis (`redis`, node-redis v4)
- **Queue**: RabbitMQ (`amqplib`)
- **Docs**: OpenAPI 3 + Swagger UI

## Prerequisites

- Node.js 20 (`nvm use` will pick the right version from `.nvmrc`)
- Docker & Docker Compose (for PostgreSQL, Redis, and RabbitMQ)

## Quick Start

```bash
# 1. Clone and install dependencies
npm install

# 2. Copy environment template and fill in values
#    docker compose, the migrate scripts and bootstrap-fork.sh all read this one file
cp .env.example .env

# 3. Start infrastructure services
docker compose up -d

# 4. Run database migrations
npm run migrate:development

# 5. Start the development server (port 5000)
npm run dev
```

## Available Scripts

| Script                             | Description                              |
| ---------------------------------- | ---------------------------------------- |
| `npm run dev`                      | Start development server with hot-reload |
| `npm test`                         | Run unit + integration tests             |
| `npm run test:unit`                | Unit tests only                          |
| `npm run test:integration`         | Integration tests (requires PostgreSQL)  |
| `npm run test:e2e`                 | End-to-end tests                         |
| `npm run lint`                     | ESLint check                             |
| `npm run lint:fix`                 | ESLint autofix                           |
| `npm run typecheck`                | TypeScript type check                    |
| `npm run build`                    | Compile to `dist/`                       |
| `npm run migrate:development`      | Run pending migrations (development)     |
| `npm run migrate:development:undo` | Undo last migration                      |
| `npm run docs:openapi:generate`    | Regenerate OpenAPI spec                  |

## Project Structure

```
src/
├── server.ts                 # API entry point
├── worker.ts                 # RabbitMQ consumer entry point
├── config/                   # Env loading, DB config
├── features/
│   ├── shared/auth/          # Auth, organizations, memberships, invites, refresh tokens
│   ├── public/
│   │   ├── metric/           # Metric CRUD
│   │   ├── metric-log/       # Metric log entries
│   │   ├── metric-settings/  # Per-metric configuration
│   │   ├── metric-category/  # Metric categories
│   │   └── analytics/        # Visualization & aggregation queries
├── shared/
│   ├── middleware/           # Rate limiting, error handling, method guard
│   └── infrastructure/       # Queue adapters (RabbitMQ)
├── infrastructure/db/        # Model registry and its types (every feature's models)
├── lib/openapi/              # OpenAPI spec generation from the Zod schemas
├── migrations/               # Sequelize migrations
└── utils/                    # Logger, Redis client, helpers
```

Each feature slice follows DDD layering: `domain/` → `application/` → `infrastructure/`.

## Environment Configuration

Copy `.env.example` to `.env` and set all required values. The app validates every variable at boot via Zod and crashes early with a descriptive error if required vars are missing.

Key required variables:

| Variable                              | Description                                  |
| ------------------------------------- | -------------------------------------------- |
| `JWT_SECRET`                          | Secret for signing JWT tokens (required)     |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Database credentials (or use `DATABASE_URL`) |

See `.env.example` for the full list with descriptions.

## API Documentation

Swagger UI is served at `/api/v1/docs` (requires auth by default).
The raw OpenAPI JSON is available at `/api/v1/docs/openapi.json`.

Health check: `GET /api/v1/health`

## Forking

This repo is designed to be forked and rebranded. After cloning, run the bootstrap script to rename every branding reference in one shot:

```bash
./scripts/bootstrap-fork.sh --name my-app
```

The script:

- Replaces `lakira-backend` → `my-app` in `package.json`, `package-lock.json`, `docker-compose.test.yml`, and CI workflow files.
- Derives a short name (`my-app` → removes `-backend` / `-api` suffix) for queue topology and DB name prefixes.
- Rotates `JWT_SECRET` in `.env` via `openssl rand -hex 32`.
- Sets `APP_NAME=my-app` in `.env`.
- **Removes `docs/internal/`** — the upstream project's working material (doc kits, audit runs,
  incidents, todos). Your fork keeps the four Diátaxis quadrants, which document the template.
  Pass `--keep-internal` to retain it.
- Drops a `FORKED-FROM.md` at the repo root recording the upstream commit SHA.

Runtime branding (API title, email copy, log service name, queue names) is controlled by the `APP_NAME` environment variable — set it in your `.env` file. See `.env.example` for the full list.

Full walkthrough, including what the script _cannot_ reach: [`docs/tutorials/fork-and-rebrand.md`](docs/tutorials/fork-and-rebrand.md).

## License

ISC — see [LICENSE](LICENSE).
