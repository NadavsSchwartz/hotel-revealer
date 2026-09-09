import {
  validateSearch, validateDetail, matchListings, normalizeQuote, safeImageUrl, MatchLimitError,
} from '../domain/index.js';
import { FreshCache } from './cache.js';
import { ProviderFailure, ServiceError } from './errors.js';
import { ProviderScheduler, realClock } from './scheduler.js';
import { cleanState, createFileStateStore, retryAfterDeadline } from './state.js';
import { assertJsonSize } from './size.js';
import { diagnostic } from '../diagnostics.js';

const SEARCH_TTL = 5 * 60_000;
const DETAIL_TTL = 60_000;
const ISSUED_OFFER_TTL = 30 * 60_000;
const CACHE_BYTES = 16 * 1024 * 1024; // Serialized payload weight per cache, not a heap limit.
const partialFailures = new Set(['PROVIDER_UNAVAILABLE', 'PROVIDER_RESPONSE_INVALID', 'PROVIDER_DESTINATION_UNSUPPORTED', 'PROVIDER_COOLDOWN', 'PROVIDER_BUSY', 'DEADLINE_EXCEEDED']);
const contextKey = (context) => JSON.stringify([context.destinationId, context.checkIn, context.checkOut, context.rooms, context.adults, context.childrenAges, context.currency]);
const issuedOfferKey = (context, offerId) => JSON.stringify([contextKey(context), offerId]);
const iso = (timestamp) => new Date(timestamp).toISOString();
const text = (value, maximum) => typeof value === 'string' ? value.trim().slice(0, maximum) || null : null;
const backoffFor = error => typeof error.retryAt === 'string' && Number.isFinite(Date.parse(error.retryAt)) &&
  ['PROVIDER_COOLDOWN', 'PROVIDER_UNAVAILABLE', 'PROVIDER_BUSY'].includes(error.code)
  ? { code: error.code, retryAt: error.retryAt } : null;

function normalizeDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServiceError('PROVIDER_RESPONSE_INVALID');
  return {
    description: text(value.description, 8_000),
    images: [...new Set((Array.isArray(value.images) ? value.images : []).map(safeImageUrl).filter(Boolean))].slice(0, 20),
    amenities: [...new Set((Array.isArray(value.amenities) ? value.amenities : []).map((item) => text(item, 100)).filter(Boolean))].slice(0, 100),
    address: text(value.address, 500),
    retailQuote: value.retailQuote == null ? null : normalizeQuote(value.retailQuote),
  };
}

function normalizeOriginalQuote(value, context) {
  const quote = normalizeQuote(value);
  return quote.currency === context.currency && quote.totalCents != null && quote.totalTaxesFees === 'included' && quote.taxesFees === 'excluded' &&
    quote.roomCount === context.rooms && quote.nightlyBasis === 'per-room' && quote.stayBasis === 'all-rooms'
    ? quote : null;
}

function withDeadline(operation, deadline, clock) {
  return new Promise((resolve, reject) => {
    const timer = clock.setTimeout(() => reject(new ServiceError('DEADLINE_EXCEEDED')), Math.max(0, deadline - clock.now()));
    Promise.resolve(operation).then(resolve, reject).finally(() => clock.clearTimeout(timer));
  });
}

/**
 * An adapter implements
 * listingsPage({context,cursor,signal}) => {listings: rawRows, nextCursor:null|string},
 * hotelDetails({context,offerId,hotelId,signal}) => display fields, honors AbortSignal,
 * and classifies challenges/rate limits with ProviderFailure.
 */
export function createProviderService({ adapter = null, clock = realClock, stateStore = createFileStateStore(), logger = console } = {}) {
  const configured = Boolean(adapter && typeof adapter.listingsPage === 'function' && typeof adapter.hotelDetails === 'function');
  const searches = new FreshCache({ capacity: 25, maxBytes: CACHE_BYTES, ttlMs: SEARCH_TTL, now: clock.now });
  const details = new FreshCache({ capacity: 100, maxBytes: CACHE_BYTES, ttlMs: DETAIL_TTL, now: clock.now });
  // Keep the exact inference we issued while its independently fetched prices expire.
  const issuedOffers = new FreshCache({ capacity: 1000, maxBytes: CACHE_BYTES, ttlMs: ISSUED_OFFER_TTL, now: clock.now });
  const searchFlights = new Map();
  const detailFlights = new Map();
  let state = cleanState();
  let loaded;
  let draining = false;
  let searchSummary = {
    status: 'unknown', eligibleOffers: null, matched: null, unresolved: null,
    lastSuccessfulFreshSearch: null, consecutiveUnexpectedFailures: 0,
  };

  function log(level, entry) {
    try { logger?.[level]?.(entry); } catch { /* Logging cannot change availability. */ }
  }

  async function loadState() {
    loaded ||= Promise.resolve().then(() => stateStore.read()).then((saved) => {
      if (saved?.version !== 1 || typeof saved.disabled !== 'boolean' || !Number.isFinite(saved.cooldownUntil) || saved.cooldownUntil < 0 || saved.cooldownUntil > 8_640_000_000_000_000 ||
          (saved.cooldownReason !== undefined && saved.cooldownReason !== 'unavailable')) throw new Error('Invalid state');
      state = saved;
    }).catch(error => {
      state = { ...cleanState(), disabled: true };
      log('error', { event: 'provider_state_failed', operation: 'read', diagnostic: diagnostic(error) });
    });
    await loaded;
  }

  async function available({ allowCooldown = false } = {}) {
    if (!configured) throw new ServiceError('PROVIDER_NOT_CONFIGURED');
    await loadState();
    if (state.disabled) throw new ServiceError('PROVIDER_DISABLED');
    if (!allowCooldown && state.cooldownUntil > clock.now()) throw cooldownError();
  }

  function cooldownError(cause) {
    return new ServiceError(state.cooldownReason === 'unavailable' ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_COOLDOWN',
      { retryAt: iso(state.cooldownUntil), cause });
  }

  async function persistState(value = state) {
    try {
      await stateStore.write(value);
    } catch (cause) {
      state.disabled = true;
      searches.clear();
      details.clear();
      issuedOffers.clear();
      log('error', { event: 'provider_state_failed', operation: 'write', diagnostic: diagnostic(cause) });
      throw new ServiceError('PROVIDER_DISABLED', { cause });
    }
  }

  const scheduler = new ProviderScheduler({
    clock,
    async beforeDispatch() {
      await available();
      // A crash or a failed outcome write must leave the next process blocked.
      // Keep live availability in memory; only the durable copy is conservative.
      await persistState({ ...state, disabled: true });
    },
    afterDispatch: () => persistState(),
  });

  async function call(method, parameters, deadline, metrics, admitUpstream, holdWork) {
    // Cache hits and coalesced subscribers never enter here. Reject excessive
    // client work before it can occupy the shared upstream queue.
    await withDeadline(available(), deadline, clock);
    admitUpstream?.();
    return scheduler.run(async (signal) => {
      try {
        metrics.upstreamCalls += 1;
        return await adapter[method]({ ...parameters, signal });
      } catch (error) {
        if (error instanceof ProviderFailure || error instanceof ServiceError) {
          log('info', { event: 'provider_failure', method, diagnostic: diagnostic(error) });
        }
        if (error instanceof ProviderFailure && error.kind === 'challenge') {
          state.disabled = true;
          searches.clear();
          details.clear();
          issuedOffers.clear();
          log('error', { event: 'provider_paused', reason: 'challenge' });
          throw new ServiceError('PROVIDER_DISABLED', { cause: error });
        }
        if (error instanceof ProviderFailure && ['rate_limit', 'maintenance'].includes(error.kind)) {
          state.cooldownUntil = retryAfterDeadline(error.retryAfter, clock.now());
          if (error.kind === 'maintenance') state.cooldownReason = 'unavailable';
          else delete state.cooldownReason;
          log('info', { event: 'provider_paused', reason: error.kind === 'maintenance' ? 'maintenance' : 'cooldown', retryAt: iso(state.cooldownUntil) });
          throw cooldownError(error);
        }
        if (signal.aborted) throw new ServiceError('DEADLINE_EXCEEDED');
        if (error instanceof ProviderFailure && error.kind === 'unavailable') throw new ServiceError('PROVIDER_UNAVAILABLE', { cause: error });
        throw error instanceof Error ? error : new Error('Non-Error provider failure', { cause: error });
      }
    }, { deadline, holdWork });
  }

  async function retrieveSearch(context, deadline, metrics, admitUpstream, holdWork) {
    await withDeadline(available({ allowCooldown: true }), deadline, clock);
    const key = contextKey(context);
    const cached = searches.get(key);
    metrics.searchCache = cached ? 'hit' : 'miss';
    if (cached) return cached;
    const offers = [];
    const hotels = [];
    const seenCursors = new Set();
    let cursor = null;
    let pagesFetched = 0;
    let reason = null;
    let cacheable = true;
    let backoff = null;
    let retrievedAt;
    do {
      try {
        const page = await call('listingsPage', { context, cursor }, deadline, metrics, admitUpstream, holdWork);
        assertJsonSize(page);
        if (!page || !Object.hasOwn(page, 'listings') || !Object.hasOwn(page, 'nextCursor') ||
          (page.nextCursor !== null && (typeof page.nextCursor !== 'string' || !page.nextCursor || page.nextCursor.length > 2_048))) {
          throw new ServiceError('PROVIDER_RESPONSE_INVALID');
        }
        const rawRows = Array.isArray(page.listings) ? page.listings : page.listings?.data?.listings?.hotels ?? page.listings?.listings?.hotels ?? page.listings?.hotels;
        if (!Array.isArray(rawRows) || rawRows.length > 2_000) throw new ServiceError('PROVIDER_RESPONSE_INVALID');
        // Keep raw types, array order and repeated observations for matching.
        for (const row of rawRows) {
          const program = row?.ratesSummary?.programName;
          if (typeof program !== 'string' && !(row?.hotelType === 'RTL' && row.ratesSummary && program == null)) {
            reason ||= 'Some provider listings could not be assessed.';
            cacheable = false;
            continue;
          }
          (['EXPRESS_DEAL', 'EXPRESS DEAL'].includes(program?.toUpperCase()) ? offers : hotels).push(row);
        }
        pagesFetched += 1;
        retrievedAt ??= clock.now();
        cursor = page.nextCursor;
        if (cursor !== null && seenCursors.has(cursor)) {
          reason = 'The provider repeated a page. Coverage is incomplete.';
          cacheable = false;
          break;
        }
        if (cursor !== null) seenCursors.add(cursor);
      } catch (error) {
        if (pagesFetched === 0 || !(error instanceof ServiceError) || !partialFailures.has(error.code)) throw error;
        metrics.failureCode = error.code;
        backoff = backoffFor(error);
        cacheable = false;
        reason = 'A later provider page could not be retrieved. Coverage is incomplete.';
        break;
      }
    } while (cursor !== null && pagesFetched < 3);
    if (cursor !== null && pagesFetched === 3) reason ||= 'The three-page retrieval limit was reached. Coverage is incomplete.';
    let matched;
    try {
      matched = matchListings(offers, hotels, { coverageStatus: reason ? 'partial' : 'complete' });
    } catch (error) {
      if (error instanceof MatchLimitError) throw new ServiceError('RESULT_TOO_LARGE');
      throw error;
    }
    if (matched.invalidRows > 0) cacheable = false;
    const result = {
      context,
      ...(backoff ? { backoff } : {}),
      retrievedAt: iso(retrievedAt ?? clock.now()),
      expiresAt: iso((retrievedAt ?? clock.now()) + SEARCH_TTL),
      coverage: {
        status: reason ? 'partial' : 'complete', reason, pagesFetched,
        offersFound: matched.offers.length,
        namedHotelsChecked: new Set(hotels.map((hotel) => hotel.hotelId)).size,
        unassessedHotels: matched.unassessedHotels,
      },
      offers: matched.offers,
    };
    metrics.pagesFetched = pagesFetched;
    const bytes = assertJsonSize(result);
    for (const offer of result.offers) {
      const selectionKey = issuedOfferKey(context, offer.offerId);
      // Missing observations cannot disprove a previously issued inference.
      if ((result.coverage.status !== 'complete' || offer.resolution.reason === 'missing_facts') && issuedOffers.get(selectionKey)) continue;
      const issued = { offer, offerExpiresAt: result.expiresAt };
      issuedOffers.set(selectionKey, issued, {
        bytes: assertJsonSize(issued), expiresAt: Date.parse(result.retrievedAt) + ISSUED_OFFER_TTL,
      });
    }
    if (cacheable && deadline > clock.now()) searches.set(key, result, { bytes, expiresAt: Date.parse(result.expiresAt) });
    return result;
  }

  async function searchWork(context, deadline, metrics, admitUpstream, holdWork) {
    try {
      const result = await retrieveSearch(context, deadline, metrics, admitUpstream, holdWork);
      if (metrics.searchCache === 'miss') {
        const unresolved = { no_match: 0, ambiguous: 0, missing_facts: 0, incomplete_search: 0 };
        let matched = 0;
        for (const offer of result.offers) {
          if (offer.resolution.status === 'matched') matched += 1;
          else unresolved[offer.resolution.reason] += 1;
        }
        searchSummary = {
          status: 'observed', eligibleOffers: result.offers.length, matched, unresolved,
          lastSuccessfulFreshSearch: iso(clock.now()), consecutiveUnexpectedFailures: 0,
        };
        log('info', { event: 'provider_search_summary', ...searchSummary });
      }
      return result;
    } catch (error) {
      if (!(error instanceof ServiceError) || error.code === 'INTERNAL_ERROR') {
        searchSummary = { ...searchSummary, status: 'observed',
          consecutiveUnexpectedFailures: Math.min(Number.MAX_SAFE_INTEGER, searchSummary.consecutiveUnexpectedFailures + 1) };
        log('error', { event: 'provider_search_failed', ...searchSummary, diagnostic: diagnostic(error) });
      }
      throw error;
    }
  }

  function coalesce(flights, key, work, holdWork) {
    const existing = flights.get(key);
    if (existing) return existing.then((value) => structuredClone(value));
    // Search owns deadline handling page by page, so it can return previous
    // successful pages when a later page reaches the deadline.
    const operation = Promise.resolve().then(work);
    flights.set(key, operation);
    holdWork?.(operation);
    operation.finally(() => {
      if (flights.get(key) === operation) flights.delete(key);
    }).catch(() => {});
    return operation.then((value) => structuredClone(value));
  }

  function observe(kind, operation, admittedAt, metrics, requestId) {
    const report = (outcome) => {
      try {
        logger?.info?.({ event: 'provider_request', kind, ...(requestId ? { requestId } : {}), ...metrics, outcome, durationMs: clock.now() - admittedAt });
      } catch { /* Logging is best effort and never contains upstream content. */ }
    };
    return operation.then((value) => { report(value.detailStatus || value.coverage?.status || 'success'); return value; }, (error) => {
      report(error instanceof ServiceError ? error.code : 'INTERNAL_ERROR');
      throw error;
    });
  }

  const newMetrics = () => ({ searchCache: 'not_checked', detailCache: 'not_checked', shared: false, upstreamCalls: 0, pagesFetched: 0, queueDepth: scheduler.queue.length });

  return {
    search(input, { requestId, admitUpstream, holdWork } = {}) {
      if (draining) return Promise.reject(new ServiceError('SERVICE_DRAINING'));
      const admittedAt = clock.now();
      const context = validateSearch(input, new Date(admittedAt));
      const deadline = admittedAt + 20_000;
      const metrics = newMetrics();
      metrics.shared = searchFlights.has(contextKey(context));
      const request = coalesce(searchFlights, contextKey(context), () => searchWork(context, deadline, metrics, admitUpstream, holdWork), holdWork);
      return observe('search', request, admittedAt, metrics, requestId);
    },
    detail(input, { requestId, admitUpstream, holdWork } = {}) {
      if (draining) return Promise.reject(new ServiceError('SERVICE_DRAINING'));
      const admittedAt = clock.now();
      const { offerId, hotelId, ...context } = validateDetail(input, new Date(admittedAt));
      const deadline = admittedAt + 10_000;
      const key = JSON.stringify([contextKey(context), offerId, hotelId ?? null]);
      const metrics = newMetrics();
      metrics.shared = detailFlights.has(key);
      const request = coalesce(detailFlights, key, async () => {
        await withDeadline(available({ allowCooldown: true }), deadline, clock);
        const selectionKey = issuedOfferKey(context, offerId);
        let issued = issuedOffers.get(selectionKey);
        if (!issued) {
          // City discovery owns its full search budget. This detail caller may
          // stop waiting earlier without terminating another search subscriber.
          const searchDeadline = clock.now() + 20_000;
          const search = await withDeadline(coalesce(searchFlights, contextKey(context),
            () => searchWork(context, searchDeadline, metrics, admitUpstream, holdWork), holdWork), deadline, clock);
          const offer = search.offers.find((item) => item.offerId === offerId);
          if (offer) issued = { offer, offerExpiresAt: search.expiresAt };
        }
        let offer = issued?.offer;
        let candidate = hotelId === undefined ? null : offer?.candidates.find((item) => item.hotelId === hotelId) ?? null;
        if (!offer) throw new ServiceError('SELECTION_UNAVAILABLE');
        const cached = details.get(key);
        if (cached) {
          metrics.detailCache = 'hit';
          const cachedQuoteFresh = Date.parse(cached.offer?.quoteExpiresAt) > clock.now();
          const refreshedOffer = cachedQuoteFresh
            ? { ...offer, quote: cached.offer.quote, quoteExpiresAt: cached.offer.quoteExpiresAt } : offer;
          const result = { ...cached, offer: refreshedOffer, candidate,
            ...(!candidate && hotelId !== undefined ? { details: null, detailStatus: 'unavailable' } : {}),
            quoteStatus: cachedQuoteFresh ? 'available' : 'unavailable', offerExpiresAt: issued.offerExpiresAt };
          assertJsonSize(result);
          return result;
        }
        metrics.detailCache = 'miss';
        let normalizedDetails = null;
        let originalQuote = null;
        let detailStatus = hotelId === undefined ? 'not_requested' : candidate ? 'available' : 'unavailable';
        let cacheable = true;
        let backoff = null;
        let refreshError = null;
        try {
          const rawDetails = await call('hotelDetails', { context, offerId, hotelId: candidate ? hotelId : undefined }, deadline, metrics, admitUpstream, holdWork);
          assertJsonSize(rawDetails);
          if (!rawDetails || typeof rawDetails !== 'object' || Array.isArray(rawDetails)) throw new ServiceError('PROVIDER_RESPONSE_INVALID');
          if (candidate) normalizedDetails = normalizeDetails(rawDetails);
          originalQuote = normalizeOriginalQuote(rawDetails.originalQuote, context);
          if (hotelId !== undefined && rawDetails.available === false) detailStatus = 'unavailable';
        } catch (error) {
          if (!(error instanceof ServiceError) || !['PROVIDER_UNAVAILABLE', 'PROVIDER_RESPONSE_INVALID', 'PROVIDER_COOLDOWN', 'PROVIDER_BUSY', 'DEADLINE_EXCEEDED'].includes(error.code)) throw error;
          metrics.failureCode = error.code;
          refreshError = { code: error.code };
          backoff = backoffFor(error);
          cacheable = false;
          if (candidate) {
            detailStatus = 'unavailable';
            normalizedDetails = { description: null, images: [], amenities: [], address: null, retailQuote: null };
          }
        }
        const retrievedAt = clock.now();
        // A search completed while this quote was queued owns newer matching evidence.
        issued = issuedOffers.get(selectionKey) || issued;
        offer = issued.offer;
        candidate = hotelId === undefined ? null : offer.candidates.find(item => item.hotelId === hotelId) ?? null;
        if (hotelId !== undefined && !candidate) {
          normalizedDetails = null;
          detailStatus = 'unavailable';
        }
        const refreshedOffer = originalQuote
          ? { ...offer, quote: originalQuote, quoteExpiresAt: iso(retrievedAt + DETAIL_TTL) } : offer;
        const result = {
          context, retrievedAt: iso(retrievedAt), expiresAt: iso(retrievedAt + DETAIL_TTL), offerExpiresAt: issued.offerExpiresAt,
          ...(backoff ? { backoff } : {}),
          ...(refreshError ? { refreshError } : {}),
          offer: refreshedOffer, candidate, details: normalizedDetails, detailStatus,
          quoteStatus: originalQuote ? 'available' : 'unavailable',
        };
        // Missing retailQuote does not imply Express unavailability.
        const bytes = assertJsonSize(result);
        // An explicit retry must be able to recover a previously unavailable total.
        if (cacheable && originalQuote && deadline > clock.now()) details.set(key, result, { bytes, expiresAt: retrievedAt + DETAIL_TTL });
        return result;
      }, holdWork);
      return observe('detail', request, admittedAt, metrics, requestId);
    },
    async status() {
      if (!configured || draining) return { available: false, search: structuredClone(searchSummary) };
      await loadState();
      return { available: !state.disabled && state.cooldownUntil <= clock.now(), search: structuredClone(searchSummary) };
    },
    drain() { draining = true; },
    close() { draining = true; scheduler.close(); },
  };
}
