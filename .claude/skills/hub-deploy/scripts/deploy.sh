#!/usr/bin/env bash
# Deploys one committed revision of OpeniLink Hub to a remote Docker host.
#
#   deploy.sh [--host xdimspace-01] [--ref HEAD] [--origin https://hub.example.com]
#             [--skip-tests] [--dry-run] [--rollback]
#
# Layout on the host (DEPLOY_DIR, default /opt/openilink-hub):
#   releases/<sha>/     source of each deployed revision (git archive + built web/dist)
#   current -> releases/<sha>
#   data/               the container's /var/lib/openilink-hub: openilink.db
#                       (SQLite), media/ — never touched by a deploy
#   compose.yml, .env, REVISION, deploy.log
#   site.env            per-host settings appended to .env (RP_ORIGIN, SECRET, …),
#                       kept across deploys; SECRET is generated on first deploy
#
# The container only listens on 127.0.0.1:<port>; publishing it is the job of
# the host's nginx (see SKILL.md). Each revision is tagged openilink-hub:<sha>,
# so a failed health check rolls back to the previous image without rebuilding.
set -euo pipefail

HOST="${DEPLOY_HOST:-xdimspace-01}"
REF="${DEPLOY_REF:-HEAD}"
DIR="${DEPLOY_DIR:-/opt/openilink-hub}"
PORT="${DEPLOY_PORT:-9800}"
KEEP="${DEPLOY_KEEP_RELEASES:-5}"
ORIGIN=""
SKIP_TESTS=0
DRY_RUN=0
ROLLBACK=0

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    --origin) ORIGIN="$2"; shift 2 ;;
    --skip-tests) SKIP_TESTS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --rollback) ROLLBACK=1; shift ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$ORIGIN" in ""|https://*|http://127.0.0.1*|http://localhost*) ;; *) echo "--origin must be https://… (WeChat OAuth and passkeys need HTTPS)" >&2; exit 2 ;; esac
ORIGIN="${ORIGIN%/}"

SKILL="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(git rev-parse --show-toplevel)"
cd "$REPO"
SHA="$(git rev-parse --verify "${REF}^{commit}")"
SHORT="${SHA:0:12}"
echo "==> deploying ${SHORT} ($(git log -1 --format=%s "$SHA")) to ${HOST}:${DIR}"

if [ -n "$(git status --porcelain)" ]; then
  echo "    note: uncommitted changes are NOT deployed (only ${SHORT} is)"
fi
if ! git branch -r --contains "$SHA" 2>/dev/null | grep -q .; then
  echo "    note: ${SHORT} is not on any remote branch yet"
fi

# Build and test from a clean export of the commit, never the work tree.
WORK="$(mktemp -d -t hub-deploy.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
git archive --format=tar "$SHA" | tar -x -C "$WORK"

# The web UI is embedded into the Go binary (internal/web/dist, gitignored).
# Build it here: some hosts cannot pull node images, and the remote build then
# needs nothing but the Go module proxy (see Dockerfile.deploy).
echo "==> building web UI"
[ -d "$REPO/web/node_modules" ] || { echo "run 'pnpm install' in web/ first" >&2; exit 1; }
ln -s "$REPO/web/node_modules" "$WORK/web/node_modules"
( cd "$WORK/web" && pnpm run build >"$WORK/web-build.log" 2>&1 ) || { tail -30 "$WORK/web-build.log"; echo "web build failed; not deploying" >&2; exit 1; }
rm -f "$WORK/web/node_modules"; rm -rf "$WORK/web/dist"
[ -f "$WORK/internal/web/dist/index.html" ] || { echo "web build produced no internal/web/dist/index.html" >&2; exit 1; }

if [ "$SKIP_TESTS" -eq 0 ]; then
  echo "==> go vet + go test (SQLite and unit; use --skip-tests to skip)"
  ( cd "$WORK" && go vet ./... && go test ./internal/... -count=1 ) >"$WORK/test.log" 2>&1 \
    || { grep -E "^(---|FAIL|ok|panic)|\.go:[0-9]+" "$WORK/test.log" | grep -v "^ok" | tail -30; echo "tests failed; not deploying" >&2; exit 1; }
  echo "    tests passed"
fi

ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" true || { echo "cannot reach ${HOST} over ssh" >&2; exit 1; }

# A commit that does not contain the running revision would silently take
# someone else's deployed work offline, so that is only done on purpose.
LIVE="$(ssh "$HOST" "cat '${DIR}/REVISION' 2>/dev/null" || true)"
if [ -n "$LIVE" ] && [ "$LIVE" != "$SHA" ]; then
  git cat-file -e "${LIVE}^{commit}" 2>/dev/null || git fetch -q origin 2>/dev/null || true
  if ! git merge-base --is-ancestor "$LIVE" "$SHA" 2>/dev/null; then
    if [ "$ROLLBACK" -eq 1 ]; then
      echo "    note: rolling back from ${LIVE:0:12} (not contained in ${SHORT})"
    else
      echo "live revision ${LIVE:0:12} is not contained in ${SHORT}; deploying would remove it. Rebase onto it, or pass --rollback on purpose." >&2
      exit 1
    fi
  fi
fi

# The port must be free or already ours.
if ssh "$HOST" "ss -ltn | awk '{print \$4}' | grep -qE '[:.]${PORT}\$' && ! docker ps --format '{{.Ports}}' --filter label=com.docker.compose.project=openilink-hub | grep -q ':${PORT}->'"; then
  echo "port ${PORT} on ${HOST} is used by something else; set DEPLOY_PORT" >&2; exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "==> dry run: would upload ${SHORT} and run the remote step"
  exit 0
fi

echo "==> uploading source (+ built web UI)"
ssh "$HOST" "mkdir -p '${DIR}/releases/${SHA}'"
# COPYFILE_DISABLE: macOS tar would add AppleDouble ._* files, which the
# embedded migration loaders then try to parse as migrations.
COPYFILE_DISABLE=1 tar -C "$WORK" --exclude='._*' --exclude=./web/node_modules --exclude=./test.log --exclude=./web-build.log -czf - . \
  | ssh "$HOST" "tar -xz -C '${DIR}/releases/${SHA}' 2>/dev/null && find '${DIR}/releases/${SHA}' -name '._*' -delete"
scp -q "$SKILL/compose.deploy.yml" "$HOST:${DIR}/compose.yml"

echo "==> remote build, start and health check"
ssh "$HOST" "bash -s" -- "$DIR" "$SHA" "$PORT" "$KEEP" "$ORIGIN" <<'REMOTE'
set -euo pipefail
DIR="$1"; SHA="$2"; PORT="$3"; KEEP="$4"; ORIGIN="$5"
SHORT="${SHA:0:12}"
PROJECT=openilink-hub
DATA="$DIR/data"
SECRETS=/root/.openilink-hub
cd "$DIR"

log() { printf '%s %s\n' "$(date -Is)" "$*" | tee -a "$DIR/deploy.log"; }

mkdir -p "$DATA" "$SECRETS"
chmod 700 "$DATA" "$SECRETS"

# site.env holds per-host settings and is never rewritten wholesale.
touch site.env; chmod 600 site.env
setkv() { grep -v "^$1=" site.env > site.env.tmp || true; echo "$1=$2" >> site.env.tmp; mv site.env.tmp site.env; chmod 600 site.env; }
# SECRET encrypts tokens; generated once and kept (changing it logs everyone out).
grep -q '^SECRET=' site.env || setkv SECRET "$(openssl rand -hex 32)"
if [ -n "$ORIGIN" ]; then
  setkv RP_ORIGIN "$ORIGIN"
  setkv RP_ID "$(echo "$ORIGIN" | sed -E 's#^https?://##; s#[:/].*$##')"
fi
grep -q '^RP_ORIGIN=' site.env || { setkv RP_ORIGIN "http://127.0.0.1:${PORT}"; setkv RP_ID "127.0.0.1"; }

# First deploy = never deployed successfully here (no REVISION). A database
# left by a failed first start does not count; the admin step below verifies
# it really obtained the superadmin role.
FIRST=0
[ -s REVISION ] || FIRST=1

PREVIOUS="$(cat REVISION 2>/dev/null || true)"
write_env() {
  {
    echo "HUB_REVISION=$1"
    echo "HUB_VERSION=${1:0:12}"
    echo "HUB_SRC=$DIR/releases/$1"
    echo "HUB_PORT=$PORT"
    echo "HUB_DATA_DIR=$DATA"
    grep -E '^[A-Z_][A-Z0-9_]*=' site.env
  } > .env
  chmod 600 .env
}
compose() { docker compose -p "$PROJECT" --env-file "$DIR/.env" -f "$DIR/compose.yml" "$@"; }

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/api/info" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

write_env "$SHA"
log "build ${SHORT}"
if ! docker image inspect "${PROJECT}:${SHA}" >/dev/null 2>&1; then
  compose build --quiet
fi
compose up -d --remove-orphans

if healthy; then
  ln -sfn "releases/$SHA" current
  echo "$SHA" > REVISION
  log "deployed ${SHORT} (previous ${PREVIOUS:0:12})"
else
  log "health check failed for ${SHORT}"
  compose logs --tail 60 || true
  if [ -n "$PREVIOUS" ] && docker image inspect "${PROJECT}:${PREVIOUS}" >/dev/null 2>&1; then
    write_env "$PREVIOUS"
    compose up -d --remove-orphans
    healthy && log "rolled back to ${PREVIOUS:0:12}" || log "ROLLBACK FAILED, ${PREVIOUS:0:12} is not healthy either"
  fi
  exit 1
fi

# First deploy: the first registered user becomes superadmin and public
# registration is open by default. Claim the admin account from loopback
# before the site is reachable, then close registration. The password never
# leaves this host (cat $SECRETS/admin-password).
if [ "$FIRST" -eq 1 ]; then
  [ -s "$SECRETS/admin-password" ] || (umask 077; openssl rand -base64 18 | tr -d '\n/+=' > "$SECRETS/admin-password")
  PW="$(cat "$SECRETS/admin-password")"
  JAR="$(mktemp)"
  body=$(printf '{"username":"admin","password":"%s"}' "$PW")
  code=$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -H 'Content-Type: application/json' -d "$body" "http://127.0.0.1:${PORT}/api/auth/register")
  role=""
  if [ "$code" = 200 ] || [ "$code" = 201 ]; then
    role=$(curl -fsS -b "$JAR" "http://127.0.0.1:${PORT}/api/me" | sed -n 's/.*"role":"\([a-z_]*\)".*/\1/p')
  fi
  if [ "$role" = superadmin ]; then
    curl -fsS -o /dev/null -b "$JAR" -X PUT -H 'Content-Type: application/json' -d '{"enabled":"false"}' "http://127.0.0.1:${PORT}/api/admin/config/registration" \
      && log "first administrator: admin (password in $SECRETS/admin-password); public registration disabled" \
      || log "WARNING: admin created but closing registration failed — close it in 管理后台 before publishing"
  else
    log "WARNING: could not claim superadmin (register HTTP ${code}, role '${role}'); users already exist? check before publishing"
  fi
  rm -f "$JAR"
fi

# Keep the newest releases (and their images); never the running one.
ls -1t releases | tail -n +"$((KEEP + 1))" | while read -r old; do
  [ "$old" = "$SHA" ] && continue
  rm -rf "releases/$old"
  docker image rm "${PROJECT}:${old}" >/dev/null 2>&1 || true
done

docker ps --filter "label=com.docker.compose.project=${PROJECT}" --format '{{.Names}}  {{.Image}}  {{.Status}}  {{.Ports}}'
curl -fsS "http://127.0.0.1:${PORT}/api/info"; echo
echo "RP_ORIGIN=$(grep '^RP_ORIGIN=' site.env | cut -d= -f2-)"
REMOTE

echo "==> done. Tunnel for a browser:  ssh -N -L ${PORT}:127.0.0.1:${PORT} ${HOST}  then open http://127.0.0.1:${PORT}"
