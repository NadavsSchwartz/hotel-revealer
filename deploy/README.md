# VPS deployment preparation

This is a single Linux VPS deployment: Node serves the built React application
and API; Caddy terminates HTTPS. Normal startup uses the public Priceline adapter.
`/health` reports process and provider state without contacting the provider.
See [live integration evidence and limits](../docs/LIVE_ACCESS.md).
Hostinger managed Node hosting cannot run these Docker/VPS scripts; it requires
its own platform setup. No host has been provisioned or released by this work.

## Review and provision

The initial sizing candidate is one `s-1vcpu-1gb` Ubuntu 24.04 Droplet. Container
limits are 512 MiB for the app and 128 MiB for Caddy; this is an unmeasured starting
point, not a capacity claim. Verify current region availability and pricing before
creating the host. Application builds run in CI, never on the VPS.

Use separate existing Ed25519 public keys for the administrator and CI deployer,
and an existing DigitalOcean administrator SSH key ID:

```sh
python3 deploy/provision-do.py \
  --admin-key ~/.ssh/hotel-admin.pub \
  --deploy-key ~/.ssh/hotel-deploy.pub \
  --ssh-key-id 123456 \
  --render /tmp/hotel-cloud-init.yaml
```

The default is a local dry run: no cloud API calls and no purchases. The optional
`--render` file must not already exist. An explicitly authorized `--apply` run
creates a tag, cloud firewall and billable Droplet. Authenticate doctl locally;
do not put a DigitalOcean token in deployment CI. Failed provisioning preserves
created resources and reports the completed IDs; inspect the account before
retrying or deleting anything.

SSH defaults to public IPv4 for compatibility with standard GitHub hosted runners.
Only key authentication is enabled. Root login, passwords, forwarding and PTYs
for the deployment account are disabled. Its key has a forced release command;
the account has no Docker-group membership and cannot rewrite its authorized key
or installed scripts. Repeat `--ssh-cidr` to restrict SSH when stable administrator
and runner source addresses are available. The cloud firewall permits public TCP
80/443; only Caddy publishes those ports. Docker can bypass UFW for published
ports, so keep the cloud firewall and loopback-only app port in place.

The app bounds outstanding hotel operations at eight overall and four per client
IP, including cache/shared-work subscribers and disconnected callers whose service
work is still running. Each client IP can start four
uncached provider requests immediately, then one per ten seconds. Cache hits and
shared in-flight work do not spend that budget; each new inventory page or detail
fetch does. Busy responses include a retry time when the client budget is spent.
The four-request burst allows a full three-page search followed by one detail fetch.
This is a fairness bound, not measured production capacity: users sharing an IP
also share the allowance, and distributed clients can still reach the global cap.
The in-memory table holds at most 1,000 identities and removes them when their full
allowance replenishes (at most 40 seconds after their last admitted request).

Compose sets `HOTEL_CLIENT_IDENTITY=caddy`. Caddy unconditionally overwrites
`X-Hotel-Revealer-Client-IP` with its immediate connection's `{remote_host}`;
the app accepts only a canonical literal IP from that header. This mode trusts
the local host and Docker-network peers that can reach the app, so never expose
the app port publicly or attach untrusted containers to its network. Missing or
invalid identity headers share the socket peer's allowance. Direct app startup
defaults to `socket` mode and ignores all client-supplied forwarding headers.
`X-Forwarded-For` is never used and Express proxy trust stays disabled. An extra
CDN or reverse proxy is not implicitly supported: it would share its connection
IP's allowance and needs an explicitly reviewed trust configuration first.

## Install the reviewed configuration

1. Verify `cloud-init status --wait` and inspect failures through the provider
   console. Verify the SSH host public key/fingerprint through that independent
   console before making a known_hosts entry. `ssh-keyscan` alone is not identity
   verification.
2. Copy the reviewed `deploy/` directory using the administrator account and run
   `sudo bash deploy/install.sh`. Docker Engine and Compose **2.30+** must exist.
3. Edit `/etc/hotel-revealer/compose.env` with the domain and ACME email. The example
   pins an official Caddy manifest verified on 2026-09-07; an override must also
   use a verified `caddy:2...@sha256:<64 lowercase hex>` reference. Set the domain's
   DNS to this VPS. This file is parsed as data, not executed as shell.
4. Create root-owned mode-600 `/etc/hotel-revealer/image-repository` containing
   exactly `ghcr.io/OWNER/REPOSITORY` in lowercase, without a tag or digest.
5. Review root-only `/etc/hotel-revealer/runtime.env`. The installer initializes
   new files with `HOTEL_PROVIDER=priceline` and preserves existing files.
   Set `HOTEL_PROVIDER=disabled` to explicitly disable live access; an absent
   selection defaults to `priceline`. Any credentials stay here, outside Git and CI.
   Compose reads literal `KEY=value` lines; do not add shell quotes or commands.
6. For a private GHCR package, configure a dedicated read-only package credential
   in root's Docker credential configuration on the host, without placing it in
   source, cloud-init or workflow output. CI's temporary publishing token cannot
   serve as persistent host registry authentication.

State belongs in `/var/lib/hotel-revealer/provider`, owned by UID/GID 1000. This is
only provider block/cooldown state, not hotel or search persistence. Caddy's named
volumes hold TLS state. Preserve these directories/volumes on replacement or
restore; losing cooldown state can allow an early retry. Keep the last healthy
application image in the local Docker cache. There is no automatic image prune.

## Configure CI and release

- Optional repository variable `NODE_IMAGE`: override the default with a verified
  `node:24.20.0-bookworm-slim@sha256:<64 lowercase hex>` reference. Docker and CI
  default to the official manifest digest verified on 2026-09-07. The registry
  manifests were checked; the image build and container runtime remain unverified
  locally because Docker is unavailable.
- Production environment variable `DEPLOY_HOST`: plain DNS name or IPv4 address.
- Production environment secrets `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS`: the
  restricted private key and independently verified exact-host known_hosts entry.
- Set the production environment's allowed branch to `main` and require operator
  review before a public release. Protect main and the workflow/deployment files.

CI sets `HOTEL_PROVIDER=disabled` for lint, domain/API tests, the build and
Chromium/Firefox/WebKit journeys.
It then builds the image and tests its UI, `/health`, nonroot process, read-only
root and persistent state mount with external container networking disabled.
Only a manual **Release VPS** workflow saves that tested image and passes it to a
separate job with package-write permission; production receives its exact digest.
The deployment job has no package-write or cloud API credential.

The release script serializes changes, rejects unexpected repositories and
mutable image references, pulls before downtime, then stops/drains the old app
before starting the replacement. It checks `/health` within a bounded polling
window. Failure stops the replacement and restores the previous application
digest; a failed first release removes only the failed app container and preserves
its state directory, allowing a later retry. Release failure remains a
failed job even when rollback succeeds. This includes a short service outage.
The rollback covers the application image, not independent Caddy/config changes.
An administrator can release a previously tested digest using the same script:

```sh
sudo /usr/local/sbin/hotel-revealer-release ghcr.io/OWNER/REPOSITORY@sha256:DIGEST
```

The command above uses placeholders that validation rejects until replaced.
After release, verify public HTTPS, static assets, the configured provider's user
journey, a planned failed-image rollback, and reboot recovery. Measure memory,
CPU and disk before claiming this host is sufficient. Docker/cloud/SSH/TLS/reboot
execution remains unverified locally; shell/YAML parsing and fake-command release
tests do not substitute for those checks.

## Health notifications and maintenance

Set repository variables `HEALTH_HOST` and `HEALTHCHECK_ENABLED=true` after release.
`HEALTH_HOST` must be a plain lowercase DNS name or IPv4 address, without a scheme,
port or path. The scheduled workflow makes one HTTPS `/health` request twice hourly
and requires HTTP 200, `status: "ok"` and `provider.available: true`. A disabled or
blocked live provider therefore fails the monitor even when the process responds.
The check has a 20-second deadline, a 4 KiB response limit, rejects redirects and
does not retry. It never runs a search, refreshes inventory or resets provider state.
This verifies the application's reported readiness, not current provider inventory
or the ability to complete a booking. Run the same check manually with
`HEALTH_HOST=hotel.example.com node scripts/check-health.mjs`, replacing the example
host with the deployed hostname. Enable failed-workflow email notifications in your
GitHub notification settings and manually run a failure/recovery drill to verify
delivery. GitHub schedules can be delayed or disabled after inactivity, so this
is lightweight monitoring, not an uptime guarantee. No message destination is
configured automatically.

Host security updates are automatic; automatic reboot is disabled. Schedule and
verify reboots when updates require them. Logs are bounded (Docker local logs
30 MiB per service, journald 100 MiB disk/50 MiB runtime). Watch disk use manually
and remove only explicitly reviewed obsolete image digests after preserving
current/rollback images and persistent volumes.

Run `npm run measure:capacity` with the pinned Node/npm toolchain to measure the
existing local capacity scenario. It uses a synthetic provider and makes no hotel
provider requests; results are written under ignored `output/verification/`.
`npm run measure:capacity -- --bursts-only` runs the smaller shared/cached burst
scenario. Local measurements do not establish the VPS memory or CPU capacity.

Dependabot checks the root npm workspace and GitHub Actions weekly for minor and
patch version updates, with at most two open version-update PRs per ecosystem.
Security updates retain GitHub's separate behavior and limits. Updates require
review; there is no automerge. Coordinate Node/npm and image-pin changes manually
across the runtime, workflows and deployment validation; they are not covered by
these version-update checks. Keep documented dependency exceptions in place.
See the [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

Implementation references verified 2026-09-07:
[Docker installation](https://docs.docker.com/engine/install/ubuntu/),
[Compose service settings](https://docs.docker.com/reference/compose-file/services/),
[Caddy proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy),
[doctl Droplet creation](https://docs.digitalocean.com/reference/doctl/reference/compute/droplet/create/),
[doctl firewall rules](https://docs.digitalocean.com/reference/doctl/reference/compute/firewall/create/).
GitHub Actions are pinned to commit SHAs verified through their official tag refs.
