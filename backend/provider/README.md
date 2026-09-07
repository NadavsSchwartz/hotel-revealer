# Provider boundary

`createProviderService()` has no live adapter and returns
`PROVIDER_NOT_CONFIGURED` (503) for searches and details. No environment variable,
credential, test query parameter, or reset operation enables live requests.
The production server does not import the old scraping, cookie, or database path.

An operational adapter is blocked on permission that explicitly covers automated
pre-booking supplier comparison and public display, plus current authorized API
documentation. Partner membership alone does not satisfy that gate. See
`docs/IMPLEMENTATION.md` for the evidence and release status. The injectable seam
supports offline tests; passing those tests does not validate live integration.

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

`context` is the validated city/date/one-room/two-adult/USD contract. The first
listing cursor is `null`; a terminal page must explicitly return `nextCursor:null`.
Listing rows pass through the domain normalizer once. Duplicate observations from
different pages go to the domain matcher together so conflicting evidence cannot
be overwritten by arrival order. At most 2,000 raw rows per page are accepted.
Each adapter page/detail payload and each public response is limited to 2 MiB of
JSON. The serializer checks UTF-8 bytes and escaping while walking values so
repeated candidate fields cannot first expand into an unbounded response string.
Oversized payloads fail before caching or shared-response cloning.

The eventual adapter owns mapping its documented API responses to this boundary,
marking exact/minimum/range clues only where supported by authorized semantics,
and binding any supplied original-offer handoff URL to the complete trip context.
The service does not synthesize supplier URLs. Images are limited to the shared
approved HTTPS host list. Hotel descriptions and addresses are plain text, never
HTML. Missing retail rates do not establish Express-offer unavailability.

The adapter must honor `AbortSignal`, make exactly one upstream request per method
call, and must not retry, manipulate anti-bot cookies, or log credentials, raw
payloads, or raw errors. It classifies blocking failures with:

```js
throw new ProviderFailure('rate_limit', { retryAfter: '120' });
throw new ProviderFailure('challenge');
```

`retryAfter` accepts seconds or an HTTP date. Missing/invalid values default to a
60-second cooldown. Other thrown errors become a controlled provider-unavailable
response. An adapter that ignores abort keeps the active slot until it settles;
the service never dispatches overlapping calls to compensate.

## Budgets, caches, and state

One service instance runs one upstream call at a time, at least one second between
starts, with four waiting FIFO slots. Search has 20 seconds from admission;
details has 10 seconds including relationship revalidation. Search reads at most
three pages. An ordinary later-page failure returns successful earlier pages with
explicit partial coverage. Provider disablement, shutdown, and size limits remain
errors. Identical in-flight work is shared without extending budgets.

Matching permits at most 100,000 offer/hotel comparisons and 5,000 candidate
objects across the result. Exceeding those limits or the payload limit returns
`RESULT_TOO_LARGE` (503); candidates are never silently truncated. These are
conservative application defaults, not a claim of measured production capacity.

Fresh search results use a 25-entry LRU cache for five minutes. Detail results use
a 100-entry cache for one minute, and their relationship is checked against fresh
search context on every request. Cache hits never extend freshness. A detail
response expires no later than its original offer's search context; fresh hotel
details cannot extend the lifetime of an older Express quote. A valid three-page
capped result may be cached while retaining partial coverage; retrieval
errors and malformed/repeated pages are not cached. Fresh cache hits may be served
during a provider cooldown. Challenges clear caches and disable the service.
Optional detail failures preserve the usable parent offer and return
`detailStatus: 'unavailable'`; that fallback is not cached.

Cooldown and challenge state are atomically persisted as a minimal JSON object in
`PROVIDER_STATE_FILE`, default `var/provider-state.json`. Unreadable/corrupt state
fails closed. `resetProviderState()` is for the local operator CLI only; restart
after resetting. Reset does not configure a provider or establish authorization.

These limits are per process. Run one application process against one persistent
state file. Multiple workers/replicas require a separately designed shared queue
and state coordinator before release. Summary logs contain only controlled event,
operation, cache/reuse, upstream/page/queue counts, outcome, and duration fields.

Durability limitation before live release: if persisting a new block fails, the
current process disables requests, but a later restart may read the prior clean
state. Atomic replacement and routine restart tests do not prove crash/disk-failure
durability. Settle the startup/recovery policy and verify that failure path before
enabling an authorized live adapter. The current default adapter remains disabled.

## Offline verification

```sh
node --test backend/app.test.js backend/provider/*.test.js
```

Tests inject clocks, state storage, and provider adapters. The HTTP tests bind only
to loopback; no test endpoint is shipped in the application. Default-service tests
explicitly verify both operations fail without provider network or state I/O.
