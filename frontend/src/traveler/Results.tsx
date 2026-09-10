import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/index.ts';
import type { TripDraft } from '../../../shared/contracts.ts';
import type { ViewCandidate as Candidate, ViewOffer as Offer } from './responseValidation.ts';
import SearchForm from './SearchForm.tsx';
import SearchProgress from './SearchProgress.tsx';
import SortSelect, { SORT_LABELS } from './SortSelect.tsx';
import {
  contextFromSearch,
  contextKey,
  parseOfferSort,
  readView,
  safeHref,
  saveView,
  searchUrl,
  validateContext,
} from './context.ts';
import type { OfferSort } from './context.ts';
import { loadSearch, validResolution } from './state.ts';
import {
  ErrorNotice,
  ProviderLink,
  Quote,
  Stars,
  TripSummary,
  useExpired,
} from './components.tsx';
import './results.css';

const PAGE_SIZE = 12;

function CandidatePhoto({ candidate, eager }: { candidate: Candidate; eager: boolean }) {
  const source = safeHref(candidate.thumbnailUrl);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <span className="candidate-preview-photo">
      {source && failedSource !== source ? (
        <img
          src={source}
          alt={candidate.name}
          width="240"
          height="180"
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailedSource(source)}
        />
      ) : (
        <span className="candidate-photo-missing">
          <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path d="M7 33V11l13-5 13 5v22M3 33h34M15 33v-8h10v8M13 14h3m8 0h3m-14 5h3m8 0h3" />
          </svg>
          <span>Photo unavailable</span>
        </span>
      )}
    </span>
  );
}

function comparableNightly(offer: Offer, rooms: TripDraft['rooms']) {
  const quote = offer.quote;
  return quote.nightlyCents !== null && Number.isInteger(quote.nightlyCents) &&
    quote.nightlyCents >= 0 &&
    (rooms === 1 || quote.nightlyBasis === 'per-room')
    ? quote.nightlyCents
    : Infinity;
}

function comparableDiscount(offer: Offer) {
  const discount = offer.quote.advertisedDiscount;
  return discount?.source === 'Priceline' && discount.percent > 0 && discount.percent < 100
    ? discount.percent : -Infinity;
}

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const navigationType = useNavigationType();
  const input = useMemo(
    () => contextFromSearch(location.search),
    [location.search],
  );
  const validation = validateContext(input);
  const requestedContext = validation.context;
  const key = contextKey(requestedContext);
  const [editing, setEditing] = useState(false);
  const valid = validation.valid;
  const data = useAppSelector((state) => state.searches[key]);
  const hasData = Boolean(data);
  const context = data?.context || requestedContext;
  const request = useAppSelector((state) => state.search);
  const loading = request.key === key && request.status === 'loading';
  const error =
    request.key === key && request.status === 'error' ? request.error : null;
  const cooldownError = useAppSelector((state) => state.searchCooldowns[key]);
  const cooldownUntil = cooldownError?.retryAt;
  const cooldownExpired = useExpired(cooldownUntil);
  const coolingDown = Boolean(cooldownUntil) && !cooldownExpired;
  const visibleError = coolingDown ? cooldownError : error || (!data ? cooldownError : null);
  const params = new URLSearchParams(location.search);
  const waitingForFirstResults = valid && !data && (loading || !visibleError);
  const sort = parseOfferSort(params.get('sort'));
  const rawPage = Number(params.get('page') || 1);
  const requestedPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const stale = useExpired(data?.expiresAt);
  const restoredKey = useRef<string | null>(null);
  const focusResults = useRef(false);
  const searchRevision = location.state?.searchRevision;
  const lastRevision = useRef<unknown>(null);

  useEffect(() => {
    const next = new URLSearchParams(location.search);
    if (!next.has('expanded')) return;
    next.delete('expanded');
    void navigate(`/results?${next}`, { replace: true, state: location.state });
  }, [key, location.search, location.state, navigate]);

  useEffect(() => {
    if (!data || input.cityName === data.context.cityName) return;
    const next = new URLSearchParams(location.search);
    next.set('cityName', data.context.cityName);
    void navigate(`/results?${next}`, { replace: true, state: location.state });
  }, [data, input.cityName, location.search, location.state, navigate]);

  useEffect(() => {
    if (!validation.valid) return;
    const isNewSubmission =
      navigationType !== 'POP' &&
      searchRevision &&
      lastRevision.current !== searchRevision;
    lastRevision.current = searchRevision;
    if (!hasData || isNewSubmission) void dispatch(loadSearch(data?.context || validation.context));
    if (isNewSubmission) {
      setEditing(false);
      document.getElementById('results-title')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    // View-only URL changes do not issue another provider request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, valid, hasData, searchRevision, dispatch]);

  useEffect(() => {
    if (!data || loading || restoredKey.current === key) return undefined;
    restoredKey.current = key;
    const saved = readView(key);
    const restore = location.state?.restore || !searchRevision;
    if (!restore) {
      window.scrollTo(0, 0);
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      if (saved.focusId)
        document.getElementById(saved.focusId)?.focus({ preventScroll: true });
      window.scrollTo(0, Number(saved.scrollY) || 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [data, loading, key, searchRevision, location.state?.restore]);

  useEffect(() => {
    if (!focusResults.current) return undefined;
    focusResults.current = false;
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById('results-count');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.search]);

  useEffect(() => {
    const saveScroll = () => saveView(key, { scrollY: window.scrollY });
    window.addEventListener('scroll', saveScroll, { passive: true });
    return () => window.removeEventListener('scroll', saveScroll);
  }, [key]);

  const offers = (data?.offers || [])
    .filter((offer): offer is Extract<Offer, { candidates: [Candidate] }> => validResolution(offer) && offer.resolution.status === 'matched')
    .sort((a, b) => {
      if (sort === 'rating') {
        const ratingA = a.candidates[0].guestRating;
        const ratingB = b.candidates[0].guestRating;
        const difference = (ratingB !== null && Number.isFinite(ratingB) ? ratingB : -Infinity) -
          (ratingA !== null && Number.isFinite(ratingA) ? ratingA : -Infinity);
        if (difference) return difference;
      }
      if (sort === 'stars') {
        const difference = (b.stars ?? -Infinity) - (a.stars ?? -Infinity);
        if (difference) return difference;
      }
      if (sort === 'discount') {
        const difference = comparableDiscount(b) - comparableDiscount(a);
        if (difference) return difference;
      }
      return comparableNightly(a, context.rooms) - comparableNightly(b, context.rooms) ||
        a.offerId.localeCompare(b.offerId);
    });
  const pageCount = Math.max(1, Math.ceil(offers.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const firstOffer = (page - 1) * PAGE_SIZE;
  const visibleOffers = offers.slice(firstOffer, firstOffer + PAGE_SIZE);


  useEffect(() => {
    if (!data) return;
    const next = new URLSearchParams(location.search);
    if (!next.has('page') || next.get('page') === String(page)) return;
    next.set('page', String(page));
    void navigate(`/results?${next}`, { replace: true, state: location.state });
  }, [data, page, location.search, location.state, navigate]);

  function updateView(nextSort: OfferSort, nextPage = page) {
    const next = new URLSearchParams(location.search);
    next.set('sort', nextSort);
    next.set('page', String(nextPage));
    next.delete('expanded');
    saveView(key, {
      sort: nextSort,
      page: nextPage,
      scrollY: window.scrollY,
    });
    if (next.toString() !== location.search.slice(1))
      void navigate(`/results?${next}`, { replace: true, state: location.state });
  }

  function changePage(nextPage: number) {
    focusResults.current = true;
    updateView(sort, nextPage);
  }

  function refresh() {
    if (!loading && !coolingDown && validation.valid) void dispatch(loadSearch(data?.context || validation.context));
  }

  function editTrip() {
    setEditing(true);
    requestAnimationFrame(() => {
      const field = document.getElementById('cityName');
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({ block: 'nearest' });
    });
  }

  function candidateLink(offer: Offer, candidate: Candidate, focusId: string) {
    return {
      id: focusId,
      to: searchUrl(context, '/deal', {
        offerId: offer.offerId,
        hotelId: candidate.hotelId,
      }),
      state: {
        resultsUrl: `/results${location.search}`,
      },
      onClick: () => saveView(key, { focusId, scrollY: window.scrollY }),
    };
  }

  const statusText = !valid
    ? 'Review your trip details.'
    : loading
      ? data
        ? 'Updating hotel deals. Previous results remain available.'
        : 'Searching hotel deals.'
      : visibleError
        ? `${visibleError.code === 'PROVIDER_COOLDOWN' && !coolingDown
          ? 'The provider pause has ended. You can try this search again.'
          : 'Search could not be completed.'}${data ? ' Previous results remain available.' : ''}`
        : data
          ? `${offers.length} hotel deals found with a likely hotel.${data.coverage.status === 'partial' ? ' The search was incomplete.' : ''} Showing page ${page} of ${pageCount}. Sorted by ${SORT_LABELS[sort].toLowerCase()}.`
          : '';

  return (
    <div className={`page-shell results-page${waitingForFirstResults ? ' is-searching' : ''}`}>
      <Link className="back-link" to="/">
        <svg className="action-icon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><path d="M16 10H4m5-5-5 5 5 5" /></svg> New trip
      </Link>
      <header className="page-heading">
        <p className="eyebrow">YOUR TRIP / EXPRESS DEALS</p>
        <div className="results-heading-row">
          <h1 id="results-title" tabIndex={-1}>
            {valid ? <><span className="results-heading-prefix">Hotel deals in </span>{context.cityName.split(',')[0]}</> : 'Check your trip details'}
          </h1>
          {valid && <button type="button" className="ui-button edit-trip-toggle" aria-expanded={editing} aria-controls="results-search"
            onClick={editing ? () => setEditing(false) : editTrip}>{editing ? 'Hide form' : 'Edit trip'}</button>}
        </div>
        {valid && <TripSummary context={context} />}
      </header>
      <div id="results-search" className={`results-search${editing || !valid ? ' is-editing' : ''}`} onFocusCapture={() => setEditing(true)}>
        <SearchForm initial={data?.context || input} compact blockedSearchKey={coolingDown ? key : null} />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {statusText}
      </p>
      {!valid && (
        <div className="empty-panel" role="alert">
          <h2>Complete your trip details</h2>
          <p>{Object.values(validation.errors).join(' ')}</p>
        </div>
      )}
      {waitingForFirstResults && <SearchProgress />}
      {valid && !loading && visibleError && (
        <>
          <ErrorNotice error={visibleError} onRetry={refresh} onEdit={editTrip} />
          {data && <p className="results-cached-note">Your previous results are shown below.</p>}
        </>
      )}
      {valid && data && (
        <section className="results-content" aria-label="Hotel search results" aria-busy={loading}>
          {loading && <SearchProgress variant="refresh" />}
          <div className="results-toolbar">
            <div>
              <h2 id="results-count" tabIndex={-1}>
                {offers.length} hotel {offers.length === 1 ? 'deal' : 'deals'}
              </h2>
              <p className="results-updated">
                Prices checked {new Date(data.retrievedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {pageCount > 1 && ` · Showing ${firstOffer + 1}–${Math.min(firstOffer + PAGE_SIZE, offers.length)}`}
                {offers.length > 0 && <button type="button" className="ui-button results-refresh" onClick={refresh} disabled={loading || coolingDown}>{loading ? 'Updating…' : 'Update prices'}</button>}
              </p>
            </div>
            {offers.length > 0 && <SortSelect value={sort} onChange={value => updateView(value, 1)} />}
          </div>
          {offers.length > 0 && (
            <p className="results-comparison-intro">
              Hotel names are inferred, not guaranteed.
            </p>
          )}
          {offers.length === 0 && (
            <div className="empty-panel">
              <h2>No hotel matches found</h2>
              <p>{data.coverage.status === 'partial'
                ? 'The search did not finish, so we could not identify hotels reliably. Try again.'
                : 'We could not identify a hotel for these dates. Try different dates or a nearby destination.'}</p>
              {data.coverage.status === 'partial' && <button type="button" className="ui-button" onClick={refresh} disabled={loading || coolingDown}>Try search again</button>}
            </div>
          )}
          <div className="offer-list">
            {visibleOffers.map((offer, index) => {
              const candidate = offer.candidates[0];
              const panelId = `offer-${encodeURIComponent(offer.offerId)}`;
              return (
                <article className="offer-card" key={offer.offerId} aria-labelledby={`${panelId}-title`}>
                  <div className="offer-overview">
                    <div className="offer-identity">
                      <span className="offer-index">
                        {String(firstOffer + index + 1).padStart(2, '0')} / EXPRESS OFFER
                      </span>
                      <h3 id={`${panelId}-title`}>
                        {offer.neighborhoodName || 'Neighborhood unavailable'}
                      </h3>
                      <p className="offer-meta">
                        <Stars value={offer.stars} />
                        <span aria-hidden="true"> · </span>Hotel name withheld
                      </p>
                    </div>
                    <div className="offer-preview">
                      <p className="preview-label">Likely hotel</p>
                      <Link className="candidate-preview" {...candidateLink(offer, candidate, `preview-${encodeURIComponent(offer.offerId)}-${encodeURIComponent(candidate.hotelId)}`)} aria-label={`View likely hotel: ${candidate.name}`}>
                        <CandidatePhoto candidate={candidate} eager={index === 0} />
                        <span className="candidate-preview-copy">
                          <strong>{candidate.name}</strong>
                          <span className="candidate-preview-meta"><Stars value={candidate.stars} />{candidate.guestRating != null && <span>Guest rating: {candidate.guestRating}/10</span>}</span>
                        </span>
                      </Link>
                    </div>
                    <div className="offer-booking">
                      <Quote quote={offer.quote} compact trip={data.context} stale={stale} />
                      <Link className="offer-detail-link button-link" {...candidateLink(offer, candidate, `details-${encodeURIComponent(offer.offerId)}`)}>
                        View hotel details
                        <svg className="action-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg>
                      </Link>
                      <ProviderLink offer={offer} stale={stale} refreshing={loading} compact />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {pageCount > 1 && (
            <nav className="results-pagination" aria-label="Results pages">
              <button type="button" className="ui-button" onClick={() => changePage(page - 1)} disabled={page === 1}><svg className="action-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10H4m5-5-5 5 5 5" /></svg> Previous</button>
              <span>Page <strong>{page}</strong> of {pageCount}</span>
              <button type="button" className="ui-button" onClick={() => changePage(page + 1)} disabled={page === pageCount}>Next <svg className="action-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg></button>
            </nav>
          )}
        </section>
      )}
    </div>
  );
}
