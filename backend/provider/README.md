# Provider boundary

`createProviderService()` requires an adapter and otherwise returns
`PROVIDER_NOT_CONFIGURED` (503) without provider requests or state I/O.
Runtime configuration supplies the live adapter explicitly. The coordinator does
not use the old scraping, cookie, or database path.

The current implementation direction permits ordinary public-endpoint access;
provider permission remains unverified. See `docs/LIVE_ACCESS.md` for that decision
and `docs/IMPLEMENTATION.md` for release evidence. Injected offline tests verify
coordinator behavior; they do not establish live integration or matching accuracy.

## Adapter interface

An adapter passed programmatically to `createProviderService({ adapter })` must
provide both methods:

```js
listingsPage({ context, cursor, signal })
// => { listings: rawRowsOrListingEnvelope, nextCursor: null | string }

hotelDetails({ context, offerId, hotelId, signal })
// => { description, images: string[], amenities: string[], address,
//      retailQuote: null | normalizedQuote, available?: boolean }
```

`context` is the validated destination/date/room/adult/child-age/USD contract. The first
listing cursor is `null`; a terminal page must explicitly return `nextCursor:null`.
Listing rows pass through the domain normalizer once. Duplicate observations from
different pages go to the domain matcher together so conflicting evidence cannot
be overwritten by arrival order. At most 2,000 raw rows per page are accepted.
Each adapter page/detail payload and each public response is limited to 2 MiB of
JSON. The serializer checks UTF-8 bytes and escaping while walking values so
repeated candidate fields cannot first expand into an unbounded response string.
Oversized payloads fail before caching or shared-response cloning.

The adapter owns mapping its upstream responses to this boundary,
marking exact/minimum/range clues only where supported by observed semantics,
and binding any supplied original-offer handoff URL to the complete trip context.
The service does not synthesize supplier URLs. Images are limited to the shared
approved HTTPS host list. Hotel descriptions and addresses are plain text, never
HTML. Missing retail rates do not establish Express-offer unavailability.

The adapter must honor `AbortSignal`, make exactly one upstream request per method
call, and must not retry, manipulate anti-bot cookies, or log credentials, raw
payloads, or raw errors. It classifies blocking failures with:

```js
throw new ProviderFailure('rate_limit', { retryAfter: '120' });
throw new ProviderFailure('maintenance', { retryAfter: '120' });
throw new ProviderFailure('challenge');
```

`retryAfter` accepts seconds or an HTTP date. Missing/invalid values default to a
60-second cooldown. Deliberate `ServiceError('PROVIDER_RESPONSE_INVALID')` and
`ServiceError('RESULT_TOO_LARGE')` retain their controlled classification. Other
thrown errors become a controlled provider-unavailable response. An adapter that
ignores abort keeps the active slot until it settles;
the service never dispatches overlapping calls to compensate.

The public adapter honors non-HTML HTTP 503 backoff. It also recognizes complete
stock nginx 502/503/504 error documents, inspecting at most 8 KiB. Only the exact
static document shape is accepted; scripts, attributes, other content, truncated
or oversized bodies remain unknown challenges. This recognizes a response shape,
not the provider's internal cause. HTTP 401/403 and other HTML interstitials still
disable access. No automatic retries or block resets occur. An aborted inspection
cancels the body and retains the unknown-access block.

Maintenance returns `PROVIDER_UNAVAILABLE` with `retryAt`; rate limiting returns
`PROVIDER_COOLDOWN`. Both retain the same wait deadline across restart. Successful
partial searches or optional detail fallbacks can include
`backoff: { code, retryAt }` for these conditions or client `PROVIDER_BUSY` waits.
The UI retains the usable data and original failure reason while disabling retry
until that ISO timestamp. These fallbacks are never cached as fresh successes.

## Budgets, caches, and state

One service instance runs one upstream call at a time, at least one second between
starts, with four waiting FIFO slots. Search has 20 seconds from admission;
details has 10 seconds including relationship revalidation. Search reads at most
three pages. An ordinary later-page failure returns successful earlier pages with
explicit partial coverage. Provider disablement, shutdown, and size limits remain
errors. Identical in-flight work is shared without extending budgets.

The HTTP layer also bounds outstanding callers to eight globally and four per
client, including disconnected callers whose service work has not settled. It
skips serialization to disconnected clients and does not cancel shared upstream
work needed by another caller. Each client can admit four new upstream calls in
a burst (three search pages plus one selected detail); one allowance replenishes
every ten seconds. Cache hits and coalesced followers do not spend that allowance.
Excess work is rejected before queue entry with `PROVIDER_BUSY` and `retryAt`.
At most 1,000 short-lived client quota records are kept in memory, without raw-IP
logging. These are application defaults, not supplier limits or a guarantee of
fairness among people sharing an IP. See `deploy/README.md` for the explicit Caddy
identity boundary; generic forwarded headers are never trusted.

Matching indexes eligible raw hotel observations by neighborhood and star rating,
preserving strict number/string types, arrival order and duplicate rates. The
100,000 comparison budget counts pairs visited within matching buckets, not every
theoretical offer/hotel combination. At most 5,000 matching raw pairs are retained
before grouping by identity. Exceeding either budget or the payload limit returns
`RESULT_TOO_LARGE` (503); matches are never truncated into a unique hotel. These are
conservative application defaults, not a claim of measured production capacity.

Fresh search results use a 25-entry LRU cache for five minutes; detail results and
complete totals use a 100-entry cache for one minute. Separately, up to 1,000 issued
offers (at most 16 MiB) retain their exact trip/offer matching evidence for up to
30 minutes from search retrieval. This preserves the earlier inference, not fresh
prices or a verified hotel identity. Known offers can refresh their original quote
directly without repeating the city search. Unknown/expired bindings require
search validation; newer contradictory evidence for the same offer ID revokes the
old candidate. Missing IDs in a new inventory snapshot alone do not revoke a
previously issued offer. Reads and quote refreshes never extend retention or make
old listing prices fresh. A valid three-page
capped result may be cached while retaining partial coverage; retrieval
errors and malformed/repeated pages are not cached. Fresh cache hits may be served
during a provider cooldown. Challenges clear caches and disable the service.
Optional detail failures preserve the usable parent offer and return
`detailStatus: 'unavailable'`; that fallback is not cached.

Cooldown and challenge state use a minimal JSON object in `PROVIDER_STATE_FILE`,
default `var/provider-state.json`. Before every provider call, the coordinator
atomically writes a conservative disabled record. After the call settles, it
replaces that record with the classified clean, cooldown, or disabled state.
No provider call starts if the first write fails. A failed outcome write or a
process stop during a call leaves the next process disabled, even if the previous
record allowed requests. This intentionally requires operator review after an
interrupted call. Healthy calls and ordinary classified transport failures restore
availability; persisted rate limits and challenges keep their existing behavior.
Version-one records remain compatible; optional `cooldownReason: 'unavailable'`
distinguishes maintenance. A subsequent rate limit removes that reason. Invalid
reason values fail closed, and operator reset removes it with the rest of state.

The scheduler holds its active slot through persistence. State-write time is part
of the admission deadline, and the one-second gap is measured at actual adapter
dispatch. Unreadable/corrupt state fails closed. Temporary files are synchronized
before replacement; disabled records also synchronize the containing directory.
An availability-restoring rename is the last fallible step, so a later reported
write error cannot leave a clean record behind. This verifies local file/process
recovery, not arbitrary storage loss or deployment-volume durability.

`resetProviderState()` is for the local operator CLI only. Stop the application,
review the block or interrupted call, reset, then restart. Reset does not configure
a provider or establish authorization.

These limits are per process. Run one application process against one persistent
state file. Multiple workers/replicas require a separately designed shared queue
and state coordinator before release. Summary logs contain only controlled event,
operation, cache/reuse, upstream/page/queue counts, outcome, and duration fields.
Failure diagnostics additionally include fixed operation, HTTP status, media-type
and schema/execution/transport/access categories. Raw headers, GraphQL error text,
paths, extensions, trip variables and credentials are excluded; categories are
allowlisted again at the logging boundary.

## Offline verification

```sh
node --test backend/app.test.js backend/provider/*.test.js
```

Tests inject clocks, state storage, and provider adapters. The HTTP tests bind only
to loopback; no test endpoint is shipped in the application. Default-service tests
explicitly verify both operations fail without provider network or state I/O.
