import React, { useEffect, useState } from 'react';
import Button from 'antd/es/button';
import Alert from 'antd/es/alert';
import 'antd/es/alert/style/css';
import { displayDate, money, nights, safeHref } from './context.js';
import './comparison.css';

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
  expired = false,
  onRefresh,
  refreshing = false,
}) {
  const nightly = money(quote?.nightlyCents);
  const stay = money(quote?.stayCents);
  const total = quote?.totalTaxesFees === 'included' ? money(quote.totalCents) : null;
  const discount = quote?.advertisedDiscount?.source === 'Priceline' &&
    quote.advertisedDiscount.percent > 0 && quote.advertisedDiscount.percent < 100
    ? quote.advertisedDiscount.percent : null;
  const fees = total && Number.isSafeInteger(quote.stayCents) && quote.totalCents >= quote.stayCents
    ? money(quote.totalCents - quote.stayCents) : null;
  const taxes =
    quote?.taxesFees === 'included'
      ? 'Taxes and fees included'
      : quote?.taxesFees === 'excluded'
        ? 'Before taxes and fees'
        : 'Additional taxes and fees may apply';
  return (
    <section
      className={`quote ${compact ? 'quote-compact' : ''}`}
      aria-label={title}
    >
      <span className="eyebrow">{title}</span>
      {expired ? <div className="quote-refresh" role="status">
        <p>The quoted price needs a refresh.</p>
        {onRefresh && <Button onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Updating price…' : 'Refresh total price'}</Button>}
      </div> : <>
        {discount && <span className="quote-discount" title="Priceline's advertised room-rate discount against its comparison rate, which may be estimated. Before taxes and fees.">{discount}% off room rate <span>· Priceline</span></span>}
        <p className="quote-price">
          {total || nightly || 'Rate unavailable'}
          {total ? <span> total</span> : nightly && <span>{quote.nightlyBasis === 'per-room' ? ' / room / night' : ' / night'}</span>}
        </p>
        <p className="quote-stay">
          {total ? `${quote.roomCount > 1 ? `${quote.roomCount} rooms · ` : ''}Entire stay · Taxes & fees included`
            : stay ? quote.stayBasis === 'all-rooms' && quote.roomCount > 1
              ? `${stay} for ${quote.roomCount} rooms, entire stay`
              : `${stay} for the stay` : 'Stay total unavailable'}{' '}
          <span>· USD</span>
        </p>
        {total ? <details className="quote-breakdown">
          <summary>Price breakdown</summary>
          <dl>
            {nightly && <div><dt>Room / night, before taxes</dt><dd>{nightly}</dd></div>}
            {stay && <div><dt>Room price for the stay</dt><dd>{stay}</dd></div>}
            {fees && <div><dt>Taxes & fees for the stay</dt><dd>{fees}</dd></div>}
            <div><dt>Quoted total</dt><dd>{total}</dd></div>
          </dl>
          <p>Includes the fees in Priceline’s quote. Promotions and the final payable price may change on Priceline.</p>
        </details> : <p className="quote-taxes">{taxes}</p>}
      </>}
    </section>
  );
}

const amenityLabels = {
  FINTRNT: 'Free internet', SPOOL: 'Pool', SPA: 'Spa', PETALLOW: 'Pets allowed',
  RESTRNT: 'Restaurant', FITSPA: 'Fitness center', FPRKING: 'Free parking',
  CASINO: 'Casino', HOTTUB: 'Hot tub', NSMKFAC: 'Non-smoking rooms',
  HANDFAC: 'Accessible facilities', FAMFRIEND: 'Family-friendly facilities',
};
const numericValue = (value) => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('en-US') : 'Not supplied';
function numericClue(clue, suffix = '') {
  if (!clue || clue.kind === 'unknown') return 'Not supplied';
  if (clue.kind === 'range') return `${numericValue(clue.min)}–${numericValue(clue.max)}${suffix}`;
  return `${numericValue(clue.value)}${clue.kind === 'minimum' ? '+' : ''}${suffix}`;
}
function amenityList(codes) {
  if (!Array.isArray(codes) || !codes.length) return 'Not supplied';
  const labels = codes.map(code => amenityLabels[code]).filter(Boolean);
  const additional = codes.length - labels.length;
  return [...labels, ...(additional ? [`${additional} other listed ${additional === 1 ? 'feature' : 'features'}`] : [])].join(' · ');
}

export function Evidence({ candidate, offer }) {
  const supporting = candidate.evidence?.supporting || [];
  const missing = candidate.evidence?.missing || [];
  const readable = (item) =>
    typeof item === 'string'
      ? item.replaceAll('_', ' ')
      : item?.label || item?.description || 'Evidence unavailable';
  const comparisons = candidate.evidence?.comparisons;
  if (offer?.clues && comparisons) {
    const rows = [
      ['neighborhood', 'Area', offer.neighborhoodName || 'Not supplied', candidate.neighborhoodName || 'Not supplied'],
      ['stars', 'Hotel class', `${numericValue(offer.stars)} stars`, `${numericValue(candidate.stars)} stars`],
      ['guestRating', 'Guest score', numericClue(offer.clues.guestRating, ' / 10'), candidate.guestRating == null ? 'Not supplied' : `${numericValue(candidate.guestRating)} / 10`],
      ['reviewCount', 'Reviews', numericClue(offer.clues.reviewCount), numericValue(candidate.reviewCount)],
      ['amenities', 'Features', amenityList(offer.clues.amenities?.codes), amenityList(candidate.amenities)],
    ];
    return <div className="evidence-comparison">
      <table className="evidence-matrix">
        <caption className="sr-only">Express offer compared with {candidate.name}</caption>
        <thead><tr><th scope="col">Clue</th><th scope="col">Express offer</th><th scope="col">This hotel</th></tr></thead>
        <tbody>{rows.map(([family, label, offered, hotel]) => <tr key={family}>
          <th scope="row">{label}</th><td>{offered}</td>
          <td><span>{hotel}</span><span className={`clue-status ${comparisons[family] === 'match' ? 'clue-status-match' : ''}`}>{comparisons[family] === 'match' ? 'Agrees' : 'Not assessed'}</span></td>
        </tr>)}</tbody>
      </table>
      {missing.length > 0 && <p className="evidence-note">Some listing information could not be compared. Missing information does not rule this hotel out.</p>}
    </div>;
  }
  return (
    <div className="evidence-columns">
      <section>
        <p className="evidence-label">
          <span aria-hidden="true">+</span> Supporting evidence
        </p>
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
        <p className="evidence-label">
          <span aria-hidden="true">−</span> Missing evidence
        </p>
        {missing.length ? (
          <ul>
            {missing.map((item, index) => (
              <li key={index}>{readable(item)}</li>
            ))}
          </ul>
        ) : (
          <p>No gaps reported in these clues.</p>
        )}
      </section>
    </div>
  );
}

export function Tier({ tier }) {
  return (
    <span className={`tier ${tier === 'supported' ? 'tier-supported' : ''}`} title={tier === 'supported' ? 'The area, hotel class, guest score, review count and listed features agree.' : 'Some listing clues agree; other information could not be assessed.'}>
      {tier === 'supported' ? 'Strong match' : 'Possible match'}
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
  PROVIDER_DESTINATION_UNSUPPORTED: [
    'Try a nearby city',
    'Priceline could not locate this destination reliably. Choose a nearby city to search the area.',
  ],
  RESULT_TOO_LARGE: [
    'Too many possible comparisons',
    'This search contains more possible matches than we can assess safely. Try different dates or another city.',
  ],
  PROVIDER_NOT_CONFIGURED: [
    'Live search is not connected yet',
    'The hotel connection is disabled in this environment. Your trip is ready, but real offers cannot be retrieved here.',
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
    'This match needs a fresh search',
    'The offer has changed since this comparison. Return to your results to check the latest hotel matches.',
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
    'This hotel link is incomplete',
    'Return to results and open the hotel again.',
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

export function ErrorNotice({ error, onRetry, onEdit, onReturn }) {
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
  const returnToResults = ['INVALID_SELECTION', 'INVALID_OFFER_ID', 'INVALID_HOTEL_ID', 'PROVIDER_RESPONSE_INVALID'].includes(error?.code);
  const editSearch = error?.code?.startsWith('INVALID_') || ['RESULT_TOO_LARGE', 'PROVIDER_DESTINATION_UNSUPPORTED', 'PAST_CHECK_IN', 'CHECK_IN_TOO_FAR', 'CHECK_OUT_TOO_FAR', 'STAY_TOO_LONG', 'UNSUPPORTED_CONTEXT', 'INSUFFICIENT_ADULTS'].includes(error?.code);
  const action = returnToResults ? onReturn || onRetry : editSearch ? onEdit : !unavailable ? onRetry : null;
  const actionLabel = returnToResults ? (onReturn ? 'Return to results' : 'Refresh search') : editSearch ? 'Edit search' : remaining > 0 ? `Try again in ${remaining}s` : 'Try again';
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
            {action && (
              <Button onClick={action} disabled={remaining > 0 && action === onRetry}>
                {actionLabel}
              </Button>
            )}
          </>
        }
      />
    </section>
  );
}

export function StaleNotice({ onRefresh, refreshing = false }) {
  return (
    <div className="stale-notice" role="status">
      <div>
        <strong>{refreshing ? 'Updating your offers…' : 'These quotes need a refresh.'}</strong>
        <p>{refreshing ? 'Your previous comparison stays here while the latest offers load.' : 'Check the latest prices before opening an offer.'}</p>
      </div>
      <Button onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Updating…' : 'Refresh search'}</Button>
    </div>
  );
}

export function ProviderLink({ offer, stale, onRefresh, refreshing = false }) {
  const href = safeHref(offer?.handoffUrl, true);
  return (
    <div className="provider-handoff">
      {refreshing ? <Button disabled>Updating offer…</Button> : stale ? (
        <>
          <Button onClick={onRefresh} disabled={!onRefresh}>Refresh Express offers</Button>
          <p>The saved quote has expired. Check the latest offer to continue.</p>
        </>
      ) : href ? (
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
          <p>The provider did not supply a usable link to this offer.</p>
        </>
      )}
      {!stale && !refreshing && href && <p>Final price and booking terms on Priceline.</p>}
    </div>
  );
}
