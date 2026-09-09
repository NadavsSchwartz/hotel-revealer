# Priceline production access research

Researched September 8, 2026 Pacific / September 9 UTC. Local code inspected at
`5bc19a2`. Research and recommendations only; application behavior was not changed.

**Subsequent implementation:** the approved hardening work is now implemented
locally. Non-HTML 503s and narrowly recognized stock nginx error pages use durable
maintenance backoff; unknown HTML remains blocked. Diagnostics are allowlisted,
outstanding requests are bounded to four per client/eight globally, and new
upstream admissions have a four-call burst with one allowance per ten seconds.
Cached/shared work does not spend upstream allowance. Usable fallback responses
carry retry information through the UI without losing the failure reason.
See [the provider contract](../backend/provider/README.md) and
[the deployment identity boundary](../deploy/README.md).

Verification: Node 24.20.0 lint, all 245 automated tests and production build passed;
26 Chromium desktop/mobile browser recovery cases passed with synthetic APIs.
An independent review's subscriber-fairness, burst-size and non-JSON 503 findings
were fixed and rechecked. Caddy/Compose settings were inspected and Compose parsed,
but Caddy/Docker execution and hosted provider behavior remain unverified. No
dependencies, automated retries, partner accounts or deployment were added.
The research observations below describe the pre-hardening implementation.

## Decision

The present adapter can become more resilient, especially during upstream failures
and public traffic bursts. I found no evidence that copying browser headers,
cookies, or a different open-source scraper would turn the consumer GraphQL
endpoint into a dependable production integration.

The supported route is Priceline Partner Solutions, subject to eligibility and
approval for the actual product. This is a material qualification: obtaining an
API key does not establish permission to identify opaque hotels before booking.
Do not spend weeks migrating before confirming that requirement.

For the current adapter, prioritize failure classification, server-request
admission, and useful diagnostics. Keep the combined inventory query, bounded
work, exact trip keys, and on-demand pricing. No new dependency, browser fleet,
proxy service, Redis deployment, or provider rewrite is justified by this research.

## What is already implemented

| Current behavior | Evidence | Assessment |
| --- | --- | --- |
| Fixed HTTPS consumer GraphQL endpoint, JSON POST, explicit operation names, no supplied cookies/auth, redirects rejected | `backend/provider/priceline.js:9,302–331` | Small, controlled request boundary. This is not the partner API. |
| Retail and opaque rows together: `RTL` + `SOPQ`, 500 rows/page, maximum three pages | `priceline.js:334–359`; `service.js:140–221` | Already avoids separate city searches and per-result detail calls. |
| One active upstream call, at least one second between starts, four waiting slots | `backend/provider/scheduler.js:9–93` | Preserve until actual supplier allowances and latency evidence justify changes. |
| Five-minute search cache; one-minute detail/total cache; identical in-flight work shared | `backend/provider/service.js:11–59,251–261` | Core caching and deduplication already exist. |
| Issued offers retain their original context for up to 30 minutes, permitting direct quote refresh | `service.js:214–218,289–359` | Avoids repeating a city search just because a price expired. |
| Search/detail admission deadlines of 20/10 seconds, streamed response size limit, abort handling | `service.js:279–297`; `priceline.js:114–161` | Good protection against slow or oversized responses. |
| Cooldown persists across restart; challenge stops further traffic | `service.js:72–138`; `backend/provider/state.js` | Useful protection, but classification is too coarse in specific cases below. |

The recorded 500-row Las Vegas response returned all 371 rows, including 100
Express offers, in 4.583 seconds and approximately 332 kB. The earlier 100-row
response contained only two Express offers. These are historical local observations
in `docs/LIVE_ACCESS.md:71–89`, not a controlled benchmark, a worldwide page-size
guarantee, or production availability evidence.

At that illustrative 4.583-second latency, a serialized worker has a theoretical
ceiling near 13 upstream calls/minute before other overhead. Multi-page searches
and details share that capacity. A one-second start gap does not mean 60 completed
searches/minute. Actual capacity depends on cache reuse and upstream latency.

## Official access: better support, unresolved product fit

Current primary sources include the public
[PPS API implementation guide](https://docs.pricelinepartnersolutions.com/pps-api/docs/implementation-overview),
[rate information](https://docs.pricelinepartnersolutions.com/pps-api/docs/rate-information),
and [PPS One distribution conditions](https://docs.pricelinepartnersolutions.com/pps-one/docs/distribution-conditions).
The documentation was readable in a browser even when the web extraction tool
failed. It should not be described as entirely login-gated.

There are two relevant supported server surfaces:

- **PPN / Unified Express Path:** onboarding-issued `refid` and `api_key`, with
  production `https://api.rezserver.com/api/hotel/` and a separate sandbox. Keep
  credentials exclusively on the server and out of logged request URLs.
  [Implementation guide](https://docs.pricelinepartnersolutions.com/pps-api/docs/implementation-overview).
- **PPS One:** GraphQL hotel availability, with gRPC also documented. OAuth client
  credentials produce 60-minute bearer tokens; Priceline recommends reusing a
  token for at least 45 minutes instead of generating one for every request.
  Coordinate refreshes in the existing server process, without a new service.
  [Authentication](https://docs.pricelinepartnersolutions.com/pps-one/docs/authentication),
  [availability](https://docs.pricelinepartnersolutions.com/pps-one/docs/availability).

The implementation guide recommends `Express.Availability` for the cheapest rate
per hotel when all room rates are unnecessary; `Express.Results` retrieves a
broader rate set. This is a documented efficiency option for a partner integration,
not an option that can simply be substituted into the current consumer query.
The `Express.*` method namespace does not establish access to the consumer
Express Deals product. Partner rate documentation also uses `rate_limit` for a
response rate-count limit; that is not a requests-per-second allowance.

Other concrete capabilities worth preserving in a future approved adapter:

- PPN documents up to 1,000 hotel IDs in a search and one city per request. This is
  an allowed batch size, not a reason to always request the maximum.
  [FAQ](https://docs.pricelinepartnersolutions.com/pps-api/docs/frequently-asked-questions).
- PPS One permits a static property/unit catalog, recommends weekly refreshes in
  batches of 100, and documents handling merged/removed IDs. This does not grant
  the same lifetime to rates, availability or identity inferences.
  [Offline content](https://docs.pricelinepartnersolutions.com/pps-one/docs/offline-content).
- PPS One supports limits and sorting at nested property/unit/rate levels. Select
  only necessary fields instead of copying the full example query.
  [Availability](https://docs.pricelinepartnersolutions.com/pps-one/docs/availability).
- PPN provides partner deep links through `hotel_data.external_urls`, retaining
  dates and occupancy. Its guide warns that destination pricing can change. This
  could support an approved named-hotel referral product, but changing to that
  product is a separate decision. [Deep-link guide](https://docs.pricelinepartnersolutions.com/pps-api/docs/deep-link-guide).

PPS One documents distribution restrictions for private rates. In particular,
its Opaque Property condition keeps the property name concealed until after
booking. Consequently, ordinary partner access is not evidence that Hotel
Revealer's pre-book identification feature is supported. Consumer terms separately
prohibit automated attempts to identify Express Deals/Pricebreaker suppliers in
section 3.2.5, and restrict scraping, disguised-origin headers and deep links in
section 2.2. This is a concrete access-continuity risk; this report does not assess
legal enforceability. [Priceline terms](https://www.priceline.com/static-pages/terms_en.html).

The [official status page](https://status.pricelinepartnersolutions.com/) distinguishes
partner search, pre-book and booking components, including partner GraphQL. It
records real supplier incidents, such as limited availability searches on September
3, 2026. This supports the value of an operational support channel, not a claim of
an SLA or outage-free service. It does not establish the status of the consumer
`/pws/v0/pcln-graph/` endpoint.

Official onboarding requires an account, issued credentials and certification
before selling inventory in production. The current application includes API,
private-label and deep-link choices, a prelaunch/no-website option and a 0–10
daily-volume range. Those options establish that an inquiry is possible, not
automatic acceptance. No official public fee, minimum-booking threshold, SLA or
HTTP quota schedule was verified. Do not adopt third-party claims such as a
five-bookings-per-day minimum as fact.
[Getting started](https://pricelinepartnersolutions.com/getting-started),
[partner application](https://pricelinepartnersolutions.com/become-a-partner).

Before implementation, get written answers to these specific questions:

1. Is a public app that identifies an Express Deal hotel before booking permitted?
2. Which API supplies that exact opaque inventory, its identifiers and a supported
   handoff URL? Are the matching fields available with equivalent semantics?
3. Is a referral-only, open-source app eligible, or is an integrated booking flow
   and certification required? Which of PPS API / PPS One applies?
4. What are the contracted concurrency, traffic, cache/storage, attribution,
   minimum-volume and commercial conditions? Are sandbox access and change notices
   available?
5. Does pricing preserve aggregate rooms/adults/child ages, requested currency,
   property fees and the same rate through the handoff?

No inquiry was sent, account created, subscription purchased, or commercial term
assumed. An API migration requires a capability check, not just a different URL.

## GitHub and commercial alternatives

| Project | What was actually found | Recommendation |
| --- | --- | --- |
| [OpenTabs Priceline plugin](https://github.com/opentabs-dev/opentabs/tree/main/plugins/priceline) | MIT; hotel search added March 10, 2026, API helper changed May 2. Uses the same consumer GraphQL endpoint from an authenticated user browser tab. | Best recent source reference; not a drop-in anonymous server client. Repository activity is not a production reliability measurement. |
| [Scrapeless examples](https://github.com/diegopzz/scrapeless-scrapers/tree/main/priceline-scraper) | Actual Node/Python browser extraction, added May 20, 2026. Depends on a paid cloud browser; sample search contains 30 rows. | Useful SSR/GraphQL extraction example. No demonstrated complete Express inventory, identity accuracy or sustained availability. License not established. |
| [Oxylabs Priceline scraper](https://github.com/oxylabs/priceline-scraper) | Examples calling a paid universal HTML-fetching API; last pushed April 2, 2026. | Outsources fetching; parsing, schema drift and product fit remain. Not an open implementation of a supported Priceline API. |
| [Happy Endpoint Priceline API](https://github.com/happyendpointhq/priceline-api) | MIT documentation for a RapidAPI reseller, explicitly unaffiliated with Priceline. README revised August 12, 2026; backend implementation absent. | Evaluate only with a representative sample and contractual answers. No documented Express Deals identity guarantee or verified licensed-access claim. |
| [priceline-python](https://github.com/nderkach/priceline-python) | Explicit unofficial flight proof of concept; last pushed January 3, 2015; old mobile headers. | Historical only. Not a production hotel client. |
| [Deconnecting script](https://github.com/iambodha/Deconnecting/blob/main/Backend/DataCollection/Scripts/LocationStays/extractStays.py) | April 2024 source with copied browser/session metadata, a fixed client version, persisted query hash, `first:10000`, concurrent workers and no request timeout. | Counterexample. Do not copy its credentials/session metadata or infer that its request recipe is reliable. |

OpenTabs' [hotel search](https://github.com/opentabs-dev/opentabs/blob/main/plugins/priceline/src/tools/search-hotels.ts)
uses `RTL` + `SOPQ`, 30-row offset pagination and extra content such as images and
map/filter information. Reducing our pages to 30 under the existing three-page cap
could lose the comparison set and Express inventory. Its
[API helper](https://github.com/opentabs-dev/opentabs/blob/main/plugins/priceline/src/priceline-api.ts)
reads tokens from the user's browser and explicitly reports
`PERSISTED_QUERY_NOT_FOUND` when a client deployment invalidates a stored hash.
Those tokens are not evidence that anonymous calls universally require login.

Scrapeless' [implementation](https://github.com/diegopzz/scrapeless-scrapers/blob/main/priceline-scraper/browser/nodejs/priceline.mjs)
reads Apollo SSR data; retail details can fall back to captured GraphQL responses.
That avoids redundant fetching if a browser is already necessary. It also adds
fixed waits, browser-session setup and provider dependencies. We do not currently
need those costs to obtain the same class of response.

The [MrBridge Apify actor](https://apify.com/mrbridge/priceline-hotel-scraper)
advertises 15–25-second searches, which overlaps or exceeds our entire 20-second
search budget before queuing. Its displayed pricing and README pricing disagree,
so neither should be treated as a settled quote. Its input describes adults per
room and currency conversion, which need explicit compatibility checks against our
aggregate-occupancy and provider-currency contract. These are vendor statements,
not measurements performed here. A hosted JSON response alone does not prove
the fields, licensing, latency or pricing parity that this app needs.

No representative project reviewed demonstrated long-term availability for a
public backend identifying Express Deals. An empty issue search is not proof of
reliability, and a source-code license does not grant rights to Priceline data.

## Header and transport recommendations

| Proposal | Verdict |
| --- | --- |
| Keep `Content-Type: application/json`, explicit operation name and JSON body | Correct for this client; already implemented. |
| Copy Chrome `User-Agent`, `sec-ch-ua`, `Origin`, `Referer`, browser cookies or session metadata | No demonstrated stability benefit. Introduces identity/session coupling and potentially personalized prices. Never forward users' incoming cookies or authorization to Priceline. |
| Add `?gqlOp=...` because another client does | Observed in OpenTabs, but no evidence it improves success rate or latency. Our body already identifies the operation. |
| Switch to a persisted-query hash | Smaller request, additional coupling to Priceline client deployments. Keep inline queries without measured reason to change. |
| Set `Connection: keep-alive` or create an HTTP agent for every call | Do not do this speculatively. Node fetch uses Undici's dispatcher; response consumption/cancellation and actual connection behavior matter more than copying a header. |
| Add `Accept: application/graphql-response+json, application/json` | Standards-aligned compatibility experiment, low priority. Verify endpoint behavior and non-2xx JSON handling first; not an anti-blocking fix. |
| Switch POST to GET or assume HTTP cache validators work | No endpoint-specific evidence. Retain POST and the existing application cache. |

The [GraphQL HTTP guide](https://graphql.org/learn/serving-over-http/) explains
media negotiation and partial errors. [Undici documentation](https://github.com/nodejs/undici)
explains the dispatcher and the need to consume or cancel response bodies. Our
adapter already cancels rejected responses and limits streamed JSON. A custom
transport dependency should follow a measured transport problem, not precede one.

## Concrete changes, in priority order

### 1. Classify failures accurately and respect maintenance backoff

`priceline.js:318–329` handles `Retry-After` only on 429. A 503 JSON maintenance
response with that header becomes a generic failure and creates no cooldown.
The header also applies to 503. Reuse the existing persistent cooldown machinery
with an explicit temporary-unavailability classification; do not misreport every
maintenance response as rate limiting. [HTTP semantics, Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3).

The same branch classifies any HTML content type as a challenge before checking
ordinary HTTP failure status. Thus a generic HTML 502/503 disables the provider
indefinitely, clearing caches and requiring an operator reset. Separate confirmed
access denials, known temporary upstream failures and unknown interstitials.
HTML 5xx can itself be an anti-bot response: do not indiscriminately make all 5xx
retryable. Keep unknown/denied access stopped pending classification; use a bounded
temporary circuit only for evidence-backed transient failures. A 503 wait header
does not override evidence of a challenge.

Do not start with a generic retry library. One upstream call per adapter method
is an existing contract. If evidence later justifies a single retry for read-only
queries after a transient transport failure, schedule it centrally within the
original deadline, queue and call budget. Never retry 401/403/challenges, schema
errors or invalid selections, and never multiply frontend and backend retries.

### 2. Close admission gaps before raising concurrency

`backend/app.js:57–75` limits eight simultaneous HTTP hotel operations globally;
the provider scheduler bounds upstream calls. Neither is per-client fairness.
One caller can continuously submit distinct valid trip combinations, defeat cache
reuse and occupy the scarce queue. Add a small, bounded admission budget for
expensive work, preserving shared results and cheap cache hits where practical.
Use a trusted client identity at the actual reverse-proxy boundary, with short
retention and no raw-IP logging. Do not blindly trust `X-Forwarded-For` or assume
an IP is one person.

There is a more specific disconnect gap: the HTTP slot is released on close,
while `hotelController.js:7` continues awaiting the service. Each coalesced caller
gets a `structuredClone` continuation in `service.js:251–261`. Repeated callers
that disconnect can accumulate waiters on a slow shared search beyond the stated
eight-operation cloning budget. Bound the lifetime/count of service subscribers
or keep their admission slot until work settles. One departing subscriber must
not cancel a shared request still needed by another. This is source-backed review;
a sustained abort/flood reproduction was not performed.

Cold detail requests can also trigger a complete city search before rejecting an
unknown offer (`service.js:299–309`). Preserve legitimate reload/recovery behavior,
but include this path in the expensive-work budget.

### 3. Add diagnostic categories that can guide a fix

Current logs already include duration, queue depth, cache reuse, page and upstream
call counts, safe stack locations and controlled public outcomes. Extend them with
bounded operation, HTTP status, content-type category and allowlisted GraphQL
error codes/paths. Right now a schema validation error and many transport/server
failures collapse to `PROVIDER_UNAVAILABLE` (`priceline.js:148–151,327–329`).
Paths here mean a fixed internal category for a known operation/field, never raw
provider-supplied paths or arbitrary `extensions` values.

Measure completed user searches, usable quote rate, partial coverage, p50/p95
latency, cache hit rate, queue rejection, timeout and challenge/cooldown frequency.
Separate provider availability from match yield: fewer identified hotels can be
an inventory or matching issue even when the API succeeds. Do not log raw error
messages, payloads, authorization, cookies, full trip contexts or opaque IDs.

### 4. Optimize only the remaining demonstrated request waste

- Keep one combined listing request when it fits. Benchmark smaller pages only
  against the same completeness and matching requirements; never infer uniqueness
  from a shortened candidate set.
- Keep selected-offer quotes on demand and preserve the implemented quote-only
  refresh path. Do not fetch rooms/photos/totals for every search result.
- Treat removing `CUSTOM_DESC` from `responseOptions`, or toggling
  `includePSLResponse`, as hypotheses requiring response-parity evidence. Their
  undocumented server workload and effects are not established.
- Do not remove fields such as `minStrikePrice`, amenities arrays or `__typename`
  merely because the UI does not show them. The current matcher uses raw rate
  values and serialized amenity objects (`backend/domain/matching.js:41–52`).
- Static photo/address caching may help repeat selections across trips, but a
  cache split also adds invalidation and response composition. Defer until metrics
  show meaningful duplicate detail work. Never place rates, availability, original
  offer identity or matching evidence in a cross-trip static cache. The current
  combined detail/quote request still needs live pricing; splitting it can add an
  upstream call on a cache miss rather than save one.

## Verification and release experiment

The three focused adapter/scheduler/service test files passed under Node 24.20.0.
Additionally, six injected responses exercised the real adapter and coordinator
with in-memory state and no Priceline traffic:

| Synthetic upstream response | Current application result | Persisted effect |
| --- | --- | --- |
| 429 + `Retry-After:120` | `PROVIDER_COOLDOWN` | Cooldown set; one call |
| 503 JSON + `Retry-After:120` | `PROVIDER_UNAVAILABLE` | No cooldown; one call |
| 503 HTML maintenance + `Retry-After:120` | `PROVIDER_DISABLED` | Disabled; one call |
| 502 HTML gateway error | `PROVIDER_DISABLED` | Disabled; one call |
| 200 HTML interstitial | `PROVIDER_DISABLED` | Disabled; one call |
| 200 GraphQL validation error | `PROVIDER_UNAVAILABLE` | No cooldown/disable; one call |

These demonstrate application behavior, not proof that Priceline currently emits
each response type. The existing tests passing does not negate those gaps.

After the access decision and a scoped implementation, use a small production-host
check across several destinations, one-/multi-room stays, child ages and supported
currencies. Record actual request/response timing, payload size, completeness,
quote availability and rendered handoff parity. Stop on denial; use offline tests
for stress, repeated failure and disconnect cases. Do not load-test Priceline or
add frequent live health probes.

Acceptance criteria for the narrow hardening work:

1. 503 backoff is honored and persists correctly; established transient failures
   do not require unnecessary manual reset; actual and unknown challenges remain
   stopped.
2. Shared subscribers and queued work stay bounded when clients disconnect; one
   caller cannot consume all admission indefinitely.
3. Optional detail failures retain a usable offer and truthful price freshness;
   changes do not alter occupancy, currencies, fees or matching semantics.
4. Logs distinguish upstream failure classes without exposing request/user data.
5. Hosted evidence demonstrates acceptable latency and recovery for the intended
   small workload. Local tests and a one-day successful probe do not establish
   long-term provider availability.

The hosted success rate, supplier allowances, paid-service performance, exact
partner inventory compatibility and approval for pre-book identification remain
unverified. No magic-header claim or production-stability promise is supported by
the evidence reviewed.
