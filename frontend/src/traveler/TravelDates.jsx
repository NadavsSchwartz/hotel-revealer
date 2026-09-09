import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from '@daypicker/react';
import '@daypicker/react/style.css';
import { TRAVEL_LIMITS, addCalendarDays, isCalendarDate, localToday } from './context.js';
import './travel-dates.css';

const localDate = value => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const calendarDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const fullDateFormat = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fullDate = date => fullDateFormat.format(date);
const shortDate = date => shortDateFormat.format(date);
const calendarLabels = {
  labelPrevious: () => 'Previous month',
  labelNext: () => 'Next month',
  labelDayButton: (date, modifiers) => `${modifiers.selected ? 'Selected, ' : ''}${fullDate(date)}`,
};

const TravelDates = forwardRef(function TravelDates({ trip, errors, onChange }, ref) {
  const checkInRef = useRef(null);
  const checkOutRef = useRef(null);
  const popup = useRef(null);
  const focusAfterSelection = useRef(null);
  const [open, setOpen] = useState(null);
  const [month, setMonth] = useState(null);
  const [position, setPosition] = useState({ visibility: 'hidden' });
  const today = localToday();
  const latest = addCalendarDays(today, TRAVEL_LIMITS.maxAdvanceDays);
  const inWindow = value => isCalendarDate(value) && value >= today && value <= latest;
  const validCheckIn = inWindow(trip.checkIn);

  useLayoutEffect(() => {
    const field = open || focusAfterSelection.current;
    if (field) (field === 'checkOut' ? checkOutRef : checkInRef).current?.focus({ preventScroll: true });
    focusAfterSelection.current = null;
  }, [open, trip.checkIn, trip.checkOut]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const trigger = (open === 'checkOut' ? checkOutRef : checkInRef).current;
    const viewport = window.visualViewport;
    const place = event => {
      if (event?.target instanceof Node && popup.current?.contains(event.target)) return;
      const bounds = trigger.getBoundingClientRect();
      const top = viewport?.offsetTop || 0;
      const left = viewport?.offsetLeft || 0;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      const popupHeight = Math.min(popup.current.scrollHeight, height - 16);
      const below = top + height - bounds.bottom;
      const above = bounds.top - top;
      const nextTop = below >= popupHeight + 8 || below >= above ? bounds.bottom + 8 : bounds.top - popupHeight - 8;
      setPosition({
        top: Math.max(top + 8, Math.min(nextTop, top + height - popupHeight - 8)),
        left: Math.max(left + 8, Math.min(bounds.left, left + width - popup.current.offsetWidth - 8)),
        maxHeight: height - 16,
      });
    };
    const dismissOutside = event => {
      if (popup.current?.contains(event.target) || checkInRef.current?.contains(event.target) || checkOutRef.current?.contains(event.target)) return;
      setOpen(null);
    };
    // Pointer month navigation can leave focus outside the portal in WebKit.
    const dismissOnEscape = event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(null);
      trigger.focus({ preventScroll: true });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [open, month]);

  useImperativeHandle(ref, () => ({ focus: openCalendar }));

  function disabledDate(date, field) {
    const day = calendarDate(date);
    if (day < today || day > latest) return true;
    return field === 'checkOut' && validCheckIn && (day <= trip.checkIn || day > addCalendarDays(trip.checkIn, TRAVEL_LIMITS.maxNights));
  }

  function openCalendar(field) {
    const value = trip[field];
    const initial = inWindow(value) && !disabledDate(localDate(value), field) ? value
      : field === 'checkOut' && validCheckIn ? [addCalendarDays(trip.checkIn, 1), latest].sort()[0] : today;
    setMonth(localDate(initial));
    setOpen(field);
    (field === 'checkOut' ? checkOutRef : checkInRef).current?.focus();
  }

  function close() {
    setOpen(null);
    (open === 'checkOut' ? checkOutRef : checkInRef).current?.focus({ preventScroll: true });
  }

  function focusDay() {
    const day = popup.current?.querySelector('.rdp-day_button[tabindex="0"]:not(:disabled):not([aria-disabled="true"])')
      || popup.current?.querySelector('.rdp-day_button:not(:disabled):not([aria-disabled="true"])');
    (day || popup.current?.querySelector('button:not(:disabled):not([aria-disabled="true"])'))?.focus();
  }

  function triggerKeyDown(event, field) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open === field) focusDay();
      else openCalendar(field);
    } else if (event.key === 'Tab' && !event.shiftKey && open === field) {
      event.preventDefault();
      focusDay();
    }
  }

  function popupKeyDown(event) {
    if (event.key !== 'Tab') return;
    const targets = [...popup.current.querySelectorAll('button:not(:disabled):not([aria-disabled="true"])')].filter(element => element.tabIndex !== -1);
    if (event.target === (event.shiftKey ? targets[0] : targets[targets.length - 1])) {
      event.preventDefault();
      close();
    }
  }

  function selectDate(field, date) {
    if (!date || disabledDate(date, field)) return;
    const value = calendarDate(date);
    if (field === 'checkIn') {
      const incompatibleEnd = trip.checkOut && (!inWindow(trip.checkOut) || trip.checkOut <= value || trip.checkOut > addCalendarDays(value, TRAVEL_LIMITS.maxNights));
      onChange(
        { checkIn: value, ...(incompatibleEnd ? { checkOut: '' } : {}) },
        incompatibleEnd ? { checkOut: 'Choose a new check-out date for this check-in.' } : {},
      );
      const next = !incompatibleEnd && inWindow(trip.checkOut) ? trip.checkOut : [addCalendarDays(value, 1), latest].sort()[0];
      setMonth(localDate(next));
      setOpen('checkOut');
    } else {
      focusAfterSelection.current = 'checkOut';
      onChange({ checkOut: value });
      setOpen(null);
    }
  }

  return (
    <div className="travel-dates">
      {['checkIn', 'checkOut'].map(field => {
        const label = field === 'checkIn' ? 'Check-in' : 'Check-out';
        const usableValue = inWindow(trip[field]);
        return (
          <div key={field} className={`trip-control date-control ${errors[field] ? 'trip-control-invalid' : ''}`}>
            <label htmlFor={field}>{label}</label>
            <div className="travel-date-field" onClick={() => openCalendar(field)}>
              <input
                ref={field === 'checkIn' ? checkInRef : checkOutRef}
                id={field}
                name={field}
                className="travel-date-trigger"
                value={usableValue ? shortDate(localDate(trip[field])) : ''}
                placeholder={trip[field] && !usableValue ? 'Choose a new date' : 'Add date'}
                readOnly
                role="combobox"
                aria-label={label}
                aria-haspopup="dialog"
                aria-expanded={open === field}
                aria-controls={open === field ? `${field}-calendar` : undefined}
                aria-invalid={Boolean(errors[field])}
                aria-describedby={`${errors[field] ? `${field}-error ` : ''}trip-date-hint`}
                onKeyDown={event => triggerKeyDown(event, field)}
              />
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="13" rx="2" /><path d="M6.5 2.5v4m7-4v4M3 8.5h14" /></svg>
            </div>
            <span className="sr-only" id={`${field}-selection`} role="status" aria-live="polite" aria-atomic="true">
              {usableValue ? `${label} selected: ${fullDate(localDate(trip[field]))}.` : ''}
            </span>
            {errors[field] && <span className="field-error" id={`${field}-error`}>{errors[field]}</span>}
          </div>
        );
      })}
      <span className="sr-only" id="trip-date-hint">Choose dates within the next {TRAVEL_LIMITS.maxAdvanceDays} days, for a stay of up to {TRAVEL_LIMITS.maxNights} nights. Press Down Arrow to open the calendar, then Tab to navigate dates. Use arrow keys to move, Page Up or Page Down to change the month, Enter to select, and Escape to close.</span>
      {open && createPortal(
        <div ref={popup} id={`${open}-calendar`} className="travel-calendar-popup" role="dialog" aria-label={`${open === 'checkIn' ? 'Check-in' : 'Check-out'} calendar`} style={position} onKeyDown={popupKeyDown}>
          <DayPicker
            key={open}
            mode="single"
            required
            selected={inWindow(trip[open]) ? localDate(trip[open]) : undefined}
            month={month}
            onMonthChange={setMonth}
            startMonth={localDate(today)}
            endMonth={localDate(latest)}
            disabled={date => disabledDate(date, open)}
            onSelect={date => selectDate(open, date)}
            navLayout="around"
            fixedWeeks
            showOutsideDays
            labels={calendarLabels}
          />
          <div className="calendar-footer">
            <span>Up to {TRAVEL_LIMITS.maxNights} nights · Within the next year</span>
            <span>Keyboard: Tab, then arrows. Enter selects. Esc closes.</span>
          </div>
        </div>, document.body,
      )}
    </div>
  );
});

export default TravelDates;
