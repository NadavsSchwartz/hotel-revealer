# Live deployment evidence

Updated **2026-09-10 UTC**. [Hotel Revealer](https://hotelrevealer.tech) runs on
Hostinger. The September 9 sections below retain the original launch evidence.

## Homepage and typography release — September 10

At 13:54 UTC, the restricted release command deployed the homepage removal and
typography/copy changes from `3fe7e61` and `98aaeb1`, integrated with the reporting
release. [PR #85](https://github.com/NadavsSchwartz/hotel-revealer/pull/85) merged as
`b0f1193ece65563f110d0f8d423dd38d1e89b437`; its tree matches tested source
`fc9d50ed46e1eede7b8f86946c1bffe7935cb430`.

Running image:
`ghcr.io/nadavsschwartz/hotel-revealer@sha256:eae26e5d19409c9ab20608db0b1fe2f29dfeb42657838eb828bcc0cdb8edd7a5`

[Release CI 34484248641](https://github.com/NadavsSchwartz/hotel-revealer/actions/runs/34484248641)
passed 293 native tests, all 456 browser cases, 12 report tests and the existing
deployment/container checks. Container `65a44d18ffb6` reports the tested revision
and healthy status; the public health check passed. The previous `310e222` image
below is the rollback target.

A fresh production browser tab showed the updated home copy, retained main search
and no “Take a closer look” section. Local review covered 22 captures across
desktop/mobile and both themes, with no horizontal overflow or browser errors.
Caddy, Compose and the report script hashes were unchanged; the daily timer remains
enabled and active. Evidence is in ignored `output/verification/homepage-release/`.

## Reporting release — September 10

[PR #84](https://github.com/NadavsSchwartz/hotel-revealer/pull/84) merged as
`5a1ed254d425cdef07ff9d0eb2e53c4ecf34eb08`. Its tree matches tested source
`e37ca8ad78c9701c447195f8afd706a879b384f8`.
[Release CI 34430653571](https://github.com/NadavsSchwartz/hotel-revealer/actions/runs/34430653571)
passed 293 native tests, 452 browser executions, 12 report tests, and the existing
deployment and container checks. It published the exact tested image:

`ghcr.io/nadavsschwartz/hotel-revealer@sha256:310e222bbc1db989a8172e0da7e5ca364c74b7b594b42486f7f8e1ab797d2669`

The restricted release command deployed it healthy at 02:56 UTC. Container
`4a3719fea9d1` reports revision `e37ca8a`; public `/health` returned 200 with the
provider available. The previous `848c09c` image below is the rollback target.
Caddy and Compose file hashes were unchanged. The existing health workflow remains
enabled. The obsolete Netlify preview checks still fail; they are separate from
this VPS release and were outside the cleanup scope.

Only the report script and its service/timer were installed. The host already had
Python 3.14.4, Docker 29.8.0 and systemd 259. Installed files match the committed
hashes; no packages, credentials or Caddy settings changed.

- The manual September 10 report observed one server start. Two deliberate
  empty-body API probes returned 400 and appeared once each under Search and
  Details, with no provider calls. Consecutive report hashes matched.
- The September 9 report contains no events from the replacement container. It
  shows partial coverage and unavailable metrics, including the deployment gap.
- The actual timer triggered the service at **03:00:11 UTC** using a temporary
  one-minute activation. The journal records a successful report write and exit
  status 0. The temporary drop-in was removed; the enabled timer has only its
  daily **00:10 UTC** calendar schedule. Its next regular run is September 11;
  that calendar run has not yet been observed.
- Reports are root-owned under `/var/lib/hotel-revealer/reports/`, with directory
  mode 0700 and file mode 0600. The script retains 30 dates. Retrieval-failure
  preservation and retention were verified by the report tests, not by deleting
  live logs or forcing Docker failures on the host.

Local evidence is in ignored `output/verification/targeted-cleanup/`. The
[shortlist check](SHORTLIST_CHECK.md) was collected before this release, against
the preceding `58f9c1f` application image.

## Launch release identity — September 9

| Artifact | Verified identity and status |
| --- | --- |
| Application at launch | `ghcr.io/nadavsschwartz/hotel-revealer@sha256:848c09c6300e1a12b46ce1bc22c964e6b578d082fc7f79d9e00085262b33ab58`; image revision `58f9c1fe4bfb42fa58a908493990830c3f36a536`; normal release through the restricted deployment key completed healthy |
| Previous rollback target | `ghcr.io/nadavsschwartz/hotel-revealer@sha256:1f43748c2141805669f49d8a9fc142e54edc843ce4b99fb37ad42e191fe9f61d`; image revision `57ca536fbb44a68f21f841768443d1fef59b0120`; restored successfully during the failed-start drill |
| Released-image CI | [Run 34405371862](https://github.com/NadavsSchwartz/hotel-revealer/actions/runs/34405371862) passed 291 native tests, 452 browser executions, 12 release simulations, and actual Docker image/Caddy configuration validation |
| Monitoring on main | [PR #79](https://github.com/NadavsSchwartz/hotel-revealer/pull/79), merged as `a693f3311835747e53a344d52899319d3186f16c`, added only the health workflow and checker; existing main application files were unchanged |

At this launch checkpoint, the application was deployed from the tested
recovery-branch image. The monitoring-only merge described above left the legacy
application on `main`; this records the branch state at launch, before application
integration. CI browser cases use synthetic provider responses; the hosted journey
below is separate evidence.

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
