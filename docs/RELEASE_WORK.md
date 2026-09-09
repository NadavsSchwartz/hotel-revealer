# Remaining release work

The goal is the public portfolio product defined in the agreed plan. Restoring a
live request is a milestone, not completion. Earlier application milestone
`4dd2217`, browser corrections in AUDIT_FIXES.md, and pricing integration from
`62a47df` remain historical evidence. See ACCEPTANCE.md for current results.

## Current deployment status — 2026-09-09

[Hotel Revealer](https://hotelrevealer.tech) is live on Hostinger with HTTPS and
verified redirects, an actual hosted traveler journey through Priceline handoff,
restart/reboot recovery, and external health checks with verified failure-email
delivery. The running image is labeled `58f9c1f` and passed CI, including actual
Docker/Caddy checks; its normal release through the restricted deployment key
completed healthy. Exact images and evidence are recorded in
[LIVE_DEPLOYMENT.md](LIVE_DEPLOYMENT.md).

A failed-start release automatically restored the previous image and record;
the immediate public 503 cleared on follow-up without manual repair.
A private off-host recovery archive passed isolated extraction and checksum/JSON
validation. Weekly backups are configured, but no first automatic restore point
exists yet; full-machine restoration remains untested.
These hosting results do not close the separate product gates below.

## Implemented and locally verified

| Work | Acceptance | Evidence |
| --- | --- | --- |
| Results and comparisons | Hotel previews lead; clue values expandable; 12 offers per page; eight comparison rows per batch; view-only actions use no upstream requests | Production browser fixtures and live family search |
| Candidate details | Photos and facts lead; original total and advertised room-rate discount are distinct from retail; independent quote/offer expiry | Fee expiry/refresh tests plus real API and browser checks |
| Rejected selection recovery | Only the original affected shortlist is invalidated; newer responses survive | Native reducer and browser regression tests |
| Accessibility gaps | Named calendar controls; keyboard/error focus; non-jumping travelers; narrow layout checks | 288 browser cases covered across four configurations; manual AT still open |
| Capacity and monitoring | Bounded HTTP admission in addition to provider queue; app/provider-readiness monitor uses no inventory | Stub workload, HTTP tests and health-check tests; Linux sizing still open |
| Local performance | Same-dimension mobile hero compressed; production text assets encoded; home-only preload | Current LCP runs 2.272/2.088/2.200s; CLS 0.0009533; no field percentile claim |

## Next autonomous engineering gates

- Finish hosted performance/sizing evidence; local stub memory does not prove the VPS budget.
- Carry forward the explicit cached-burst health-latency limit rather than calling it solved.
- Keep the current dependency reachability disposition in DEPENDENCY_REVIEW.md aligned with code.
- Confirm the first automatic backup and retain the full-machine restoration
  limitation in [the deployment record](LIVE_DEPLOYMENT.md).
- Produce current responsive screenshots, walkthrough and concise case study after
  the actual product flow is polished and measured.

## External prerequisites

- Hosting and domain ownership are established for the recorded Hostinger release.
  Further purchases and releases require the applicable user direction.
- Manual VoiceOver/Safari, physical mobile browsers and the 3–5 first-time-user
  usability gate remain explicit. Do not substitute automated scores for them.
- Provider permission remains unverified, but the user removed it as an
  implementation prerequisite. Preserve that decision and the documented facts.

Each milestone needs a skeptical review, proportional verification and a coherent
commit. Update this record and ACCEPTANCE.md with observed evidence, not projected
scores or inflated completion claims.
