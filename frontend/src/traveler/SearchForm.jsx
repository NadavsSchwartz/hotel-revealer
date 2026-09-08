import React, { useEffect, useRef, useState } from 'react';
import Button from 'antd/es/button';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_OCCUPANCY, contextKey, searchUrl, validateContext } from './context.js';
import DestinationSearch from './DestinationSearch.jsx';
import TravelDates from './TravelDates.jsx';
import Travelers from './Travelers.jsx';
import './search-controls.css';

const emptyTrip = { cityName: '', checkIn: '', checkOut: '', ...DEFAULT_OCCUPANCY };

export default function SearchForm({ initial = emptyTrip, compact = false, draftRef, blockedSearchKey = null, submitLabel = 'Search' }) {
  const navigate = useNavigate();
  const initialValue = JSON.stringify({ ...emptyTrip, ...initial });
  const previousInitial = useRef(initialValue);
  const [trip, setTrip] = useState(() => draftRef?.current?.trip || JSON.parse(initialValue));
  const [errors, setErrors] = useState(() => {
    if (draftRef?.current) return draftRef.current.errors;
    const value = JSON.parse(initialValue);
    return value.cityName || value.checkIn || value.checkOut ? validateContext(value).errors : {};
  });
  const destinationRef = useRef(null);
  const datesRef = useRef(null);
  const travelersRef = useRef(null);
  const submitted = useRef(false);
  const blocked = blockedSearchKey !== null && contextKey(trip) === blockedSearchKey;

  useEffect(() => {
    // Preserve the draft without rerendering Home or feeding each edit back into initial.
    if (draftRef && !submitted.current) draftRef.current = { trip, errors };
  }, [draftRef, trip, errors]);

  useEffect(() => {
    if (previousInitial.current === initialValue) return;
    previousInitial.current = initialValue;
    const next = JSON.parse(initialValue);
    setTrip(next);
    setErrors(next.cityName || next.checkIn || next.checkOut ? validateContext(next).errors : {});
  }, [initialValue]);

  function update(values, fieldErrors = {}) {
    setTrip((current) => ({ ...current, ...values }));
    setErrors((current) => {
      const next = { ...current };
      Object.keys(values).forEach((field) => { delete next[field]; });
      return { ...next, ...fieldErrors };
    });
  }

  function submit(event) {
    event.preventDefault();
    const validation = validateContext(trip);
    setErrors(validation.errors);
    const invalid = ['cityName', 'destinationId', 'checkIn', 'checkOut', 'rooms', 'adults', 'childrenAges', 'currency']
      .find((field) => validation.errors[field]);
    if (invalid) {
      if (invalid === 'cityName' || invalid === 'destinationId') destinationRef.current?.focus();
      else if (invalid === 'checkIn' || invalid === 'checkOut') datesRef.current?.focus(invalid);
      else if (invalid !== 'currency') travelersRef.current?.focus(invalid);
      return;
    }
    if (contextKey(validation.context) === blockedSearchKey) return;
    if (draftRef) {
      submitted.current = true;
      draftRef.current = null;
    }
    navigate(searchUrl(validation.context), { state: { searchRevision: Date.now() } });
  }

  const validationMessages = Object.values(errors).filter(Boolean);
  return (
    <form className={`trip-form ${compact ? 'trip-form-compact' : ''}`} onSubmit={submit} noValidate aria-label="Search hotels">
      <div className="trip-search-fields">
        <DestinationSearch ref={destinationRef} trip={trip} error={errors.cityName} onChange={update} />
        <TravelDates ref={datesRef} trip={trip} errors={errors} onChange={update} />
        <Travelers ref={travelersRef} trip={trip} errors={errors} onChange={update} />
        <Button type="primary" htmlType="submit" className="search-button" disabled={blocked}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
          {submitLabel}
        </Button>
      </div>
      {errors.currency && <p className="trip-currency-error">{errors.currency}{' '}<button type="button" onClick={() => update({ currency: 'USD' })}>Use USD</button></p>}
      {validationMessages.length > 0 && <p className="sr-only" role="alert">{validationMessages.join(' ')}</p>}
    </form>
  );
}
