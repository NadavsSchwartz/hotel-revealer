import { contextKey } from './context.ts';
import { isRecord, validDetailResponse, validSearchResponse, validResolution } from './responseValidation.ts';
import type { Backoff, TripContext } from '../../../shared/contracts.ts';
import type { ViewCandidate as Candidate, ViewDetailResponse as DetailResponse, ViewOffer as Offer, ViewSearchResponse as SearchResponse } from './responseValidation.ts';
export { validResolution } from './responseValidation.ts';

const bindingErrors = new Set(['INVALID_SELECTION', 'SELECTION_UNAVAILABLE']);
export interface ControlledError { code: string; retryAt?: string | null }
export type RequestId = number | string;
interface RequestState { key: string | null; requestId: RequestId | null; status: 'idle' | 'loading' | 'success' | 'error'; error: ControlledError | null }
export interface DetailState extends RequestState {
  tripKey: string | null;
  searchAtStart: SearchResponse | null | undefined;
  offerId: string | null;
  hotelId: string | null;
  offer: Offer | null;
  offerExpiresAt: string | undefined;
  bindingRejected: boolean;
  data: DetailResponse | null;
}
export interface TravelerState {
  searches: Record<string, SearchResponse>;
  searchCooldowns: Record<string, Backoff>;
  search: RequestState;
  detail: DetailState;
}
interface ActionIdentity { key: string; requestId: RequestId; tripKey?: string; receivedAt?: number }
export type TravelerAction =
  | (ActionIdentity & { type: 'search/start' })
  | (ActionIdentity & { type: 'search/success'; data: SearchResponse })
  | (ActionIdentity & { type: 'search/error' | 'detail/error'; error: ControlledError })
  | (ActionIdentity & { type: 'detail/start'; tripKey: string; offerId: string; hotelId?: string | null })
  | (ActionIdentity & { type: 'detail/success'; data: DetailResponse })
  | { type: 'unknown' };
export type TravelerThunk = (dispatch: (action: TravelerAction) => void, getState?: () => TravelerState) => Promise<void>;

function selectionIn(search: SearchResponse | null | undefined, offerId: string | null, hotelId: string | null | undefined) {
  const offer = Array.isArray(search?.offers)
    ? search.offers.find(item => item?.offerId === offerId && validResolution(item)) : null;
  const candidate = Array.isArray(offer?.candidates) ? offer.candidates.find(item => item?.hotelId === hotelId) : null;
  return { offer: offer || null, candidate: candidate || null };
}

function detailWithResolution(data: DetailResponse, offer: Offer, hotelId: string | null): DetailResponse {
  const candidate = hotelId == null ? null : offer.candidates.find(item => item.hotelId === hotelId) ?? null;
  // Both fields come from the same validated discriminated offer. TypeScript
  // does not preserve that correlation when properties are spread separately.
  const updatedOffer = { ...data.offer, resolution: offer.resolution, candidates: offer.candidates } as Offer;
  return { ...data, offer: updatedOffer, candidate,
    ...(!candidate && hotelId != null ? { details: null, detailStatus: 'unavailable' } : {}) };
}

const usableEvidence = (search: SearchResponse | null | undefined, offer: Offer | null): offer is Offer =>
  search?.coverage.status === 'complete' && offer !== null &&
  (offer.resolution.status === 'matched' || !['missing_facts', 'incomplete_search'].includes(offer.resolution.reason));

export function selectSearchCooldown(state: TravelerState | undefined, key: string, now = Date.now()) {
  const retryAt = state?.searchCooldowns?.[key]?.retryAt;
  return Date.parse(retryAt ?? '') > now ? retryAt : null;
}

function recordCooldown(cooldowns: Record<string, Backoff>, action: ActionIdentity & { error?: ControlledError; data?: SearchResponse | DetailResponse }) {
  const now = action.receivedAt ?? Date.now();
  const error = action.error ?? action.data?.backoff;
  if (!error || (error.code !== 'PROVIDER_COOLDOWN' && error.code !== 'PROVIDER_UNAVAILABLE' && error.code !== 'PROVIDER_BUSY') ||
      typeof error.retryAt !== 'string' || !(Date.parse(error.retryAt) > now)) return cooldowns;
  const updated = Object.fromEntries(Object.entries(cooldowns || {}).filter(([, value]) => Date.parse(value.retryAt) > now));
  const key = action.tripKey || action.key;
  delete updated[key];
  updated[key] = { code: error.code, retryAt: error.retryAt };
  if (Object.keys(updated).length > 5) delete updated[Object.keys(updated)[0]];
  return updated;
}

export interface DetailViewInput { detail: DetailState; search: SearchResponse | null | undefined; key: string; offerId: string; hotelId?: string | null }
export interface DetailView { data: DetailResponse | null; offer: Offer | null; candidate: Candidate | null; expiresAt: string | undefined; bindingRejected: boolean }

export function selectDetailView({ detail, search, key, offerId, hotelId }: DetailViewInput): DetailView {
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

const initialState: TravelerState = {
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

export function travelerReducer(state: TravelerState = initialState, action: TravelerAction): TravelerState {
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
    const search = state.detail.tripKey === null ? undefined : state.searches[state.detail.tripKey];
    const stored = selectionIn(search, state.detail.offerId, state.detail.hotelId);
    const newerEvidence = search !== state.detail.searchAtStart && usableEvidence(search, stored.offer);
    // Only explicit same-offer evidence can replace an inference. Search
    // membership and incomplete discovery say nothing about an issued quote.
    let data = newerEvidence && stored.offer
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
const controllers: Record<'search' | 'detail', AbortController | null> = { search: null, detail: null };

function controlledError(code: string, retryAt?: unknown): ControlledError {
  return {
    code,
    retryAt:
      typeof retryAt === 'string' && Number.isFinite(Date.parse(retryAt))
        ? retryAt
        : null,
  };
}

async function post(path: string, input: TripContext & { offerId?: string; hotelId?: string }, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw controlledError('PROVIDER_RESPONSE_INVALID');
  }
  if (!response.ok) {
    const error = isRecord(data) && isRecord(data.error) ? data.error : {};
    throw controlledError(typeof error.code === 'string' && error.code ? error.code : 'INTERNAL_ERROR', error.retryAt);
  }
  return data;
}

function request(kind: 'search' | 'detail', path: string, input: TripContext & { offerId?: string; hotelId?: string }, key: string): TravelerThunk {
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
    if (kind === 'search') dispatch({ type: 'search/start', key, tripKey, requestId });
    else if (input.offerId !== undefined) dispatch({ type: 'detail/start', key, tripKey, requestId, offerId: input.offerId, hotelId: input.hotelId });
    try {
      const data = await post(path, input, controller.signal);
      if (kind === 'search') {
        if (!validSearchResponse(data) || contextKey(data.context) !== contextKey(input)) {
          throw controlledError('PROVIDER_RESPONSE_INVALID');
        }
        dispatch({ type: 'search/success', key, tripKey, requestId, data });
      } else {
        if (!validDetailResponse(data) || contextKey(data.context) !== contextKey(input) ||
            data.offer.offerId !== input.offerId ||
            (data.candidate !== null && data.candidate.hotelId !== input.hotelId) ||
            (data.refreshError !== undefined && (Object.keys(data.refreshError).join(',') !== 'code' || data.quoteStatus !== 'unavailable')) ||
            (input.hotelId === undefined
              ? data.candidate !== null || data.details !== null || data.detailStatus !== 'not_requested'
              : data.candidate === null
                ? data.details !== null || data.detailStatus !== 'unavailable' ||
                  data.offer.candidates.some(candidate => candidate.hotelId === input.hotelId)
                : !data.offer.candidates.some(candidate => candidate.hotelId === input.hotelId) ||
                  !['available', 'unavailable'].includes(data.detailStatus))) {
          throw controlledError('PROVIDER_RESPONSE_INVALID');
        }
        dispatch({ type: 'detail/success', key, tripKey, requestId, data });
      }
    } catch (failure) {
      const error = isRecord(failure) ? failure : {};
      if (controller.signal.aborted && !timedOut) return;
      dispatch({
        type: kind === 'search' ? 'search/error' : 'detail/error',
        key,
        tripKey,
        requestId,
        receivedAt: Date.now(),
        error: controlledError(
          timedOut ? 'DEADLINE_EXCEEDED' : typeof error.code === 'string' && error.code ? error.code : 'NETWORK_ERROR',
          error.retryAt,
        ),
      });
    } finally {
      clearTimeout(timeout);
      if (controllers[kind] === controller) controllers[kind] = null;
    }
  };
}

export function loadSearch(context: TripContext) {
  return request('search', '/api/v1/hotelDeals', context, contextKey(context));
}

export function detailKey(context: Parameters<typeof contextKey>[0], offerId: string, hotelId?: string | null) {
  return JSON.stringify([contextKey(context), offerId, hotelId ?? null]);
}

export function loadDetail(context: TripContext, offerId: string, hotelId?: string | null) {
  return request(
    'detail',
    '/api/v1/deal',
    { ...context, offerId, ...(hotelId != null ? { hotelId } : {}) },
    detailKey(context, offerId, hotelId),
  );
}
