#!/usr/bin/env bash
# Installs a site's nginx config from the repository template, safely.
#
#   install-nginx.sh --host xdimspace-01 --domain hub.example.com [--template site.conf] [--port 9800] [--dry-run]
#
# Renders nginx/<template> (__DOMAIN__, __PORT__), shows the diff with
# what is live, backs the live file up, installs, runs `nginx -t` and reloads only
# when it passes — otherwise restores the backup (the host serves other sites).
# Afterwards the live file must equal the rendered template byte for byte.
set -euo pipefail
HOST="" DOMAIN="" TEMPLATE=site.conf PORT="${DEPLOY_PORT:-9800}" DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --template) TEMPLATE="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$HOST" ] && [ -n "$DOMAIN" ] || { sed -n '2,11p' "$0"; exit 2; }
SRC="$(cd "$(dirname "$0")/../nginx" && pwd)/$TEMPLATE"
[ -f "$SRC" ] || { echo "no template $SRC" >&2; exit 1; }
RENDERED="$(mktemp)"
trap 'rm -f "$RENDERED"' EXIT
sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$PORT/g" "$SRC" >"$RENDERED"
LIVE="/etc/nginx/sites-available/$DOMAIN"

echo "==> diff live → rendered ($TEMPLATE for $DOMAIN on $HOST)"
if ssh "$HOST" "test -f $LIVE"; then
  ssh "$HOST" "cat $LIVE" | diff - "$RENDERED" && { echo "    identical; nothing to do"; exit 0; } || true
else
  echo "    $LIVE does not exist yet (new site: follow the three steps in SKILL.md for the certificate)"
fi
[ "$DRY_RUN" -eq 1 ] && exit 0

STAMP="$(date +%Y%m%d-%H%M%S)"
scp -q "$RENDERED" "$HOST:/tmp/nginx-$DOMAIN.conf"
ssh "$HOST" "set -e
F=$LIVE; B=/root/nginx-$DOMAIN.$STAMP.bak
[ -f \$F ] && cp -p \$F \$B
cp /tmp/nginx-$DOMAIN.conf \$F; rm -f /tmp/nginx-$DOMAIN.conf
ln -sfn \$F /etc/nginx/sites-enabled/$DOMAIN
if nginx -t 2>/tmp/nginx-t.log; then systemctl reload nginx; echo '    nginx -t ok, reloaded (backup '\$B')'
else
  echo '    nginx -t FAILED:'; sed 's/^/      /' /tmp/nginx-t.log
  if [ -f \$B ]; then cp -p \$B \$F; else rm -f \$F /etc/nginx/sites-enabled/$DOMAIN; fi
  nginx -t >/dev/null 2>&1 && echo '    restored the previous config; nothing reloaded'
  exit 1
fi"
ssh "$HOST" "cat $LIVE" | cmp -s - "$RENDERED" && echo "==> live config equals the template"
