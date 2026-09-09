import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Button from 'antd/es/button';
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

function PropertyPhotos({ images, name, loading }) {
  const [failedImages, setFailedImages] = useState([]);
  const available = images.filter((image) => !failedImages.includes(image)).slice(0, 4);

  if (!available.length) {
    return loading ? null : (
      <p className="detail-photos-unavailable">Property photos are unavailable.</p>
    );
  }

  return (
    <div
      className={`detail-gallery detail-gallery-${available.length}`}
      aria-label="Named hotel photographs"
    >
      {available.map((image, index) => (
        <img
          key={image}
          src={image}
          alt={`${name || 'Named hotel'}, property photograph ${index + 1}`}
          width="960"
          height="640"
          loading={index === 0 ? 'eager' : 'lazy'}
          referrerPolicy="no-referrer"
          onError={() => setFailedImages((failed) => [...failed, image])}
        />
      ))}
    </div>
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
  const error = request.key === key ? request.error : null;
  const priceUpdateFailed = offer && !bindingRejected &&
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
          {(candidate || offer) && <div className={`detail-layout${candidate ? '' : ' detail-layout-unverified'}`}>
            {candidate && (
              <div className="detail-property-preview">
                <PropertyPhotos key={key} images={images} name={candidate.name} loading={loading} />
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
                  <p className="detail-offer-location">
                    {offer.neighborhoodName && `${offer.neighborhoodName} · `}
                    <Stars value={offer.stars} />
                  </p>
                  {!bindingRejected && <Quote quote={offer.quote} expired={priceStale} onRefresh={priceUpdateFailed ? undefined : retry} refreshing={loading} refreshDisabled={coolingDown} />}
                  {priceUpdateFailed && <div className="detail-total-unavailable" role="status">
                    <p>We couldn’t update this price. Try again or check the current price on Priceline.</p>
                    <Button onClick={retry} disabled={loading || coolingDown}>Try again</Button>
                  </div>}
                  {!bindingRejected && !priceUpdateFailed && data?.quoteStatus === 'unavailable' && !priceStale && <div className="detail-total-unavailable" role="status">
                    <p>A complete total is unavailable. Check the current price on Priceline or try again.</p>
                    <Button onClick={retry} disabled={loading || coolingDown}>Retry total price</Button>
                  </div>}
                  <TripSummary context={context} />
                  {!bindingRejected && candidate && (
                    <p className="detail-qualification">
                      Property photos show this hotel. Room details are on the original offer.
                    </p>
                  )}
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
            <div className="detail-property-content">
              {candidate && (data || amenities.length > 0) && (
                <section className="detail-property-section">
                  <h2>About the property</h2>
                  {data?.details?.description && <p>{data.details.description}</p>}
                  {data && (
                    <div className="detail-address">
                      <span className="eyebrow">Address</span>
                      <p>{address || 'Street address unavailable.'}</p>
                    </div>
                  )}
                  {amenities.length > 0 && (
                    <div className="detail-amenities">
                      <h3>Listed amenities</h3>
                      <ul>
                        {amenities.map((amenity, index) => (
                          <li key={index}>
                            <span aria-hidden="true">•</span>
                            {typeof amenity === 'string'
                              ? amenity.replaceAll('_', ' ')
                              : amenity?.name || 'Amenity not specified'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}
              {data?.detailStatus === 'unavailable' && (
                <div className="detail-coverage-notice">
                  <strong>Additional hotel details are unavailable</strong>
                  <p>The Express offer and available hotel clues are still shown.</p>
                </div>
              )}
            </div>
          </div>}
        </>
      )}
    </div>
  );
}
