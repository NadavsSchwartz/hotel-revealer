import React, { useEffect, useState } from 'react';
import Button from 'antd/es/button';
import Alert from 'antd/es/alert';
import 'antd/es/alert/style/css';
import { displayDate, money, nights, safeHref } from './context.js';

export function TripSummary({ context }) {
  const count = nights(context);
  const children = context.childrenAges?.length || 0;
  return (
    <p className="trip-summary">
      {displayDate(context.checkIn)} –{' '}
      {displayDate(context.checkOut, { year: 'numeric' })}
      <span aria-hidden="true"> / </span>
      {count} {count === 1 ? 'night' : 'nights'}
      <span aria-hidden="true"> / </span>
      {context.rooms} {context.rooms === 1 ? 'room' : 'rooms'}, {context.adults} {context.adults === 1 ? 'adult' : 'adults'}
      {children > 0 && <>, {children} {children === 1 ? 'child' : 'children'}</>}, USD
    </p>
  );
}

export function Quote({
  quote,
  title = 'Original Express quote',
  compact = false,
}) {
  const nightly = money(quote?.nightlyCents);
  const stay = money(quote?.stayCents);
  const taxes =
    quote?.taxesFees === 'included'
      ? 'Taxes and fees included'
      : quote?.taxesFees === 'excluded'
        ? 'Taxes and fees excluded'
        : 'Taxes and fees not confirmed';
  return (
    <section
      className={`quote ${compact ? 'quote-compact' : ''}`}
      aria-label={title}
    >
      <span className="eyebrow">{title}</span>
      <p className="quote-price">
        {nightly || 'Rate unavailable'}
        {nightly && <span> / night</span>}
      </p>
      <p className="quote-stay">
        {stay ? `${stay} for the stay` : 'Stay total unavailable'}{' '}
        <span>· USD</span>
      </p>
      <p className="quote-taxes">{taxes}</p>
    </section>
  );
}

export function Evidence({ candidate }) {
  const supporting = candidate.evidence?.supporting || [];
  const missing = candidate.evidence?.missing || [];
  const readable = (item) =>
    typeof item === 'string'
      ? item.replaceAll('_', ' ')
      : item?.label || item?.description || 'Evidence unavailable';
  return (
    <div className="evidence-columns">
      <section>
        <h4>
          <span aria-hidden="true">+</span> Supporting evidence
        </h4>
        {supporting.length ? (
          <ul>
            {supporting.map((item, index) => (
              <li key={index}>{readable(item)}</li>
            ))}
          </ul>
        ) : (
          <p>No supporting evidence supplied.</p>
        )}
      </section>
      <section>
        <h4>
          <span aria-hidden="true">−</span> Missing evidence
        </h4>
        {missing.length ? (
          <ul>
            {missing.map((item, index) => (
              <li key={index}>{readable(item)}</li>
            ))}
          </ul>
        ) : (
          <p>
            No gaps reported in the compared clues. Identity is still
            unverified.
          </p>
        )}
      </section>
    </div>
  );
}

export function Tier({ tier }) {
  return (
    <span className={`tier ${tier === 'supported' ? 'tier-supported' : ''}`}>
      {tier === 'supported' ? 'Supported candidate' : 'Partial candidate'}
    </span>
  );
}

export function Stars({ value }) {
  return (
    <span>
      {typeof value === 'number' ? `${value}-star` : 'Star rating unavailable'}
    </span>
  );
}

export function useClock(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function useExpired(expiresAt) {
  const [expiredAt, setExpiredAt] = useState(null);
  const expiry = Date.parse(expiresAt || '');
  useEffect(() => {
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return undefined;
    const timer = setTimeout(
      () => setExpiredAt(expiry),
      Math.min(expiry - Date.now() + 10, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [expiry]);
  return (
    !Number.isFinite(expiry) || expiry <= Date.now() || expiredAt === expiry
  );
}

const errorCopy = {
  RESULT_TOO_LARGE: [
    'Too many possible comparisons',
    'This search contains more possible matches than we can assess safely. Try different dates or another city.',
  ],
  PROVIDER_NOT_CONFIGURED: [
    'Live search is not connected yet',
    'Hotel Revealer does not currently have authorized live provider access. Your trip is ready, but real offers cannot be retrieved yet.',
  ],
  PROVIDER_DISABLED: [
    'Live search is currently paused',
    'The hotel provider connection is disabled. Your trip details are preserved. Please try again later.',
  ],
  PROVIDER_COOLDOWN: [
    'The provider needs a short pause',
    'Too many searches reached the hotel provider. Wait for the retry time below, then try again.',
  ],
  PROVIDER_BUSY: [
    'The provider is busy',
    'Your trip details are preserved. Please wait a moment and try again.',
  ],
  DEADLINE_EXCEEDED: [
    'The search took too long',
    'We could not finish within the search time limit. Your trip details are preserved. You can try again.',
  ],
  PROVIDER_UNAVAILABLE: [
    'The hotel provider is unavailable',
    'We could not retrieve reliable hotel information. Please try again later.',
  ],
  PROVIDER_RESPONSE_INVALID: [
    'We could not verify this response',
    'The hotel information was incomplete or inconsistent. Please try a fresh search.',
  ],
  INVALID_SELECTION: [
    'This candidate cannot be opened',
    'We could not confirm that this hotel belongs to this Express offer and trip. Return to the results and choose a candidate again.',
  ],
  NETWORK_ERROR: [
    'We could not connect',
    'Check your internet connection, then try again. Your trip details are preserved.',
  ],
  INVALID_CITY: [
    'Choose a supported city',
    'Select a city from the search suggestions and try again.',
  ],
  INVALID_CHECK_IN: [
    'Check the check-in date',
    'Enter a valid check-in date, then try again.',
  ],
  INVALID_CHECK_OUT: [
    'Check the check-out date',
    'Enter a valid check-out date, then try again.',
  ],
  INVALID_DATE_RANGE: [
    'Check your travel dates',
    'Check-out must be after check-in.',
  ],
  PAST_CHECK_IN: [
    'Check-in is in the past',
    'Choose today or a later date.',
  ],
  CHECK_IN_TOO_FAR: [
    'Choose an earlier check-in',
    'Your check-in must be within the next 365 days. Edit your dates and search again.',
  ],
  CHECK_OUT_TOO_FAR: [
    'Choose an earlier check-out',
    'Your check-out must be within the next 365 days. Edit your dates and search again.',
  ],
  STAY_TOO_LONG: [
    'Choose a shorter stay',
    'Search stays of up to 30 nights. Edit your dates and search again.',
  ],
  INVALID_ROOMS: [
    'Check the room count',
    'Choose between 1 and 8 rooms in Travelers.',
  ],
  INVALID_ADULTS: [
    'Check the adult count',
    'Choose between 1 and 16 adults in Travelers.',
  ],
  INSUFFICIENT_ADULTS: [
    'Check the room and adult counts',
    'Include at least one adult for each room in Travelers.',
  ],
  INVALID_CHILDREN: [
    'Check the children’s details',
    'Choose up to 8 children and provide each child’s age in Travelers.',
  ],
  INVALID_CHILD_AGE: [
    'Complete the children’s ages',
    'Choose an age from 0 to 17 for every child in Travelers. Select “Under 1” for infants.',
  ],
  UNSUPPORTED_CONTEXT: [
    'This trip is not supported',
    'Review the travelers and use USD prices.',
  ],
  INVALID_OFFER_ID: [
    'This offer link is incomplete',
    'Return to results and choose the original offer again.',
  ],
  INVALID_HOTEL_ID: [
    'This candidate link is incomplete',
    'Return to results and choose the candidate again.',
  ],
  INVALID_REQUEST: [
    'Check your trip details',
    'This search could not be accepted. Review the city and dates, then search again.',
  ],
  SERVICE_DRAINING: [
    'Search is temporarily restarting',
    'Please wait a moment, then try again. Your trip details are preserved.',
  ],
};

export function ErrorNotice({ error, onRetry }) {
  const [title, description] = errorCopy[error?.code] || [
    'Something went wrong',
    'We could not complete this request. Your trip details are preserved. Please try again later.',
  ];
  const retryAt = Date.parse(error?.retryAt || '');
  const now = useClock(Number.isFinite(retryAt) && retryAt > Date.now());
  const remaining = Number.isFinite(retryAt)
    ? Math.max(0, Math.ceil((retryAt - now) / 1000))
    : 0;
  const unavailable =
    error?.code === 'PROVIDER_NOT_CONFIGURED' ||
    error?.code === 'PROVIDER_DISABLED';
  return (
    <section className="notice-panel" aria-label="Search status">
      <Alert
        type={unavailable ? 'info' : 'warning'}
        message={<h2>{title}</h2>}
        description={
          <>
            <p>{description}</p>
            {Number.isFinite(retryAt) && (
              <p>
                Retry after{' '}
                {new Date(retryAt).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit',
                })}
                .
              </p>
            )}
            {onRetry && !unavailable && error?.code !== 'RESULT_TOO_LARGE' && (
              <Button onClick={onRetry} disabled={remaining > 0}>
                {remaining > 0 ? `Try again in ${remaining}s` : 'Try again'}
              </Button>
            )}
          </>
        }
      />
    </section>
  );
}

export function StaleNotice({ onRefresh }) {
  return (
    <div className="stale-notice" role="status">
      <div>
        <strong>These results are out of date.</strong>
        <p>
          Prices and availability may have changed. Refresh before continuing to
          the provider.
        </p>
      </div>
      <Button onClick={onRefresh}>Refresh search</Button>
    </div>
  );
}

export function ProviderLink({ offer, stale }) {
  const href = safeHref(offer?.handoffUrl, true);
  return (
    <div className="provider-handoff">
      {href && !stale ? (
        <a
          className="button-link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          View original Express offer <span aria-hidden="true">↗</span>
          <span className="sr-only"> (opens a new tab)</span>
        </a>
      ) : (
        <>
          <Button disabled>Original offer unavailable</Button>
          <p>
            {stale
              ? 'Refresh the search to check this offer again.'
              : 'The provider did not supply a usable link to this offer.'}
          </p>
        </>
      )}
      <p>
        Verify the final total, dates, terms, and availability on Priceline.
        Candidate identity is not guaranteed.
      </p>
    </div>
  );
}
