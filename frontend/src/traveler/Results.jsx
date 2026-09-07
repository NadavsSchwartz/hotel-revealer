import React, { useEffect, useMemo, useRef } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Button from 'antd/es/button';
import SearchForm from './SearchForm.jsx';
import {
  contextFromSearch,
  contextKey,
  readView,
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
  const context = validation.context;
  const key = contextKey(context);
  const valid = Object.keys(validation.errors).length === 0;
  const data = useSelector((state) => state.searches[key]);
  const request = useSelector((state) => state.search);
  const loading = request.key === key && request.status === 'loading';
  const error =
    request.key === key && request.status === 'error' ? request.error : null;
  const params = new URLSearchParams(location.search);
  const sort = params.get('sort') === 'price' ? 'price' : 'evidence';
  const expanded = params.getAll('expanded');
  const stale = useExpired(data?.expiresAt);
  const restoredKey = useRef(null);
  const searchRevision = location.state?.searchRevision;
  const lastRevision = useRef(null);

  useEffect(() => {
    if (!valid) return;
    const isNewSubmission =
      navigationType !== 'POP' &&
      searchRevision &&
      lastRevision.current !== searchRevision;
    lastRevision.current = searchRevision;
    if (!data || isNewSubmission) dispatch(loadSearch(context));
    // View-only URL changes do not issue another provider request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, valid, searchRevision, dispatch]);

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
    const saveScroll = () => saveView(key, { scrollY: window.scrollY });
    window.addEventListener('scroll', saveScroll, { passive: true });
    return () => window.removeEventListener('scroll', saveScroll);
  }, [key]);

  function updateView(nextSort, nextExpanded) {
    const next = new URLSearchParams(location.search);
    next.set('sort', nextSort);
    next.delete('expanded');
    nextExpanded.forEach((id) => next.append('expanded', id));
    saveView(key, {
      sort: nextSort,
      expanded: nextExpanded,
      scrollY: window.scrollY,
    });
    navigate(`/results?${next}`, { replace: true, state: location.state });
  }

  function refresh() {
    dispatch(loadSearch(context));
  }

  const offers = [...(data?.offers || [])].sort((a, b) => {
    if (sort === 'price')
      return (
        (a.quote?.nightlyCents ?? Infinity) -
          (b.quote?.nightlyCents ?? Infinity) ||
        a.offerId.localeCompare(b.offerId)
      );
    const supported = (offer) =>
      (offer.candidates || []).filter(
        (candidate) => candidate.tier === 'supported',
      ).length;
    return supported(b) - supported(a) || a.offerId.localeCompare(b.offerId);
  });
  const candidateCount = offers.reduce(
    (total, offer) => total + (offer.candidates || []).length,
    0,
  );
  const statusText = !valid
    ? 'Review your trip details.'
    : loading
      ? 'Searching Express offers and comparing available hotel clues.'
      : error
        ? 'Search could not be completed.'
        : data
          ? `${offers.length} Express offers found with ${candidateCount} candidate comparisons.${data.coverage.status === 'partial' ? ' Results are partial.' : ''}`
          : '';

  return (
    <div className="page-shell results-page">
      <Link className="back-link" to="/">
        ← New trip
      </Link>
      <header className="page-heading">
        <p className="eyebrow">Your hotel shortlist</p>
        <h1 tabIndex="-1">
          {valid
            ? `A closer look at ${context.cityName.split(',')[0]}.`
            : 'Let’s check your trip.'}
        </h1>
        {valid && <TripSummary context={context} />}
      </header>
      <SearchForm initial={input} compact />
      <p className="sr-only" role="status" aria-live="polite">
        {statusText}
      </p>
      {!valid && (
        <div className="empty-panel" role="alert">
          <h2>Complete your trip details</h2>
          <p>{Object.values(validation.errors).join(' ')}</p>
        </div>
      )}
      {loading && (
        <div className="loading-panel" aria-busy="true">
          <span className="loading-mark" aria-hidden="true" />
          <h2>Following the clues.</h2>
          <p>
            Retrieving Express offers and comparing the available hotel
            evidence.
          </p>
        </div>
      )}
      {!loading && error && <ErrorNotice error={error} onRetry={refresh} />}
      {!loading && data && (
        <>
          {stale && <StaleNotice onRefresh={refresh} />}
          {data.coverage.status === 'partial' && (
            <div className="coverage-notice" role="note">
              <strong>Partial results</strong>
              <p>
                We could not assess all available listings. These are the offers
                and candidates checked so far; other possibilities may be
                missing.
              </p>
            </div>
          )}
          <div className="results-toolbar">
            <div>
              <h2>
                {offers.length} Express{' '}
                {offers.length === 1 ? 'offer' : 'offers'}
              </h2>
              <p>
                {candidateCount} candidate{' '}
                {candidateCount === 1 ? 'comparison' : 'comparisons'} · Identity
                remains unverified
              </p>
            </div>
            {offers.length > 0 && (
              <div className="sort-control">
                <label htmlFor="offer-sort">Sort by</label>
                <select
                  id="offer-sort"
                  value={sort}
                  onChange={(event) => updateView(event.target.value, expanded)}
                >
                  <option value="evidence">Supported candidates</option>
                  <option value="price">Lowest nightly quote</option>
                </select>
              </div>
            )}
          </div>
          {offers.length === 0 && (
            <div className="empty-panel">
              <span className="empty-symbol" aria-hidden="true">
                ∅
              </span>
              <h2>No Express offers were returned</h2>
              <p>
                Try a different city or set of dates. This does not mean that
                every hotel is sold out.
              </p>
            </div>
          )}
          <div className="offer-list">
            {offers.map((offer, index) => {
              const isOpen = expanded.includes(offer.offerId);
              const candidates = offer.candidates || [];
              const panelId = `offer-${encodeURIComponent(offer.offerId)}`;
              return (
                <article
                  className="offer-card"
                  key={offer.offerId}
                  aria-labelledby={`${panelId}-title`}
                >
                  <div className="offer-overview">
                    <div className="offer-identity">
                      <span className="offer-index">
                        {String(index + 1).padStart(2, '0')} / EXPRESS OFFER
                      </span>
                      <h3 id={`${panelId}-title`}>
                        {offer.neighborhoodName || 'Neighborhood unavailable'}
                      </h3>
                      <p className="offer-meta">
                        <Stars value={offer.stars} />
                        <span aria-hidden="true"> · </span>Hotel name withheld
                      </p>
                      <p className="offer-candidate-count">
                        {candidates.length
                          ? `${candidates.length} ${candidates.length === 1 ? 'candidate' : 'candidates'} to compare`
                          : 'No supported candidates found'}
                        {offer.unassessedCount > 0 && (
                          <span> · {offer.unassessedCount} unassessed</span>
                        )}
                      </p>
                    </div>
                    <Quote quote={offer.quote} compact />
                  </div>
                  <div className="offer-action">
                    <p>
                      A candidate is a possibility, never a confirmed hotel.
                    </p>
                    <Button
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() =>
                        updateView(
                          sort,
                          isOpen
                            ? expanded.filter((id) => id !== offer.offerId)
                            : [...expanded, offer.offerId],
                        )
                      }
                    >
                      {isOpen
                        ? 'Hide comparison'
                        : candidates.length
                          ? `Compare ${candidates.length} ${candidates.length === 1 ? 'candidate' : 'candidates'}`
                          : 'See comparison limits'}
                      <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
                    </Button>
                  </div>
                  {isOpen && (
                    <div id={panelId} className="offer-expanded">
                      {candidates.length === 0 && (
                        <div className="no-candidates">
                          <h4>
                            {offer.unassessedCount > 0
                              ? 'Not enough evidence to name a candidate'
                              : 'No matches among the hotels assessed'}
                          </h4>
                          <p>
                            {offer.unassessedCount > 0
                              ? `${offer.unassessedCount} hotels could not be assessed because required clues were missing. A hotel without enough evidence is not ruled out.`
                              : 'The compared hotels did not meet the evidence requirements. The actual hotel may be outside the retrieved listings.'}
                          </p>
                        </div>
                      )}
                      {candidates.map((candidate) => {
                        const focusId = `candidate-${encodeURIComponent(offer.offerId)}-${encodeURIComponent(candidate.hotelId)}`;
                        return (
                          <section
                            className="candidate-row"
                            key={candidate.hotelId}
                            aria-label={`Candidate: ${candidate.name}`}
                          >
                            <div className="candidate-heading">
                              <div>
                                <Tier tier={candidate.tier} />
                                <h4>{candidate.name}</h4>
                                <p>
                                  <Stars value={candidate.stars} />
                                  {candidate.guestRating != null && (
                                    <>
                                      {' '}
                                      · {candidate.guestRating}/10 guest rating
                                    </>
                                  )}
                                  {candidate.reviewCount != null && (
                                    <>
                                      {' '}
                                      · {candidate.reviewCount.toLocaleString()}{' '}
                                      reviews
                                    </>
                                  )}
                                </p>
                              </div>
                              <Link
                                id={focusId}
                                className="candidate-link"
                                to={searchUrl(context, '/deal', {
                                  offerId: offer.offerId,
                                  hotelId: candidate.hotelId,
                                })}
                                state={{
                                  resultsUrl: `/results${location.search}`,
                                  offer,
                                  candidate,
                                  expiresAt: data.expiresAt,
                                }}
                                onClick={() =>
                                  saveView(key, {
                                    focusId,
                                    scrollY: window.scrollY,
                                  })
                                }
                              >
                                View candidate <span aria-hidden="true">↗</span>
                                <span className="sr-only">
                                  : {candidate.name}
                                </span>
                              </Link>
                            </div>
                            <Evidence candidate={candidate} />
                          </section>
                        );
                      })}
                      {candidates.length > 0 && offer.unassessedCount > 0 && (
                        <p className="unassessed-note">
                          {offer.unassessedCount} additional{' '}
                          {offer.unassessedCount === 1
                            ? 'hotel was'
                            : 'hotels were'}{' '}
                          not assessed because required evidence was missing.
                        </p>
                      )}
                      <ProviderLink offer={offer} stale={stale} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <div className="results-footnote">
            <p>
              Compared {data.coverage.namedHotelsChecked ?? 0} named hotels
              across {data.coverage.pagesFetched ?? 0} retrieved{' '}
              {data.coverage.pagesFetched === 1 ? 'page' : 'pages'}.{' '}
              {data.coverage.unassessedHotels > 0
                ? `${data.coverage.unassessedHotels} hotels could not be assessed. `
                : ''}
              Retrieved listings do not cover every possible hotel.
            </p>
            <p>
              Prices were retrieved{' '}
              {new Date(data.retrievedAt).toLocaleString('en-US')}. Rates and
              availability can change.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
