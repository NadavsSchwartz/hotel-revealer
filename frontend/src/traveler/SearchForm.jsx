import React, { useEffect, useRef, useState } from 'react';
import Button from 'antd/es/button';
import { useNavigate } from 'react-router-dom';
import {
  cityNames,
  fixedContext,
  localToday,
  searchUrl,
  validateContext,
} from './context.js';

const emptyTrip = { cityName: '', checkIn: '', checkOut: '', ...fixedContext };

export default function SearchForm({ initial = emptyTrip, compact = false }) {
  const navigate = useNavigate();
  const [trip, setTrip] = useState(initial);
  const [errors, setErrors] = useState({});
  const form = useRef(null);
  useEffect(() => {
    setTrip({
      cityName: initial.cityName || '',
      checkIn: initial.checkIn || '',
      checkOut: initial.checkOut || '',
      ...fixedContext,
    });
    setErrors({});
  }, [initial.cityName, initial.checkIn, initial.checkOut]);

  function submit(event) {
    event.preventDefault();
    const validation = validateContext(trip);
    setErrors(validation.errors);
    const invalidField = Object.keys(validation.errors)[0];
    if (invalidField) {
      form.current.elements.namedItem(invalidField)?.focus();
      return;
    }
    navigate(searchUrl(validation.context), {
      state: { searchRevision: Date.now() },
    });
  }

  function change(event) {
    const { name, value } = event.target;
    setTrip((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  return (
    <form
      ref={form}
      className={`trip-form ${compact ? 'trip-form-compact' : ''}`}
      onSubmit={submit}
      noValidate
      aria-label="Search hotels"
    >
      <div className="form-fields">
        <div className="form-field city-field">
          <label htmlFor="cityName">Where are you going?</label>
          <input
            id="cityName"
            name="cityName"
            type="text"
            list="supported-cities"
            value={trip.cityName}
            onChange={change}
            placeholder="Choose a city"
            autoComplete="off"
            required
            aria-invalid={Boolean(errors.cityName)}
            aria-describedby={errors.cityName ? 'cityName-error' : 'city-hint'}
          />
          <datalist id="supported-cities">
            {cityNames.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
          <span id="city-hint" className="sr-only">
            Start typing to see supported cities, then choose one.
          </span>
          {errors.cityName && (
            <span className="field-error" id="cityName-error">
              {errors.cityName}
            </span>
          )}
        </div>
        <div className="form-field">
          <label htmlFor="checkIn">Check-in</label>
          <input
            id="checkIn"
            name="checkIn"
            type="date"
            min={localToday()}
            value={trip.checkIn}
            onChange={change}
            required
            aria-invalid={Boolean(errors.checkIn)}
            aria-describedby={errors.checkIn ? 'checkIn-error' : undefined}
          />
          {errors.checkIn && (
            <span className="field-error" id="checkIn-error">
              {errors.checkIn}
            </span>
          )}
        </div>
        <div className="form-field">
          <label htmlFor="checkOut">Check-out</label>
          <input
            id="checkOut"
            name="checkOut"
            type="date"
            min={trip.checkIn || localToday()}
            value={trip.checkOut}
            onChange={change}
            required
            aria-invalid={Boolean(errors.checkOut)}
            aria-describedby={errors.checkOut ? 'checkOut-error' : undefined}
          />
          {errors.checkOut && (
            <span className="field-error" id="checkOut-error">
              {errors.checkOut}
            </span>
          )}
        </div>
        <Button type="primary" htmlType="submit" className="search-button">
          Search offers <span aria-hidden="true">↗</span>
        </Button>
      </div>
      <div className="form-footnote">
        <span>
          1 room <span aria-hidden="true">·</span> 2 adults{' '}
          <span aria-hidden="true">·</span> USD{' '}
        </span>
        <span>Compare candidates. Keep the uncertainty in view.</span>
      </div>
      {Object.values(errors).some(Boolean) && (
        <p className="sr-only" role="alert">
          Please correct the highlighted trip details.
        </p>
      )}
    </form>
  );
}
