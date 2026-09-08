import { contextKey } from './context.js';

const bindingErrors = new Set(['INVALID_SELECTION', 'PROVIDER_RESPONSE_INVALID', 'PROVIDER_DISABLED', 'PROVIDER_NOT_CONFIGURED']);

function selectionIn(search, offerId, hotelId) {
  const offer = Array.isArray(search?.offers) ? search.offers.find(item => item?.offerId === offerId) : null;
  const candidate = Array.isArray(offer?.candidates) ? offer.candidates.find(item => item?.hotelId === hotelId) : null;
  return { offer: offer || null, candidate: candidate || null };
}

export function selectSearchCooldown(state, key, now = Date.now()) {
  const retryAt = state?.searchCooldowns?.[key];
  return Date.parse(retryAt) > now ? retryAt : null;
}

function recordCooldown(cooldowns, action) {
  const now = action.receivedAt ?? Date.now();
  if (action.error.code !== 'PROVIDER_COOLDOWN' || !(Date.parse(action.error.retryAt) > now)) return cooldowns;
  const updated = Object.fromEntries(Object.entries(cooldowns || {}).filter(([, retryAt]) => Date.parse(retryAt) > now));
  const key = action.tripKey || action.key;
  delete updated[key];
  updated[key] = action.error.retryAt;
  if (Object.keys(updated).length > 5) delete updated[Object.keys(updated)[0]];
  return updated;
}

export function selectDetailView({ detail, search, key, offerId, hotelId }) {
  const current = detail.key === key ? detail : null;
  const data = current?.data;
  const stored = selectionIn(search, offerId, hotelId);
  const excluded = Boolean(search && !stored.candidate && !(data && current.dataSearch === search));
  const bindingRejected = Boolean(current?.bindingRejected || excluded);
  if (data && !bindingRejected) {
    return { data, offer: data.offer, candidate: data.candidate,
      expiresAt: data.offerExpiresAt || data.expiresAt, bindingRejected: false };
  }
  if (search) {
    return { data: null, offer: stored.offer, candidate: bindingRejected ? null : stored.candidate,
      expiresAt: search.expiresAt, bindingRejected };
  }
  return { data: null, offer: null, candidate: null, expiresAt: undefined, bindingRejected };
}

const initialState = {
  searches: {},
  searchCooldowns: {},
  search: { key: null, requestId: null, status: 'idle', error: null },
  detail: {
    key: null,
    tripKey: null,
    searchAtStart: null,
    dataSearch: null,
    offerId: null,
    hotelId: null,
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
    const searches = { ...state.searches, [action.key]: action.data };
    const oldest = Object.keys(searches)[0];
    if (Object.keys(searches).length > 5) delete searches[oldest];
    const excluded = state.detail.tripKey === action.key && state.detail.offerId && state.detail.hotelId &&
      !selectionIn(action.data, state.detail.offerId, state.detail.hotelId).candidate;
    return {
      ...state,
      searches,
      search: { ...state.search, status: 'success', error: null },
      detail: excluded ? { ...state.detail, data: null, dataSearch: null, bindingRejected: true } : state.detail,
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
    const excluded = Boolean(searchAtStart && !selectionIn(searchAtStart, action.offerId, action.hotelId).candidate &&
      !(sameSelection && state.detail.data && state.detail.dataSearch === searchAtStart));
    const bindingRejected = excluded || (sameSelection && state.detail.bindingRejected);
    return {
      ...state,
      detail: {
        key: action.key,
        tripKey: action.tripKey,
        searchAtStart,
        dataSearch: sameSelection && !bindingRejected ? state.detail.dataSearch : null,
        offerId: action.offerId,
        hotelId: action.hotelId,
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
    if (search && search !== state.detail.searchAtStart &&
        !selectionIn(search, state.detail.offerId, state.detail.hotelId).candidate) {
      // An older detail operation cannot contradict a search completed since it began.
      return { ...state, detail: { ...state.detail, searchAtStart: null, dataSearch: null, data: null,
        status: 'error', error: { code: 'INVALID_SELECTION' }, bindingRejected: true } };
    }
    return {
      ...state,
      detail: { ...state.detail, searchAtStart: null, dataSearch: search, status: 'success', data: action.data,
        error: null, bindingRejected: false },
    };
  }
  if (
    action.type === 'detail/error' &&
    state.detail.requestId === action.requestId
  ) {
    let searches = state.searches;
    const { tripKey, searchAtStart } = state.detail;
    if (
      action.error.code === 'INVALID_SELECTION' &&
      searchAtStart && state.searches[tripKey] === searchAtStart
    ) {
      // A rejection invalidates the shortlist used for this selection, but a
      // search that completed after detail/start owns its newer cache entry.
      searches = { ...state.searches };
      delete searches[tripKey];
    }
    return {
      ...state,
      searches,
      searchCooldowns: recordCooldown(state.searchCooldowns, action),
      detail: { ...state.detail, searchAtStart: null, status: 'error', error: action.error,
        data: bindingErrors.has(action.error.code) ? null : state.detail.data,
        dataSearch: bindingErrors.has(action.error.code) ? null : state.detail.dataSearch,
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
        (!Array.isArray(data.offers) || !data.coverage)
      ) {
        throw controlledError('PROVIDER_RESPONSE_INVALID');
      }
      if (
        kind === 'detail' &&
        (data.offer?.offerId !== input.offerId ||
          data.candidate?.hotelId !== input.hotelId)
      ) {
        throw controlledError('INVALID_SELECTION');
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
  return `${contextKey(context)}|${offerId}|${hotelId}`;
}

export function loadDetail(context, offerId, hotelId) {
  return request(
    'detail',
    '/api/v1/deal',
    { ...context, offerId, hotelId },
    detailKey(context, offerId, hotelId),
  );
}
