import { useEffect, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import type { TripDraft, TripErrors, TripField } from '../../../shared/contracts.ts';
import type { DestinationSearchHandle } from './DestinationSearch.tsx';
import type { TravelDatesHandle } from './TravelDates.tsx';
import type { TravelersHandle } from './Travelers.tsx';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_OCCUPANCY, contextKey, searchUrl, validateContext } from './context.ts';
import DestinationSearch from './DestinationSearch.tsx';
import TravelDates from './TravelDates.tsx';
import Travelers from './Travelers.tsx';
import './search-controls.css';

export type TripChange = (values: Partial<TripDraft>, fieldErrors?: TripErrors) => void;
export interface SearchDraft { trip: TripDraft; errors: TripErrors }
export interface SearchFormProps {
  initial?: TripDraft;
  currency?: string;
  compact?: boolean;
  draftRef?: RefObject<SearchDraft | null>;
  blockedSearchKey?: string | null;
  submitLabel?: string;
}
const tripFields: TripField[] = ['cityName', 'destinationId', 'checkIn', 'checkOut', 'rooms', 'adults', 'childrenAges', 'currency'];

const emptyTrip: TripDraft = { cityName: '', checkIn: '', checkOut: '', ...DEFAULT_OCCUPANCY, childrenAges: [] };

export default function SearchForm({ initial = emptyTrip, currency = initial.currency, compact = false, draftRef, blockedSearchKey = null, submitLabel = 'Search' }: SearchFormProps) {
  const navigate = useNavigate();
  const initialValue = JSON.stringify({ ...emptyTrip, ...initial });
  const previousInitial = useRef({ value: initialValue, trip: { ...emptyTrip, ...initial } });
  const [trip, setTrip] = useState<TripDraft>(() => draftRef?.current?.trip || { ...emptyTrip, ...initial });
  const [errors, setErrors] = useState<TripErrors>(() => {
    if (draftRef?.current) return draftRef.current.errors;
    const value = { ...emptyTrip, ...initial };
    return value.cityName || value.checkIn || value.checkOut ? validateContext(value).errors : {};
  });
  const destinationRef = useRef<DestinationSearchHandle>(null);
  const datesRef = useRef<TravelDatesHandle>(null);
  const travelersRef = useRef<TravelersHandle>(null);
  const submitted = useRef(false);
  const blocked = blockedSearchKey !== null && contextKey(trip) === blockedSearchKey;

  useEffect(() => {
    // Preserve the draft without rerendering Home or feeding each edit back into initial.
    if (draftRef && !submitted.current) draftRef.current = { trip, errors };
  }, [draftRef, trip, errors]);

  useEffect(() => {
    if (previousInitial.current.value === initialValue) return;
    const previous = previousInitial.current.trip;
    const next = { ...emptyTrip, ...initial };
    previousInitial.current = { value: initialValue, trip: next };
    // Currency is applied separately without resetting the remaining draft.
    if (JSON.stringify({ ...previous, currency: next.currency }) === initialValue) return;
    setTrip(next);
    setErrors(next.cityName || next.checkIn || next.checkOut ? validateContext(next).errors : {});
  }, [initial, initialValue]);

  useEffect(() => {
    // A preference change must preserve unfinished destination/date/traveler edits.
    setTrip(current => ({ ...current, currency }));
    setErrors(current => {
      const next = { ...current };
      delete next.currency;
      return next;
    });
  }, [currency]);

  function update(values: Partial<TripDraft>, fieldErrors: TripErrors = {}) {
    setTrip((current) => ({ ...current, ...values }));
    setErrors((current) => {
      const next = { ...current };
      tripFields.forEach((field) => { if (field in values) delete next[field]; });
      return { ...next, ...fieldErrors };
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateContext(trip);
    setErrors(validation.errors);
    const invalid = tripFields
      .find((field) => validation.errors[field]);
    if (invalid) {
      if (invalid === 'cityName' || invalid === 'destinationId') destinationRef.current?.focus();
      else if (invalid === 'checkIn' || invalid === 'checkOut') datesRef.current?.focus(invalid);
      else if (invalid !== 'currency') travelersRef.current?.focus(invalid);
      return;
    }
    if (!validation.valid || contextKey(validation.context) === blockedSearchKey) return;
    if (draftRef) {
      submitted.current = true;
      draftRef.current = null;
    }
    void navigate(searchUrl(validation.context), { state: { searchRevision: Date.now() } });
  }

  const validationMessages = Object.values(errors).filter(Boolean);
  return (
    <form className={`trip-form ${compact ? 'trip-form-compact' : ''}`} onSubmit={submit} noValidate aria-label="Search hotels">
      <div className="trip-search-fields">
        <DestinationSearch ref={destinationRef} trip={trip} error={errors.cityName} onChange={update} />
        <TravelDates ref={datesRef} trip={trip} errors={errors} onChange={update} />
        <Travelers ref={travelersRef} trip={trip} errors={errors} onChange={update} />
        <button type="submit" className="ui-button ui-button-primary search-button" disabled={blocked}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
          {submitLabel}
        </button>
      </div>
      {errors.currency && <p className="trip-currency-error">{errors.currency}{' '}<button type="button" onClick={() => update({ currency: 'USD' })}>Use USD</button></p>}
      {validationMessages.length > 0 && <p className="sr-only" role="alert">{validationMessages.join(' ')}</p>}
    </form>
  );
}
