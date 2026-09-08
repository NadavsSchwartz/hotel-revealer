import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Button from 'antd/es/button';
import SearchForm from './SearchForm.jsx';
import SearchProgress from './SearchProgress.jsx';
import {
  contextFromSearch,
  contextKey,
  readView,
  safeHref,
  saveView,
  searchUrl,
  validateContext,
} from './context.js';
import { loadSearch } from './state.js';
import {
  ErrorNotice,
  Evidence,
  ProviderLink,
  Quote,
  StaleNotice,
  Stars,
  Tier,
  TripSummary,
  useExpired,
} from './components.jsx';
import './results.css';

const PAGE_SIZE = 12;
const MATCH_BATCH_SIZE = 8;

function CandidatePhoto({ candidate, eager }) {
  const source = safeHref(candidate.thumbnailUrl);
  const [failedSource, setFailedSource] = useState(null);
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
          Photo unavailable
        </span>
      )}
    </span>
  );
}

function comparableNightly(offer, rooms) {
  const quote = offer.quote;
  return Number.isInteger(quote?.nightlyCents) &&
    quote.nightlyCents >= 0 &&
    (rooms === 1 || quote.nightlyBasis === 'per-room')
    ? quote.nightlyCents
    : Infinity;
}

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const navigationType = useNavigationType();
  const input = useMemo(
    () => contextFromSearch(location.search),
    [location.search],
  );
  const validation = validateContext(input);
  const requestedContext = validation.context;
  const key = contextKey(requestedContext);
  const [localView, setLocalView] = useState(() => ({ ...readView(key), key }));
  const [editing, setEditing] = useState(false);
  const view = localView.key === key ? localView : readView(key);
  const matchLimits = view.matchLimits || {};
  const valid = Object.keys(validation.errors).length === 0;
  const data = useSelector((state) => state.searches[key]);
  const hasData = Boolean(data);
  const context = data?.context || requestedContext;
  const request = useSelector((state) => state.search);
  const loading = request.key === key && request.status === 'loading';
  const error =
    request.key === key && request.status === 'error' ? request.error : null;
  const cooldownUntil = useSelector((state) => state.searchCooldowns[key]);
  const cooldownExpired = useExpired(cooldownUntil);
  const coolingDown = Boolean(cooldownUntil) && !cooldownExpired;
  const cooldownError = cooldownUntil ? { code: 'PROVIDER_COOLDOWN', retryAt: cooldownUntil } : null;
  const visibleError = coolingDown ? cooldownError : error || (!data ? cooldownError : null);
  const params = new URLSearchParams(location.search);
  const waitingForFirstResults = valid && !data && (loading || !visibleError);
  const sort = params.get('sort') === 'price' ? 'price' : 'evidence';
  const expanded = params.has('expanded') ? params.getAll('expanded')
    : Array.isArray(view.expanded) ? view.expanded : [];
  const rawPage = Number(params.get('page') || 1);
  const requestedPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const stale = useExpired(data?.expiresAt);
  const restoredKey = useRef(null);
  const focusResults = useRef(false);
  const searchRevision = location.state?.searchRevision;
  const lastRevision = useRef(null);

  useEffect(() => {
    const next = new URLSearchParams(location.search);
    if (!next.has('expanded')) return;
    // Accept old links once, but keep growing comparison state out of request URLs.
    const expanded = next.getAll('expanded');
    saveView(key, { expanded });
    setLocalView((current) => ({ ...(current.key === key ? current : readView(key)), key, expanded }));
    next.delete('expanded');
    navigate(`/results?${next}`, { replace: true, state: location.state });
  }, [key, location.search, location.state, navigate]);

  useEffect(() => {
    if (!data || input.cityName === data.context.cityName) return;
    const next = new URLSearchParams(location.search);
    next.set('cityName', data.context.cityName);
    navigate(`/results?${next}`, { replace: true, state: location.state });
  }, [data, input.cityName, location.search, location.state, navigate]);

  useEffect(() => {
    if (!valid) return;
    const isNewSubmission =
      navigationType !== 'POP' &&
      searchRevision &&
      lastRevision.current !== searchRevision;
    lastRevision.current = searchRevision;
    if (!hasData || isNewSubmission) dispatch(loadSearch(context));
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

  const offers = [...(data?.offers || [])].sort((a, b) => {
    const priceDifference =
      comparableNightly(a, context.rooms) - comparableNightly(b, context.rooms);
    if (sort === 'price')
      return priceDifference || a.offerId.localeCompare(b.offerId);
    const hasSupported = (offer) =>
      (offer.candidates || []).some((candidate) => candidate.tier === 'supported');
    return (
      Number(hasSupported(b)) - Number(hasSupported(a)) ||
      priceDifference ||
      a.offerId.localeCompare(b.offerId)
    );
  });
  const pageCount = Math.max(1, Math.ceil(offers.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const firstOffer = (page - 1) * PAGE_SIZE;
  const visibleOffers = offers.slice(firstOffer, firstOffer + PAGE_SIZE);
  const candidateCount = offers.reduce(
    (total, offer) => total + (offer.candidates || []).length,
    0,
  );

  useEffect(() => {
    if (!data) return;
    const next = new URLSearchParams(location.search);
    if (!next.has('page') || next.get('page') === String(page)) return;
    next.set('page', String(page));
    navigate(`/results?${next}`, { replace: true, state: location.state });
  }, [data, page, location.search, location.state, navigate]);

  function updateView(nextSort, nextExpanded, nextPage = page) {
    const next = new URLSearchParams(location.search);
    next.set('sort', nextSort);
    next.set('page', String(nextPage));
    next.delete('expanded');
    setLocalView({ ...view, key, expanded: nextExpanded });
    saveView(key, {
      sort: nextSort,
      page: nextPage,
      expanded: nextExpanded,
      scrollY: window.scrollY,
    });
    if (next.toString() !== location.search.slice(1))
      navigate(`/results?${next}`, { replace: true, state: location.state });
  }

  function changePage(nextPage) {
    focusResults.current = true;
    updateView(sort, expanded, nextPage);
  }

  function refresh() {
    if (!loading && !coolingDown) dispatch(loadSearch(context));
  }

  function editTrip() {
    setEditing(true);
    requestAnimationFrame(() => {
      const field = document.getElementById('cityName');
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({ block: 'nearest' });
    });
  }

  function showMoreMatches(offerId, currentLimit) {
    const limits = { ...matchLimits, [offerId]: currentLimit + MATCH_BATCH_SIZE };
    saveView(key, { matchLimits: limits });
    setLocalView({ ...view, key, matchLimits: limits });
  }

  function candidateLink(offer, candidate, focusId) {
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
          ? `${offers.length} Express offers found with ${candidateCount} hotel matches.${data.coverage.status === 'partial' ? ' Results are partial.' : ''} Showing page ${page} of ${pageCount}.`
          : '';

  return (
    <div className={`page-shell results-page${waitingForFirstResults ? ' is-searching' : ''}`}>
      <Link className="back-link" to="/">
        ← New trip
      </Link>
      <header className="page-heading">
        <p className="eyebrow">YOUR TRIP / THE POSSIBILITIES</p>
        <div className="results-heading-row">
          <h1 id="results-title" tabIndex="-1">
            {valid ? <><span className="results-heading-prefix">Hotel matches in </span>{context.cityName.split(',')[0]}</> : 'Check your trip details'}
          </h1>
          {valid && <Button className="edit-trip-toggle" aria-expanded={editing} aria-controls="results-search"
            onClick={editing ? () => setEditing(false) : editTrip}>{editing ? 'Close editor' : 'Edit trip'}</Button>}
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
          {data && <p className="results-cached-note">Your last retrieved results are shown below.</p>}
        </>
      )}
      {valid && data && (
        <section className="results-content" aria-label="Hotel search results" aria-busy={loading}>
          {loading && <SearchProgress variant="refresh" />}
          {stale && !loading && <StaleNotice onRefresh={refresh} disabled={coolingDown} />}
          {data.coverage.status === 'partial' && (
            <div className="coverage-notice" role="note">
              <strong>Partial results</strong>
              <p>
                We could not assess all available listings. These are the offers
                and candidates checked so far; other possibilities may be missing.
              </p>
            </div>
          )}
          <div className="results-toolbar">
            <div>
              <h2 id="results-count" tabIndex="-1">
                {offers.length} Express {offers.length === 1 ? 'offer' : 'offers'}
              </h2>
              <p>
                Updated {new Date(data.retrievedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {pageCount > 1 && ` · Showing ${firstOffer + 1}–${Math.min(firstOffer + PAGE_SIZE, offers.length)}`}
              </p>
            </div>
            {offers.length > 0 && (
              <div className="sort-control">
                <label htmlFor="offer-sort">Sort by</label>
                <select
                  id="offer-sort"
                  value={sort}
                  onChange={(event) => updateView(event.target.value, expanded, 1)}
                >
                  <option value="evidence">Match strength</option>
                  <option value="price">Nightly price</option>
                </select>
              </div>
            )}
          </div>
          {offers.length > 0 && (
            <p className="results-comparison-intro">
              Hotel names are possible matches based on Priceline’s listing clues. Open a hotel to see why it fits.
            </p>
          )}
          {offers.length === 0 && (
            <div className="empty-panel">
              <span className="empty-symbol" aria-hidden="true">∅</span>
              <h2>No Express offers were returned</h2>
              <p>
                Try a different city or set of dates. This does not mean that
                every hotel is sold out.
              </p>
            </div>
          )}
          <div className="offer-list">
            {visibleOffers.map((offer, index) => {
              const isOpen = expanded.includes(offer.offerId);
              const candidates = offer.candidates || [];
              const savedLimit = matchLimits[offer.offerId];
              const matchLimit = Number.isSafeInteger(savedLimit) && savedLimit >= MATCH_BATCH_SIZE
                ? savedLimit : MATCH_BATCH_SIZE;
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
                    <Quote quote={offer.quote} compact />
                    {candidates.length > 0 ? (
                      <div className="offer-preview">
                        <p className="preview-label">Possible {candidates.length === 1 ? 'hotel' : 'hotels'}</p>
                        <ul className="candidate-previews">
                          {candidates.slice(0, 2).map((candidate, candidateIndex) => {
                            const focusId = `preview-${encodeURIComponent(offer.offerId)}-${encodeURIComponent(candidate.hotelId)}`;
                            return (
                              <li key={candidate.hotelId}>
                                <Link className="candidate-preview" {...candidateLink(offer, candidate, focusId)} aria-label={`View possible hotel: ${candidate.name}`}>
                                  <CandidatePhoto candidate={candidate} eager={index === 0 && candidateIndex === 0} />
                                  <span className="candidate-preview-copy">
                                    <Tier tier={candidate.tier} />
                                    <strong>{candidate.name}</strong>
                                    <span className="candidate-preview-meta"><Stars value={candidate.stars} />{candidate.guestRating != null && ` · ${candidate.guestRating}/10 guests`}</span>
                                    <span className="candidate-preview-action">View hotel <span aria-hidden="true">↗</span></span>
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                        {candidates.length > 2 && <p className="preview-more">+{candidates.length - 2} more possible {candidates.length - 2 === 1 ? 'hotel' : 'hotels'} in the comparison</p>}
                      </div>
                    ) : (
                      <div className="offer-preview-empty">
                        <strong>{offer.unassessedCount > 0 ? 'Hotel clues are incomplete' : 'No hotel match found'}</strong>
                        <p>{offer.unassessedCount > 0 ? 'Some hotels could not be assessed. Open the comparison limits for details.' : 'None of the assessed hotels met the available clues. You can still review the original Express offer.'}</p>
                      </div>
                    )}
                    <div className="offer-booking">
                      <ProviderLink offer={offer} stale={stale} onRefresh={refresh} refreshing={loading} refreshDisabled={coolingDown} />
                    </div>
                  </div>
                  <div className="offer-action">
                    <p className="offer-candidate-count">
                      {candidates.length ? 'Match details' : 'About this offer'}
                    </p>
                    <Button
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => updateView(sort, isOpen ? expanded.filter((id) => id !== offer.offerId) : [...expanded, offer.offerId])}
                    >
                      {isOpen ? 'Hide match details' : candidates.length ? (candidates.length === 1 ? 'Why this match?' : 'Why these matches?') : 'About this offer'}
                      <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
                    </Button>
                  </div>
                  {isOpen && (
                    <div id={panelId} className="offer-expanded">
                      {candidates.length === 0 && (
                        <div className="no-candidates">
                          <h4>{offer.unassessedCount > 0 ? 'Not enough information to match this hotel' : 'No matches among the hotels assessed'}</h4>
                          <p>
                            {offer.unassessedCount > 0
                              ? `${offer.unassessedCount} hotels could not be assessed because required clues were missing. A hotel without enough evidence is not ruled out.`
                              : 'The compared hotels did not meet the evidence requirements. The actual hotel may be outside the retrieved listings.'}
                          </p>
                        </div>
                      )}
                      {candidates.slice(0, matchLimit).map((candidate) => {
                        const focusId = `candidate-${encodeURIComponent(offer.offerId)}-${encodeURIComponent(candidate.hotelId)}`;
                        return (
                          <section className="candidate-row" key={candidate.hotelId} aria-label={`Hotel match: ${candidate.name}`}>
                            <div className="candidate-heading">
                              <div>
                                <Tier tier={candidate.tier} />
                                <h4>{candidate.name}</h4>
                                <p>
                                  <Stars value={candidate.stars} />
                                  {candidate.guestRating != null && <> · {candidate.guestRating}/10 guest rating</>}
                                  {candidate.reviewCount != null && <> · {candidate.reviewCount.toLocaleString()} reviews</>}
                                </p>
                              </div>
                              <Link className="candidate-link" {...candidateLink(offer, candidate, focusId)}>
                                View hotel details <span aria-hidden="true">↗</span>
                                <span className="sr-only">: {candidate.name}</span>
                              </Link>
                            </div>
                            <Evidence candidate={candidate} offer={offer} />
                          </section>
                        );
                      })}
                      {candidates.length > matchLimit && <div className="candidate-show-more">
                        <Button onClick={() => showMoreMatches(offer.offerId, matchLimit)}>
                          Show {Math.min(MATCH_BATCH_SIZE, candidates.length - matchLimit)} more hotels
                        </Button>
                      </div>}
                      {candidates.length > 0 && offer.unassessedCount > 0 && (
                        <p className="unassessed-note">
                          {offer.unassessedCount} additional {offer.unassessedCount === 1 ? 'hotel was' : 'hotels were'} not assessed because required evidence was missing.
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {pageCount > 1 && (
            <nav className="results-pagination" aria-label="Results pages">
              <Button onClick={() => changePage(page - 1)} disabled={page === 1}><span aria-hidden="true">←</span> Previous</Button>
              <span>Page <strong>{page}</strong> of {pageCount}</span>
              <Button onClick={() => changePage(page + 1)} disabled={page === pageCount}>Next <span aria-hidden="true">→</span></Button>
            </nav>
          )}
          <details className="results-footnote">
            <summary>About these results</summary>
            <p>
              Matches are based on {data.coverage.namedHotelsChecked ?? 0} hotel listings checked for your trip.
              {data.coverage.unassessedHotels > 0 ? ' Some listings had too little information to compare.' : ''}
              {' '}Other hotels may be available outside these results.
            </p>
            <p>
              Prices retrieved {new Date(data.retrievedAt).toLocaleString('en-US')}. Rates and availability can change.
            </p>
          </details>
        </section>
      )}
    </div>
  );
}
