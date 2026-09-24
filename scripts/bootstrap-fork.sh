#!/usr/bin/env bash
# bootstrap-fork.sh — rename this repo for a new project.
#
# Usage:
#   ./scripts/bootstrap-fork.sh --name my-app
#   ./scripts/bootstrap-fork.sh --name my-app --keep-internal
#
# What it does:
#   1. Replaces "lakira-backend" with <new-name> in package.json,
#      package-lock.json, .env.example, and CI workflows.
#   2. Replaces "lakira" with the derived short name (strip -backend suffix)
#      in queue-topology references, DB names, and CI DB refs.
#   3. Rotates JWT_SECRET in .env (creating it from .env.example if needed).
#   4. Sets APP_NAME=<new-name> in .env, and creates .env.test from its template.
#   5. Removes docs/internal/ (upstream working material); --keep-internal opts out.
#   6. Drops FORKED-FROM.md with the upstream commit SHA.
#
# The script is idempotent: running it twice with the same name is a no-op.

set -euo pipefail

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
NEW_NAME=""
KEEP_INTERNAL=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      NEW_NAME="$2"
      shift 2
      ;;
    --keep-internal)
      KEEP_INTERNAL=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 --name <new-app-name> [--keep-internal]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$NEW_NAME" ]]; then
  echo "Error: --name is required." >&2
  echo "Usage: $0 --name <new-app-name> [--keep-internal]" >&2
  exit 1
fi

# Reject anything that isn't a safe slug. Prevents sed-delimiter injection
# (e.g. names containing '/' or '|') and downstream shell-quoting hazards.
if ! [[ "$NEW_NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "Error: --name must match ^[a-z][a-z0-9-]*$ (lowercase letters, digits, hyphens; must start with a letter)." >&2
  echo "Got: '$NEW_NAME'" >&2
  exit 1
fi

# Derive short name (strip trailing -backend, -api, etc.)
SHORT_NAME="${NEW_NAME%%-backend}"
SHORT_NAME="${SHORT_NAME%%-api}"

# Derive Title-Cased display name from short name (matches src/config/app-name.ts toTitleCase).
# e.g. "my-app" → "My App", "lakira" → "Lakira"
DISPLAY_NAME=""
IFS='-' read -ra _PARTS <<< "$SHORT_NAME"
for _p in "${_PARTS[@]}"; do
  [[ -z "$_p" ]] && continue
  _head="$(printf '%s' "${_p:0:1}" | tr '[:lower:]' '[:upper:]')"
  DISPLAY_NAME+="${_head}${_p:1} "
done
DISPLAY_NAME="${DISPLAY_NAME% }"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---------------------------------------------------------------------------
# Detect sed flavour (BSD vs GNU) and build an argument array.
# Using an array (not eval) so patterns containing spaces work correctly.
# ---------------------------------------------------------------------------
if sed --version 2>/dev/null | grep -q GNU; then
  SED_INPLACE=(sed -i)
else
  # macOS / BSD sed requires an empty extension argument
  SED_INPLACE=(sed -i '')
fi

do_sed() {
  local pattern="$1"
  local file="$2"
  if [[ -f "$file" ]]; then
    "${SED_INPLACE[@]}" "$pattern" "$file"
  fi
}

# ---------------------------------------------------------------------------
# Guard: skip if already renamed
# ---------------------------------------------------------------------------
CURRENT_NAME=$(node -e "process.stdout.write(require('./package.json').name)" 2>/dev/null || echo "")
if [[ "$CURRENT_NAME" == "$NEW_NAME" ]]; then
  echo "Already renamed to '$NEW_NAME'. Nothing to do."
  exit 0
fi

echo "Renaming '$CURRENT_NAME' → '$NEW_NAME' (short: lakira → $SHORT_NAME)"

# ---------------------------------------------------------------------------
# 1. Replace "lakira-backend" → NEW_NAME in key files
# ---------------------------------------------------------------------------
FILES_FULL=(
  "$REPO_ROOT/package.json"
  "$REPO_ROOT/package-lock.json"
  "$REPO_ROOT/.env.example"
  "$REPO_ROOT/.github/workflows/backend-ci.yml"
  "$REPO_ROOT/.github/workflows/backend-prd-drift-warning.yml"
  "$REPO_ROOT/.github/workflows/promote-dev-to-staging.yml"
)

for f in "${FILES_FULL[@]}"; do
  do_sed "s/lakira-backend/$NEW_NAME/g" "$f"
done

# ---------------------------------------------------------------------------
# 2. Replace "lakira" → SHORT_NAME in DB names, CI refs, queue topology refs,
#    and Title-cased "Lakira" → DISPLAY_NAME in human-readable workflow strings.
#    (Only in config/CI files — runtime src/ uses app-name.ts)
# ---------------------------------------------------------------------------
FILES_SHORT=(
  "$REPO_ROOT/.github/workflows/backend-ci.yml"
  "$REPO_ROOT/.github/workflows/backend-prd-drift-warning.yml"
  "$REPO_ROOT/.github/workflows/promote-dev-to-staging.yml"
  "$REPO_ROOT/.env.example"
)

for f in "${FILES_SHORT[@]}"; do
  # DB/queue/identifier slots (case-insensitive prefix match)
  do_sed "s/[Ll]akira_/${SHORT_NAME}_/g" "$f"
  do_sed "s/[Ll]akira\./${SHORT_NAME}./g" "$f"
  # Human-readable Title Case in workflow names, badge text, etc.
  do_sed "s/Lakira Backend/${DISPLAY_NAME} Backend/g" "$f"
  do_sed "s/Lakira/${DISPLAY_NAME}/g" "$f"
done

# ---------------------------------------------------------------------------
# 3. Rotate JWT_SECRET in .env
#
# Creates .env from .env.example when absent. Previously this targeted
# .env.development and was guarded on that file existing, so on a fresh clone
# both this step and step 4 silently did nothing and the fork kept the
# template's JWT secret (SAAS-BASE-CHECKLIST C1).
# ---------------------------------------------------------------------------
ENV_FILE="$REPO_ROOT/.env"
if [[ ! -f "$ENV_FILE" && -f "$REPO_ROOT/.env.example" ]]; then
  cp "$REPO_ROOT/.env.example" "$ENV_FILE"
  echo "Created .env from .env.example"
fi

if [[ -f "$ENV_FILE" ]]; then
  NEW_SECRET=$(openssl rand -hex 32)
  do_sed "s|^JWT_SECRET=.*|JWT_SECRET=$NEW_SECRET|" "$ENV_FILE"
  echo "JWT_SECRET rotated in .env"
else
  echo "WARNING: no .env and no .env.example — JWT_SECRET not rotated" >&2
fi

# ---------------------------------------------------------------------------
# 3b. Create .env.test from its template
#
# The closing instructions below tell the user to run `npm test`, which cannot
# work without this file — it is gitignored and absent on a fresh clone, and
# nothing else in the repo creates it (SAAS-BASE-CHECKLIST C1).
# ---------------------------------------------------------------------------
ENV_TEST_FILE="$REPO_ROOT/.env.test"
if [[ ! -f "$ENV_TEST_FILE" && -f "$REPO_ROOT/.env.test.example" ]]; then
  cp "$REPO_ROOT/.env.test.example" "$ENV_TEST_FILE"
  echo "Created .env.test from .env.test.example"
fi

# ---------------------------------------------------------------------------
# 4. Set APP_NAME in .env
# ---------------------------------------------------------------------------
if [[ -f "$ENV_FILE" ]]; then
  if grep -q "^APP_NAME=" "$ENV_FILE"; then
    do_sed "s|^APP_NAME=.*|APP_NAME=$NEW_NAME|" "$ENV_FILE"
  else
    echo "APP_NAME=$NEW_NAME" >> "$ENV_FILE"
  fi
  echo "APP_NAME set to '$NEW_NAME' in .env"
fi

# ---------------------------------------------------------------------------
# 5. Prune internal documentation
#
# docs/internal/ is the upstream project's working material — doc kits, audit
# runs, incidents, dev-log, todos, archive. A fork should inherit documentation
# about the template (the four Diataxis quadrants), not someone else's history.
# ---------------------------------------------------------------------------
INTERNAL_DOCS="$REPO_ROOT/docs/internal"
if [[ "$KEEP_INTERNAL" == "true" ]]; then
  echo "Keeping docs/internal (--keep-internal)."
elif [[ -d "$INTERNAL_DOCS" ]]; then
  INTERNAL_FILE_COUNT=$(find "$INTERNAL_DOCS" -type f | wc -l | tr -d " ")
  rm -rf "$INTERNAL_DOCS"
  echo "Removed docs/internal ($INTERNAL_FILE_COUNT files of upstream working material)."
  echo "  Note: that tree held the upstream SaaS-readiness audit. Re-run your own"
  echo "  assessment before production - see docs/how-to/security/."
else
  echo "docs/internal already absent - nothing to prune."
fi

# ---------------------------------------------------------------------------
# 6. Drop FORKED-FROM.md
# ---------------------------------------------------------------------------
UPSTREAM_SHA=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
cat > "$REPO_ROOT/FORKED-FROM.md" <<EOF
# Forked From

This project was forked from the Lakira Backend template.

- **Upstream commit**: $UPSTREAM_SHA
- **Fork date**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- **New name**: $NEW_NAME
EOF

echo "FORKED-FROM.md created."
echo ""
echo "Done! Next steps:"
echo "  1. Run: npm install"
echo "  2. Start services: docker compose up -d"
echo "  3. Run: npm run migrate:development"
echo "  4. Run: npm test"
echo ""
echo "This script already created .env and .env.test from their templates and"
echo "rotated JWT_SECRET. Review .env before pointing it at anything real."
