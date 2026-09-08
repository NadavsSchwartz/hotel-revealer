# Remaining release work

The goal is the public portfolio product defined in the agreed plan. Restoring a
live request is a milestone, not completion. Current application milestone: `4dd2217`,
with the browser audit corrections recorded in AUDIT_FIXES.md and pricing
integration retained from `62a47df`. See ACCEPTANCE.md for current evidence.

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
- Verify deployment artifacts, setup and rollback to the strongest locally available
  evidence; retain exact limitations where no container/host is available.
- Produce current responsive screenshots, walkthrough and concise case study after
  the actual product flow is polished and measured.

## External prerequisites

- Hosting/domain ownership and purchase choice are not established; do not purchase
  or push without the required user direction.
- Manual VoiceOver/Safari, physical mobile browsers and the 3–5 first-time-user
  usability gate remain explicit. Do not substitute automated scores for them.
- Provider permission remains unverified, but the user removed it as an
  implementation prerequisite. Preserve that decision and the documented facts.

Each milestone needs a skeptical review, proportional verification and a coherent
commit. Update this record and ACCEPTANCE.md with observed evidence, not projected
scores or inflated completion claims.
