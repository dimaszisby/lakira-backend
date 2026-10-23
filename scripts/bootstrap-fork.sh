#!/usr/bin/env bash
# bootstrap-fork.sh — rename this repo for a new project.
#
# Usage:
#   ./scripts/bootstrap-fork.sh --name my-app
#   ./scripts/bootstrap-fork.sh --name my-app --keep-internal
#
# What it does:
#   1. Replaces "lakira-backend" with <new-name> in package.json,
#      package-lock.json, .env.example, and CI workflows, and renames the
#      generated OpenAPI spec to <new-name>-openapi.json to match: the spec's
#      path comes from the package name (scripts/openapi-spec-path.js).
#   2. Replaces "lakira" with the short name (the name less a trailing
#      "-backend", as src/config/app-name.ts derives it) in DB names and CI DB
#      refs. The running app's queue names come from src/config/app-name.ts, not
#      from here. Database
#      identifiers use the short name with hyphens turned into underscores
#      ("my-app" gives my_app_user), so they stay valid in plain SQL. The test
#      template and the test-database init SQL are rewritten too, so .env.test
#      logs in as the user Compose creates from .env. In an .env or .env.test
#      that already exists, only the database identifiers are renamed.
#   3. Rotates JWT_SECRET in .env (creating it from .env.example if needed), and
#      replaces the template's database password and the broker's guest login
#      with generated ones. .env.test takes its database and broker logins from
#      .env, whatever users those are. Redis keeps no password; Compose publishes
#      every service on 127.0.0.1 only.
#   4. Sets APP_NAME=<new-name> in .env, and creates .env.test from its template.
#   5. Removes docs/internal/ (upstream working material); --keep-internal opts out.
#   6. Drops FORKED-FROM.md with the upstream commit SHA.
#
# The script is idempotent: running it twice changes nothing, except that a
# second run creates .env or .env.test if they are missing (a fresh checkout of a
# fork has neither), and finishes a rename an earlier run stopped part-way. A fork
# is renamed once: a later run with a different --name keeps the name the tree
# already has. No generated secret is ever a command-line argument, where any
# user could read it from the process list: each reaches awk through its
# environment.

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
# No trailing or doubled hyphen: src/config/app-name.ts title-cases the name by
# splitting on "-", and an empty part there becomes a stray space in the API
# title, which the rewrite of the spec in step 1b would not reproduce.
if ! [[ "$NEW_NAME" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
  echo "Error: --name must match ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ (lowercase letters, digits, single hyphens between them; must start with a letter)." >&2
  echo "Got: '$NEW_NAME'" >&2
  exit 1
fi

# Refuse a name that holds the template's own. The renames below replace
# "lakira" wherever it stands, so they match their own output: "lakira-x" titled
# the workflow "Lakira X X Backend CI", and a second run renamed lakira_x_user
# to lakira_x_x_user (audit 2026-10-12, T3). A name whose short name is exactly
# "lakira" is safe, since every rename then writes what it found.
NAME_STEM="${NEW_NAME%-backend}"
if [[ "$NEW_NAME" == *lakira* && "$NAME_STEM" != "lakira" ]]; then
  echo "Error: --name must not contain 'lakira', the template's own name: the renames would match their own output." >&2
  echo "Got: '$NEW_NAME'" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Checked before anything is renamed: steps 3 and 3c generate the JWT secret and
# the database password with it, and failing there would leave the tree renamed
# with the template's secrets still in .env.
if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: openssl is required to generate the JWT secret and the database password." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Rewriting a file
#
# rewrite_file <file> <command...> runs the command on the file into a temp file,
# then writes the result back through the file, so it keeps its own mode. No
# in-place sed: its flag differs between BSD and GNU, and CI runs only GNU, so the
# macOS branch went untested (fork-bootstrap-leftovers D-03). The temp file is
# outside the tree: a run that is killed must not leave a copy of the secrets
# beside .env under a name nothing ignores. REWRITE_CHANGED says whether the file
# changed; the function itself always succeeds, as `set -e` requires.
# ---------------------------------------------------------------------------
REWRITE_CHANGED=false
rewrite_file() {
  local file="$1"
  shift
  REWRITE_CHANGED=false
  [[ -f "$file" ]] || return 0
  local tmp
  tmp=$(mktemp "${TMPDIR:-/tmp}/bootstrap-fork.XXXXXX")
  if ! "$@" "$file" > "$tmp"; then
    rm -f "$tmp"
    echo "Error: could not rewrite $(basename "$file")." >&2
    exit 1
  fi
  if ! cmp -s "$tmp" "$file"; then
    cat "$tmp" > "$file"
    REWRITE_CHANGED=true
  fi
  rm -f "$tmp"
}

do_sed() {
  rewrite_file "$2" sed "$1"
}

# set_env_values <file> <KEY...> sets each KEY's line to the value in the
# variable SET_<KEY>, which the caller puts in awk's environment:
#   SET_JWT_SECRET="$secret" set_env_values "$ENV_FILE" JWT_SECRET
# A key with no line is not added. The values never appear in a pattern or an
# argument.
set_env_values() {
  local file="$1"
  shift
  rewrite_file "$file" awk -v keys="$*" '
    BEGIN { n = split(keys, list, " "); for (i = 1; i <= n; i++) wanted[list[i]] = 1 }
    {
      eq = index($0, "=")
      if (eq > 1) {
        key = substr($0, 1, eq - 1)
        if (key in wanted) { print key "=" ENVIRON["SET_" key]; next }
      }
      print
    }
  '
}

# ---------------------------------------------------------------------------
# What state is the tree in?
#
#   template         package.json is still "lakira-backend": rename it.
#   already renamed  it carries a fork's name: skip the renames, the prune and
#                    FORKED-FROM.md, but not the env files. A fresh checkout of a
#                    fork has no .env or .env.test, and exiting here left that
#                    fork's own Fork Smoke run without them (audit 2026-10-03, S4).
#
# A fork is renamed once. Asked for a different name later, the script keeps the
# name the tree has: the template's strings are gone, so a second rename would
# change APP_NAME and the JWT secret and nothing else.
# ---------------------------------------------------------------------------
TEMPLATE_NAME="lakira-backend"
CURRENT_NAME=$(node -e "process.stdout.write(require(process.argv[1]).name ?? '')" "$REPO_ROOT/package.json" 2>/dev/null || echo "")
if [[ -z "$CURRENT_NAME" ]]; then
  echo "Error: could not read the package name from $REPO_ROOT/package.json (is node installed?)." >&2
  exit 1
fi

# Asking the template to take its own name is also "nothing to rename"; without
# this it would fall through to the prune and delete docs/internal upstream.
ALREADY_RENAMED=false
if [[ "$CURRENT_NAME" != "$TEMPLATE_NAME" || "$NEW_NAME" == "$TEMPLATE_NAME" ]]; then
  ALREADY_RENAMED=true
  if [[ "$CURRENT_NAME" != "$NEW_NAME" ]]; then
    echo "This tree is already renamed to '$CURRENT_NAME'; keeping that name, not '$NEW_NAME'." >&2
    NEW_NAME="$CURRENT_NAME"
  fi
  echo "Already renamed to '$NEW_NAME'. Finishing any rename left part-way, then checking .env and .env.test."
fi

# Steps 1 to 2 run in both states. "Already renamed" is read from package.json,
# which step 1 renames first, so a run stopped after it left the spec, the
# workflows and the test chain on the template's names, and every later run
# skipped them (fork-bootstrap-leftovers D-04). Each step matches only the
# template's strings, and a name holding "lakira" is refused above, so on a
# finished tree they change nothing. The template asked to take its own name
# renames nothing.
RENAME_TREE=true
if [[ "$NEW_NAME" == "$TEMPLATE_NAME" ]]; then
  RENAME_TREE=false
fi

# The short name is the name less a trailing "-backend", as src/config/app-name.ts
# derives APP_SHORT_NAME. The script also stripped "-api", so "acme-api" got acme_*
# databases beside an app that calls itself acme-api (B-51, D-07).
SHORT_NAME="${NEW_NAME%-backend}"

# Database identifiers (users, database names) must be valid unquoted in SQL:
# docker/db/init/01-create-dbs.sql runs a plain CREATE DATABASE, where a hyphen
# is a syntax error.
DB_SLUG="${SHORT_NAME//-/_}"

# Title-cased display name, as src/config/app-name.ts derives APP_DISPLAY_NAME.
# e.g. "my-app" → "My App", "acme-api" → "Acme Api". The generated OpenAPI spec
# carries it, so step 1b has to write exactly that (audit 2026-10-05, T2).
DISPLAY_NAME=""
IFS='-' read -ra _PARTS <<< "$SHORT_NAME"
for _p in "${_PARTS[@]}"; do
  [[ -z "$_p" ]] && continue
  _head="$(printf '%s' "${_p:0:1}" | tr '[:lower:]' '[:upper:]')"
  DISPLAY_NAME+="${_head}${_p:1} "
done
DISPLAY_NAME="${DISPLAY_NAME% }"

OLD_SPEC="docs/reference/api/$TEMPLATE_NAME-openapi.json"
NEW_SPEC="docs/reference/api/$NEW_NAME-openapi.json"

# Refuse before anything is rewritten: failing at the spec rename would leave
# package.json and the workflows renamed and the spec not.
if [[ "$RENAME_TREE" == "true" && -f "$REPO_ROOT/$OLD_SPEC" && -e "$REPO_ROOT/$NEW_SPEC" ]]; then
  echo "Error: $NEW_SPEC already exists; remove it or pick another name." >&2
  exit 1
fi
if [[ "$ALREADY_RENAMED" == "false" ]]; then
  echo "Renaming '$CURRENT_NAME' → '$NEW_NAME' (short: lakira → $SHORT_NAME)"
fi

if [[ "$RENAME_TREE" == "true" ]]; then

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
# 1b. Rename the generated OpenAPI spec to match
#
# Step 1 has just renamed the path in package.json's docs:openapi:check and in
# the drift workflow. The scripts that write the spec take its name from the
# package name, so the file follows (audit 2026-10-03, S2). `git mv` when the
# file is tracked, so the drift check has a staged file to compare against.
# ---------------------------------------------------------------------------
if [[ -f "$REPO_ROOT/$OLD_SPEC" ]]; then
  if git -C "$REPO_ROOT" ls-files --error-unmatch "$OLD_SPEC" >/dev/null 2>&1; then
    git -C "$REPO_ROOT" mv "$OLD_SPEC" "$NEW_SPEC"
  else
    mv "$REPO_ROOT/$OLD_SPEC" "$REPO_ROOT/$NEW_SPEC"
  fi
  echo "Renamed the OpenAPI spec to $NEW_SPEC"

  # The spec's title, description and refresh-cookie name are derived from the
  # app's name, and the generator now takes that name from package.json. This
  # script runs before `npm install` and cannot run the generator, so it rewrites
  # those strings itself; the fork's docs:openapi:check then finds no difference.
  # Staged when the file is tracked, because that check compares with the index.
  do_sed "s/\"title\": \"Lakira API\"/\"title\": \"$DISPLAY_NAME API\"/" "$REPO_ROOT/$NEW_SPEC"
  do_sed "s/for the Lakira application\./for the $DISPLAY_NAME application./" "$REPO_ROOT/$NEW_SPEC"
  do_sed "s/lakira_refresh/${SHORT_NAME}_refresh/g" "$REPO_ROOT/$NEW_SPEC"
  if git -C "$REPO_ROOT" ls-files --error-unmatch "$NEW_SPEC" >/dev/null 2>&1; then
    git -C "$REPO_ROOT" add "$NEW_SPEC"
  fi
  echo "Rewrote the spec's title and cookie name for '$NEW_NAME'"
fi

# The docs and the Claude hook that name the file. docs/internal is pruned in
# step 5, or kept as upstream history, so it is left alone either way. -I skips
# binary files, which sed could choke on.
SPEC_MENTIONS=()
while IFS= read -r f; do
  SPEC_MENTIONS+=("$f")
done < <(
  grep -rlIF --exclude-dir=internal "$TEMPLATE_NAME-openapi.json" \
    "$REPO_ROOT/docs" "$REPO_ROOT/.claude" "$REPO_ROOT/CLAUDE.md" 2>/dev/null || true
)
if (( ${#SPEC_MENTIONS[@]} > 0 )); then
  for f in "${SPEC_MENTIONS[@]}"; do
    do_sed "s/$TEMPLATE_NAME-openapi\.json/$NEW_NAME-openapi.json/g" "$f"
  done
fi

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
  # The test chain: .env.test is copied from this template in step 3b, and the
  # init SQL creates the database it names. Leaving these out made a fork's
  # `npm test` log in as the upstream user (SAAS-BASE-CHECKLIST C1, 2026-09-29).
  "$REPO_ROOT/.env.test.example"
  "$REPO_ROOT/docker/db/init/01-create-dbs.sql"
)

for f in "${FILES_SHORT[@]}"; do
  # DB identifier slots (case-insensitive prefix match)
  do_sed "s/[Ll]akira_/${DB_SLUG}_/g" "$f"
  # Queue and other dotted identifiers
  do_sed "s/[Ll]akira\./${SHORT_NAME}./g" "$f"
  # Human-readable Title Case in workflow names, badge text, etc.
  do_sed "s/Lakira Backend/${DISPLAY_NAME} Backend/g" "$f"
  do_sed "s/Lakira/${DISPLAY_NAME}/g" "$f"
done

fi # RENAME_TREE

# ---------------------------------------------------------------------------
# 2b. Rename database identifiers in an .env or .env.test that already exists
#
# docs/tutorials/getting-started.md tells a newcomer to copy both templates, so
# they can be here before this script runs. Leaving them alone kept the upstream
# database user in them while the templates and the init SQL were renamed (audit
# 2026-10-03, S3). These files are the user's own, so only the database
# identifiers are renamed: DB_USER, DB_NAME, and the user and database of a
# *_DATABASE_URL, when they start with the template's prefix. The template's
# own password is renamed too, so step 3c still knows it for the template's and
# replaces it. A pattern over the whole file renamed DB_PASSWORD=lakira_secret
# to my_app_secret, and the user's database then refused the login
# (fork-bootstrap-leftovers D-01). Runs in both states, and changes nothing once
# the prefix is gone.
# ---------------------------------------------------------------------------
rename_env_identifiers() {
  rewrite_file "$1" awk -v slug="$DB_SLUG" '
    function renamed(value) {
      return value ~ /^[Ll]akira_/ ? slug "_" substr(value, 8) : value
    }
    function password(value) {
      return tolower(value) == "lakira_password" ? slug "_password" : value
    }
    {
      eq = index($0, "=")
      key = eq > 1 ? substr($0, 1, eq - 1) : ""
      value = substr($0, eq + 1)
    }
    key == "DB_USER" || key == "DB_NAME" { print key "=" renamed(value); next }
    key == "DB_PASSWORD" { print key "=" password(value); next }
    key ~ /^[A-Z_]+_DATABASE_URL$/ {
      sep = index(value, "://")
      if (sep == 0) { print; next }
      rest = substr(value, sep + 3)
      # The authority ends at the path, the query or the fragment.
      cut = match(rest, "[/?#]")
      authority = cut ? substr(rest, 1, cut - 1) : rest
      tail = cut ? substr(rest, cut) : ""
      at = 0
      for (i = length(authority); i > 0; i--) {
        if (substr(authority, i, 1) == "@") { at = i; break }
      }
      if (at > 0) {
        login = substr(authority, 1, at - 1)
        colon = index(login, ":")
        if (colon > 0) {
          login = renamed(substr(login, 1, colon - 1)) ":" password(substr(login, colon + 1))
        } else {
          login = renamed(login)
        }
        authority = login substr(authority, at)
      }
      if (substr(tail, 1, 1) == "/") {
        path = substr(tail, 2)
        end = match(path, "[/?#]")
        database = end ? substr(path, 1, end - 1) : path
        tail = "/" renamed(database) (end ? substr(path, end) : "")
      }
      print key "=" substr(value, 1, sep + 2) authority tail
      next
    }
    { print }
  '
}

for f in "$REPO_ROOT/.env" "$REPO_ROOT/.env.test"; do
  rename_env_identifiers "$f"
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
ENV_CREATED=false
if [[ ! -f "$ENV_FILE" && -f "$REPO_ROOT/.env.example" ]]; then
  cp "$REPO_ROOT/.env.example" "$ENV_FILE"
  ENV_CREATED=true
  echo "Created .env from .env.example"
fi

# Rotate on the first run, and in a .env this run has just created. A second run
# must not replace the secret of an .env that is already in use. An .env that
# still holds the template's placeholder is not in use: it is what a run that
# stopped part-way leaves behind, so it is finished here like a new one.
TEMPLATE_JWT_SECRET="replace-with-a-long-random-secret"
ENV_FRESH=false
if [[ "$ALREADY_RENAMED" == "false" || "$ENV_CREATED" == "true" ]]; then
  ENV_FRESH=true
elif [[ -f "$ENV_FILE" ]] && grep -q "^JWT_SECRET=$TEMPLATE_JWT_SECRET[[:space:]]*$" "$ENV_FILE"; then
  ENV_FRESH=true
fi

JWT_ROTATED=false
if [[ -f "$ENV_FILE" && "$ENV_FRESH" == "true" ]] && ! grep -q "^JWT_SECRET=" "$ENV_FILE"; then
  echo "WARNING: .env has no JWT_SECRET line; none was set" >&2
elif [[ -f "$ENV_FILE" && "$ENV_FRESH" == "true" ]]; then
  SET_JWT_SECRET=$(openssl rand -hex 32) set_env_values "$ENV_FILE" JWT_SECRET
  JWT_ROTATED=true
  echo "JWT_SECRET rotated in .env"
elif [[ -f "$ENV_FILE" ]]; then
  echo "JWT_SECRET left as it is in the existing .env"
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
ENV_TEST_CREATED=false
if [[ ! -f "$ENV_TEST_FILE" && -f "$REPO_ROOT/.env.test.example" ]]; then
  cp "$REPO_ROOT/.env.test.example" "$ENV_TEST_FILE"
  ENV_TEST_CREATED=true
  echo "Created .env.test from .env.test.example"
fi

# ---------------------------------------------------------------------------
# 3c. Generate the database password
#
# The template's password is "<slug>_password", which anyone can guess from the
# fork's name (audit 2026-10-03, S10). It is replaced under the rule JWT_SECRET
# follows (ENV_FRESH above). A password the user chose is kept, and so is the
# one in an .env that is already in use: the Postgres volume keeps the password
# it was created with, so replacing it would lock a working fork out of its own
# database.
#
# .env.test must log in as the role Compose creates from .env, so it takes that
# user and password together whenever this run generated the password, created
# .env.test, or finds the template's password still in it. Copying the password
# alone left .env.test on the template's user beside a hand-made .env (audit
# 2026-10-12, W3).
# ---------------------------------------------------------------------------
read_env_value() {
  local key="$1"
  local file="$2"
  # "|| true": a missing key is an answer here, not an error under pipefail.
  { grep -m1 "^$key=" "$file" || true; } | cut -d= -f2- | sed 's/[[:space:]]*$//'
}

# Writes a database login to an env file: DB_PASSWORD, DB_USER when the fourth
# argument is "with-user", and the development and test URLs. The staging and
# production URLs are never touched.
#
# A URL is rebuilt, not edited by pattern: its scheme, the login, then whatever
# followed the old credentials. With "with-user" (.env.test, which has one
# database to reach) whatever user it named before is replaced. Without it
# (.env) a URL is rebuilt when it logs in as that user or still holds the
# template's password; one with another user and a password of its own is the
# user's and is left alone. With no user to write, a URL keeps the one it names.
# A user that is not a plain identifier would need encoding in a URL, so the
# URLs are then left for the user. The values reach awk through its environment
# and are never part of a pattern.
#
# Returns 0 when the file changed and 1 when it already held all of it.
write_db_login() {
  local file="$1"
  local user="$2"
  local password="$3"
  local set_user="${4:-}"
  local rebuild_urls=true
  if [[ -n "$user" ]] && ! [[ "$user" =~ ^[A-Za-z0-9_]+$ ]]; then
    rebuild_urls=false
    echo "WARNING: DB_USER in .env is not a plain identifier; set the database URLs in $(basename "$file") by hand." >&2
  fi

  LOGIN_USER="$user" LOGIN_PASSWORD="$password" LOGIN_SET_USER="$set_user" \
    LOGIN_REBUILD_URLS="$rebuild_urls" LOGIN_TEMPLATE_PASSWORD="$TEMPLATE_DB_PASSWORD" \
    rewrite_file "$file" awk '
      BEGIN {
        user = ENVIRON["LOGIN_USER"]
        password = ENVIRON["LOGIN_PASSWORD"]
        template_password = ENVIRON["LOGIN_TEMPLATE_PASSWORD"]
        every_url = ENVIRON["LOGIN_SET_USER"] == "with-user"
        set_user = every_url && user != ""
        rebuild = ENVIRON["LOGIN_REBUILD_URLS"] == "true"
      }
      /^DB_PASSWORD=/ { print "DB_PASSWORD=" password; next }
      set_user && /^DB_USER=/ { print "DB_USER=" user; next }
      rebuild && /^(DEVELOPMENT|TEST)_DATABASE_URL=/ {
        eq = index($0, "=")
        value = substr($0, eq + 1)
        sep = index(value, "://")
        if (sep > 0) {
          rest = substr(value, sep + 3)
          # The authority ends at the path, the query or the fragment.
          cut = match(rest, "[/?#]")
          authority = cut ? substr(rest, 1, cut - 1) : rest
          tail = cut ? substr(rest, cut) : ""
          at = 0
          for (i = length(authority); i > 0; i--) {
            if (substr(authority, i, 1) == "@") { at = i; break }
          }
          old_user = ""
          old_password = ""
          if (at > 0) {
            old_user = substr(authority, 1, at - 1)
            colon = index(old_user, ":")
            if (colon > 0) {
              old_password = substr(old_user, colon + 1)
              old_user = substr(old_user, 1, colon - 1)
            }
          }
          url_user = user != "" ? user : old_user
          ours = every_url || old_user == user || old_password == template_password
          if (url_user != "" && ours) {
            print substr($0, 1, eq) substr(value, 1, sep + 2) url_user ":" password "@" substr(authority, at + 1) tail
            next
          }
        }
      }
      { print }
    '
  [[ "$REWRITE_CHANGED" == "true" ]]
}

TEMPLATE_DB_PASSWORD="${DB_SLUG}_password"
PASSWORD_GENERATED=false
PASSWORD_ADOPTED=false

if [[ -f "$ENV_FILE" ]]; then
  DB_LOGIN_USER=$(read_env_value DB_USER "$ENV_FILE")
  DB_LOGIN_PASSWORD=$(read_env_value DB_PASSWORD "$ENV_FILE")

  # An .env.test the user filled in, found without an .env: its login is what
  # their database was created with, so the new .env takes it instead of a
  # generated one, which used to overwrite it (fork-bootstrap-leftovers D-05).
  if [[ "$ENV_CREATED" == "true" && -f "$ENV_TEST_FILE" && "$ENV_TEST_CREATED" == "false" ]]; then
    FOUND_USER=$(read_env_value DB_USER "$ENV_TEST_FILE")
    FOUND_PASSWORD=$(read_env_value DB_PASSWORD "$ENV_TEST_FILE")
    if [[ "$FOUND_USER" =~ ^[A-Za-z0-9_]+$ && "$FOUND_PASSWORD" =~ ^[A-Za-z0-9._~-]+$ && "$FOUND_PASSWORD" != "$TEMPLATE_DB_PASSWORD" ]]; then
      DB_LOGIN_USER="$FOUND_USER"
      DB_LOGIN_PASSWORD="$FOUND_PASSWORD"
      write_db_login "$ENV_FILE" "$DB_LOGIN_USER" "$DB_LOGIN_PASSWORD" with-user || true
      PASSWORD_ADOPTED=true
      echo "Database login taken from the existing .env.test"
    fi
  fi

  if [[ "$PASSWORD_ADOPTED" == "false" && "$DB_LOGIN_PASSWORD" == "$TEMPLATE_DB_PASSWORD" && "$ENV_FRESH" == "true" ]]; then
    DB_LOGIN_PASSWORD=$(openssl rand -hex 24)
    write_db_login "$ENV_FILE" "$DB_LOGIN_USER" "$DB_LOGIN_PASSWORD" || true
    PASSWORD_GENERATED=true
    echo "Database password generated in .env"
  elif [[ "$PASSWORD_ADOPTED" == "false" && -n "$DB_LOGIN_PASSWORD" ]]; then
    echo "Database password left as it is in the existing .env"
  fi

  # The third case is an .env.test copied from the template by hand beside an .env
  # that holds a password the user chose. The fourth is what this script left
  # before it copied the user: the chosen password in DB_PASSWORD and the
  # template's still in the URL.
  ENV_TEST_PASSWORD=""
  ENV_TEST_URL=""
  if [[ -f "$ENV_TEST_FILE" ]]; then
    ENV_TEST_PASSWORD=$(read_env_value DB_PASSWORD "$ENV_TEST_FILE")
    ENV_TEST_URL=$(read_env_value TEST_DATABASE_URL "$ENV_TEST_FILE")
  fi
  if [[ -f "$ENV_TEST_FILE" && -n "$DB_LOGIN_PASSWORD" && ( "$PASSWORD_GENERATED" == "true" || "$ENV_TEST_CREATED" == "true" || "$ENV_TEST_PASSWORD" == "$TEMPLATE_DB_PASSWORD" || "$ENV_TEST_URL" == *":$TEMPLATE_DB_PASSWORD@"* ) ]]; then
    # The value goes into a URL and onto a line of an env file. Anything outside
    # this set would need encoding or quoting there, so it is left for the user.
    if [[ "$DB_LOGIN_PASSWORD" =~ ^[A-Za-z0-9._~-]+$ ]]; then
      if write_db_login "$ENV_TEST_FILE" "$DB_LOGIN_USER" "$DB_LOGIN_PASSWORD" with-user; then
        echo "Database login copied to .env.test"
      fi
    elif [[ "$ENV_TEST_PASSWORD" != "$DB_LOGIN_PASSWORD" ]]; then
      echo "WARNING: the database password in .env has characters this script will not copy." >&2
      echo "  Set DB_USER, DB_PASSWORD and TEST_DATABASE_URL in .env.test to match .env by hand." >&2
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 3d. Generate the broker login
#
# Both templates ship RabbitMQ's guest/guest, and Compose creates the broker
# from .env with its management UI on 127.0.0.1:15672, which a page that rebinds
# its DNS name to 127.0.0.1 can reach. An .env this run treats as fresh (the
# rule JWT_SECRET follows) that still holds guest/guest gets the database slug
# as its user and a generated password; .env.test takes the same pair while it
# holds guest. Redis keeps no password: it refuses input that looks like HTTP
# (fork-bootstrap-leftovers D-06).
# ---------------------------------------------------------------------------
BROKER_GENERATED=false
if [[ -f "$ENV_FILE" ]]; then
  BROKER_USER=$(read_env_value RABBITMQ_USER "$ENV_FILE")
  BROKER_PASSWORD=$(read_env_value RABBITMQ_PASSWORD "$ENV_FILE")

  if [[ "$ENV_FRESH" == "true" && "$BROKER_USER" == "guest" && "$BROKER_PASSWORD" == "guest" ]]; then
    BROKER_USER="$DB_SLUG"
    BROKER_PASSWORD=$(openssl rand -hex 24)
    SET_RABBITMQ_USER="$BROKER_USER" SET_RABBITMQ_PASSWORD="$BROKER_PASSWORD" \
      set_env_values "$ENV_FILE" RABBITMQ_USER RABBITMQ_PASSWORD
    BROKER_GENERATED=true
    echo "Broker login generated in .env"
  fi

  if [[ -f "$ENV_TEST_FILE" && -n "$BROKER_USER" && "$BROKER_USER" != "guest" && -n "$BROKER_PASSWORD" ]] &&
    [[ "$(read_env_value RABBITMQ_USER "$ENV_TEST_FILE")" == "guest" ]]; then
    SET_RABBITMQ_USER="$BROKER_USER" SET_RABBITMQ_PASSWORD="$BROKER_PASSWORD" \
      set_env_values "$ENV_TEST_FILE" RABBITMQ_USER RABBITMQ_PASSWORD
    echo "Broker login copied to .env.test"
  fi
fi

# ---------------------------------------------------------------------------
# 4. Set APP_NAME in .env
# ---------------------------------------------------------------------------
if [[ -f "$ENV_FILE" ]]; then
  if grep -q "^APP_NAME=" "$ENV_FILE"; then
    do_sed "s|^APP_NAME=.*|APP_NAME=$NEW_NAME|" "$ENV_FILE"
  else
    # A last line with no newline would otherwise take APP_NAME onto its end.
    if [[ -s "$ENV_FILE" && -n "$(tail -c 1 "$ENV_FILE")" ]]; then
      echo "" >> "$ENV_FILE"
    fi
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
if [[ "$ALREADY_RENAMED" == "false" ]]; then

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

fi # ALREADY_RENAMED

echo ""
echo "Done! Next steps:"
echo "  1. Run: npm install"
echo "  2. Start services: docker compose up -d db redis rabbitmq"
echo "  3. Run: npm run migrate:development"
echo "  4. Run: npm run db:migrate:test"
echo "  5. Run: npm test"
echo ""
DONE=()
KEPT=()
if [[ "$JWT_ROTATED" == "true" ]]; then DONE+=("rotated JWT_SECRET"); else KEPT+=("JWT_SECRET"); fi
if [[ "$PASSWORD_GENERATED" == "true" ]]; then
  DONE+=("generated the database password")
elif [[ "$PASSWORD_ADOPTED" == "true" ]]; then
  DONE+=("took the database login from .env.test")
else
  KEPT+=("the database password")
fi
if [[ "$BROKER_GENERATED" == "true" ]]; then DONE+=("generated the broker login"); else KEPT+=("the broker login"); fi
for _line in "${DONE[@]+"${DONE[@]}"}"; do
  echo "This run $_line."
done
for _line in "${KEPT[@]+"${KEPT[@]}"}"; do
  echo "This run left $_line in .env as it was."
done
echo "A Postgres or RabbitMQ volume from an earlier run keeps its old login:"
echo "'docker compose down -v' removes both. Review .env before pointing it at"
echo "anything real."
