import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import DatePicker from 'antd/es/date-picker';
import moment from 'moment';
import 'antd/es/date-picker/style/css';
import { TRAVEL_LIMITS, addCalendarDays, isCalendarDate, localToday } from './context.js';

const TravelDates = forwardRef(function TravelDates({ trip, errors, onChange }, ref) {
  const checkInRef = useRef(null);
  const checkOutRef = useRef(null);
  const focusAfterSelection = useRef(null);
  const [open, setOpen] = useState(null);
  const today = localToday();
  const latest = addCalendarDays(today, TRAVEL_LIMITS.maxAdvanceDays);
  const inWindow = (value) => isCalendarDate(value) && value >= today && value <= latest;
  const validCheckIn = inWindow(trip.checkIn);

  useLayoutEffect(() => {
    // A cleared or newly selected date replaces the keyed picker. Focus its new
    // input after the DOM commits, so Escape and the next Tab reach the right field.
    const field = open || focusAfterSelection.current;
    if (field) (field === 'checkOut' ? checkOutRef : checkInRef).current?.focus();
    focusAfterSelection.current = null;
  }, [open, trip.checkIn, trip.checkOut]);

  useImperativeHandle(ref, () => ({
    focus: (field) => {
      (field === 'checkOut' ? checkOutRef : checkInRef).current?.focus();
      setOpen(field);
    },
  }), []);

  function disabledDate(date, field) {
    const day = date.format('YYYY-MM-DD');
    if (day < today || day > latest) return true;
    return field === 'checkOut' && validCheckIn && (day <= trip.checkIn || day > addCalendarDays(trip.checkIn, TRAVEL_LIMITS.maxNights));
  }

  function selectDate(field, date) {
    const value = date ? date.format('YYYY-MM-DD') : '';
    if (field === 'checkIn') {
      const incompatibleEnd = !value || (trip.checkOut && (!inWindow(trip.checkOut) || trip.checkOut <= value || trip.checkOut > addCalendarDays(value, TRAVEL_LIMITS.maxNights)));
      onChange(
        { checkIn: value, ...(incompatibleEnd ? { checkOut: '' } : {}) },
        incompatibleEnd && trip.checkOut ? { checkOut: 'Choose a new check-out date for this check-in.' } : {},
      );
      if (value) {
        setOpen('checkOut');
      }
    } else {
      focusAfterSelection.current = 'checkOut';
      onChange({ checkOut: value });
      setOpen(null);
    }
  }

  return (
    <div className="travel-dates">
      {['checkIn', 'checkOut'].map((field) => {
        const label = field === 'checkIn' ? 'Check-in' : 'Check-out';
        const usableValue = inWindow(trip[field]);
        return (
          <div key={field} className={`trip-control date-control ${errors[field] ? 'trip-control-invalid' : ''}`}>
            <label htmlFor={field}>{label}</label>
            <DatePicker
              key={usableValue ? 'valid' : 'new-date'}
              ref={field === 'checkIn' ? checkInRef : checkOutRef}
              id={field}
              name={field}
              value={usableValue ? moment(trip[field], 'YYYY-MM-DD', true) : null}
              defaultPickerValue={moment(field === 'checkOut' && validCheckIn ? trip.checkIn : today, 'YYYY-MM-DD', true)}
              format="MMM D, YYYY"
              placeholder={trip[field] && !usableValue ? 'Choose a new date' : 'Add date'}
              inputReadOnly
              allowClear={false}
              showToday={false}
              disabledDate={(date) => disabledDate(date, field)}
              open={open === field}
              onOpenChange={(nextOpen) => setOpen((current) => nextOpen ? field : current === field ? null : current)}
              onChange={(date) => selectDate(field, date)}
              popupClassName="travel-calendar-popup"
              aria-label={label}
              aria-invalid={Boolean(errors[field])}
              aria-describedby={errors[field] ? `${field}-error` : 'trip-date-hint'}
              renderExtraFooter={() => <span>Up to 30 nights · Within the next year</span>}
            />
            {errors[field] && <span className="field-error" id={`${field}-error`}>{errors[field]}</span>}
          </div>
        );
      })}
      <span className="sr-only" id="trip-date-hint">Choose dates within the next 365 days, for a stay of up to 30 nights.</span>
    </div>
  );
});

export default TravelDates;
