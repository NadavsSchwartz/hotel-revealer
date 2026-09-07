#!/usr/bin/env bash
set -euo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
source /opt/hotel-revealer/deploy/validate.sh
[[ $EUID == 0 && $# == 1 ]] || fail 'Usage as root: hotel-revealer-release <immutable image>'
valid_image "$1" || fail 'Invalid immutable application image.'
repository=$(cat /etc/hotel-revealer/image-repository)
valid_repository "$repository" || fail 'Invalid configured image repository.'
[[ ${1%@sha256:*} == "$repository" ]] || fail 'Image repository is not allowed.'
exec 9>/run/lock/hotel-revealer-release.lock
flock -n 9 || fail 'Another deployment is in progress.'

unset CADDY_IMAGE SITE_ADDRESS ACME_EMAIL
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  case "$line" in
    CADDY_IMAGE=*) CADDY_IMAGE=${line#*=} ;;
    SITE_ADDRESS=*) SITE_ADDRESS=${line#*=} ;;
    ACME_EMAIL=*) ACME_EMAIL=${line#*=} ;;
    *) fail 'Unexpected setting in compose.env.' ;;
  esac
done < /etc/hotel-revealer/compose.env
valid_caddy_image "${CADDY_IMAGE:-}" || fail 'A verified immutable Caddy image is required.'
valid_host "${SITE_ADDRESS:-}" || fail 'SITE_ADDRESS must be a plain public hostname.'
[[ ${ACME_EMAIL:-} =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || fail 'Invalid ACME_EMAIL.'
export CADDY_IMAGE SITE_ADDRESS ACME_EMAIL
export APP_IMAGE=$1
compose() { docker compose --env-file /dev/null --file /opt/hotel-revealer/deploy/compose.yaml "$@"; }
compose config --quiet
previous=''
if [[ -f /var/lib/hotel-revealer/current-image ]]; then
  previous=$(cat /var/lib/hotel-revealer/current-image)
  valid_image "$previous" || fail 'Invalid saved previous image; resolve before deploying.'
  [[ ${previous%@sha256:*} == "$repository" ]] || fail 'Previous repository does not match.'
fi
container=$(compose ps --all --quiet app)
[[ "$container" != *$'\n'* ]] || fail 'More than one app instance exists.'
if [[ -n "$container" ]]; then
  [[ -n "$previous" ]] || fail 'Existing app has no release record; reconcile it first.'
  [[ $(docker inspect --format '{{.Config.Image}}' "$container") == "$previous" ]] || fail 'Running image and release record disagree.'
fi

# Pull and validate infrastructure before interrupting the current process.
timeout 180s docker pull "$APP_IMAGE" >/dev/null
timeout 180s docker pull "$CADDY_IMAGE" >/dev/null
timeout 30s docker run --rm --read-only --cap-drop ALL --network none --tmpfs /data --tmpfs /config \
  --env SITE_ADDRESS --env ACME_EMAIL \
  --mount type=bind,src=/opt/hotel-revealer/deploy/Caddyfile,dst=/etc/caddy/Caddyfile,readonly \
  "$CADDY_IMAGE" caddy validate --config /etc/caddy/Caddyfile >/dev/null

wait_healthy() {
  local attempt cid
  for attempt in {1..30}; do
    cid=$(compose ps --quiet app)
    if [[ -n "$cid" && $(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid") == healthy ]] &&
      curl --silent --fail --max-time 3 http://127.0.0.1:5000/health >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}
interrupted=0
recover() {
  local result=$?
  trap - EXIT INT TERM
  if (( result != 0 && interrupted )); then
    printf '%s\n' 'Release failed; stopping replacement before recovery.' >&2
    if ! stop_app; then
      printf '%s\n' 'Could not stop app. Recovery requires operator attention.' >&2
      exit 1
    fi
    if [[ -n "$previous" ]]; then
      export APP_IMAGE=$previous
      if compose up --detach --no-deps --pull never --force-recreate app && wait_healthy; then
        printf '%s\n' 'Previous application image restored.' >&2
      else
        printf '%s\n' 'Rollback failed. Operator attention required.' >&2
      fi
    else
      compose rm --force app >/dev/null
      printf '%s\n' 'No previous release exists; failed app removed, persistent state retained.' >&2
    fi
  fi
  exit "$result"
}
stop_app() { timeout 75s docker compose --env-file /dev/null --file /opt/hotel-revealer/deploy/compose.yaml stop --timeout 45 app; }
trap recover EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
compose up --detach --no-deps --pull never caddy
interrupted=1
stop_app
compose up --detach --no-deps --pull never --force-recreate app
wait_healthy || fail 'New application did not become healthy.'
printf '%s\n' "$APP_IMAGE" > /var/lib/hotel-revealer/current-image.next
mv /var/lib/hotel-revealer/current-image.next /var/lib/hotel-revealer/current-image
interrupted=0
printf '%s\n' 'Application release is healthy.'
