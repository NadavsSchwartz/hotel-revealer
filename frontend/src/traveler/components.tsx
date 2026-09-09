import { useEffect, useState } from 'react';
import type { Offer, Quote as QuoteValue, TripDraft } from '../../../shared/contracts.ts';
import { displayDate, money, nights, safeHref } from './context.ts';
import './comparison.css';

export function TripSummary({ context }: { context: TripDraft }) {
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
      {children > 0 && <>, {children} {children === 1 ? 'child' : 'children'}</>}, {context.currency}
    </p>
  );
}

interface QuoteProps {
  quote: QuoteValue | null;
  title?: string;
  compact?: boolean;
  trip?: TripDraft | null;
  expired?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshDisabled?: boolean;
}

export function Quote({
  quote,
  title = 'Original Express quote',
  compact = false,
  trip = null,
  expired = false,
  onRefresh,
  refreshing = false,
  refreshDisabled = false,
}: QuoteProps) {
  const format = (cents: number | null | undefined) => money(cents, quote?.currency ?? null);
  const nightly = format(quote?.nightlyCents);
  const stay = format(quote?.stayCents);
  const total = quote?.totalTaxesFees === 'included' ? format(quote.totalCents) : null;
  const discount = quote?.advertisedDiscount?.source === 'Priceline' &&
    quote.advertisedDiscount.percent > 0 && quote.advertisedDiscount.percent < 100
    ? quote.advertisedDiscount.percent : null;
  const fees = total && quote && quote.stayCents !== null && quote.totalCents !== undefined
    && Number.isSafeInteger(quote.stayCents) && quote.totalCents >= quote.stayCents
    ? format(quote.totalCents - quote.stayCents) : null;
  const nightCount = trip ? nights(trip) : null;
  const multipleRooms = (quote?.roomCount ?? 0) > 1;
  const taxes =
    quote?.taxesFees === 'included'
      ? 'Taxes and fees included'
      : quote?.taxesFees === 'excluded'
        ? 'Before taxes and fees'
        : 'Taxes and fees are not confirmed';
  return (
    <section
      className={`quote ${compact ? 'quote-compact' : ''}`}
      aria-label={title}
    >
      <span className="eyebrow">{title}</span>
      {expired ? <div className="quote-refresh" role="status">
        <p>The quoted price needs a refresh.</p>
        {onRefresh && <button type="button" className="ui-button" onClick={onRefresh} disabled={refreshing || refreshDisabled}>{refreshing ? 'Updating price…' : 'Refresh total price'}</button>}
      </div> : <>
        {discount && <span className="quote-discount" title="Priceline's advertised room-rate discount against its comparison rate, which may be estimated. Before taxes and fees.">{discount}% off room rate <span>· Priceline</span></span>}
        <p className="quote-price">
          <strong className="quote-amount">{total || nightly || 'Rate unavailable'}</strong>
          {total ? <span> total</span> : nightly && <span>{quote?.nightlyBasis === 'per-room' ? ' / room / night' : ' / night'}</span>}
        </p>
        {compact && trip && nightCount !== null && nightCount > 0 && <p className="quote-context">{nightCount} {nightCount === 1 ? 'night' : 'nights'} · {trip.rooms} {trip.rooms === 1 ? 'room' : 'rooms'}</p>}
        {(total || !compact || !nightly || stay !== nightly || multipleRooms) && <p className="quote-stay">
          {total ? `${multipleRooms ? `${quote?.roomCount} rooms · ` : ''}Entire stay${compact ? '' : ' · Taxes & fees included'}`
            : stay ? quote?.stayBasis === 'all-rooms' && multipleRooms
              ? `${stay} for ${quote?.roomCount} rooms, entire stay`
              : `${stay} for the stay` : 'Stay total unavailable'}{' '}
          {quote?.currency && <span>· {quote.currency}</span>}
        </p>}
        {total ? <details className="quote-breakdown">
          <summary>Price breakdown</summary>
          <dl>
            {nightly && <div><dt>Room / night, before taxes</dt><dd>{nightly}</dd></div>}
            {stay && <div><dt>Room price for the stay</dt><dd>{stay}</dd></div>}
            {fees && <div><dt>Taxes & fees for the stay</dt><dd>{fees}</dd></div>}
            <div><dt>Quoted total</dt><dd>{total}</dd></div>
          </dl>
          <p>Includes the fees in Priceline’s quote. Promotions and the final payable price may change on Priceline.</p>
        </details> : !compact && <p className="quote-taxes">{taxes}</p>}
      </>}
    </section>
  );
}

export function Stars({ value }: { value: number | null | undefined }) {
  return (
    <span>
      {typeof value === 'number' ? `${value}-star` : 'Star rating unavailable'}
    </span>
  );
}

export function useClock(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function useExpired(expiresAt: string | null | undefined) {
  const [expiredAt, setExpiredAt] = useState<number | null>(null);
  const expiry = Date.parse(expiresAt || '');
  useEffect(() => {
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return undefined;
    const update = () => setExpiredAt(expiry <= Date.now() ? expiry : null);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    const timer = setTimeout(
      update,
      Math.min(expiry - Date.now() + 10, 2147483647),
    );
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [expiry]);
  return (
    !Number.isFinite(expiry) || expiry <= Date.now() || expiredAt === expiry
  );
}

const errorCopy: Record<string, [string, string]> = {
  PROVIDER_DESTINATION_UNSUPPORTED: [
    'Try a nearby city',
    'Priceline could not locate this destination reliably. Choose a nearby city to search the area.',
  ],
  RESULT_TOO_LARGE: [
    'We couldn’t finish this search',
    'We couldn’t load all the hotel results for this trip. Your trip details are saved. Please try again.',
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
    'The hotel information was incomplete or inconsistent. Please try again.',
  ],
  INVALID_SELECTION: [
    'This offer could not be recovered',
    'Return to your results to choose an offer. Your other results are preserved.',
  ],
  SELECTION_UNAVAILABLE: [
    'This offer could not be recovered',
    'Return to your results to choose an offer. Your other results are preserved.',
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
    'Review the travelers and choose a supported currency.',
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

interface ErrorNoticeProps {
  error: { code: string; retryAt?: string | null };
  onRetry?: () => void;
  onEdit?: () => void;
  onReturn?: () => void;
}

export function ErrorNotice({ error, onRetry, onEdit, onReturn }: ErrorNoticeProps) {
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
  const returnToResults = ['INVALID_SELECTION', 'SELECTION_UNAVAILABLE', 'INVALID_OFFER_ID', 'INVALID_HOTEL_ID'].includes(error?.code);
  const editSearch = error?.code?.startsWith('INVALID_') || ['PROVIDER_DESTINATION_UNSUPPORTED', 'PAST_CHECK_IN', 'CHECK_IN_TOO_FAR', 'CHECK_OUT_TOO_FAR', 'STAY_TOO_LONG', 'UNSUPPORTED_CONTEXT', 'INSUFFICIENT_ADULTS'].includes(error?.code);
  const action = returnToResults ? onReturn || onRetry : editSearch ? onEdit : !unavailable ? onRetry : null;
  const actionLabel = error?.code === 'SELECTION_UNAVAILABLE' ? 'Find current deals'
    : returnToResults ? (onReturn ? 'Return to results' : 'Refresh search') : editSearch ? 'Edit search' : remaining > 0 ? `Try again in ${remaining}s` : 'Try again';
  return (
    <section className="notice-panel" aria-label="Search status">
      <div className={`ui-notice${unavailable ? ' ui-notice-info' : ''}`} role="alert">
        <h2>{title}</h2>
        <div className="ui-notice-description">
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
              <button type="button" className="ui-button" onClick={action} disabled={remaining > 0 && action === onRetry}>
                {actionLabel}
              </button>
            )}
        </div>
      </div>
    </section>
  );
}

interface ProviderLinkProps {
  offer: Pick<Offer, 'handoffUrl' | 'quote'> | null | undefined;
  stale: boolean;
  unavailable?: boolean;
  refreshing?: boolean;
  compact?: boolean;
}

export function ProviderLink({ offer, stale, unavailable = false, refreshing = false, compact = false }: ProviderLinkProps) {
  const href = safeHref(offer?.handoffUrl, true);
  const quote = offer?.quote;
  const hasPrice = [quote?.nightlyCents, quote?.stayCents, quote?.totalTaxesFees === 'included' ? quote.totalCents : null]
    .some(cents => typeof cents === 'number' && Number.isSafeInteger(cents) && cents >= 0);
  const currentPrice = stale || unavailable || refreshing || !hasPrice;
  const totalIncludesFees = quote?.totalTaxesFees === 'included' && money(quote.totalCents, quote.currency ?? null) !== null;
  const feeNote = totalIncludesFees || quote?.taxesFees === 'included'
    ? 'Taxes and fees included'
    : quote?.taxesFees === 'excluded' ? 'Before taxes and fees' : 'Taxes and fees unconfirmed';
  const bookingNote = href
    ? `${hasPrice ? `${feeNote}; check` : 'Check'} ${currentPrice ? 'current' : 'final'} price and terms on Priceline.`
    : hasPrice ? `${feeNote}; original offer link unavailable.` : 'The provider did not supply a usable price or offer link.';
  return (
    <div className="provider-handoff">
      {href ? (
        <a className="button-link" href={href} target="_blank" rel="noopener noreferrer">
          {currentPrice ? 'Check current price on Priceline' : 'Check price on Priceline'}
          <svg className="action-icon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 4H4v12h12v-4M11 4h5v5M9 11l7-7" /></svg>
          <span className="sr-only"> (opens a new tab)</span>
        </a>
      ) : (
        <>
          <button type="button" className="ui-button" disabled>Original offer link unavailable</button>
          {!compact && <p>The provider did not supply a usable link to this offer.</p>}
        </>
      )}
      {compact ? <p className="booking-note">{bookingNote}</p> : href && <p>Final price and booking terms on Priceline.</p>}
    </div>
  );
}
