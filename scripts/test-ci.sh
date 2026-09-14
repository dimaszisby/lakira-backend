#!/usr/bin/env bash

set -euo pipefail

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.test.yml"

cleanup() {
  echo "[PROCESS] Cleaning up docker test environment..."
  $COMPOSE down -v
}

trap cleanup EXIT

echo "[PROCESS] Resetting docker test environment..."
$COMPOSE down -v

echo "[PROCESS] Building app image..."
$COMPOSE build app

echo "[PROCESS] Starting test dependencies..."
$COMPOSE up -d db redis rabbitmq

echo "[PROCESS] Waiting for database to be ready..."
$COMPOSE run --rm db /bin/sh -c 'while ! pg_isready -h db -p 5432 -U lakira_user -d lakira_test_db; do sleep 1; done'

echo "[PROCESS] Running migrations and Jest suites..."
$COMPOSE run --rm app /bin/sh -c "
  npx sequelize-cli db:migrate --config src/config/config.cjs &&
  npm run test:unit &&
  npm run test:integration &&
  npm run test:integration:coverage
"
