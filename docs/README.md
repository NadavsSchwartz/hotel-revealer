# Documentation

Start with the [project overview](../README.md) for the product, architecture,
local setup, and principal limits. The documents below explain the contracts and
the evidence behind them.

| Document | Use it for |
| --- | --- |
| [Implementation contract](IMPLEMENTATION.md) | HTTP responses, matching, pricing, recovery, and internal boundaries |
| [Provider boundary](../backend/provider/README.md) | Adapter operations, admission, deadlines, caches, and durable control state |
| [Matching study](../scripts/matching-study/README.md) | Preserved raw matching rules, independent reference, and differential replay |
| [Data sources](DATA_SOURCES.md) | GeoNames attribution, snapshot checksums, catalog limits, and controlled refresh |
| [Dependency review](DEPENDENCY_REVIEW.md) | Exact dependency decisions, audit evidence, and compatibility limits |
| [Modernization status](MODERNIZATION.md) | Completed checkpoints, current work, verification, and remaining migration gates |
| [Acceptance evidence](ACCEPTANCE.md) | Revision-specific checks, measurements, historical results, and remaining release gates |
| [Live integration evidence](LIVE_ACCESS.md) | Observed provider behavior, handoff interpretation, and unresolved access risks |
| [Live deployment evidence](LIVE_DEPLOYMENT.md) | Dated public release, exact images, hosted journey, recovery, monitoring, rollback limits, and backup checks |
| [Deployment runbook](../deploy/README.md) | Single-process packaging, VPS setup, health notifications, release procedures, and reviewed state reset |

## Supporting records

- [Legacy PR audit](PR_CLEANUP.md) records why the 78 old dependency PRs are superseded.

- [Audit fixes](AUDIT_FIXES.md) maps reviewed defects to their corrections and checks.
- [Release work](RELEASE_WORK.md) records operational preparation and the remaining gates.
- [Provider research](PRICELINE_PRODUCTION_RESEARCH.md) retains dated external research.
- [Working agreement](../AGENTS.md) defines implementation and review expectations.

Dates and revisions matter: an older passing check is evidence for that revision,
not automatic verification of today's checkout. Local tests, live-provider
observations, container execution, hosted operation, and human usability are
separate claims. Generated logs and captures belong in ignored output directories;
the overview screenshot lives in `docs/media/`.
