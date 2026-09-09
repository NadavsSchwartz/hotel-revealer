# Dependency security disposition

Updated **2026-09-09 UTC** for the TypeScript modernization. Exact versions come
from the root workspace lockfile; audit results describe known advisories for
that graph at the recorded time. They do not establish application security,
provider permission, or hosted behavior.

## Current dependency graph

Use Node **24.20.0** and npm **11.19.0**. The pinned container base is unchanged.

| Dependency | Version / disposition |
| --- | --- |
| React / React DOM | 19.2.8 / 19.2.8; unchanged |
| React Router DOM / resolved React Router | 7.18.3 / 7.18.3; unchanged |
| React Redux / Redux / Redux Thunk | 9.3.0 / 5.0.1 / 3.1.0; existing reducer and thunk lifecycle retained |
| `@daypicker/react` | 10.0.1; unchanged |
| Vite / React plugin | 8.2.2 / 6.1.1; unchanged |
| Express / resolved `qs` | 5.2.1 / 6.16.0; root `qs` override retained |
| dotenv | 17.4.2; explicit quiet loading and existing environment precedence |
| ESLint / `@eslint/js` | 10.10.0 / 10.0.1 |
| React Hooks lint plugin | 7.1.1 |
| `eslint-plugin-react` | Removed; its two JSX-reference rules are redundant with ESLint 10 |
| TypeScript / `typescript-eslint` | 6.0.3 / 8.70.0 |
| `@types/react` / `@types/react-dom` | 19.2.18 / 19.2.7 |
| `@types/node` / `@types/express` | 24.13.3 / 5.0.6 |
| Playwright / Axe integration | 1.63.0 / 4.13.0; unchanged |
| Ant Design / Moment / `rc-select` override | Remain removed |

Current lockfile SHA-256:
`5f2b6ec764ddef2beca76403136a295f7b05c30e0f1d94d48a553ff9b7c2e5ae`.
Full and production-only audits recorded on 2026-09-09 UTC report **zero findings
at every severity** for this graph. Reports:
`output/verification/modernization/final-audit-all.json` and
`output/verification/modernization/final-audit-production.json` (ignored).
Earlier `dependencies-audit-*.json` reports in that directory describe the
JavaScript dependency checkpoint, before TypeScript dependencies.

## Compatibility decisions — 2026-09-09

- **TypeScript 6.0.3:** the installed `typescript-eslint` and parser 8.70.0 declare
  `typescript: >=4.8.4 <6.1.0`. Stay inside that supported peer range. Revisit when
  the selected parser declares support for a newer compiler, then verify the
  compiler, typed rules, native server execution, and browser build together.
  Do not force peer dependencies or install a parallel compiler.
- **ESLint 10:** it tracks JSX references itself, so the old React plugin and
  stale React-version setting are removed. The Hooks plugin and TypeScript ESLint
  both declare ESLint 10 support. Revisit if future rules require that plugin or
  the supported peer ranges change. See the [ESLint migration guidance](https://eslint.org/docs/latest/use/migrate-to-10.0.0#jsx-references-are-now-tracked).
- **Native backend TypeScript:** Node 24 strips erasable types and preserves the
  source layout. There is no backend compiler output, loader, or additional
  runtime dependency. Strict no-emit typechecking is mandatory in `npm run check`;
  runtime validation remains at external boundaries. Configuration and maintenance
  scripts stay JavaScript where appropriate, and the independent legacy matching
  reference retains its original implementation with a narrow declaration.
  The pre-paint browser theme script remains plain JavaScript because Vite copies
  it unchanged. Existing shell/Python deployment checks retain their runtimes;
  application modules and Node/Playwright test suites are TypeScript.
- **Express 5:** the root-inclusive SPA wildcard and startup error callback were
  migrated explicitly. A failed bind emits a structured failure and cannot emit
  `server_started`. Compression fallthrough, JSON limits, static responses, and
  health behavior have focused checks. See the [Express migration guide](https://expressjs.com/en/guide/migrating-5/).
- **`qs` 6.16.0:** retain the existing patched override. The application parses
  destination query input with `URL` and does not introduce Express query parsing
  or URL-encoded bodies during this migration. Revisit the override when the
  resolved graph and advisory review justify its removal.

## Verification and remaining limits

Strict typechecking, lint, **291 native tests**, the production build, and
**436 browser executions** (109 scenarios across four configurations) passed
for the code committed as `6c3a9ad`. A clean production-only local snapshot also
started the native TypeScript server without compiler, lint, Vite, or test files;
health, static/API routes, reviewed synthetic state reset, restart, and graceful
shutdown passed. Development startup and its Vite proxy passed separately.
A subsequent clean development `npm ci` and full check passed; all 46 generated
build files matched the browser-tested build byte-for-byte. The optional macOS
`fsevents` install-script notice did not block installation or loading its native
binding. Measured catalog-import and heap costs are recorded in the
[acceptance evidence](ACCEPTANCE.md#modernization-performance-comparison); no runtime
speedup is claimed. Docker execution, deployed
behavior, physical devices, and manual assistive-technology checks remain
separate gates. A dependency audit cannot replace those checks.

Continue coordinated updates through reviewed manifests and lockfile changes.
Do not use `npm audit fix --force` or independently override Router majors.

## Historical audit baseline (`6bf14b2`)

The pre-modernization lockfile had SHA-256
`44980cd109e4f0a8beeae7e3d11f965392289615af322aa8b282f68d11b0e85d`.
Full and production-only reports recorded on 2026-09-09 UTC contained zero
findings at every severity:
`output/verification/remediation-20260909/integration-audit-all.json` and
`output/verification/remediation-20260909/integration-audit-production.json`.
Those reports apply only to that earlier graph.

That baseline already used React Router 7.18.3 and `qs` 6.16.0 following reviews
of [the Router redirect advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6),
[the Router SSR advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg),
and the `qs` advisories [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx)
and [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).
Routing remains declarative `BrowserRouter`, with no SSR, hydration, generic URL
proxy, or new router data-loading surface. Fixed local routes, encoded query
values, and validated HTTPS provider handoffs remain application boundaries.
