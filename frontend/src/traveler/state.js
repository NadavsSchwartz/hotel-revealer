import { contextKey } from './context.js';
import { validIdentifier } from '../../../shared/identifiers.js';

const bindingErrors = new Set(['INVALID_SELECTION', 'SELECTION_UNAVAILABLE']);
const unresolvedReasons = new Set(['no_match', 'ambiguous', 'missing_facts', 'incomplete_search']);
const refreshFailureCodes = new Set(['PROVIDER_UNAVAILABLE', 'PROVIDER_RESPONSE_INVALID', 'PROVIDER_COOLDOWN', 'PROVIDER_BUSY', 'DEADLINE_EXCEEDED']);

export function validResolution(offer) {
  if (!Array.isArray(offer?.candidates)) return false;
  if (offer.resolution?.status === 'matched') {
    return !Object.hasOwn(offer.resolution, 'reason') && offer.candidates.length === 1 &&
      validIdentifier(offer.candidates[0]?.hotelId);
  }
  return offer.resolution?.status === 'unresolved' &&
    unresolvedReasons.has(offer.resolution.reason) && offer.candidates.length === 0;
}

function selectionIn(search, offerId, hotelId) {
  const offer = Array.isArray(search?.offers)
    ? search.offers.find(item => item?.offerId === offerId && validResolution(item)) : null;
  const candidate = Array.isArray(offer?.candidates) ? offer.candidates.find(item => item?.hotelId === hotelId) : null;
  return { offer: offer || null, candidate: candidate || null };
}

function detailWithResolution(data, offer, hotelId) {
  const candidate = hotelId == null ? null : offer.candidates.find(item => item.hotelId === hotelId) ?? null;
  return { ...data, offer: { ...data.offer, resolution: offer.resolution, candidates: offer.candidates }, candidate,
    ...(!candidate && hotelId != null ? { details: null, detailStatus: 'unavailable' } : {}) };
}

const usableEvidence = (search, offer) => search?.coverage.status === 'complete' && offer &&
  !['missing_facts', 'incomplete_search'].includes(offer.resolution.reason);

export function selectSearchCooldown(state, key, now = Date.now()) {
  const retryAt = state?.searchCooldowns?.[key]?.retryAt;
  return Date.parse(retryAt) > now ? retryAt : null;
}

function recordCooldown(cooldowns, action) {
  const now = action.receivedAt ?? Date.now();
  const error = action.error ?? action.data?.backoff;
  if (!['PROVIDER_COOLDOWN', 'PROVIDER_UNAVAILABLE', 'PROVIDER_BUSY'].includes(error?.code) ||
      typeof error.retryAt !== 'string' || !(Date.parse(error.retryAt) > now)) return cooldowns;
  const updated = Object.fromEntries(Object.entries(cooldowns || {}).filter(([, value]) => Date.parse(value.retryAt) > now));
  const key = action.tripKey || action.key;
  delete updated[key];
  updated[key] = { code: error.code, retryAt: error.retryAt };
  if (Object.keys(updated).length > 5) delete updated[Object.keys(updated)[0]];
  return updated;
}

export function selectDetailView({ detail, search, key, offerId, hotelId }) {
  const current = detail.key === key ? detail : null;
  const data = current?.data;
  const stored = selectionIn(search, offerId, hotelId);
  const bindingRejected = Boolean(current?.bindingRejected);
  if (data && !bindingRejected) {
    return { data, offer: data.offer, candidate: hotelId == null ? null : data.candidate,
      expiresAt: data.offerExpiresAt || data.expiresAt, bindingRejected: false };
  }
  if (current?.offer) {
    const candidate = current.offer.candidates.find(item => item.hotelId === hotelId) ?? null;
    return { data: null, offer: current.offer, candidate: bindingRejected ? null : candidate,
      expiresAt: current.offerExpiresAt, bindingRejected };
  }
  if (search) {
    return { data: null, offer: stored.offer, candidate: bindingRejected ? null : stored.candidate,
      expiresAt: search.expiresAt, bindingRejected };
  }
  return { data: null, offer: current?.offer || null, candidate: null,
    expiresAt: current?.offerExpiresAt, bindingRejected };
}

const initialState = {
  searches: {},
  searchCooldowns: {},
  search: { key: null, requestId: null, status: 'idle', error: null },
  detail: {
    key: null,
    tripKey: null,
    searchAtStart: null,
    offerId: null,
    hotelId: null,
    offer: null,
    offerExpiresAt: undefined,
    bindingRejected: false,
    requestId: null,
    status: 'idle',
    data: null,
    error: null,
  },
};

export function travelerReducer(state = initialState, action) {
  if (action.type === 'search/start') {
    return {
      ...state,
      search: {
        key: action.key,
        requestId: action.requestId,
        status: 'loading',
        error: null,
      },
    };
  }
  if (
    action.type === 'search/success' &&
    state.search.requestId === action.requestId
  ) {
    const searches = { ...state.searches };
    delete searches[action.key];
    searches[action.key] = action.data;
    const keys = Object.keys(searches);
    if (keys.length > 5) delete searches[keys[0]];
    let detail = state.detail;
    if (detail.tripKey === action.key && detail.offerId && action.data.coverage.status === 'complete') {
      const stored = selectionIn(action.data, detail.offerId, detail.hotelId);
      if (usableEvidence(action.data, stored.offer)) {
        const data = detail.data ? detailWithResolution(detail.data, stored.offer, detail.hotelId) : null;
        detail = { ...detail, offer: data?.offer ?? stored.offer,
          offerExpiresAt: data ? detail.offerExpiresAt : action.data.expiresAt, data };
      }
    }
    return {
      ...state,
      searches,
      searchCooldowns: recordCooldown(state.searchCooldowns, action),
      search: { ...state.search, status: 'success', error: null },
      detail,
    };
  }
  if (
    action.type === 'search/error' &&
    state.search.requestId === action.requestId
  ) {
    return {
      ...state,
      searchCooldowns: recordCooldown(state.searchCooldowns, action),
      search: { ...state.search, status: 'error', error: action.error },
    };
  }
  if (action.type === 'detail/start') {
    const sameSelection = state.detail.key === action.key;
    const searchAtStart = state.searches[action.tripKey];
    const stored = selectionIn(searchAtStart, action.offerId, action.hotelId);
    const bindingRejected = sameSelection && state.detail.bindingRejected;
    return {
      ...state,
      detail: {
        key: action.key,
        tripKey: action.tripKey,
        searchAtStart,
        offerId: action.offerId,
        hotelId: action.hotelId ?? null,
        offer: sameSelection ? state.detail.offer : stored.offer,
        offerExpiresAt: sameSelection ? state.detail.offerExpiresAt : searchAtStart?.expiresAt,
        bindingRejected,
        requestId: action.requestId,
        status: 'loading',
        data: sameSelection && !bindingRejected ? state.detail.data : null,
        error: null,
      },
    };
  }
  if (
    action.type === 'detail/success' &&
    state.detail.requestId === action.requestId
  ) {
    const search = state.searches[state.detail.tripKey];
    const stored = selectionIn(search, state.detail.offerId, state.detail.hotelId);
    const newerEvidence = search !== state.detail.searchAtStart && usableEvidence(search, stored.offer);
    // Only explicit same-offer evidence can replace an inference. Search
    // membership and incomplete discovery say nothing about an issued quote.
    let data = newerEvidence
      ? detailWithResolution(action.data, stored.offer, state.detail.hotelId) : action.data;
    const previous = state.detail.data;
    if (data.refreshError && previous) {
      data = { ...data,
        ...(data.candidate && data.candidate.hotelId === previous.candidate?.hotelId ? { details: previous.details } : {}),
        ...(previous.offer.quoteExpiresAt ? { offer: { ...data.offer,
          quote: previous.offer.quote, quoteExpiresAt: previous.offer.quoteExpiresAt } } : {}),
      };
    }
    return {
      ...state,
      searchCooldowns: recordCooldown(state.searchCooldowns, action),
      detail: { ...state.detail, searchAtStart: null, status: 'success', data,
        offer: data.offer, offerExpiresAt: data.offerExpiresAt || data.expiresAt,
        error: null, bindingRejected: false },
    };
  }
  if (
    action.type === 'detail/error' &&
    state.detail.requestId === action.requestId
  ) {
    return {
      ...state,
      searchCooldowns: recordCooldown(state.searchCooldowns, action),
      detail: { ...state.detail, searchAtStart: null, status: 'error', error: action.error,
        data: bindingErrors.has(action.error.code) ? null : state.detail.data,
        bindingRejected: state.detail.bindingRejected || bindingErrors.has(action.error.code) },
    };
  }
  return state;
}

let nextRequestId = 0;
const controllers = { search: null, detail: null };

function controlledError(code, retryAt) {
  return {
    code,
    retryAt:
      typeof retryAt === 'string' && Number.isFinite(Date.parse(retryAt))
        ? retryAt
        : null,
  };
}

async function post(path, input, signal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw controlledError('PROVIDER_RESPONSE_INVALID');
  }
  if (!response.ok)
    throw controlledError(
      data?.error?.code || 'INTERNAL_ERROR',
      data?.error?.retryAt,
    );
  return data;
}

function request(kind, path, input, key) {
  return async (dispatch, getState) => {
    if (kind === 'search' && selectSearchCooldown(getState?.(), key)) return;
    controllers[kind]?.abort();
    const controller = new AbortController();
    controllers[kind] = controller;
    const requestId = ++nextRequestId;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);
    const tripKey = contextKey(input);
    dispatch({ type: `${kind}/start`, key, tripKey, requestId, offerId: input.offerId, hotelId: input.hotelId });
    try {
      const data = await post(path, input, controller.signal);
      if (
        !data ||
        contextKey(data.context || {}) !== contextKey(input) ||
        !Number.isFinite(Date.parse(data.expiresAt))
      ) {
        throw controlledError('PROVIDER_RESPONSE_INVALID');
      }
      if (
        kind === 'search' &&
        (!Array.isArray(data.offers) || !data.offers.every(validResolution) || !data.coverage)
      ) {
        throw controlledError('PROVIDER_RESPONSE_INVALID');
      }
      if (kind === 'detail') {
        if (data.offer?.offerId !== input.offerId ||
            (data.candidate !== null && data.candidate?.hotelId !== input.hotelId)) {
          throw controlledError('PROVIDER_RESPONSE_INVALID');
        }
        if (!validResolution(data.offer) || !['available', 'unavailable'].includes(data.quoteStatus) ||
            (data.refreshError !== undefined && (!data.refreshError || Object.keys(data.refreshError).join(',') !== 'code' ||
              !refreshFailureCodes.has(data.refreshError.code) || data.quoteStatus !== 'unavailable')) ||
            (input.hotelId === undefined
              ? data.candidate !== null || data.details !== null || data.detailStatus !== 'not_requested'
              : data.candidate === null
                ? data.details !== null || data.detailStatus !== 'unavailable' ||
                  data.offer.candidates.some(candidate => candidate.hotelId === input.hotelId)
                : !data.offer.candidates.some(candidate => candidate.hotelId === input.hotelId) ||
                  !['available', 'unavailable'].includes(data.detailStatus))) {
          throw controlledError('PROVIDER_RESPONSE_INVALID');
        }
      }
      dispatch({ type: `${kind}/success`, key, tripKey, requestId, data });
    } catch (error) {
      if (controller.signal.aborted && !timedOut) return;
      dispatch({
        type: `${kind}/error`,
        key,
        tripKey,
        requestId,
        receivedAt: Date.now(),
        error: controlledError(
          timedOut ? 'DEADLINE_EXCEEDED' : error.code || 'NETWORK_ERROR',
          error.retryAt,
        ),
      });
    } finally {
      clearTimeout(timeout);
      if (controllers[kind] === controller) controllers[kind] = null;
    }
  };
}

export function loadSearch(context) {
  return request('search', '/api/v1/hotelDeals', context, contextKey(context));
}

export function detailKey(context, offerId, hotelId) {
  return JSON.stringify([contextKey(context), offerId, hotelId ?? null]);
}

export function loadDetail(context, offerId, hotelId) {
  return request(
    'detail',
    '/api/v1/deal',
    { ...context, offerId, ...(hotelId != null ? { hotelId } : {}) },
    detailKey(context, offerId, hotelId),
  );
}
