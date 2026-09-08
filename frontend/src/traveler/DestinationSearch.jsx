import React, { forwardRef, useLayoutEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import AutoComplete from 'antd/es/auto-complete';
import Input from 'antd/es/input';
import Spin from 'antd/es/spin';
import 'antd/es/auto-complete/style/css';
import 'antd/es/input/style/css';
import 'antd/es/spin/style/css';

const DestinationSearch = forwardRef(function DestinationSearch({ trip, error, onChange }, ref) {
  const input = useRef(null);
  const sequence = useRef(0);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [retry, setRetry] = useState(0);
  const query = trip.cityName.trim();

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

  // Finish suggestion resets before another input event. In React 17, a pending
  // passive update can restore the previous controlled text before onChange runs.
  useLayoutEffect(() => {
    const request = ++sequence.current;
    setResults((current) => current.length ? [] : current);
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
        const body = await response.json();
        if (!Array.isArray(body.destinations)) throw new Error('Invalid destination response');
        if (request === sequence.current && !controller.signal.aborted) {
          setResults(body.destinations);
          setStatus(body.destinations.length ? 'ready' : 'empty');
        }
      } catch (failure) {
        if (failure.name !== 'AbortError' && request === sequence.current && !controller.signal.aborted) setStatus('error');
      }
    }, 200);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [query, open, trip.destinationId, retry]);

  const options = useMemo(() => results.map((destination) => ({
    key: destination.id,
    value: destination.id,
    destination,
    label: (
      <span className="destination-option">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
        <span><strong>{destination.name}</strong><small>{[destination.regionName, destination.countryName].filter(Boolean).join(', ')}</small>
          {results.some((other) => other.id !== destination.id && other.label === destination.label) && (
            <small>{Math.abs(destination.latitude).toFixed(2)}°{destination.latitude < 0 ? 'S' : 'N'}, {Math.abs(destination.longitude).toFixed(2)}°{destination.longitude < 0 ? 'W' : 'E'}</small>
          )}
        </span>
      </span>
    ),
  })), [results]);
  const message = status === 'loading' ? 'Finding destinations…'
    : status === 'empty' ? 'No destinations found. Try a city or country name.'
      : status === 'error' ? 'Destinations could not load. Try again.'
        : trip.destinationId ? 'Destination selected. Edit the name to search somewhere else.'
          : query.length < 2 ? 'Enter at least 2 letters of a city or country.'
            : `${results.length} destination${results.length === 1 ? '' : 's'} found. Use the arrow keys to choose.`;

  return (
    <div className={`trip-control destination-control ${error ? 'trip-control-invalid' : ''}`}>
      <label htmlFor="cityName">Where are you going?</label>
      <AutoComplete
        id="cityName"
        {...(!(open && options.length > 0) ? { 'aria-activedescendant': undefined, 'aria-controls': undefined, 'aria-owns': undefined } : {})}
        value={trip.cityName}
        options={options}
        open={open && options.length > 0}
        popupClassName="destination-popup"
        dropdownMatchSelectWidth
        listHeight={300}
        virtual={false}
        defaultActiveFirstOption
        onDropdownVisibleChange={setOpen}
        onChange={(cityName) => { onChange({ cityName: cityName.slice(0, 200), destinationId: undefined }); setOpen(true); }}
        onSelect={(_value, option) => {
          onChange({ destinationId: option.destination.id, cityName: option.destination.label || option.destination.name });
          setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onInputKeyDown={(event) => {
          if (event.key === 'Enter' && open && !trip.destinationId) event.preventDefault();
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        <Input ref={input} id="cityName" name="cityName" placeholder="City or country" autoComplete="off" aria-invalid={Boolean(error)} aria-describedby={error ? 'cityName-error' : 'destination-hint'} />
      </AutoComplete>
      {open && !trip.destinationId && options.length === 0 && (
        <div className="destination-status-panel" onMouseDown={(event) => event.preventDefault()}>
          {status === 'loading' && <Spin size="small" />}
          <span>{message}</span>
          {status === 'error' && <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>}
        </div>
      )}
      <span className="sr-only" id="destination-hint" role="status">{open ? message : 'Search by city or country, then choose a destination.'}</span>
      {error && <span className="field-error" id="cityName-error">{error}</span>}
    </div>
  );
});

export default DestinationSearch;
