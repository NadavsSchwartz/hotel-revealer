# Dependency security disposition

Reviewed 2026-09-07 America/Los_Angeles (2026-09-08 UTC), against the root npm
workspace lock and the current traveler UI, including the uncommitted results
and details changes. This is a source-level dependency review, not a penetration
test or a claim that the application has no vulnerabilities.

## Fresh audit and installed versions

Node **24.20.0** and npm **11.19.0** ran both `npm audit --json` and
`npm audit --omit=dev --json` against the registry, without installing packages
or changing the lockfile. Both completed with exit code 1 and reported **two
moderate package findings, zero high and zero critical**. There are two distinct
advisories on `react-router`; npm also reports the affected dependent
`react-router-dom`. These are not four separate vulnerabilities. The full audit
reported no additional development-only finding.

The installed production dependency path is
`hotel-revealer-frontend → react-router-dom@6.30.6 → react-router@6.30.6`, with
`@remix-run/router@1.23.4`. These libraries are browser runtime dependencies,
not merely build tools. The backend does not import them. The production image
also installs workspace production dependencies, so omitting development
packages does not remove these findings.

The current lock SHA-256 is
`127ededb3ee7f496928541c1b3769de0e1c006066b635dfc47707f5b4fc3d066`.
Ignored local evidence is in `output/audit/current-all.json`,
`current-production.json`, `current-installed.json`, `current-meta.json`, and
`current-url-checks.json`. Metadata includes Node/npm versions, review time,
HEAD and hashes of reviewed source files. The older `npm-audit.json` predates
the `qs` fix and must not be used as the current result.

| Advisory | Upstream facts | Current disposition |
| --- | --- | --- |
| [GHSA-wrjc-x8rr-h8h6 / CVE-2026-53669](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6) | Moderate; published July 22, 2026, database updated July 23; affected React Router `>=6.0.0 <7.18.0`, patched in `7.18.0`. Attacker-controlled navigation paths can become external navigations. | **Affected dependency, mitigated at current application callsites.** Navigation APIs are used, but no reviewed callsite accepts an attacker-supplied destination path. Conditions and remaining browser checks below. |
| [GHSA-337j-9hxr-rhxg / CVE-2026-53666](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg) | Moderate; published July 22, 2026, database updated July 23; affected `>=6.4.0 <7.18.0`, patched in `7.18.0`. It requires SSR error hydration with attacker-controlled serialized error properties. The maintainer excludes declarative routing. | **Unreachable in the reviewed application entrypoint.** The required hydration call chain is absent; this is established from the actual imports and installed source, not from a general SPA assumption. |

## Reachability evidence and retained constraints

**Open redirect:** installed `react-router-dom/dist/index.js` uses an absolute-URL
test at line 723 that does not include mixed slash/backslash prefixes. Installed
`@remix-run/router/dist/router.js` also falls back from failed `pushState` to
`window.location.assign` at line 383. Those library paths explain why an
arbitrary destination passed to `Link` or `navigate` would be unsafe here.

The application currently restricts that input before it reaches the library:

- [SearchForm.jsx](../frontend/src/traveler/SearchForm.jsx) validates trip fields
  before calling `navigate(searchUrl(context))` (lines 42–54).
  [context.js](../frontend/src/traveler/context.js) `searchUrl` encodes values
  with `URLSearchParams` (lines 56–62). Its path argument comes only from the
  default `/results` or the literal `/deal` at current callsites; validation
  alone is not the redirect mitigation.
- [Results.jsx](../frontend/src/traveler/Results.jsx) uses fixed `/results?`
  destinations for canonicalization, sorting, expansion and pagination. Candidate
  navigation uses the literal `/deal` with encoded offer/hotel IDs. Provider
  labels and IDs cannot replace the pathname.
- [Details.jsx](../frontend/src/traveler/Details.jsx) checks history-provided
  `resultsUrl` for the `/results?` prefix and matching travel context, then
  reconstructs it as `/results?` plus fresh `URLSearchParams` (lines 105–115).
  Back, edit and refresh all use this reconstructed value. Canonicalization
  uses the literal `/deal?`. It does not navigate directly to arbitrary history
  state or to a `next`, `redirect`, or `returnTo` query parameter.
- Remaining router links in `App.jsx`, `Home.jsx`, and `Brand.jsx` have fixed
  local destinations. `PageBehavior` uses location hashes for element lookup,
  not navigation or HTML insertion. No server `res.redirect`, route loader,
  route action, or router `redirect()` consumes request input.
- [components.jsx](../frontend/src/traveler/components.jsx) `ProviderLink` uses
  a native anchor, not React Router. `safeHref(value, true)` parses before
  enforcing HTTPS, exact Priceline host, no credentials and no non-default
  port. Backend `safeHandoffUrl` imposes the same host boundary; the live adapter
  constructs the original-offer URL from validated IDs and travel fields.

One related hardening point was identified outside the Router advisory:
`App.jsx`'s error-boundary reload anchor used raw `pathname + search`. If the
current same-origin pathname begins `//`, that relative href resolves to an
external host when the error boundary renders. No attacker-triggerable render
failure was established. Use the complete current `window.location.href` or a
reload button to keep this recovery action bound to the current document;
verify this before treating all navigation sinks as covered.

**SSR constructor injection:** [index.jsx](../frontend/src/index.jsx) calls
`ReactDOM.render` with `BrowserRouter` (lines 10–17), and
[App.jsx](../frontend/src/App.jsx) declares `Routes`/`Route` elements.
Installed `react-router-dom/dist/index.js` places `deserializeErrors` behind
`parseHydrationData` and `createBrowserRouter`/`createHashRouter` (lines 221–281).
Its `BrowserRouter` implementation (lines 609–647) creates browser history and
does not call that chain. Application sources import neither data-router
factory, SSR/hydration API nor static router; the Express server sends static
HTML and JSON. There is no server-serialized router error state. An eventual
SSR/data-router migration invalidates this disposition and requires a patched
router before that feature ships.

## Resolved findings and update decision

The installed server path is `express@4.22.2 → qs@6.16.0`, also shared by
`body-parser@1.20.6`. `npm ls` confirmed the root override actually resolves to
6.16.0, rather than only appearing in the manifest. That version fixes
[GHSA-x5fp-wj9c-mxmx / CVE-2026-82562](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx)
and [GHSA-4mjr-xmp4-gh2g / CVE-2026-82417](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g),
both published August 29, 2026 and updated September 2. The former affects
6.14.2–6.15.3; the latter affects 2.2.5 through versions below 6.16.0.
Neither is present in the fresh audit. This is **patched**, not an exception
based on guessing that Express never parses untrusted input.

Retain the current router major for this release only while the fixed-path
constraints remain true and the focused checks pass. Audit still returns
nonzero; do not describe it as clean. npm suggests `react-router-dom@7.18.3`,
a major update. Do not use `npm audit fix --force` or override transitive router
majors independently. A coordinated router/runtime upgrade should have its own
compatibility review. Revisit immediately if adding arbitrary redirects,
external router links, configurable route bases, data routers, or SSR.

## Focused verification

The review ran 25 Node-level checks against the actual `searchUrl`,
`contextFromSearch`, `validIdentifier`, and `safeHref` helpers: mixed slash and
backslash prefixes, scheme URLs, encoded prefixes, query/hash injection,
lookalike hosts, credentials, ports, and a valid Priceline link. All passed.
These prove helper behavior; they do not replace rendered browser checks.

Using the existing production-build Playwright configuration with
`HOTEL_PROVIDER=disabled`, rerun the existing ambiguity/detail/back journey,
offsite-handoff rejection, rejected-candidate binding, and 336-character offer
ID journey. For example:

```sh
npm run test:browser -- --project chromium --grep 'offer ambiguity|upstream labels|rejected relationship|336-character'
```

Add only a focused navigation case to those existing fixtures: seed a malicious
history `resultsUrl` containing `//`, `/\\`, or a scheme and confirm Back stays
on this origin's `/results` with the original validated trip; include malicious
query values and confirm candidate links keep their fixed pathname. Reject
lookalike, credential-bearing and mixed-backslash handoff hosts with no offsite
navigation. Check the error-boundary reload separately after its narrow fix.
These browser extensions were **not run by this dependency review** and remain
part of the release verification, not evidence already obtained.

No package, application source, build artifact, or lockfile was changed by this
review. No live provider request was made.
