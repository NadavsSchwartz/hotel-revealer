import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { TripDraft, TripErrors } from '../../../shared/contracts.ts';
import type { TripChange } from './SearchForm.tsx';
import { createPortal } from 'react-dom';
import { TRAVEL_LIMITS } from './context.ts';
import './travelers.css';

interface CounterProps {
  name: string; value: number | string; minimum: number; maximum: number; hint: string; onChange: (value: number) => void;
}

function Counter({ name, value, minimum, maximum, hint, onChange }: CounterProps) {
  const valid = typeof value === 'number' && Number.isInteger(value);
  return (
    <div className="traveler-counter-row">
      <div><span id={`${name.toLowerCase()}-label`} className="traveler-counter-label">{name}</span><small>{hint}</small></div>
      <div className="traveler-counter" role="group" aria-labelledby={`${name.toLowerCase()}-label`}>
        <button type="button" aria-label={`Decrease ${name.toLowerCase()}`} disabled={valid && value <= minimum} onClick={() => onChange(valid ? Math.max(minimum, value - 1) : minimum)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12" /></svg></button>
        <output aria-label={name} aria-live="polite">{valid ? value : '—'}</output>
        <button type="button" aria-label={`Increase ${name.toLowerCase()}`} disabled={valid && value >= maximum} onClick={() => onChange(valid ? Math.min(maximum, value + 1) : minimum)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M10 4v12" /></svg></button>
      </div>
    </div>
  );
}

type TravelerField = 'rooms' | 'adults' | 'childrenAges';
export interface TravelersHandle { focus: (field: TravelerField) => void }
interface TravelersProps { trip: TripDraft; errors: TripErrors; onChange: TripChange }
interface PanelLayout { placement: 'bottom' | 'top'; maxHeight: number; width?: number; left?: number; top?: number }

const Travelers = forwardRef<TravelersHandle, TravelersProps>(function Travelers({ trip, errors, onChange }, ref) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusField = useRef<TravelerField | null>(null);
  const keyboardOpen = useRef(false);
  const [panelLayout, setPanelLayout] = useState<PanelLayout>({ placement: 'bottom', maxHeight: 620 });
  const ages = Array.isArray(trip.childrenAges) ? trip.childrenAges : [];
  const occupancyErrors = (['rooms', 'adults', 'childrenAges'] as const).filter((field) => errors[field]);
  const hasErrors = occupancyErrors.length > 0;
  const total = typeof trip.adults === 'number' && Number.isInteger(trip.adults) ? trip.adults + ages.length : null;
  const summary = `${total ?? '—'} guest${total === 1 ? '' : 's'} · ${trip.rooms} room${trip.rooms === 1 ? '' : 's'}`;

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    focusField.current = null;
    keyboardOpen.current = false;
    if (returnFocus) trigger.current?.focus({ preventScroll: true });
  }, []);

  useImperativeHandle(ref, () => ({
    focus: (field: TravelerField) => {
      focusField.current = field;
      const bounds = trigger.current?.getBoundingClientRect();
      if (bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight)) {
        trigger.current?.scrollIntoView({ block: 'nearest' });
      }
      positionPanel();
      setOpen(true);
      if (open) focusPanel();
    },
  }));

  const positionPanel = useCallback(() => {
    const bounds = trigger.current?.getBoundingClientRect();
    if (!bounds) return;
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportWidth = viewport?.width || document.documentElement.clientWidth;
    const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
    const above = Math.max(0, bounds.top - viewportTop);
    const below = Math.max(0, viewportBottom - bounds.bottom);
    const onBottom = below >= above;
    const width = Math.min(342, viewportWidth - 26);
    const anchor = Math.max(viewportTop + 12, Math.min(viewportBottom - 12, onBottom ? bounds.bottom + 8 : bounds.top - 8));
    setPanelLayout({
      placement: onBottom ? 'bottom' : 'top',
      width,
      left: Math.max(viewportLeft + 13, Math.min(bounds.right - width, viewportLeft + viewportWidth - width - 13)),
      top: anchor,
      maxHeight: Math.max(40, Math.min(620, onBottom ? viewportBottom - anchor - 12 : anchor - viewportTop - 12)),
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const viewport = window.visualViewport;
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) positionPanel();
    };
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', onScroll, true);
    viewport?.addEventListener('resize', positionPanel);
    viewport?.addEventListener('scroll', positionPanel);
    return () => {
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', onScroll, true);
      viewport?.removeEventListener('resize', positionPanel);
      viewport?.removeEventListener('scroll', positionPanel);
    };
  }, [open, positionPanel]);

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) return close();
    positionPanel();
    if (!keyboardOpen.current) trigger.current?.focus({ preventScroll: true });
    setOpen(true);
  }

  function focusPanel() {
    const field = focusField.current;
    const ageIndex = ages.findIndex((age) => typeof age !== 'number' || !Number.isInteger(age) || age < TRAVEL_LIMITS.minChildAge || age > TRAVEL_LIMITS.maxChildAge);
    const counter = field === 'adults' ? 'adults' : field === 'childrenAges' ? 'children' : 'rooms';
    const target = field === 'childrenAges' && ageIndex >= 0
      ? panel.current?.querySelector<HTMLElement>(`#child-age-${ageIndex}`)
      : panel.current?.querySelector<HTMLElement>(`button[aria-label="Increase ${counter}"]:not([disabled]), button[aria-label="Decrease ${counter}"]:not([disabled])`);
    const control = target || (!field && panel.current?.querySelector<HTMLElement>('button:not([disabled])'));
    if (!control) return;
    const row = control.closest<HTMLElement>('.child-age-field, .traveler-counter-row');
    if (field && row && panel.current) {
      // Keep validation focus inside the scrolling panel without moving the page.
      const top = row.offsetTop - panel.current.offsetTop;
      const bottom = top + row.offsetHeight;
      if (top < panel.current.scrollTop) panel.current.scrollTop = top;
      else if (bottom > panel.current.scrollTop + panel.current.clientHeight) {
        panel.current.scrollTop = bottom - panel.current.clientHeight;
      }
    }
    control.focus({ preventScroll: true });
    if (document.activeElement === control) focusField.current = null;
  }

  useLayoutEffect(() => {
    if (open && (focusField.current || (keyboardOpen.current && document.activeElement === trigger.current))) focusPanel();
  });

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close(true);
    };
    const dismissOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) {
        close();
      }
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismissOutside);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', dismissOutside);
    };
  }, [open, close]);

  function panelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
    if (event.key === 'Tab' && panel.current) {
      const targets = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])')].filter((element) => element.tabIndex !== -1);
      const edge = event.shiftKey ? targets[0] : targets[targets.length - 1];
      if (event.target === edge) {
        event.preventDefault();
        close(true);
      }
    }
  }

  const content = (
    <div ref={panel} id="travelers-panel" role="dialog" aria-labelledby="travelers-title" className="travelers-panel" style={{ maxHeight: panelLayout.maxHeight }} onKeyDown={panelKeyDown}>
      <div className="travelers-panel-heading"><h3 id="travelers-title">Who’s traveling?</h3><button type="button" aria-label="Close travelers" onClick={() => close(true)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M5 15 15 5" /></svg></button></div>
      <Counter name="Rooms" value={trip.rooms} minimum={1} maximum={TRAVEL_LIMITS.maxRooms} hint="At least 1 adult per room" onChange={(rooms) => onChange({ rooms })} />
      <Counter name="Adults" value={trip.adults} minimum={1} maximum={TRAVEL_LIMITS.maxAdults} hint="Ages 18 and above" onChange={(adults) => onChange({ adults })} />
      <Counter name="Children" value={ages.length} minimum={0} maximum={TRAVEL_LIMITS.maxChildren} hint={`Ages ${TRAVEL_LIMITS.minChildAge}–${TRAVEL_LIMITS.maxChildAge}`} onChange={(count) => onChange({ childrenAges: count < ages.length ? ages.slice(0, count) : [...ages, null] })} />
      {ages.length > 0 && (
        <div className="child-ages">
          <p id="child-ages-hint">An age is required for every child.</p>
          <div className="child-age-grid">
            {ages.map((age, index) => (
              <div className="child-age-field" key={index}>
                <label htmlFor={`child-age-${index}`}>Child {index + 1} age</label>
                <div className="child-age-select">
                  <select
                    id={`child-age-${index}`}
                    value={typeof age === 'number' && Number.isInteger(age) && age >= TRAVEL_LIMITS.minChildAge && age <= TRAVEL_LIMITS.maxChildAge ? age : ''}
                    onChange={(event) => onChange({ childrenAges: ages.map((current, position) => position === index ? Number(event.target.value) : current) })}
                    aria-label={`Child ${index + 1} age`}
                    aria-invalid={Boolean(errors.childrenAges && (typeof age !== 'number' || !Number.isInteger(age) || age < TRAVEL_LIMITS.minChildAge || age > TRAVEL_LIMITS.maxChildAge))}
                    aria-describedby={errors.childrenAges ? 'travelers-childrenAges-error' : 'child-ages-hint'}
                  >
                    <option value="" disabled>Select age</option>
                    {Array.from({ length: TRAVEL_LIMITS.maxChildAge - TRAVEL_LIMITS.minChildAge + 1 }, (_, offset) => {
                      const value = TRAVEL_LIMITS.minChildAge + offset;
                      return <option key={value} value={value}>{value === 0 ? 'Under 1' : value}</option>;
                    })}
                  </select>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
                </div>
              </div>
            ))}
          </div>
          <small>Choose “Under 1” for infants.</small>
        </div>
      )}
      {occupancyErrors.map((field) => <p key={field} className="field-error" id={`travelers-${field}-error`}>{errors[field]}</p>)}
      <div className="travelers-panel-footer"><span>Changes apply as you go.</span><button type="button" className="ui-button ui-button-primary" onClick={() => close(true)}>Done</button></div>
    </div>
  );

  return (
    <div className={`trip-control travelers-control ${hasErrors ? 'trip-control-invalid' : ''}`}>
      <label id="travelers-label" htmlFor="travelers-trigger">Travelers</label>
      <button ref={trigger} id="travelers-trigger" type="button" className="travelers-trigger" aria-label={`Travelers, ${summary}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'travelers-panel' : undefined} aria-invalid={hasErrors} onClick={() => changeOpen(!open)} onPointerDown={() => { keyboardOpen.current = false; }} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') keyboardOpen.current = true;
        if (event.key === 'Escape' && open) close(true);
        if (event.key === 'Tab' && open) close();
      }}>
        <span>{summary}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
      </button>
      {open && createPortal(
        <div className="travelers-popup" data-placement={panelLayout.placement} style={{ top: panelLayout.top, left: panelLayout.left, width: panelLayout.width }}>
          {content}
        </div>,
        document.body,
      )}
      {hasErrors && !open && <span className="field-error">{errors[occupancyErrors[0]]}</span>}
    </div>
  );
});

export default Travelers;
