import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import PropertyPhotos from './PropertyPhotos.jsx';
import { MAX_OFFER_ID_LENGTH, validIdentifier } from '../../../shared/identifiers.js';
import {
  contextFromSearch,
  contextKey,
  safeHref,
  searchUrl,
  validateContext,
} from './context.js';
import { detailKey, loadDetail, selectDetailView, selectSearchCooldown } from './state.js';
import {
  ErrorNotice,
  ProviderLink,
  Quote,
  Stars,
  TripSummary,
  useExpired,
} from './components.jsx';
import './details.css';
import './progress.css';

const priorityAmenity = /wi[ -]?fi|internet|parking|pool|breakfast|accessible|accessibility|wheelchair|fitness|gym|air.condition/i;

function PropertyAmenities({ amenities }) {
  const [expanded, setExpanded] = useState(false);
  const names = [...new Set(amenities.map(item => typeof item === 'string' ? item : item?.name)
    .filter(name => typeof name === 'string' && name.trim()).map(name => name.trim().replaceAll('_', ' ')))];
  names.sort((a, b) => Number(priorityAmenity.test(b)) - Number(priorityAmenity.test(a)));
  if (!names.length) return null;
  return (
    <section className="detail-amenities">
      <h2>Amenities</h2>
      <ul id="hotel-amenities">
        {(expanded ? names : names.slice(0, 6)).map(name => <li key={name}><span aria-hidden="true">•</span>{name}</li>)}
      </ul>
      {names.length > 6 && <button type="button" className="ui-button detail-text-button" aria-expanded={expanded} aria-controls="hotel-amenities" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Show fewer amenities' : `Show all ${names.length} amenities`}
      </button>}
    </section>
  );
}

export default function Details() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const input = useMemo(
    () => contextFromSearch(location.search),
    [location.search],
  );
  const { context: requestedContext, errors } = validateContext(input);
  const params = new URLSearchParams(location.search);
  const offerId = params.get('offerId') || '';
  const hotelId = params.has('hotelId') ? params.get('hotelId') : null;
  const valid =
    Object.keys(errors).length === 0 &&
    validIdentifier(offerId, MAX_OFFER_ID_LENGTH) &&
    (hotelId === null || validIdentifier(hotelId));
  const key = detailKey(requestedContext, offerId, hotelId);
  const request = useSelector((state) => state.detail);
  const search = useSelector((state) => state.searches[contextKey(requestedContext)]);
  const cooldown = useSelector((state) => selectSearchCooldown(state, contextKey(requestedContext)));
  const { data, offer, candidate, expiresAt, bindingRejected } = selectDetailView({
    detail: request, search, key, offerId, hotelId,
  });
  const context = data?.context || search?.context || requestedContext;
  const error = request.key === key ? request.error ?? request.data?.backoff ?? request.data?.refreshError : null;
  const priceUpdateFailed = offer && !bindingRejected && !error?.retryAt &&
    ['DEADLINE_EXCEEDED', 'PROVIDER_UNAVAILABLE', 'NETWORK_ERROR'].includes(error?.code);
  const loading =
    valid &&
    (!request.key || request.key !== key || request.status === 'loading');
  const stale = useExpired(expiresAt);
  const priceStale = useExpired(offer?.quoteExpiresAt || expiresAt);
  const cooldownExpired = useExpired(cooldown);
  const coolingDown = Boolean(cooldown && !cooldownExpired);
  const proposedReturn = location.state?.resultsUrl;
  const returnUrl =
    typeof proposedReturn === 'string' &&
    proposedReturn.startsWith('/results?') &&
    contextKey(contextFromSearch(proposedReturn.split('?')[1])) ===
      contextKey(context)
      ? proposedReturn
      : searchUrl(context);
  const returnParams = new URLSearchParams(returnUrl.split('?')[1]);
  returnParams.set('cityName', context.cityName);
  const resultsUrl = `/results?${returnParams}`;

  useEffect(() => {
    if ((!data && !search) || input.cityName === context.cityName) return;
    const next = new URLSearchParams(location.search);
    next.set('cityName', context.cityName);
    navigate(`/deal?${next}`, { replace: true, state: location.state });
  }, [data, search, input.cityName, context.cityName, location.search, location.state, navigate]);

  useEffect(() => {
    if (valid) dispatch(loadDetail(context, offerId, hotelId));
    // The offer and optional hotel identity own this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, valid, dispatch]);

  const images = [...new Set((data?.details?.images || [])
    .map((image) => safeHref(typeof image === 'string' ? image : image?.url))
    .filter(Boolean))];
  const thumbnail = safeHref(candidate?.thumbnailUrl);
  if (!images.length && thumbnail) images.push(thumbnail);
  const amenities = data?.details?.amenities || [];
  const address = typeof data?.details?.address === 'string'
    ? data.details.address.trim()
    : null;
  const description = data?.details?.description;
  const hasPropertyInfo = Boolean(address || description || amenities.length);
  let mapsUrl = candidate?.name && address
    ? `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: `${candidate.name}, ${address}` })}` : null;
  if (mapsUrl?.length > 2048) mapsUrl = null;
  const reviewsUrl = candidate && /^[1-9]\d*$/.test(candidate.hotelId) && candidate.reviewCount > 0
    ? `https://www.priceline.com/relax/at/${candidate.hotelId}` : null;
  const retry = () => {
    if (!loading && !coolingDown && !bindingRejected) dispatch(loadDetail(context, offerId, hotelId));
  };
  const refreshOffers = () => navigate(resultsUrl, {
    state: { restore: true, searchRevision: Date.now() },
  });
  const editTrip = () => navigate(resultsUrl);

  return (
    <div className="page-shell detail-page">
      <Link className="back-link" to={resultsUrl} state={{ restore: true }}>
        ← Back to results
      </Link>
      {!valid ? (
        <div className="empty-panel" role="alert">
          <h1>This offer link is incomplete</h1>
          <p>
            This link is missing valid trip or offer information.
            Return to results and choose a hotel deal.
          </p>
          <Link className="button-link" to="/">
            Start a search
          </Link>
        </div>
      ) : (
        <>
          <header className="detail-heading">
            <p className="eyebrow">{candidate ? 'Likely hotel' : 'Express offer'}</p>
            <h1 tabIndex="-1">{candidate?.name || 'Your Express offer'}</h1>
            {candidate && <p className="detail-location">The hotel name is inferred from the deal information, and is not guaranteed.</p>}
            <p className="detail-location">
              {candidate?.neighborhoodName && `${candidate.neighborhoodName} · `}
              {context.cityName}
            </p>
          </header>
          <p className="sr-only" role="status" aria-live="polite">
            {loading
              ? hotelId ? 'Loading hotel details and total price.' : 'Checking the total price.'
              : error
                ? 'This offer could not be updated.'
                : data
                  ? candidate ? `Details loaded for ${candidate.name}.` : 'Original offer loaded.'
                  : ''}
          </p>
          {loading && (
            <div className="detail-loading" aria-busy="true">
              <span className="detail-progress-dot" aria-hidden="true" />
              <p>{hotelId ? 'Loading hotel details and total price…' : 'Checking the total price…'}</p>
            </div>
          )}
          {error && !priceUpdateFailed && (
            <ErrorNotice
              error={error}
              onRetry={bindingRejected ? undefined : retry}
              onEdit={editTrip}
              onReturn={refreshOffers}
            />
          )}
          {data && hotelId && !candidate && <p className="detail-coverage-notice" role="status">
            We couldn’t verify the selected hotel. You can still check the original Express offer below.
          </p>}
          {(candidate || offer) && <div className={`detail-layout${candidate ? '' : ' detail-layout-unverified'}`}>
            {candidate && (
              <div className="detail-property-preview">
                {images.length > 0 && <PropertyPhotos key={key} images={images} name={candidate.name} />}
                <div className="detail-property-facts" aria-label="Hotel ratings">
                  {Number.isFinite(candidate.guestRating) && (
                    <div className="detail-guest-rating">
                      <strong>{candidate.guestRating}<span>/10</span></strong>
                      <span>Guest rating</span>
                    </div>
                  )}
                  {Number.isFinite(candidate.reviewCount) && (
                    <p>{candidate.reviewCount.toLocaleString()} reviews</p>
                  )}
                  {reviewsUrl && <a className="detail-external-link" href={reviewsUrl} target="_blank" rel="noopener noreferrer">
                    Read reviews on Priceline<span className="sr-only"> (opens the hotel page in a new tab)</span>
                  </a>}
                  <p><Stars value={candidate.stars} />{Number.isFinite(candidate.stars) && ' hotel'}</p>
                </div>
              </div>
            )}
            <aside
              className="detail-quote-panel"
              aria-label="Original Express offer"
            >
              <h2>Original Express offer</h2>
              {offer ? (
                <>
                  {!candidate && <p className="detail-offer-location">
                    {offer.neighborhoodName && `${offer.neighborhoodName} · `}
                    <Stars value={offer.stars} />
                  </p>}
                  {!bindingRejected && <Quote quote={offer.quote} expired={priceStale} onRefresh={priceUpdateFailed ? undefined : retry} refreshing={loading} refreshDisabled={coolingDown} />}
                  {priceUpdateFailed && <div className="detail-total-unavailable" role="status">
                    <p>We couldn’t update this price. Try again or check the current price on Priceline.</p>
                    <button type="button" className="ui-button" onClick={retry} disabled={loading || coolingDown}>Try again</button>
                  </div>}
                  {!bindingRejected && !priceUpdateFailed && data?.quoteStatus === 'unavailable' && !priceStale && <div className="detail-total-unavailable" role="status">
                    <p>A complete total is unavailable. Check the current price on Priceline or try again.</p>
                    <button type="button" className="ui-button" onClick={retry} disabled={loading || coolingDown}>Retry total price</button>
                  </div>}
                  <TripSummary context={context} />
                  <ProviderLink offer={offer} stale={stale || priceStale} unavailable={data?.quoteStatus === 'unavailable'} refreshing={loading} />
                  {!hotelId && data?.offer?.resolution?.status === 'matched' && data.offer.candidates?.length === 1 && (
                    <p className="detail-qualification"><Link to={searchUrl(context, '/deal', { offerId, hotelId: data.offer.candidates[0].hotelId })} state={location.state}>View the likely hotel</Link></p>
                  )}
                </>
              ) : (
                <p>
                  The original quote could not be retrieved. Return to the
                  results to select an offer.
                </p>
              )}
            </aside>
            {candidate && <div className="detail-property-content">
              {hasPropertyInfo && <div className="detail-property-section">
                {description && <section><h2>About this hotel</h2><p>{description}</p></section>}
                {address && <section className="detail-address">
                  <h2>Location</h2>
                  <p>{address}</p>
                  {mapsUrl && <a className="detail-external-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">
                    Open in Google Maps<span className="sr-only"> (opens in a new tab)</span>
                  </a>}
                </section>}
                <PropertyAmenities key={key} amenities={amenities} />
              </div>}
              {data && !hasPropertyInfo && <p className="detail-coverage-notice">Additional hotel information is unavailable.</p>}
            </div>}
          </div>}
        </>
      )}
    </div>
  );
}
