#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/validate.sh"
[[ $# == 1 ]] && valid_image "$1" || fail 'Expected one immutable application image.'
valid_host "${DEPLOY_HOST:-}" || fail 'DEPLOY_HOST must be a plain DNS name or IPv4 address.'
[[ -f ${DEPLOY_KEY_FILE:-} && -f ${DEPLOY_KNOWN_HOSTS_FILE:-} ]] || fail 'An SSH key and independently verified known_hosts file are required.'
# Keyscan is not a trust check. known_hosts must be provisioned separately.
ssh-keygen -F "$DEPLOY_HOST" -f "$DEPLOY_KNOWN_HOSTS_FILE" >/dev/null || fail 'No verified SSH host key for the exact host.'
exec ssh -F /dev/null -T \
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$DEPLOY_KNOWN_HOSTS_FILE" \
  -o GlobalKnownHostsFile=/dev/null -o ConnectTimeout=15 \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -i "$DEPLOY_KEY_FILE" "deploy@$DEPLOY_HOST" "deploy $1"
