import { contextKey } from './context.js';

const initialState = {
  searches: {},
  search: { key: null, requestId: null, status: 'idle', error: null },
  detail: {
    key: null,
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
    return {
      ...state,
      searches,
      search: { ...state.search, status: 'success', error: null },
    };
  }
  if (
    action.type === 'search/error' &&
    state.search.requestId === action.requestId
  ) {
    return {
      ...state,
      search: { ...state.search, status: 'error', error: action.error },
    };
  }
  if (action.type === 'detail/start') {
    return {
      ...state,
      detail: {
        key: action.key,
        requestId: action.requestId,
        status: 'loading',
        data: null,
        error: null,
      },
    };
  }
  if (
    action.type === 'detail/success' &&
    state.detail.requestId === action.requestId
  ) {
    return {
      ...state,
      detail: { ...state.detail, status: 'success', data: action.data },
    };
  }
  if (
    action.type === 'detail/error' &&
    state.detail.requestId === action.requestId
  ) {
    return {
      ...state,
      detail: { ...state.detail, status: 'error', error: action.error },
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
  return async (dispatch) => {
    controllers[kind]?.abort();
    const controller = new AbortController();
    controllers[kind] = controller;
    const requestId = ++nextRequestId;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);
    dispatch({ type: `${kind}/start`, key, requestId });
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
      dispatch({ type: `${kind}/success`, key, requestId, data });
    } catch (error) {
      if (controller.signal.aborted && !timedOut) return;
      dispatch({
        type: `${kind}/error`,
        key,
        requestId,
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
