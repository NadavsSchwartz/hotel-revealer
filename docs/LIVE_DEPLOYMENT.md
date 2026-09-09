# Live deployment evidence

Recorded **2026-09-09 UTC**. [Hotel Revealer](https://hotelrevealer.tech) is live on
Hostinger. These are observed launch results, not a guarantee of future provider
compatibility, matching accuracy, or uptime.

## Release identity

| Artifact | Verified identity and status |
| --- | --- |
| Running application | `ghcr.io/nadavsschwartz/hotel-revealer@sha256:848c09c6300e1a12b46ce1bc22c964e6b578d082fc7f79d9e00085262b33ab58`; image revision `58f9c1fe4bfb42fa58a908493990830c3f36a536`; normal release through the restricted deployment key completed healthy |
| Previous rollback target | `ghcr.io/nadavsschwartz/hotel-revealer@sha256:1f43748c2141805669f49d8a9fc142e54edc843ce4b99fb37ad42e191fe9f61d`; image revision `57ca536fbb44a68f21f841768443d1fef59b0120`; restored successfully during the failed-start drill |
| Released-image CI | [Run 34405371862](https://github.com/NadavsSchwartz/hotel-revealer/actions/runs/34405371862) passed 291 native tests, 452 browser executions, 12 release simulations, and actual Docker image/Caddy configuration validation |
| Monitoring on main | [PR #79](https://github.com/NadavsSchwartz/hotel-revealer/pull/79), merged as `a693f3311835747e53a344d52899319d3186f16c`, added only the health workflow and checker; existing main application files were unchanged |

The application was deployed from the tested recovery-branch image. The monitoring
merge does not move that application implementation onto `main`. CI browser cases
use synthetic provider responses; the hosted journey below is separate evidence.

## Observed hosted behavior

- The apex domain serves valid HTTPS. `www.hotelrevealer.tech` and the VPS hostname
  redirect to the apex with HTTP 308, preserving path and query parameters.
- The actual browser journey searched Las Vegas for September 21–23, 2026, one
  room, two adults, and USD. It returned 59 inferred results. Flamingo details
  showed 20 photos and an original-offer total of USD 123.22. The expired-price
  update succeeded; the original-offer handoff opened Priceline with the same
  trip parameters and a displayed USD 123 total. After the final image was
  deployed, a fresh search on the apex domain returned 57 likely-hotel deals;
  Flamingo again loaded 20 photos and the USD 123.22 original total. No booking
  was made. These are point-in-time quotes; the displayed amounts are not exact cent-level parity
  or proof of the hidden hotel's identity.
- A graceful application restart and a full VPS reboot recovered the containers,
  persistent provider state, and current-image record. This does not prove
  recovery from host or volume loss.
- Candidate `848c09c` was deliberately stopped during startup to exercise the
  real release script. It exited 1 and restored the previous `1f43748` image, healthy application
  container, and exact current-image record. The drill's immediate public probe
  returned HTTP 503 and failed the harness; a subsequent public probe returned
  HTTP 200 with the provider available, without manual recovery or state/config
  edits. Caddy logged “no upstreams available” at 21:47:09 UTC, then its active
  health checker marked the restored upstream healthy at 21:47:20 UTC, 11 seconds
  after the failed public probe. Automatic rollback is verified with this proxy
  recovery delay; uninterrupted public recovery is not claimed. The subsequent
  normal release of `848c09c` completed healthy through the restricted deployment key.

## Installed operating controls

The host runs Ubuntu 26.04.1 with kernel `7.0.0-31-generic`. One non-root, read-only
application container has a 512 MiB memory limit and a loopback-only host port.
Caddy terminates public TLS with a 128 MiB limit. Docker logs use
`max-size=10m` and `max-file=3` per service. These configured bounds and successful
journeys are not sustained-load capacity measurements.

Administrator SSH uses the existing key only. The deployment account is restricted
to its forced release command. No unrestricted sudo administrator was added.
Both cloud and host firewalls limit SSH to the approved administrator's single
IPv4 address (`/32`). If that address changes, update both firewall rules through
the Hostinger console before attempting SSH.

The installed Caddyfile includes the domain aliases. Ordinary app releases keep
it; rerunning the generic installer would overwrite it. Preserve that host-specific
configuration before reinstalling.

The public health workflow is enabled with a five-minute, best-effort schedule.
The post-deployment [normal run 34409039696](https://github.com/NadavsSchwartz/hotel-revealer/actions/runs/34409039696)
passed at 21:50 UTC. At that checkpoint, no scheduled event had appeared yet;
manual execution and notification delivery were verified, while the first
automatic scheduled execution remained unobserved.
[Normal run 34406471454](https://github.com/NadavsSchwartz/hotel-revealer/actions/runs/34406471454)
passed against the live domain. [Intentional alert run 34406656749](https://github.com/NadavsSchwartz/hotel-revealer/actions/runs/34406656749)
failed only its explicit notification-test step, skipped all application steps,
and delivered the failure email to the configured inbox. The health request
reads reported state without contacting Priceline. GitHub scheduling can be
delayed or dropped and disables public-repository schedules after 60 days without
activity; see the [monitoring runbook](../deploy/README.md#health-notifications-and-maintenance).

## Recovery backup and remaining limits

At 21:52 UTC, a private archive captured 26 installed configuration, release,
firewall/SSH-policy, and provider-state files. Source lists, metadata, and hashes
were unchanged across collection. Extraction into a separate temporary directory
passed file-checksum and JSON checks; no live files were overwritten. The archive
was then copied to the administrator's Mac, outside version control, and its
SHA-256 and every archived file were checked again. The directory and archive
permissions are 0700 and 0600. Private SSH/TLS keys are excluded; treat runtime
configuration in the archive as sensitive.

Weekly Hostinger backups are enabled, but the first automatic restore point had
not appeared at this checkpoint. This is verified file-level backup extraction,
not a full-machine rebuild or restoration after volume loss. The initial
pre-deployment snapshot was retained; it is not the current application backup.

Local launch logs and captures are retained under ignored
`output/verification/hostinger-launch-20260909/`. Earlier local results remain in
[acceptance evidence](ACCEPTANCE.md) and [live provider evidence](LIVE_ACCESS.md).
Physical-device, manual assistive-technology, known-hotel-outcome, and first-time
user gates are unchanged by this hosting record.
