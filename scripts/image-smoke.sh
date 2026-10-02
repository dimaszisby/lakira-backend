#!/usr/bin/env bash
# image-smoke.sh — build the production image and prove it runs (ADR-0055).
#
# Usage:
#   npm run docker:smoke
#   SMOKE_IMAGE=some:tag npm run docker:smoke   # test an existing image, skip the build
#
# What it checks:
#   1. The production Dockerfile builds.
#   2. The image runs as a non-root user.
#   3. It carries runtime dependencies only, and bcrypt's native binary loads.
#   4. It defaults to NODE_ENV=production (ADR-0050): a production-unsafe switch
#      is refused at startup when NODE_ENV is not set.
#   5. In production mode it serves /health and /ready against Postgres (over
#      TLS, as production connects) and Redis, and redirects plain HTTP.
#   6. It stops cleanly on SIGTERM.
#
# It needs only Docker and curl. Postgres and Redis are throwaway containers on
# a private network; nothing is published except the app, on a random localhost
# port. Everything it creates is removed on exit, pass or fail. It does not use
# the Compose stack or any .env file.

set -euo pipefail

cd "$(dirname "$0")/.."

PREFIX="image-smoke-$$"
NETWORK="${PREFIX}-net"
PG="${PREFIX}-pg"
REDIS="${PREFIX}-redis"
APP="${PREFIX}-app"

IMAGE="${SMOKE_IMAGE:-}"
RELEASE="${APP_RELEASE:-smoke-$$}"
WAIT_SECONDS="${SMOKE_WAIT_SECONDS:-60}"

# Keep in step with docker-compose.yml and backend-ci.yml.
POSTGRES_IMAGE="postgres:18"
REDIS_IMAGE="redis:7-alpine"

DB_USER="smoke"
DB_PASSWORD="smoke-only-not-a-secret"
DB_NAME="smoke"

# Enough to pass startup validation in production mode. Nothing here is a real
# credential, and the smoke sends no email.
APP_ENV=(
  -e "JWT_SECRET=smoke-only-not-a-secret"
  -e "DB_HOST=${PG}"
  -e "DB_PORT=5432"
  -e "DB_USER=${DB_USER}"
  -e "DB_PASSWORD=${DB_PASSWORD}"
  -e "DB_NAME=${DB_NAME}"
  -e "DB_SSL_REJECT_UNAUTHORIZED=false"
  -e "REDIS_URL=redis://${REDIS}:6379"
  -e "EMAIL_PROVIDER=resend"
  -e "RESEND_API_KEY=smoke-only-not-a-secret"
  -e "APP_RELEASE=${RELEASE}"
  -e "PORT=5000"
)

cleanup() {
  docker rm -fv "$APP" "$PG" "$REDIS" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

pass() {
  echo "[image-smoke] PASS  $1"
}

fail() {
  echo "[image-smoke] FAIL  $1" >&2
  if [[ -n "${2:-}" ]]; then
    echo "$2" >&2
  fi
  if docker inspect "$APP" >/dev/null 2>&1; then
    echo "[image-smoke] ---- app container log (last 60 lines) ----" >&2
    docker logs --tail 60 "$APP" >&2 2>&1 || true
  fi
  exit 1
}

# Any command that fails outside a check (a pull, a docker run) still ends in a
# FAIL line and the app log, instead of a silent exit. Deliberately without
# `set -E`: inherited by command substitutions, the trap would also fire for
# the failures the checks below expect and handle.
trap 'fail "unexpected error at line ${LINENO}"' ERR

in_image() {
  docker run --rm --entrypoint sh "$IMAGE" -c "$1"
}

# ---------------------------------------------------------------------------
# 1. Build
# ---------------------------------------------------------------------------
if [[ -z "$IMAGE" ]]; then
  # Left in place afterwards on purpose: the next build reuses its layers.
  IMAGE="image-smoke:local"
  echo "[image-smoke] building ${IMAGE} from ./Dockerfile"
  docker build -t "$IMAGE" . || fail "1. image builds"
  pass "1. image builds"
else
  docker image inspect "$IMAGE" >/dev/null 2>&1 ||
    fail "1. image exists" "SMOKE_IMAGE=${IMAGE} is not a local image"
  pass "1. image exists (SMOKE_IMAGE=${IMAGE}, build skipped)"
fi

# ---------------------------------------------------------------------------
# 2. Non-root
# ---------------------------------------------------------------------------
uid="$(in_image 'id -u')"
[[ "$uid" != "0" ]] || fail "2. runs as a non-root user" "id -u is 0"
pass "2. runs as a non-root user (uid ${uid})"

# ---------------------------------------------------------------------------
# 3. Runtime dependencies only, native modules present
# ---------------------------------------------------------------------------
in_image 'test -f dist/server.js' ||
  fail "3. runtime dependencies only" "dist/server.js is missing"
in_image 'test ! -e node_modules/typescript' ||
  fail "3. runtime dependencies only" "devDependencies are installed (typescript found)"
in_image "node -e \"require('bcrypt').hashSync('smoke', 4)\"" ||
  fail "3. runtime dependencies only" "bcrypt's native binary does not load"
pass "3. runtime dependencies only, bcrypt loads"

# ---------------------------------------------------------------------------
# 4. Defaults to production (ADR-0050)
# ---------------------------------------------------------------------------
# No NODE_ENV is passed. If the image defaulted to development, this switch
# would be accepted and the process would go on to fail on the database instead.
if refusal="$(docker run --rm "${APP_ENV[@]}" -e DISABLE_RATE_LIMITING=true "$IMAGE" 2>&1)"; then
  fail "4. defaults to NODE_ENV=production" "started with DISABLE_RATE_LIMITING=true"
else
  refusal_status=$?
fi
grep -q "DISABLE_RATE_LIMITING cannot be true when NODE_ENV=production" <<<"$refusal" ||
  fail "4. defaults to NODE_ENV=production" \
    "exited ${refusal_status}, but not with the ADR-0036 refusal:
$(tail -n 15 <<<"$refusal")"
pass "4. defaults to NODE_ENV=production (unsafe switch refused)"

# ---------------------------------------------------------------------------
# 5. Serves in production mode
# ---------------------------------------------------------------------------
docker network create "$NETWORK" >/dev/null

# The official image ships a self-signed certificate readable by the postgres
# user; production mode connects over TLS (src/config/db.ts).
docker run -d --name "$PG" --network "$NETWORK" \
  -e "POSTGRES_USER=${DB_USER}" \
  -e "POSTGRES_PASSWORD=${DB_PASSWORD}" \
  -e "POSTGRES_DB=${DB_NAME}" \
  "$POSTGRES_IMAGE" \
  -c ssl=on \
  -c ssl_cert_file=/etc/ssl/certs/ssl-cert-snakeoil.pem \
  -c ssl_key_file=/etc/ssl/private/ssl-cert-snakeoil.key >/dev/null
docker run -d --name "$REDIS" --network "$NETWORK" "$REDIS_IMAGE" >/dev/null

# Over TCP on purpose: the init-time server listens on the socket only, so this
# cannot pass before the real server is up.
deadline=$((SECONDS + WAIT_SECONDS))
until docker exec "$PG" pg_isready -q -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME"; do
  [[ "$(docker inspect -f '{{.State.Running}}' "$PG")" == "true" ]] ||
    fail "5. serves in production mode" "Postgres exited:
$(docker logs --tail 20 "$PG" 2>&1)"
  ((SECONDS < deadline)) || fail "5. serves in production mode" \
    "Postgres was not ready within ${WAIT_SECONDS}s:
$(docker logs --tail 20 "$PG" 2>&1)"
  sleep 1
done

docker run -d --name "$APP" --network "$NETWORK" -p 127.0.0.1::5000 \
  "${APP_ENV[@]}" "$IMAGE" >/dev/null
port="$(docker port "$APP" 5000/tcp | head -n 1 | sed 's/.*://')"
base="http://127.0.0.1:${port}/api/v1"

# Production mode redirects plain HTTP; a TLS-terminating proxy sets this header.
https=(-H "X-Forwarded-Proto: https")

deadline=$((SECONDS + WAIT_SECONDS))
until health="$(curl -fsS --max-time 5 "${https[@]}" "${base}/health" 2>/dev/null)"; do
  [[ "$(docker inspect -f '{{.State.Running}}' "$APP")" == "true" ]] ||
    fail "5. serves in production mode" "the container exited during startup"
  ((SECONDS < deadline)) ||
    fail "5. serves in production mode" "/health did not answer within ${WAIT_SECONDS}s"
  sleep 1
done

grep -q '"environment":"production"' <<<"$health" ||
  fail "5. serves in production mode" "/health does not report production: ${health}"
grep -qF "\"release\":\"${RELEASE}\"" <<<"$health" ||
  fail "5. serves in production mode" "/health does not report release ${RELEASE}: ${health}"

# /health answers as soon as the server listens; Redis may still be connecting,
# so /ready is retried rather than asked once.
ready=""
until ready="$(curl -sS --max-time 10 "${https[@]}" "${base}/ready" 2>/dev/null)" &&
  grep -q '"db":"ok"' <<<"$ready" && grep -q '"redis":"ok"' <<<"$ready"; do
  ((SECONDS < deadline)) ||
    fail "5. serves in production mode" "/ready is not ok after ${WAIT_SECONDS}s: ${ready}"
  sleep 1
done

plain="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "${base}/health")"
[[ "$plain" == "301" ]] ||
  fail "5. serves in production mode" "plain HTTP answered ${plain}, expected the 301 redirect"
pass "5. serves in production mode (/health, /ready, HTTPS redirect; release ${RELEASE})"

# ---------------------------------------------------------------------------
# 6. Stops cleanly
# ---------------------------------------------------------------------------
# A process that ignores SIGTERM is killed when the grace period ends and
# reports 137.
docker stop -t 20 "$APP" >/dev/null
exit_code="$(docker inspect -f '{{.State.ExitCode}}' "$APP")"
[[ "$exit_code" == "0" ]] ||
  fail "6. stops cleanly on SIGTERM" "exit code ${exit_code}"
pass "6. stops cleanly on SIGTERM (exit 0)"

echo "[image-smoke] all checks passed for ${IMAGE}"
