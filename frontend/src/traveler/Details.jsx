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
import { detailKey, loadDetail } from './state.js';
import {
  ErrorNotice,
  Evidence,
  ProviderLink,
  Quote,
  Stars,
  Tier,
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
  const hotelId = params.get('hotelId') || '';
  const valid =
    Object.keys(errors).length === 0 &&
    validIdentifier(offerId, MAX_OFFER_ID_LENGTH) &&
    validIdentifier(hotelId);
  const key = detailKey(requestedContext, offerId, hotelId);
  const request = useSelector((state) => state.detail);
  const search = useSelector((state) => state.searches[contextKey(requestedContext)]);
  const data = request.key === key ? request.data : null;
  const context = data?.context || search?.context || requestedContext;
  const error = request.key === key ? request.error : null;
  const [rejectedSelection, setRejectedSelection] = useState(null);
  const bindingError = [
    'INVALID_SELECTION',
    'PROVIDER_RESPONSE_INVALID',
    'PROVIDER_DISABLED',
    'PROVIDER_NOT_CONFIGURED',
  ].includes(error?.code);
  const bindingRejected = !data && (bindingError || rejectedSelection === key);
  const loading =
    valid &&
    (!request.key || request.key !== key || request.status === 'loading');
  const storedOffer = search?.offers.find((offer) => offer.offerId === offerId);
  const historyOffer =
    location.state?.offer?.offerId === offerId ? location.state.offer : null;
  const offer = data?.offer || storedOffer || historyOffer;
  const candidate = bindingRejected
    ? null
    : data?.candidate ||
      storedOffer?.candidates.find((hotel) => hotel.hotelId === hotelId) ||
      (location.state?.candidate?.hotelId === hotelId
        ? location.state.candidate
        : null);
  const expiresAt =
    data?.offerExpiresAt || data?.expiresAt || search?.expiresAt || location.state?.expiresAt;
  const stale = useExpired(expiresAt);
  const detailsStale = useExpired(data?.expiresAt);
  const priceStale = useExpired(offer?.quoteExpiresAt || expiresAt);
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
    // A retry must not briefly restore a relationship the server rejected.
    if (bindingError) setRejectedSelection(key);
    else if (data) setRejectedSelection(null);
  }, [bindingError, data, key]);

  useEffect(() => {
    if (valid) dispatch(loadDetail(context, offerId, hotelId));
    // Candidate selection, not incidental history state, owns this request.
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
  const retry = () => dispatch(loadDetail(context, offerId, hotelId));
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
          <h1>This hotel link is incomplete</h1>
          <p>
            This page needs a valid destination, travel dates, Express offer, and
            hotel ID.
          </p>
          <Link className="button-link" to="/">
            Start a search
          </Link>
        </div>
      ) : (
        <>
          <header className="detail-heading">
            <p className="eyebrow">Possible hotel</p>
            <h1 tabIndex="-1">{candidate?.name || 'Your hotel match'}</h1>
            {candidate && <Tier tier={candidate.tier} />}
            {candidate && offer?.candidates?.length > 1 && <p className="detail-location">One of {offer.candidates.length} hotels matching this offer</p>}
            <p className="detail-location">
              {candidate?.neighborhoodName && `${candidate.neighborhoodName} · `}
              {context.cityName}
            </p>
          </header>
          <p className="sr-only" role="status" aria-live="polite">
            {loading
              ? 'Loading hotel details.'
              : error
                ? 'Hotel details could not be loaded.'
                : data
                  ? `Details loaded for ${candidate.name}. Candidate identity remains unverified.`
                  : ''}
          </p>
          {loading && (
            <div className="detail-loading" aria-busy="true">
              <span className="detail-progress-dot" aria-hidden="true" />
              <p>Loading hotel details…</p>
            </div>
          )}
          {error && (
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
                  <Quote quote={offer.quote} expired={Boolean(offer.quoteExpiresAt) && priceStale} onRefresh={retry} refreshing={loading} />
                  <TripSummary context={context} />
                  {!bindingRejected && candidate && (
                    <p className="detail-qualification">
                      Property photos show this hotel. Room details are on the original offer.
                    </p>
                  )}
                  {stale && (
                    <div className="inline-stale">
                      <strong>This quote is out of date.</strong>
                    </div>
                  )}
                  {bindingRejected ? (
                    <p className="detail-binding-status" role="status">
                      Choose a hotel from refreshed results to continue.
                    </p>
                  ) : (
                    <ProviderLink offer={offer} stale={stale} onRefresh={refreshOffers} />
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
                            <span aria-hidden="true">↗</span>
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
              {candidate && (
                <details className="detail-evidence">
                  <summary>
                    <h2>Why this match?</h2>
                    <span aria-hidden="true">+</span>
                  </summary>
                  <div className="detail-evidence-content">
                    <p>One possible hotel among those checked for this offer.</p>
                    <Tier tier={candidate.tier} />
                    <Evidence candidate={candidate} offer={offer} />
                  </div>
                </details>
              )}
              {data && (
                <section className="detail-retail">
                  <div className="detail-retail-heading">
                    <span className="eyebrow">A separate option</span>
                    <h2>Named hotel retail price</h2>
                  </div>
                  {detailsStale ? (
                    <>
                      <p role="status">The retail price is out of date.</p>
                      <Button onClick={retry} disabled={loading}>Refresh retail price</Button>
                    </>
                  ) : data.details?.retailQuote ? (
                    <>
                      <Quote quote={data.details.retailQuote} title="Separate retail quote" />
                      <p>
                        A separately named listing. Its room, cancellation policy,
                        and inclusions may differ from the Express offer.
                      </p>
                    </>
                  ) : (
                    <p>No retail quote is available. The original Express offer is shown separately.</p>
                  )}
                </section>
              )}
            </div>
          </div>}
        </>
      )}
    </div>
  );
}
