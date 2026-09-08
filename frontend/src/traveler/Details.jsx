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

  const images = (data?.details?.images || [])
    .map((image) => safeHref(typeof image === 'string' ? image : image?.url))
    .filter(Boolean);
  const amenities = data?.details?.amenities || [];
  const retry = () => dispatch(loadDetail(context, offerId, hotelId));

  return (
    <div className="page-shell detail-page">
      <Link className="back-link" to={resultsUrl} state={{ restore: true }}>
        ← Back to results
      </Link>
      {!valid ? (
        <div className="empty-panel" role="alert">
          <h1>This candidate link is incomplete</h1>
          <p>
            A candidate needs a valid city, travel dates, Express offer, and
            hotel ID.
          </p>
          <Link className="button-link" to="/">
            Start a search
          </Link>
        </div>
      ) : (
        <>
          <header className="page-heading">
            <p className="eyebrow">A possibility, with the evidence attached</p>
            <h1 tabIndex="-1">{candidate?.name || 'Your hotel candidate'}</h1>
            <TripSummary context={context} />
            {candidate && (
              <div className="detail-metadata">
                <Tier tier={candidate.tier} />
                <span>
                  <Stars value={candidate.stars} /> ·{' '}
                  {candidate.neighborhoodName || context.cityName}
                </span>
              </div>
            )}
          </header>
          <p className="sr-only" role="status" aria-live="polite">
            {loading
              ? 'Loading candidate details.'
              : error
                ? 'Candidate details could not be loaded.'
                : data
                  ? `Details loaded for ${candidate.name}. Candidate identity remains unverified.`
                  : ''}
          </p>
          {loading && (
            <div className="detail-loading" aria-busy="true">
              <span className="loading-mark" aria-hidden="true" />
              <p>Checking the candidate details…</p>
            </div>
          )}
          {error && <ErrorNotice error={error} onRetry={retry} />}
          <div className="detail-grid">
            <div className="detail-main">
              {candidate && (
                <section className="detail-section">
                  <div className="section-heading">
                    <span className="eyebrow">01 / The comparison</span>
                    <h2>What connects this hotel to the offer?</h2>
                  </div>
                  <p className="candidate-disclaimer">
                    This hotel is a candidate for the unnamed Express offer.
                    Matching clues do not confirm its identity.
                  </p>
                  <Evidence candidate={candidate} />
                </section>
              )}
              {data?.detailStatus === 'unavailable' && (
                <div className="coverage-notice">
                  <strong>Additional hotel details are unavailable</strong>
                  <p>
                    The original Express quote and candidate evidence remain
                    above. Missing retail information does not mean the Express
                    offer is unavailable.
                  </p>
                </div>
              )}
              {(data?.details?.description || data?.details?.address) && (
                <section className="detail-section">
                  <div className="section-heading">
                    <span className="eyebrow">02 / The named hotel</span>
                    <h2>A little more about the stay</h2>
                  </div>
                  {data.details.description && <p>{data.details.description}</p>}
                  {data.details.address && (
                    <p className="hotel-address">
                      {typeof data.details.address === 'string'
                        ? data.details.address
                        : 'Address unavailable'}
                    </p>
                  )}
                </section>
              )}
              {images.length > 0 && (
                <div
                  className="hotel-images"
                  aria-label="Named hotel photographs"
                >
                  {images.slice(0, 4).map((image, index) => (
                    <img
                      key={image}
                      src={image}
                      alt={`${candidate?.name || 'Named hotel'}, property photograph ${index + 1}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  ))}
                </div>
              )}
              {amenities.length > 0 && (
                <section className="detail-section">
                  <h2>Listed amenities</h2>
                  <ul className="amenity-list">
                    {amenities.map((amenity, index) => (
                      <li key={index}>
                        {typeof amenity === 'string'
                          ? amenity.replaceAll('_', ' ')
                          : amenity?.name || 'Amenity not specified'}
                      </li>
                    ))}
                  </ul>
                  <p className="muted">
                    Listed amenities describe the named hotel. Confirm
                    availability and any extra charges with the provider.
                  </p>
                </section>
              )}
              {data && (
                <section className="detail-section retail-section">
                  <h2>Named hotel retail price</h2>
                  {detailsStale ? (
                    <>
                      <p role="status">The retail price is out of date.</p>
                      <Button onClick={retry} disabled={loading}>Refresh retail price</Button>
                    </>
                  ) : data.details?.retailQuote ? (
                    <>
                      <Quote
                        quote={data.details.retailQuote}
                        title="Separate retail quote"
                      />
                      <p>
                        This is a separately named retail listing. Its room,
                        cancellation policy, and inclusions may differ from the
                        Express offer.
                      </p>
                    </>
                  ) : (
                    <p>
                      No retail quote is available. This tells us nothing about
                      whether the original Express offer is still available.
                    </p>
                  )}
                </section>
              )}
            </div>
            <aside
              className="detail-quote-panel"
              aria-label="Original Express offer"
            >
              <span className="eyebrow">Keep the original in view</span>
              <h2>{offer?.neighborhoodName || 'Your Express offer'}</h2>
              {offer ? (
                <>
                  <p>
                    <Stars value={offer.stars} /> · Hotel name withheld
                  </p>
                  <Quote quote={offer.quote} />
                  <TripSummary context={context} />
                  {stale && (
                    <div className="inline-stale">
                      <strong>This quote is out of date.</strong>
                      <p>
                        Return to the results and refresh the search before
                        continuing.
                      </p>
                    </div>
                  )}
                  {bindingRejected ? (
                    <div className="provider-handoff">
                      <Button disabled>Original offer unavailable</Button>
                      <p role="status">
                        This comparison could not be verified. Return to the
                        results and refresh the search before continuing.
                      </p>
                    </div>
                  ) : (
                    <ProviderLink offer={offer} stale={stale} />
                  )}
                </>
              ) : (
                <p>
                  The original quote could not be retrieved. Return to the
                  results to select an offer.
                </p>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
