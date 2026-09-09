# Modernization status

This document records the modernization checkpoints below. Later container and
hosted launch verification is recorded in [live deployment evidence](LIVE_DEPLOYMENT.md);
earlier statements that deployment was unverified describe those checkpoints.

Starting revision: `6bf14b2`. Scope: presentation, destination response validation,
Express/dotenv/ESLint updates, and TypeScript for application code and automated tests.
No deployment, push, matching change, recovery-key change, or speculative optimization.

## Checkpoints

| Checkpoint | Status | Verification and remaining work |
| --- | --- | --- |
| Presentation | Complete | Current homepage capture, rendered README/Mermaid, 27 links/anchors and 19 ignore cases checked; independent review found no consequential defects |
| Destination responses | Complete | 3 native tests and 16 browser executions passed; existing cancellation/retry preserved; independent review found no consequential defects |
| Dependencies | Complete | Express/dotenv/ESLint verified; 285 native tests, 436 browser executions and both audits passed |
| Shared TypeScript contracts | Complete | Strict contracts and raw/validated input boundaries; independent review findings fixed and retested |
| Frontend and browser tests | Complete | Typed state, refs, view contracts and tests; 436 integrated browser executions passed |
| Backend and remaining tests | Complete | Typed matching/provider/HTTP code and tests; 291 integrated native tests passed |
| Packaging and final evidence | Local checks complete; Docker unverified | Clean installs, local runtime/dev smoke, source-bound measurements and static packaging review passed; Docker execution unavailable |

## Evidence

- Planning baseline at `6bf14b2`: Node 24.20.0/npm 11.19.0; lint, 278 native tests
  and production build passed. This is not evidence for subsequent changes.
- Implementation browser baseline: **420/420 passed in 5.4 minutes**, without
  retries, on the unchanged application at `6bf14b2`. Log:
  `output/verification/modernization/baseline-browser.log` (ignored).
- Homepage screenshot: production build with provider disabled, 1440×1100,
  JPEG 181,341 bytes. Reloaded homepage had no console errors. Local README
  preview loaded the image and rendered the Mermaid diagram successfully.
- Baseline capacity harness passed: peak RSS **332.63 MiB**, sampled heap
  **149.92 MiB**, maximum sampled health latency **80.07 ms**. This is a local
  synthetic comparison, not container capacity proof. Log:
  `output/verification/modernization/baseline-capacity.log` (ignored).
- Destination change: 3/3 focused native tests, focused lint, production build,
  and 16/16 new browser executions passed (four scenarios × four projects).
  The full existing matrix was not rerun at this checkpoint. The next integrated
  matrix includes 109 scenarios (436 executions).
- Express 5.2.1: lint, **282 native tests**, production build and **48 existing
  Chromium/WebKit journey executions** passed. The occupied-port test failed
  before the callback fix (incorrect exit 0) and passes with a sanitized failure
  and exit 1. Existing static tests cover encoding fallback, HEAD, MIME and API
  errors. Logs: `express-check.log`, `express-browser.log`, and
  `startup-express5-before.log` under the ignored modernization output directory.
  The full matrix will run on the completed dependency graph.
- dotenv 17.4.2: lint, **285 native tests**, and production build passed, including
  isolated missing-file, file-value and shell-precedence tests, startup failure,
  and provider reset checks. The shared loader is quiet and runs before app
  modules. Log: `output/verification/modernization/dotenv-check.log` (ignored).
- ESLint 10.10.0 / @eslint/js 10.0.1: lint, **285 native tests**, production build
  and virtual JSX scope checks passed. JSX-only imports remain recognized and
  undefined JSX components are reported. The React lint plugin was removed;
  hooks rules remain. Both saved dependency audits report zero findings for lock
  `41a1760cee6f872a573684aea2aac14f7c887be5a98a3448e3f9a9d195bbb14a`.
- Completed dependency graph: **436/436 browser executions passed in 4.6 minutes**,
  without retries (109 scenarios × four projects). Log:
  `output/verification/modernization/dependencies-browser.log` (ignored).
- Container execution is unverified: no Docker command, Docker Desktop or OrbStack
  installation was found in the standard local locations. Packaging source and
  offline script checks passed; no container success is implied.
- TypeScript integration: **291/291 native tests**, strict checks, type-aware lint
  and production build passed. **436/436 browser executions passed in 3.3 minutes**
  without retries. Logs: `typescript-check.log` and `typescript-browser.log`.
- Compiler coverage: all **94 TypeScript source/declaration files** are included;
  virtual invalid-assignment and implicit-any probes fail as required. No probe
  source was written to disk. Temporary JavaScript allowances are removed.
  `noUncheckedIndexedAccess` remains deferred as agreed.
- Deliberate language exceptions: the static pre-paint theme script, JavaScript
  configuration/operator tools and independent legacy oracle remain unchanged in
  language. Existing shell/Python deployment checks are not ported. Application
  modules and Node/Playwright suites are TypeScript.
- Clean production-only local install: 88 packages installed; compiler/lint/Vite
  packages and test files absent. Native TypeScript startup, readiness, HTML and
  Brotli assets, API 404s, destination lookup, refused/unlocked operator reset,
  restart and graceful stop passed. This was a macOS staged directory, **not a
  Docker image**. Evidence: `runtime-smoke.json` and `runtime-install.log`.
- Root development command: native TypeScript backend, TSX entry and Vite proxy
  passed with the provider disabled; temporary servers were stopped afterward.
  Desktop (1440×1100) and mobile (390×844) production captures were inspected;
  no page errors or horizontal overflow were found. Evidence: `dev-smoke.json`,
  `final-desktop.jpg`, and `final-mobile.jpg`.
- Both final capacity runs passed. Peak RSS was **352.72 MiB** in the first run
  and **319.42 MiB** on committed `6c3a9ad`, versus **332.63 MiB** at baseline.
  Maximum health latency varied from 59.68 to 262.23 ms after migration (80.07 ms
  before). These variations do not establish a fixed RSS change or speedup.
  The committed report identifies `6c3a9ad` with no dirty measured source paths.
- Five alternating fresh-process catalog imports compared `2cf7f32` JavaScript
  with `6c3a9ad` TypeScript on Node 24.20.0, using a warm filesystem. Median import
  time rose **1292.57 → 1642.06 ms**; heap after forced GC rose **76.04 → 80.05 MiB**.
  This includes native type stripping and the added catalog validation, excludes
  Node process bootstrap, and does not isolate individual costs or hosted startup.
- All generated JS/CSS assets changed from **148,602 → 150,029 Brotli bytes**.
  This is the complete asset set, not cold-page transfer. Measurements and limits
  are recorded in `performance-comparison.json` and `startup-comparison.json`.
- A clean development `npm ci` succeeded, followed by strict checks, type-aware
  lint, **291/291 native tests** and the build. All **46 build files** exactly
  match the build used by the passing 436-execution browser matrix. The optional
  native watcher binding also loads. Evidence: `clean-install.log`,
  `clean-install-check.log`, and `clean-install-build.json`.
- Existing untracked `sketches/hidden-name/` and `sketches/open-secret/` belong to
  unrelated work and remain untouched.

## Review and commits

Each substantial checkpoint receives an independent skeptical review before its
commit. Record concrete findings, their resolution, the actual checks run and any
unverified gate below. Keep dependency and behavioral changes separate.

- `85d2aa5`: presentation, current screenshot, docs navigation and ignore cleanup.
  Independent review found no consequential defects.
- Destination review found no consequential defects. The validator proves the
  consumed UI destination fields, not unchecked backend-only fields; preserve
  that distinction when introducing TypeScript.
- `054428f`: destination validation and focused regression tests.
- Express review found no consequential defects in startup cleanup, wildcard
  routing, the locked dependency changes or the regression test.
- `d8c4f2d`: Express upgrade and startup binding failure handling.
- dotenv review found no consequential defects in load order, documented `.env`
  behavior, quiet logging or test isolation.
- `6b270cb`: dotenv upgrade and quiet environment initialization.
- ESLint review found no consequential defects. Frontend changes only remove
  unused React imports; production dependencies did not change in this step.
- `2cf7f32`: ESLint 10 and redundant React lint plugin removal.
- Shared/domain review caught inherited `hotelId` inclusion; the own-property
  condition was restored and regression-tested. Error class fields use `declare`
  to preserve runtime property order. A narrow sparse-array amenity validation fix
  rejects an invalid non-JSON array consistently; valid matching behavior is unchanged.
- Independent frontend, provider, HTTP and refreshed packaging reviews found no
  remaining consequential defects. Browser view types preserve nullable ratings
  and existing object-form image/amenity fallbacks separately from producer types.
- `6c3a9ad`: strict TypeScript application/tests, native runtime entrypoints,
  request/response contracts and filtered runtime packaging.
- Closing independent review verified test/audit counts, lock and build hashes,
  staged runtime source binding, performance figures and remaining gates. No
  consequential findings remained; language-exception wording was clarified.

## Remaining release gates

Local implementation and verification are complete. Run the Docker build and
image smoke checks on a machine with Docker before release. Hosted deployment,
live-provider/known-outcome validation, physical devices and manual accessibility
remain separate, unverified release gates. No push or deployment was performed.
