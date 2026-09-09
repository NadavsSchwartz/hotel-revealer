# Dependency security disposition

**Migration in progress:** Express is now 5.2.1, dotenv 17.4.2 and ESLint 10.10.0.
The redundant React lint plugin has been removed. Current checkpoint versions and
checks are tracked in [modernization status](MODERNIZATION.md). The audit record
below describes the pre-migration lockfile at `6bf14b2`; it does not certify the
modified dependency graph. Refresh both saved audits when the upgrade is complete.

## Pre-migration baseline (`6bf14b2`)

Updated 2026-09-09 UTC against the current root npm workspace lockfile. The
coordinated React/Router upgrade and removal of Ant Design/Moment supersede the
previous Router 6 exception. This records dependency state and audit evidence;
it is not a penetration test or a claim that the application has no vulnerabilities.

## Resolved versions and audit

The project uses Node **24.20.0** and npm **11.19.0**. The manifests and lockfile pin:

| Dependency | Version / disposition |
| --- | --- |
| React / React DOM | 19.2.8 |
| React Router DOM / resolved React Router | 7.18.3 |
| React Redux / Redux / Redux Thunk | 9.3.0 / 5.0.1 / 3.1.0 |
| `@daypicker/react` | 10.0.1; styled calendar |
| Express / resolved `qs` | 4.22.2 / 6.16.0; retain the root `qs` override |
| Ant Design / Moment / `rc-select` override | Removed |

The current lock SHA-256 is
`44980cd109e4f0a8beeae7e3d11f965392289615af322aa8b282f68d11b0e85d`.
Saved `npm audit --json` and `npm audit --omit=dev --json` reports both contain
**zero findings at every severity**. Local evidence is in
`output/verification/remediation-20260909/integration-audit-all.json` and
`output/verification/remediation-20260909/integration-audit-production.json` (ignored).
The earlier `output/audit/` reports describe the superseded dependency graph.

## Patched findings and retained boundaries

- React Router 7.18.3 is above the 7.18.0 fixes for the previously reviewed
  [open redirect advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6)
  and [SSR error deserialization advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg).
  The affected Router 6 path is no longer installed; no reachability exception is
  needed for those findings.
- The retained `qs` 6.16.0 override resolves the reviewed
  [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) and
  [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)
  findings. Neither appears in the saved current audits.
- React renders with `createRoot`; routing remains declarative `BrowserRouter`.
  The migration adds no data-router, SSR or hydration surface. Internal routes use
  fixed local paths and encoded query values; provider handoffs remain validated
  HTTPS native links. Keep those application boundaries after the library fixes.
- The existing reducer, selectors and thunk request runner remain. Native
  controls and a modal `<dialog>` replace Ant Design, with DayPicker handling the
  calendar. See the [React upgrade guidance](https://react.dev/blog/2024/04/25/react-19-upgrade-guide),
  [Router upgrade requirements](https://reactrouter.com/upgrading/v6) and
  [DayPicker package documentation](https://daypicker.dev/start).

## Verification and maintenance limits

See [ACCEPTANCE.md](ACCEPTANCE.md) for current compatibility, browser and performance
evidence and remaining external gates. Audit results describe
known registry advisories for this exact lockfile at the time recorded; they do
not establish UI behavior, provider permission or hosted security.

Continue coordinated dependency updates through reviewed lockfile changes;
do not use `npm audit fix --force` or independently override Router majors.
ESLint 9 remains for the React plugin's declared peer compatibility; its upstream
support warning is a maintenance item. Container/runtime, hosted and manual
assistive-technology checks remain separate acceptance gates.
