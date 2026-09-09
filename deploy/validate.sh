#!/usr/bin/env bash
# Sourced only from trusted, root-owned deployment scripts.
fail() { printf '%s\n' "$*" >&2; exit 1; }
valid_repository() { [[ "$1" =~ ^ghcr\.io/[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*$ ]]; }
valid_image() { [[ "$1" =~ ^ghcr\.io/[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*@sha256:[a-f0-9]{64}$ ]]; }
valid_node_image() { [[ "$1" =~ ^node:24\.20\.0-bookworm-slim@sha256:[a-f0-9]{64}$ ]]; }
valid_caddy_image() { [[ "$1" =~ ^caddy:2[0-9a-z.-]*@sha256:[a-f0-9]{64}$ ]]; }
valid_host() {
  [[ ${#1} -le 253 && "$1" == *.* && "$1" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && "$1" != *..* && "$1" != *.-* && "$1" != *-.* ]]
}
validate_caddy_config() {
  # The pinned Caddy binary requires its file capability even for validation.
  timeout 30s docker run --rm --read-only --cap-drop ALL --cap-add NET_BIND_SERVICE --network none --tmpfs /data --tmpfs /config \
    --env SITE_ADDRESS --env ACME_EMAIL \
    --mount "type=bind,src=$2,dst=/etc/caddy/Caddyfile,readonly" \
    "$1" caddy validate --config /etc/caddy/Caddyfile >/dev/null
}
