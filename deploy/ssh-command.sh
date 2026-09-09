#!/usr/bin/env bash
set -euo pipefail
source /opt/hotel-revealer/deploy/validate.sh
command=${SSH_ORIGINAL_COMMAND:-}
[[ "$command" == 'deploy '* ]] || fail 'Only deploy <immutable image> is permitted.'
image=${command#deploy }
valid_image "$image" || fail 'Invalid immutable image reference.'
exec sudo -n /usr/local/sbin/hotel-revealer-release "$image"
