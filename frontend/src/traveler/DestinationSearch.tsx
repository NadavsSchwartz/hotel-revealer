import { forwardRef, useLayoutEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { TripDraft } from '../../../shared/contracts.ts';
import type { TripChange } from './SearchForm.tsx';
import type { DestinationSuggestion } from './destinationResponse.ts';
import { validDestinationResponse } from './destinationResponse.ts';
import './destination-search.css';

export interface DestinationSearchHandle { focus: () => void }
interface DestinationSearchProps { trip: TripDraft; error?: string; onChange: TripChange }

const DestinationSearch = forwardRef<DestinationSearchHandle, DestinationSearchProps>(function DestinationSearch({ trip, error, onChange }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<DestinationSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  const [retry, setRetry] = useState(0);
  const query = trip.cityName.trim();

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

  // Finish suggestion resets before another input event. In React 17, a pending
  // passive update can restore the previous controlled text before onChange runs.
  useLayoutEffect(() => {
    const request = ++sequence.current;
    setResults((current) => current.length ? [] : current);
    setActiveIndex(0);
    if (!open || trip.destinationId || query.length < 2) {
      setStatus('idle');
      return undefined;
    }
    const controller = new AbortController();
    setStatus('loading');
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/destinations?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Destination lookup failed');
        const body: unknown = await response.json();
        if (!validDestinationResponse(body)) throw new Error('Invalid destination response');
        if (request === sequence.current && !controller.signal.aborted) {
          setResults(body.destinations.slice(0, 8));
          setStatus(body.destinations.length ? 'ready' : 'empty');
        }
      } catch (failure) {
        if (!(failure instanceof Error && failure.name === 'AbortError') && request === sequence.current && !controller.signal.aborted) setStatus('error');
      }
    }, 200);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [query, open, trip.destinationId, retry]);

  const showPopup = open && !trip.destinationId;
  const showOptions = showPopup && results.length > 0;

  useLayoutEffect(() => {
    if (!showPopup) return undefined;
    const positionPopup = (event?: Event) => {
      if (event?.target === popup.current || !input.current || !popup.current) return;
      const anchor = input.current.getBoundingClientRect();
      const anchorBottom = error && control.current ? control.current.getBoundingClientRect().bottom : anchor.bottom;
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft || 0) + 12;
      const topEdge = (viewport?.offsetTop || 0) + 12;
      const rightEdge = leftEdge + (viewport?.width || window.innerWidth) - 24;
      const bottomEdge = topEdge + (viewport?.height || window.innerHeight) - 24;
      // Focus can arrive before the browser scrolls this input into view.
      if (anchor.bottom < topEdge || anchor.top > bottomEdge) { setPosition({ visibility: 'hidden' }); return; }
      const width = Math.min(Math.max(anchor.width, 270), rightEdge - leftEdge);
      popup.current.style.width = `${width}px`;
      const below = Math.max(0, bottomEdge - anchorBottom - 8);
      const above = Math.max(0, anchor.top - topEdge - 8);
      const height = Math.min(popup.current.scrollHeight + 2, 314);
      const upwards = below < height && above > below;
      const maxHeight = Math.min(314, upwards ? above : below);
      setPosition({
        width,
        left: Math.max(leftEdge, Math.min(anchor.left, rightEdge - width)),
        top: upwards ? anchor.top - Math.min(height, maxHeight) - 8 : anchorBottom + 8,
        maxHeight,
      });
    };
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !control.current?.contains(event.target)) setOpen(false);
    };
    positionPopup();
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    window.visualViewport?.addEventListener('resize', positionPopup);
    window.visualViewport?.addEventListener('scroll', positionPopup);
    document.addEventListener('pointerdown', dismissOutside);
    return () => {
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
      window.visualViewport?.removeEventListener('resize', positionPopup);
      window.visualViewport?.removeEventListener('scroll', positionPopup);
      document.removeEventListener('pointerdown', dismissOutside);
    };
  }, [showPopup, results, status, error]);

  useLayoutEffect(() => {
    if (!showOptions || !popup.current) return;
    const option = popup.current.children[activeIndex];
    if (!option) return;
    const bounds = popup.current.getBoundingClientRect();
    const item = option.getBoundingClientRect();
    if (item.top < bounds.top + 8) popup.current.scrollTop -= bounds.top + 8 - item.top;
    else if (item.bottom > bounds.bottom - 8) popup.current.scrollTop += item.bottom - bounds.bottom + 8;
  }, [activeIndex, showOptions, position]);

  function select(destination: DestinationSuggestion) {
    onChange({ destinationId: destination.id, cityName: destination.label || destination.name });
    setOpen(false);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (showOptions) setActiveIndex(index => Math.max(0, Math.min(results.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter' && open && !trip.destinationId) {
      event.preventDefault();
      if (showOptions) select(results[activeIndex]);
    } else if (event.key === 'Tab' && status !== 'error') setOpen(false);
  }
  const message = status === 'loading' ? 'Finding destinations…'
    : status === 'empty' ? 'No destinations found. Try a city or country name.'
      : status === 'error' ? 'Destinations could not load. Try again.'
        : trip.destinationId ? 'Destination selected. Edit the name to search somewhere else.'
          : query.length < 2 ? 'Enter at least 2 letters of a city or country.'
            : `${results.length} destination${results.length === 1 ? '' : 's'} found. Use the arrow keys to choose.`;

  return (
    <div
      ref={control}
      className={`trip-control destination-control ${error ? 'trip-control-invalid' : ''}`}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); input.current?.focus(); setOpen(false); }
      }}
    >
      <label htmlFor="cityName">Where are you going?</label>
      <input
        ref={input}
        id="cityName"
        name="cityName"
        className="destination-input"
        type="text"
        role="combobox"
        placeholder="City or country"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showOptions}
        aria-controls={showOptions ? 'destination-suggestions' : undefined}
        aria-activedescendant={showOptions ? `destination-option-${activeIndex}` : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'cityName-error' : 'destination-hint'}
        value={trip.cityName}
        onChange={(event) => { onChange({ cityName: event.target.value.slice(0, 200), destinationId: undefined }); setOpen(true); }}
        onFocus={(event) => { event.currentTarget.scrollIntoView({ block: 'nearest' }); setOpen(true); }}
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {showPopup && (
        <div
          ref={popup}
          id={showOptions ? 'destination-suggestions' : undefined}
          className={`destination-panel ${showOptions ? 'destination-popup' : 'destination-status-panel'}`}
          role={showOptions ? 'listbox' : undefined}
          tabIndex={-1}
          aria-label={showOptions ? 'Destination suggestions' : undefined}
          style={position || { visibility: 'hidden' }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {showOptions ? results.map((destination, index) => (
            <div
              key={destination.id}
              id={`destination-option-${index}`}
              className="destination-suggestion"
              role="option"
              aria-selected={activeIndex === index}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => select(destination)}
            >
              <span className="destination-option">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
                <span><strong>{destination.name}</strong><small>{[destination.regionName, destination.countryName].filter(Boolean).join(', ')}</small>
                  {results.some((other) => other.id !== destination.id && other.label === destination.label) && (
                    <small>{Math.abs(destination.latitude).toFixed(2)}°{destination.latitude < 0 ? 'S' : 'N'}, {Math.abs(destination.longitude).toFixed(2)}°{destination.longitude < 0 ? 'W' : 'E'}</small>
                  )}
                </span>
              </span>
            </div>
          )) : <>
            {status === 'loading' && <span className="destination-spinner" aria-hidden="true" />}
            <span>{message}</span>
            {status === 'error' && <button type="button" onClick={() => { input.current?.focus(); setRetry((value) => value + 1); }}>Try again</button>}
          </>}
        </div>
      )}
      <span className="sr-only" id="destination-hint" role="status">{open ? message : 'Search by city or country, then choose a destination.'}</span>
      {error && <span className="field-error" id="cityName-error">{error}</span>}
    </div>
  );
});

export default DestinationSearch;
