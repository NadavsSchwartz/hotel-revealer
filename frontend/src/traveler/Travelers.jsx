import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Popover from 'antd/es/popover';
import Select from 'antd/es/select';
import Button from 'antd/es/button';
import 'antd/es/popover/style/css';
import 'antd/es/select/style/css';
import { TRAVEL_LIMITS } from './context.js';

function Counter({ name, value, minimum, maximum, hint, onChange }) {
  const valid = Number.isInteger(value);
  return (
    <div className="traveler-counter-row">
      <div><span id={`${name.toLowerCase()}-label`} className="traveler-counter-label">{name}</span><small>{hint}</small></div>
      <div className="traveler-counter" role="group" aria-labelledby={`${name.toLowerCase()}-label`}>
        <button type="button" aria-label={`Decrease ${name.toLowerCase()}`} disabled={valid && value <= minimum} onClick={() => onChange(valid ? Math.max(minimum, value - 1) : minimum)}><span aria-hidden="true">−</span></button>
        <output aria-label={name} aria-live="polite">{valid ? value : '—'}</output>
        <button type="button" aria-label={`Increase ${name.toLowerCase()}`} disabled={valid && value >= maximum} onClick={() => onChange(valid ? Math.min(maximum, value + 1) : minimum)}><span aria-hidden="true">+</span></button>
      </div>
    </div>
  );
}

const Travelers = forwardRef(function Travelers({ trip, errors, onChange }, ref) {
  const [open, setOpen] = useState(false);
  const [activeAgeDropdown, setActiveAgeDropdown] = useState(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const focusField = useRef(null);
  const ages = Array.isArray(trip.childrenAges) ? trip.childrenAges : [];
  const occupancyErrors = ['rooms', 'adults', 'childrenAges'].filter((field) => errors[field]);
  const hasErrors = occupancyErrors.length > 0;
  const total = Number.isInteger(trip.adults) ? trip.adults + ages.length : null;
  const summary = `${total ?? '—'} guest${total === 1 ? '' : 's'} · ${trip.rooms} room${trip.rooms === 1 ? '' : 's'}`;

  useImperativeHandle(ref, () => ({
    focus: (field) => {
      focusField.current = field;
      setOpen(true);
      if (open) focusPanel();
    },
  }));

  function focusPanel() {
    const field = focusField.current;
    const ageIndex = ages.findIndex((age) => !Number.isInteger(age) || age < 0 || age > 17);
    const target = field === 'childrenAges' && ageIndex >= 0
      ? panel.current?.querySelector(`#child-age-${ageIndex}`)
      : panel.current?.querySelector(`button[aria-label="Increase ${field === 'adults' ? 'adults' : 'rooms'}"]`);
    (target || panel.current?.querySelector('button:not([disabled])'))?.focus();
    focusField.current = null;
  }

  useEffect(() => {
    if (!open) return undefined;
    const timeout = setTimeout(focusPanel, 0);
    return () => clearTimeout(timeout);
    // Focus is moved only when the panel opens, never while the guest edits a count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      setActiveAgeDropdown(null);
      trigger.current?.focus();
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open]);

  function close(returnFocus = false) {
    setOpen(false);
    setActiveAgeDropdown(null);
    if (returnFocus) trigger.current?.focus();
  }

  function panelKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
    if (event.key === 'Tab') {
      const targets = [...panel.current.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter((element) => element.tabIndex !== -1);
      const edge = event.shiftKey ? targets[0] : targets[targets.length - 1];
      if (event.target === edge) {
        event.preventDefault();
        close(true);
      }
    }
  }

  const content = (
    <div ref={panel} id="travelers-panel" role="dialog" aria-labelledby="travelers-title" className="travelers-panel" onKeyDown={panelKeyDown}>
      <div className="travelers-panel-heading"><h3 id="travelers-title">Who’s traveling?</h3><button type="button" aria-label="Close travelers" onClick={() => close(true)}>×</button></div>
      <Counter name="Rooms" value={trip.rooms} minimum={1} maximum={TRAVEL_LIMITS.maxRooms} hint="At least 1 adult per room" onChange={(rooms) => onChange({ rooms })} />
      <Counter name="Adults" value={trip.adults} minimum={1} maximum={TRAVEL_LIMITS.maxAdults} hint="Ages 18 and above" onChange={(adults) => onChange({ adults })} />
      <Counter name="Children" value={ages.length} minimum={0} maximum={TRAVEL_LIMITS.maxChildren} hint="Ages 0–17" onChange={(count) => onChange({ childrenAges: count < ages.length ? ages.slice(0, count) : [...ages, null] })} />
      {ages.length > 0 && (
        <div className="child-ages">
          <p id="child-ages-hint">An age is required for every child.</p>
          <div className="child-age-grid">
            {ages.map((age, index) => (
              <div className="child-age-field" key={index}>
                <label htmlFor={`child-age-${index}`}>Child {index + 1} age</label>
                <Select
                  id={`child-age-${index}`}
                  open={activeAgeDropdown === index}
                  {...(activeAgeDropdown !== index ? { 'aria-activedescendant': undefined, 'aria-controls': undefined, 'aria-owns': undefined } : {})}
                  onDropdownVisibleChange={(visible) => setActiveAgeDropdown(visible ? index : null)}
                  value={Number.isInteger(age) && age >= 0 && age <= 17 ? age : undefined}
                  placeholder="Select age"
                  options={Array.from({ length: 18 }, (_, value) => ({ value, label: value === 0 ? 'Under 1' : `${value}` }))}
                  onChange={(value) => onChange({ childrenAges: ages.map((current, position) => position === index ? value : current) })}
                  getPopupContainer={(node) => node.parentElement}
                  virtual={false}
                  aria-label={`Child ${index + 1} age`}
                  aria-invalid={Boolean(errors.childrenAges && (!Number.isInteger(age) || age < 0 || age > 17))}
                  aria-describedby={errors.childrenAges ? 'travelers-childrenAges-error' : 'child-ages-hint'}
                />
              </div>
            ))}
          </div>
          <small>Choose “Under 1” for infants.</small>
        </div>
      )}
      {occupancyErrors.map((field) => <p key={field} className="field-error" id={`travelers-${field}-error`}>{errors[field]}</p>)}
      <div className="travelers-panel-footer"><span>Changes are saved as you go.</span><Button type="primary" onClick={() => close(true)}>Done</Button></div>
    </div>
  );

  return (
    <div className={`trip-control travelers-control ${hasErrors ? 'trip-control-invalid' : ''}`}>
      <label id="travelers-label" htmlFor="travelers-trigger">Travelers</label>
      <Popover trigger="click" open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setActiveAgeDropdown(null); }} placement="bottomRight" content={content} overlayClassName="travelers-popup" destroyTooltipOnHide>
        <button ref={trigger} id="travelers-trigger" type="button" className="travelers-trigger" aria-label={`Travelers, ${summary}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'travelers-panel' : undefined} aria-invalid={hasErrors} onKeyDown={(event) => { if (event.key === 'Escape' && open) close(true); }}>
          <span>{summary}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
        </button>
      </Popover>
      {hasErrors && !open && <span className="field-error">{errors[occupancyErrors[0]]}</span>}
    </div>
  );
});

export default Travelers;
