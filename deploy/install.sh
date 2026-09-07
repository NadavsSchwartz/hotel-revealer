#!/usr/bin/env bash
# Run manually from an approved checkout on the VPS as an administrator.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run this installer as root on the VPS.' >&2; exit 1; }
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
command -v docker >/dev/null
docker compose version >/dev/null
install -d -o root -g root -m 755 /opt/hotel-revealer/deploy
install -d -o root -g root -m 700 /etc/hotel-revealer /var/lib/hotel-revealer
install -d -o 1000 -g 1000 -m 700 /var/lib/hotel-revealer/provider
for file in compose.yaml Caddyfile validate.sh; do
  install -o root -g root -m 644 "$source_dir/$file" "/opt/hotel-revealer/deploy/$file"
done
install -o root -g root -m 755 "$source_dir/release.sh" /usr/local/sbin/hotel-revealer-release
install -o root -g root -m 755 "$source_dir/ssh-command.sh" /usr/local/bin/hotel-revealer-ssh
if [[ ! -e /etc/hotel-revealer/compose.env ]]; then
  install -o root -g root -m 600 "$source_dir/compose.env.example" /etc/hotel-revealer/compose.env
fi
if [[ ! -e /etc/hotel-revealer/runtime.env ]]; then
  install -o root -g root -m 600 /dev/null /etc/hotel-revealer/runtime.env
fi
printf '%s\n' 'Installed release scripts. Set root-only compose.env and image-repository before releasing. Provider access remains unconfigured.'
