import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import DatePicker from 'antd/es/date-picker';
import moment from 'moment';
import 'antd/es/date-picker/style/css';
import { TRAVEL_LIMITS, addCalendarDays, isCalendarDate, localToday } from './context.js';

const fullDate = date => date.format('dddd, MMMM D, YYYY');
const navigationIcon = (label, className) => <><span className={className} aria-hidden="true" /><span className="sr-only">{label}</span></>;

const TravelDates = forwardRef(function TravelDates({ trip, errors, onChange }, ref) {
  const checkInRef = useRef(null);
  const checkOutRef = useRef(null);
  const focusAfterSelection = useRef(null);
  const [open, setOpen] = useState(null);
  const [panelModes, setPanelModes] = useState({ checkIn: 'date', checkOut: 'date' });
  const today = localToday();
  const latest = addCalendarDays(today, TRAVEL_LIMITS.maxAdvanceDays);
  const inWindow = (value) => isCalendarDate(value) && value >= today && value <= latest;
  const validCheckIn = inWindow(trip.checkIn);
  const validCheckOut = inWindow(trip.checkOut);
  const previousPickerKeys = useRef({ checkIn: validCheckIn, checkOut: validCheckOut });

  useLayoutEffect(() => {
    const previous = previousPickerKeys.current;
    if (previous.checkIn === validCheckIn && previous.checkOut === validCheckOut) return;
    previousPickerKeys.current = { checkIn: validCheckIn, checkOut: validCheckOut };
    setPanelModes(current => ({
      ...current,
      ...(previous.checkIn !== validCheckIn ? { checkIn: 'date' } : {}),
      ...(previous.checkOut !== validCheckOut ? { checkOut: 'date' } : {}),
    }));
  }, [validCheckIn, validCheckOut]);

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
        const calendarId = `${field}-calendar`;
        const mode = panelModes[field];
        const yearStep = mode === 'decade' ? 'century' : mode === 'year' ? 'decade' : 'year';
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
              role="combobox"
              aria-label={label}
              aria-haspopup="dialog"
              aria-expanded={open === field}
              aria-controls={open === field ? calendarId : undefined}
              aria-invalid={Boolean(errors[field])}
              aria-describedby={`${errors[field] ? `${field}-error ` : ''}trip-date-hint`}
              prevIcon={navigationIcon('Previous month', 'ant-picker-prev-icon')}
              nextIcon={navigationIcon('Next month', 'ant-picker-next-icon')}
              superPrevIcon={navigationIcon(`Previous ${yearStep}`, 'ant-picker-super-prev-icon')}
              superNextIcon={navigationIcon(`Next ${yearStep}`, 'ant-picker-super-next-icon')}
              onPanelChange={(_date, nextMode) => setPanelModes(current => current[field] === nextMode ? current : { ...current, [field]: nextMode })}
              panelRender={panel => <div id={calendarId} role="dialog" aria-label={`${label} calendar`}>{panel}</div>}
              dateRender={date => (
                <button
                  type="button"
                  className="ant-picker-cell-inner"
                  tabIndex={-1}
                  disabled={disabledDate(date, field)}
                  aria-label={`${usableValue && date.format('YYYY-MM-DD') === trip[field] ? 'Selected, ' : ''}${fullDate(date)}`}
                >{date.date()}</button>
              )}
              renderExtraFooter={() => (
                <div className="calendar-footer">
                  <span>Up to 30 nights · Within the next year</span>
                  <span>Keyboard: Tab, then arrows. Enter selects. Esc closes.</span>
                </div>
              )}
            />
            <span className="sr-only" id={`${field}-selection`} role="status" aria-live="polite" aria-atomic="true">
              {usableValue ? `${label} selected: ${fullDate(moment(trip[field], 'YYYY-MM-DD', true))}.` : ''}
            </span>
            {errors[field] && <span className="field-error" id={`${field}-error`}>{errors[field]}</span>}
          </div>
        );
      })}
      <span className="sr-only" id="trip-date-hint">Choose dates within the next 365 days, for a stay of up to 30 nights. Press Down Arrow to open the calendar, then Tab to navigate dates. Use arrow keys to move, Page Up or Page Down to change the displayed period, Enter to select, and Escape to close.</span>
    </div>
  );
});

export default TravelDates;
