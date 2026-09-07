#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/validate.sh"
digest=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
valid_image "ghcr.io/example/hotel-revealer@sha256:$digest"
valid_node_image "node:24.20.0-bookworm-slim@sha256:$digest"
valid_caddy_image "caddy:2.10-alpine@sha256:$digest"
valid_host 'hotels.example.com'
valid_host '192.0.2.1'
for image in 'ghcr.io/example/hotel-revealer:latest' "ghcr.io/example/hotel-revealer@sha256:$digest;id" \
  "ghcr.io/example/hotel-revealer@sha256:$digest extra" '$(id)' '-oProxyCommand=id' $'image\nextra'; do
  if valid_image "$image"; then fail 'Accepted unsafe image'; fi
done
for host in '-bad.example.com' 'example.com/path' 'user@example.com' 'example.com:22' 'example..com' \
  'example.com extra' 'example.com;id' '*.example.com' 'example.-com' $'example.com\nextra'; do
  if valid_host "$host"; then fail 'Accepted unsafe host'; fi
done
printf '%s\n' 'Deployment image and hostname validation passed.'
